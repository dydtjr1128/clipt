import { MIX_SAMPLE_RATE, mixAudio } from '@/offscreen/audio-mixer';
import { recordedMs } from '@/core/job';

/** 연결 관계만 기록하는 가짜 AudioContext */
function fakeContext() {
  const connections: [string, string][] = [];
  const outputTrack = { kind: 'audio', id: 'mixed' };
  const destination = { name: 'speaker' };
  const output = { name: 'recording', stream: { getAudioTracks: () => [outputTrack] } };
  let closed = false;
  const context = {
    destination,
    createMediaStreamDestination: () => output,
    createMediaStreamSource: (stream: { name: string }) => ({
      connect: (target: { name: string }) => connections.push([stream.name, target.name]),
    }),
    close: async () => {
      closed = true;
    },
  };
  return {
    context: context as unknown as AudioContext,
    connections,
    outputTrack,
    isClosed: () => closed,
  };
}

const stream = (name: string, audio: number) =>
  ({
    name,
    getAudioTracks: () => Array.from({ length: audio }, () => ({})),
  }) as unknown as MediaStream;

describe('mixAudio', () => {
  it('탭 소리는 녹화와 스피커 양쪽으로, 마이크는 녹화로만 보낸다', async () => {
    const fake = fakeContext();
    const mix = mixAudio(stream('tab', 1), stream('mic', 1), () => fake.context);
    expect(fake.connections).toEqual([
      ['tab', 'speaker'],
      ['tab', 'recording'],
      ['mic', 'recording'],
    ]);
    expect(mix.track).toBe(fake.outputTrack);
    await mix.close();
    expect(fake.isClosed()).toBe(true);
  });

  it('기본 컨텍스트는 출력 장치와 관계없이 48kHz로 만든다(96kHz 장치에서 MP4 AAC 인코더 멈춤 방지)', () => {
    const options: unknown[] = [];
    vi.stubGlobal(
      'AudioContext',
      class {
        destination = { name: 'speaker' };
        constructor(init: unknown) {
          options.push(init);
        }
        createMediaStreamDestination() {
          return { stream: { getAudioTracks: () => [{}] } };
        }
        createMediaStreamSource() {
          return { connect: () => undefined };
        }
        close = async () => undefined;
      },
    );
    mixAudio(stream('tab', 1), null);
    expect(options).toEqual([{ sampleRate: MIX_SAMPLE_RATE }]);
    expect(MIX_SAMPLE_RATE).toBe(48_000);
    vi.unstubAllGlobals();
  });

  it('오디오가 없으면 트랙도 컨텍스트도 만들지 않는다', () => {
    let created = false;
    const mix = mixAudio(stream('tab', 0), null, () => {
      created = true;
      return fakeContext().context;
    });
    expect(mix.track).toBeNull();
    expect(created).toBe(false);
  });
});

describe('recordedMs', () => {
  it('일시정지 구간을 빼고, 일시정지 중에는 멈춘다', () => {
    expect(recordedMs({ startedAt: 1000 }, 6000)).toBe(5000);
    expect(recordedMs({ startedAt: 1000, pausedTotal: 2000 }, 6000)).toBe(3000);
    expect(recordedMs({ startedAt: 1000, pausedAt: 4000, pausedTotal: 1000 }, 9000)).toBe(2000);
    expect(recordedMs({}, 9000)).toBe(0);
  });
});
