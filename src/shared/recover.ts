import fixWebmDuration from 'fix-webm-duration';
import { deleteChunks, listChunkJobIds, readChunks, saveResult } from './db';

/**
 * 비정상 종료로 남은 녹화 chunk 복구 (docs/architecture.md 9.5절).
 * 브라우저가 녹화 중에 꺼지면 결과는 없고 chunk만 IndexedDB에 남는다.
 */

/** 진행 중인 작업을 뺀, 결과로 만들어지지 못한 녹화 id */
export async function orphanRecordings(activeJobId?: string): Promise<string[]> {
  return (await listChunkJobIds()).filter((id) => id !== activeJobId);
}

/** chunk를 합쳐 결과로 저장하고 결과 id를 돌려준다. chunk가 없으면 null */
export async function recoverRecording(jobId: string): Promise<string | null> {
  const chunks = await readChunks(jobId);
  if (chunks.length === 0) return null;
  const type = chunks[0]!.type.startsWith('video/mp4') ? 'video/mp4' : 'video/webm';
  // 정확한 길이는 알 수 없어 chunk 간격(1초)으로 어림한다
  const seconds = chunks.length;
  let blob = new Blob(chunks, { type });
  if (type === 'video/webm') {
    blob = await fixWebmDuration(blob, seconds * 1000, { logger: false }).catch(() => blob);
  }
  const meta = await saveResult(
    {
      kind: 'video',
      mode: 'rec-tab',
      mime: type,
      width: 0,
      height: 0,
      duration: seconds,
      warnings: ['recovered'],
    },
    blob,
  );
  await deleteChunks(jobId);
  return meta.id;
}

export function discardRecording(jobId: string): Promise<void> {
  return deleteChunks(jobId);
}
