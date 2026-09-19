import fixWebmDuration from 'fix-webm-duration';
import { CliptError } from '@/core/errors';
import type { Mode } from '@/core/job';
import { chooseMime, containerOf, videoBitrate, type RecordFormat } from '@/core/media-profile';
import type { Settings } from '@/core/settings';
import { appendChunk, deleteChunks, readChunks, saveResult } from '@/shared/db';
import { mixAudio, type AudioMix } from './audio-mixer';
import { cropTrack, type CroppedTrack } from './frame-cropper';
import type { NormalizedRect } from '@/core/crop';

/**
 * 오프스크린 문서의 녹화 세션 (docs/architecture.md 9절).
 * MediaRecorder가 1초마다 내는 chunk를 IndexedDB에 바로 쓰고 메모리에 쌓지 않는다.
 * 종료 시 chunk를 합쳐 결과로 저장하고, webm은 길이 메타를 채워 탐색할 수 있게 한다.
 */
export interface StartOptions {
  jobId: string;
  mode: Mode;
  streamId: string;
  audio: Settings['record']['audio'];
  format: RecordFormat;
  fps: Settings['record']['fps'];
  bitrate: Settings['record']['bitrate'];
  /** 캡처 해상도(device px). 지정하지 않으면 탭 캡처가 낮은 기본 해상도로 잡힌다 */
  size: { width: number; height: number };
  /** 영역·요소 녹화: 뷰포트 대비 비율 크롭 */
  crop?: NormalizedRect;
  /** 요소 추적 녹화: 시작 시점 요소 위치(자르지 않은 뷰포트 비율). 이후 위치는 updateTrackedRect로 받는다 */
  track?: NormalizedRect;
  /** 결과에 남길 주의 사항(예: clipped) */
  warnings?: string[];
  /** 최대 녹화 길이(ms) */
  maxMs?: number;
}

export interface StartInfo {
  mime: string;
  fallbackFrom?: RecordFormat;
  width: number;
  height: number;
  audioTracks: number;
  /** 탭 캡처 트랙에 적용된 프레임레이트 */
  frameRate: number;
  warnings: string[];
}

type State = 'recording' | 'paused';

interface Session {
  options: StartOptions;
  recorder: MediaRecorder;
  streams: MediaStream[];
  audio: AudioMix;
  cropped: CroppedTrack;
  mime: string;
  fallbackFrom?: RecordFormat;
  width: number;
  height: number;
  warnings: string[];
  seq: number;
  writes: Promise<void>;
  /** 녹화된 시간(ms). 일시정지 구간 제외 */
  activeMs: number;
  segmentStart: number;
  state: State;
  /** MediaRecorder의 stop 이벤트(마지막 dataavailable 이후)에 풀린다 */
  stopped: Promise<void>;
}

const TIMESLICE_MS = 1000;
let session: Session | null = null;
/** 요소 추적의 최신 요소 위치. 녹화 준비 중에 먼저 도착할 수 있어 세션과 따로 둔다 */
let tracked: { jobId: string; rect: NormalizedRect } | null = null;

export function updateTrackedRect(jobId: string, rect: NormalizedRect): void {
  tracked = { jobId, rect };
}

/** 대상 탭이 닫히는 등으로 스트림이 끝났을 때 호출 */
let onEnded: ((jobId: string, resultId: string | null) => void) | null = null;
export function setEndedHandler(handler: typeof onEnded): void {
  onEnded = handler;
}

/**
 * 탭 영상 제약. 해상도를 탭 실제 크기로 맞추고, minFrameRate로 화면이 바뀌지 않아도
 * 마지막 프레임을 계속 보내게 한다(정지 화면에서 프레임이 없으면 MediaRecorder가 데이터를 만들지 않음).
 */
function tabConstraints(
  streamId: string,
  fps: number,
  size: { width: number; height: number },
): MediaStreamConstraints['video'] {
  return {
    mandatory: {
      chromeMediaSource: 'tab',
      chromeMediaSourceId: streamId,
      maxWidth: size.width,
      maxHeight: size.height,
      minFrameRate: fps,
      maxFrameRate: fps,
    },
  } as MediaTrackConstraints;
}

export async function startRecording(options: StartOptions): Promise<StartInfo> {
  if (session) throw new CliptError('JOB_ACTIVE', 'already recording');
  const wantsTab = options.audio === 'tab' || options.audio === 'tab+mic';
  const wantsMic = options.audio === 'mic' || options.audio === 'tab+mic';
  const warnings: string[] = [...(options.warnings ?? [])];

  const tab = await navigator.mediaDevices
    .getUserMedia({
      video: tabConstraints(options.streamId, options.fps, options.size),
      audio: wantsTab
        ? ({
            mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: options.streamId },
          } as MediaTrackConstraints)
        : false,
    })
    .catch((error: unknown) => {
      throw new CliptError('PERMISSION_DENIED', String(error));
    });
  let mic: MediaStream | null = null;
  if (wantsMic) {
    // 권한이 없으면 마이크 없이 녹화하고 결과에 알린다
    mic = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
    if (!mic) warnings.push('mic-unavailable');
  }

  const video = tab.getVideoTracks()[0];
  if (!video) throw new CliptError('CAPTURE_FAILED', 'no video track');
  // 영역·요소 녹화는 프레임을 잘라 새 트랙으로 만든다. 화면 비율이 바뀌면 멈춘다
  let current: Session | null = null;
  // 모든 모드가 프레임 처리 경로를 거친다: 시작 직후 프레임을 버리고, 영역·요소는 자른다
  if (tracked?.jobId !== options.jobId) tracked = null;
  const cropped = cropTrack(
    video,
    options.crop ?? null,
    options.crop
      ? () => {
          if (session === current && current) stopForLayoutChange(current);
        }
      : null,
    undefined,
    options.track ? () => tracked?.rect ?? options.track! : null,
  );
  const recordedVideo = cropped.track;
  const audio = mixAudio(tab, mic);
  const output = new MediaStream([recordedVideo, ...(audio.track ? [audio.track] : [])]);

  const choice = chooseMime(options.format, (mime) => MediaRecorder.isTypeSupported(mime));
  if (!choice) throw new CliptError('UNSUPPORTED_FORMAT');
  const fallbackSize = {
    width: video.getSettings().width ?? 0,
    height: video.getSettings().height ?? 0,
  };
  const { width, height } = await Promise.race([
    cropped.size,
    new Promise<{ width: number; height: number }>((resolve) =>
      setTimeout(() => resolve(fallbackSize), 3000),
    ),
  ]);
  const recorder = new MediaRecorder(output, {
    mimeType: choice.mime,
    videoBitsPerSecond: videoBitrate(width, height, options.fps, options.bitrate),
    audioBitsPerSecond: 128_000,
  });

  current = {
    options,
    recorder,
    streams: [tab, ...(mic ? [mic] : [])],
    audio,
    cropped,
    mime: choice.mime,
    fallbackFrom: choice.fallbackFrom,
    width,
    height,
    warnings,
    seq: 0,
    writes: Promise.resolve(),
    activeMs: 0,
    segmentStart: performance.now(),
    state: 'recording',
    // 트랙이 끝나면 MediaRecorder가 스스로 멈추며 마지막 데이터를 늦게 내보낸다.
    // 상태만 보고 넘어가면 그 데이터를 놓치므로 항상 stop 이벤트를 기다린다
    stopped: new Promise<void>((resolve) =>
      recorder.addEventListener('stop', () => resolve(), { once: true }),
    ),
  };
  const live = current;
  recorder.ondataavailable = (event) => {
    if (event.data.size === 0) return;
    const seq = live.seq++;
    live.writes = live.writes.then(() => appendChunk(options.jobId, seq, event.data));
    // 최대 길이에 도달하면 그때까지 저장하고 끝낸다
    if (options.maxMs && session === live && activeMsOf(live) >= options.maxMs) {
      stopWithWarning(live, 'max-length');
    }
  };
  // 탭이 닫히거나 캡처가 끊기면 그때까지의 영상을 저장한다
  video.addEventListener('ended', () => {
    if (session !== live) return;
    void stopRecording()
      .then(({ resultId }) => onEnded?.(options.jobId, resultId))
      .catch(() => onEnded?.(options.jobId, null));
  });

  session = live;
  recorder.start(TIMESLICE_MS);
  return {
    mime: choice.mime,
    ...(choice.fallbackFrom ? { fallbackFrom: choice.fallbackFrom } : {}),
    width,
    height,
    audioTracks: output.getAudioTracks().length,
    frameRate: video.getSettings().frameRate ?? options.fps,
    warnings,
  };
}

export function pauseRecording(): void {
  if (!session || session.state !== 'recording') return;
  session.recorder.pause();
  session.activeMs += performance.now() - session.segmentStart;
  session.state = 'paused';
}

export function resumeRecording(): void {
  if (!session || session.state !== 'paused') return;
  session.recorder.resume();
  session.segmentStart = performance.now();
  session.state = 'recording';
}

export function recordingStatus(): {
  jobId: string;
  state: State;
  chunks: number;
  /** 크롭 녹화에서 받은·내보낸 프레임 수 */
  frames?: { in: number; out: number };
} | null {
  if (!session) return null;
  return {
    jobId: session.options.jobId,
    state: session.state,
    chunks: session.seq,
    frames: session.cropped.frames(),
  };
}

/** 일시정지 구간을 뺀 지금까지의 녹화 시간 */
function activeMsOf(current: Session): number {
  return (
    current.activeMs +
    (current.state === 'recording' ? performance.now() - current.segmentStart : 0)
  );
}

/** 화면 비율이 바뀌면 그때까지 저장하고 서비스 워커에 알린다 */
function stopForLayoutChange(current: Session): void {
  stopWithWarning(current, 'layout-changed');
}

function stopWithWarning(current: Session, warning: string): void {
  void stopRecording({ warning })
    .then(({ resultId }) => onEnded?.(current.options.jobId, resultId))
    .catch(() => onEnded?.(current.options.jobId, null));
}

function release(current: Session): Promise<void> {
  current.cropped.stop();
  for (const stream of current.streams) for (const track of stream.getTracks()) track.stop();
  return current.audio.close();
}

/** 녹화를 끝내고 결과를 저장한다 */
export async function stopRecording(
  options: { warning?: string } = {},
): Promise<{ resultId: string }> {
  const current = session;
  if (!current) throw new CliptError('NO_JOB', 'not recording');
  session = null;
  if (options.warning && !current.warnings.includes(options.warning)) {
    current.warnings.push(options.warning);
  }
  if (current.state === 'recording') current.activeMs += performance.now() - current.segmentStart;

  if (current.recorder.state !== 'inactive') current.recorder.stop();
  await Promise.race([current.stopped, new Promise((resolve) => setTimeout(resolve, 5000))]);
  await current.writes;
  await release(current);

  const { jobId, mode, fps, audio } = current.options;
  const type = containerOf(current.mime);
  let blob = new Blob(await readChunks(jobId), { type });
  if (type === 'video/webm') {
    blob = await fixWebmDuration(blob, current.activeMs, { logger: false });
  }
  const meta = await saveResult(
    {
      kind: 'video',
      mode,
      mime: type,
      width: current.width,
      height: current.height,
      duration: current.activeMs / 1000,
      fps,
      audio,
      ...(current.warnings.length ? { warnings: current.warnings } : {}),
      ...(current.fallbackFrom ? { fallbackReason: current.fallbackFrom } : {}),
    },
    blob,
  );
  await deleteChunks(jobId);
  return { resultId: meta.id };
}

/** 녹화를 버린다(취소) */
export async function discardRecording(): Promise<void> {
  const current = session;
  if (!current) return;
  session = null;
  current.recorder.ondataavailable = null;
  if (current.recorder.state !== 'inactive') current.recorder.stop();
  await current.writes.catch(() => undefined);
  await release(current);
  await deleteChunks(current.options.jobId);
}
