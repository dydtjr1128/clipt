/**
 * 오프스크린 녹화 세션의 종료·오류 경로. MediaRecorder·탭 스트림·프레임 처리는 가짜로 대신하고
 * chunk·결과 저장은 fake IndexedDB를 그대로 쓴다.
 */
const cropped = {
  track: { kind: 'video' },
  size: Promise.resolve({ width: 640, height: 360 }),
  frames: () => ({ in: 0, out: 0 }),
  stop: vi.fn(),
};
vi.mock('@/offscreen/frame-cropper', () => ({ cropTrack: vi.fn(() => cropped) }));
vi.mock('@/offscreen/audio-mixer', () => ({
  mixAudio: () => ({ track: null, close: async () => undefined }),
}));
vi.mock('fix-webm-duration', () => ({ default: async (blob: Blob) => blob }));

/** appendChunk 동작을 테스트마다 바꾼다(기본: 실제 저장) */
let appendBehavior: ((call: number) => 'ok' | 'fail') | null = null;
let appendCalls = 0;
vi.mock('@/shared/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/db')>();
  return {
    ...actual,
    appendChunk: async (...args: Parameters<typeof actual.appendChunk>) => {
      const call = appendCalls++;
      if (appendBehavior?.(call) === 'fail') throw new Error('QuotaExceededError');
      return actual.appendChunk(...args);
    },
  };
});

class FakeRecorder extends EventTarget {
  static last: FakeRecorder | null = null;
  static isTypeSupported = () => true;
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  /** 지정하면 stop()에서 마지막 chunk로 내보낸다 */
  flushOnStop: string | null = null;
  constructor() {
    super();
    FakeRecorder.last = this;
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    if (this.state === 'inactive') throw new Error('InvalidState');
    this.state = 'inactive';
    if (this.flushOnStop) this.emit(this.flushOnStop);
    queueMicrotask(() => this.dispatchEvent(new Event('stop')));
  }
  pause() {}
  resume() {}
  /** 인코더가 chunk를 낸다 */
  emit(text: string) {
    this.ondataavailable?.({ data: new Blob([text], { type: 'video/webm' }) });
  }
  /** 인코더 오류: error 뒤 스스로 멈춘다 */
  fail() {
    this.onerror?.(new Event('error'));
    if (this.state !== 'inactive') this.stop();
  }
}

const videoTrack = {
  kind: 'video',
  getSettings: () => ({ width: 640, height: 360, frameRate: 30 }),
  addEventListener: vi.fn(),
  stop: vi.fn(),
};

beforeEach(() => {
  appendBehavior = null;
  appendCalls = 0;
  cropped.stop.mockClear();
  videoTrack.stop.mockClear();
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.stubGlobal(
    'MediaStream',
    class {
      constructor(private tracks: { kind: string }[]) {}
      getAudioTracks() {
        return this.tracks.filter((t) => t.kind === 'audio');
      }
    },
  );
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: async () => ({
        getVideoTracks: () => [videoTrack],
        getAudioTracks: () => [],
        getTracks: () => [videoTrack],
      }),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function start(jobId: string) {
  vi.resetModules();
  const recorder = await import('@/offscreen/recorder');
  const ended = vi.fn();
  recorder.setEndedHandler(ended);
  await recorder.startRecording({
    jobId,
    mode: 'rec-tab',
    streamId: 's',
    audio: 'none',
    format: 'webm-vp9',
    fps: 30,
    bitrate: 'auto',
    size: { width: 640, height: 360 },
  });
  return { recorder, ended, media: FakeRecorder.last! };
}

async function resultOf(id: string) {
  const { loadResult } = await import('@/shared/db');
  return loadResult(id);
}

describe('녹화 종료', () => {
  it('인코더가 데이터를 하나도 내지 않으면 빈 결과를 저장하지 않고 오류로 끝내며 자원을 놓는다', async () => {
    const { recorder } = await start('empty');
    await expect(recorder.stopRecording()).rejects.toMatchObject({ code: 'CAPTURE_FAILED' });
    expect(cropped.stop).toHaveBeenCalled();
    expect(videoTrack.stop).toHaveBeenCalled();
    const { listChunkJobIds } = await import('@/shared/db');
    expect(await listChunkJobIds()).not.toContain('empty');
  });

  it('시작 직후 중지하면 인코더의 첫 데이터를 기다렸다가 멈춰 빈 파일이 되지 않는다', async () => {
    const { recorder, media } = await start('early-stop');
    // 실제 인코더처럼 stop()에서는 아무것도 내지 않고, 첫 데이터는 조금 뒤에 나온다
    setTimeout(() => media.emit('late'), 50);
    const { resultId } = await recorder.stopRecording();
    const result = await resultOf(resultId);
    expect(await result?.blob.text()).toBe('late');
    expect(media.state).toBe('inactive');
  });

  it('레이아웃 변경 같은 자동 종료는 첫 데이터를 기다리지 않는다', async () => {
    const { recorder } = await start('layout');
    const startedAt = Date.now();
    await expect(recorder.stopRecording({ warning: 'layout-changed' })).rejects.toMatchObject({
      code: 'CAPTURE_FAILED',
    });
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });

  it('중지 중 마지막 chunk 저장이 실패해도 결과에 저장 실패 경고를 남긴다', async () => {
    appendBehavior = (call) => (call >= 1 ? 'fail' : 'ok');
    const { recorder, media } = await start('flush-fail');
    media.emit('a');
    media.flushOnStop = 'b';
    const { resultId } = await recorder.stopRecording();
    const result = await resultOf(resultId);
    expect(result?.meta.warnings).toContain('storage-failed');
    expect(await result?.blob.text()).toBe('a');
  });

  it('저장 중 재기동한 서비스 워커는 같은 작업의 저장 결과를 다시 받을 수 있다', async () => {
    const { recorder, media } = await start('resume');
    media.emit('a');
    const stopped = recorder.stopRecording();
    await expect(recorder.stopResult('resume')).resolves.toEqual(await stopped);
    await expect(recorder.stopResult('other')).rejects.toMatchObject({ code: 'NO_JOB' });
  });

  it('인코더 오류가 나면 그때까지 저장하고 결과와 함께 종료를 알린다', async () => {
    const { ended, media } = await start('encoder-error');
    media.emit('a');
    media.emit('b');
    media.fail();
    await vi.waitFor(() => expect(ended).toHaveBeenCalled());
    const [jobId, resultId, error] = ended.mock.calls[0]!;
    expect(jobId).toBe('encoder-error');
    expect(error).toBeUndefined();
    const result = await resultOf(resultId as string);
    expect(result?.meta.warnings).toContain('recorder-error');
    expect(await result?.blob.text()).toBe('ab');
    expect(videoTrack.stop).toHaveBeenCalled();
  });

  it('chunk 저장에 실패하면 이후 chunk는 쓰지 않고 그때까지 저장해 끝낸다', async () => {
    appendBehavior = (call) => (call >= 1 ? 'fail' : 'ok');
    const { ended, media } = await start('storage');
    media.emit('a');
    media.emit('b');
    await vi.waitFor(() => expect(ended).toHaveBeenCalled());
    const [, resultId] = ended.mock.calls[0]!;
    const result = await resultOf(resultId as string);
    expect(result?.meta.warnings).toContain('storage-failed');
    expect(await result?.blob.text()).toBe('a');
    expect(cropped.stop).toHaveBeenCalled();
  });

  it('chunk를 하나도 저장하지 못하면 결과 없이 사유와 함께 종료를 알린다', async () => {
    appendBehavior = () => 'fail';
    const { ended, media } = await start('storage-empty');
    media.emit('a');
    await vi.waitFor(() => expect(ended).toHaveBeenCalled());
    expect(ended).toHaveBeenCalledWith(
      'storage-empty',
      null,
      expect.objectContaining({ code: 'CAPTURE_FAILED' }),
    );
  });
});
