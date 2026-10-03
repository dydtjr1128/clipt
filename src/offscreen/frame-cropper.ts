import {
  aspectChanged,
  centeredDraw,
  cropPixels,
  needsPadding,
  paddedSize,
  trackedCanvasSize,
  trackedDraw,
  type NormalizedRect,
} from '@/core/crop';

/**
 * 녹화 프레임 처리 (docs/architecture.md 9.1·9.2절).
 * 오프스크린 문서는 화면에 보이지 않아 requestAnimationFrame이 돌지 않으므로 캔버스 대신
 * MediaStreamTrackProcessor(프레임 읽기) → VideoFrame visibleRect(자르기) →
 * MediaStreamTrackGenerator(트랙 만들기)로 프레임 단위 처리한다.
 *
 * 시작 직후 warmupMs 동안의 프레임은 버린다. 탭 캡처가 시작할 때 선택 UI·카운트다운을
 * 지우기 전 화면을 첫 프레임으로 보낼 수 있기 때문이다.
 *
 * 요소 추적(9.6절)은 출력 크기를 고정해야 하므로 visibleRect 대신 OffscreenCanvas에 그려 새 프레임을 만든다.
 * 고정 크롭도 최소 출력 크기(core/crop.ts paddedSize)보다 작으면 여백을 둬야 해 같은 캔버스 경로로 그린다.
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
  /** 요소 추적: 프레임마다 최신 요소 위치(자르지 않은 뷰포트 비율)를 읽는다. crop 대신 쓴다 */
  track: (() => NormalizedRect) | null = null,
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
  let canvas: OffscreenCanvas | null = null;
  /**
   * 요소 추적: 직전 프레임의 캔버스 사본, 사본에 실제로 그린 프레임이 담겼는지(첫 프레임 전의 검정 캔버스가 아님),
   * 요소가 화면 밖이라 화면을 유지 중인지
   */
  let previous: OffscreenCanvas | null = null;
  let previousDrawn = false;
  let drawnFrames = 0;
  let holding = false;
  /** 고정 크롭을 여백 있는 캔버스에 그릴지. 첫 프레임에서 정한다 */
  let padCrop: boolean | null = null;
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
      if (crop && !track && padCrop === null) padCrop = needsPadding(cropPixels(crop, frameSize));
      // 캔버스 경로: 요소 추적(최신 요소 위치) 또는 여백이 필요한 고정 크롭(같은 픽셀 사각형을 1:1로 가운데)
      if (track || (padCrop && crop)) {
        if (!canvas) {
          // 요소가 아직 보이지 않으면(숨김·0 크기) 크기를 정할 수 없어 보일 때까지 프레임을 버린다
          const content = track
            ? trackedCanvasSize(track(), frameSize)
            : cropPixels(crop!, frameSize);
          if (!content) {
            frame.close();
            return;
          }
          const fixed = paddedSize(content);
          canvas = new OffscreenCanvas(fixed.width, fixed.height);
          const ctx = canvas.getContext('2d', { alpha: false })!;
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, fixed.width, fixed.height);
        }
        outSize = { width: canvas.width, height: canvas.height };
        try {
          const draw = track
            ? trackedDraw(track(), frameSize, outSize)
            : centeredDraw(cropPixels(crop!, frameSize), outSize);
          const ctx = canvas.getContext('2d', { alpha: false })!;
          if (draw) {
            if (track) {
              // 다음 프레임에 요소가 화면 밖으로 나가면 되돌릴 수 있게 지금 화면을 보관한다
              previous ??= new OffscreenCanvas(canvas.width, canvas.height);
              previous.getContext('2d', { alpha: false })!.drawImage(canvas, 0, 0);
              previousDrawn = drawnFrames > 0;
              drawnFrames++;
              holding = false;
            }
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(
              frame,
              draw.src.x,
              draw.src.y,
              draw.src.width,
              draw.src.height,
              draw.dst.x,
              draw.dst.y,
              draw.dst.width,
              draw.dst.height,
            );
          } else if (previous && previousDrawn && !holding) {
            // 요소가 막 화면 밖으로 나감: 그리지 않고 직전 화면을 유지한다. 단, 위치 메시지가 한 프레임 늦어
            // 바로 앞 프레임은 이미 움직인 화면을 옛 위치로 그렸을 수 있어(#60) 그 이전 프레임으로 되돌린다
            ctx.drawImage(previous, 0, 0);
            holding = true;
          }
          output = new VideoFrame(canvas, {
            timestamp: frame.timestamp,
            ...(frame.duration ? { duration: frame.duration } : {}),
          });
        } catch {
          output = null;
        } finally {
          frame.close();
        }
      } else if (crop) {
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
