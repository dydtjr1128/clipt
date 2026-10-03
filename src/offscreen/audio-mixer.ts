/**
 * 탭·마이크 오디오를 하나의 트랙으로 합친다 (docs/architecture.md 9.1절).
 * tabCapture로 탭 소리를 잡으면 사용자에게 들리지 않으므로 탭 소리는 스피커(destination)로도 보낸다.
 * 마이크는 하울링을 막기 위해 스피커로 보내지 않는다.
 */
export interface AudioMix {
  /** 녹화에 넣을 오디오 트랙. 소리 설정이 없으면 null */
  track: MediaStreamTrack | null;
  close(): Promise<void>;
}

/**
 * 합성 샘플레이트. 기본값(출력 장치 샘플레이트)은 96kHz 장치 등에서 MP4의 AAC 인코더가 받지 못해
 * MediaRecorder가 데이터를 내지 않는다. AAC·Opus 모두 지원하는 48kHz로 고정하고 스피커 출력은 브라우저가 변환한다
 */
export const MIX_SAMPLE_RATE = 48_000;

export function mixAudio(
  tab: MediaStream | null,
  mic: MediaStream | null,
  createContext: () => AudioContext = () => new AudioContext({ sampleRate: MIX_SAMPLE_RATE }),
): AudioMix {
  const hasTab = (tab?.getAudioTracks().length ?? 0) > 0;
  const hasMic = (mic?.getAudioTracks().length ?? 0) > 0;
  if (!hasTab && !hasMic) return { track: null, close: async () => undefined };

  const context = createContext();
  const output = context.createMediaStreamDestination();
  if (hasTab && tab) {
    const source = context.createMediaStreamSource(tab);
    source.connect(context.destination); // 녹화 중에도 탭 소리가 들리게
    source.connect(output);
  }
  if (hasMic && mic) {
    context.createMediaStreamSource(mic).connect(output);
  }
  return {
    track: output.stream.getAudioTracks()[0] ?? null,
    close: () => context.close().catch(() => undefined),
  };
}
