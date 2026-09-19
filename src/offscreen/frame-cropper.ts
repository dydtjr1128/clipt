import { aspectChanged, cropPixels, type NormalizedRect } from '@/core/crop';

/**
 * 녹화 프레임 처리 (docs/architecture.md 9.1·9.2절).
 * 오프스크린 문서는 화면에 보이지 않아 requestAnimationFrame이 돌지 않으므로 캔버스 대신
 * MediaStreamTrackProcessor(프레임 읽기) → VideoFrame visibleRect(자르기) →
 * MediaStreamTrackGenerator(트랙 만들기)로 프레임 단위 처리한다.
 *
 * 시작 직후 warmupMs 동안의 프레임은 버린다. 탭 캡처가 시작할 때 선택 UI·카운트다운을
 * 지우기 전 화면을 첫 프레임으로 보낼 수 있기 때문이다.
 */
interface ProcessorCtor {
  new (init: { track: MediaStreamTrack }): { readable: ReadableStream<VideoFrame> };
}
interface GeneratorCtor {
  new (init: { kind: 'video' }): MediaStreamTrack & { writable: WritableStream<VideoFrame> };
}

export const WARMUP_MS = 250;

export interface CroppedTrack {
  track: MediaStreamTrack;
  /** 출력 크기(px). 첫 출력 프레임 기준 */
  size: Promise<{ width: number; height: number }>;
  /** 지금까지 받은·내보낸 프레임 수(성능 확인용). 워밍업으로 버린 프레임은 in에서 뺀다 */
  frames(): { in: number; out: number };
  stop(): void;
}

export function cropTrack(
  source: MediaStreamTrack,
  /** null이면 자르지 않고 그대로 내보낸다(탭 녹화) */
  crop: NormalizedRect | null,
  /** 화면 비율이 바뀌면 한 번 호출(영역·요소 녹화) */
  onLayoutChange: (() => void) | null,
  warmupMs = WARMUP_MS,
): CroppedTrack {
  const g = globalThis as unknown as {
    MediaStreamTrackProcessor: ProcessorCtor;
    MediaStreamTrackGenerator: GeneratorCtor;
  };
  const processor = new g.MediaStreamTrackProcessor({ track: source });
  const generator = new g.MediaStreamTrackGenerator({ kind: 'video' });
  let base: { width: number; height: number } | null = null;
  let changed = false;
  let framesIn = 0;
  let framesOut = 0;
  let firstTimestamp: number | null = null;
  let resolveSize!: (size: { width: number; height: number }) => void;
  const size = new Promise<{ width: number; height: number }>((resolve) => (resolveSize = resolve));

  const transformer = new TransformStream<VideoFrame, VideoFrame>({
    transform(frame, controller) {
      // timestamp는 마이크로초
      firstTimestamp ??= frame.timestamp;
      if (frame.timestamp - firstTimestamp < warmupMs * 1000) {
        frame.close();
        return;
      }
      framesIn++;
      const frameSize = { width: frame.codedWidth, height: frame.codedHeight };
      if (!base) {
        base = frameSize;
      } else if (onLayoutChange && !changed && aspectChanged(base, frameSize)) {
        // 창 크기가 바뀌어 화면 비율이 달라지면 같은 영역을 이어 녹화할 수 없다
        changed = true;
        onLayoutChange();
      }
      let output: VideoFrame | null;
      let outSize = { width: frame.displayWidth, height: frame.displayHeight };
      if (crop) {
        const rect = cropPixels(crop, frameSize);
        outSize = { width: rect.width, height: rect.height };
        try {
          output = new VideoFrame(frame, { visibleRect: rect });
        } catch {
          output = null;
        } finally {
          frame.close();
        }
      } else {
        output = frame;
      }
      if (!output) return;
      resolveSize(outSize);
      framesOut++;
      controller.enqueue(output);
    },
  });
  const done = processor.readable
    .pipeThrough(transformer)
    .pipeTo(generator.writable)
    .catch(() => undefined);

  return {
    track: generator,
    size,
    frames: () => ({ in: framesIn, out: framesOut }),
    stop() {
      source.stop();
      generator.stop();
      void done;
    },
  };
}
