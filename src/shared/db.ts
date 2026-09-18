import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Mode } from '@/core/job';
import { selectExpired, DEFAULT_RETENTION, type RetentionPolicy } from '@/core/retention';

/**
 * 결과물과 녹화 chunk 저장소 (docs/architecture.md 10절).
 * Blob은 메시지로 넘기지 않고 여기에 저장한 뒤 id만 주고받는다.
 * 모든 확장 페이지와 오프스크린 문서가 같은 origin이라 같은 DB를 공유한다.
 */

export interface ResultMeta {
  id: string;
  kind: 'image' | 'video';
  mode: Mode;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: number;
  duration?: number;
  fps?: number;
  audio?: string;
  pageUrl?: string;
  pageTitle?: string;
  selector?: string;
  /** 캔버스 한계로 축소한 배율 (0~1) */
  scaled?: number;
  /** 요청 포맷을 지원하지 않아 폴백한 사유 */
  fallbackReason?: string;
}

export type NewResult = Omit<ResultMeta, 'id' | 'bytes' | 'createdAt'>;

interface CliptDB extends DBSchema {
  results: { key: string; value: ResultMeta; indexes: { createdAt: number } };
  blobs: { key: string; value: Blob };
  chunks: { key: [string, number]; value: Blob };
}

export const DB_NAME = 'clipt';
export const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<CliptDB>> | null = null;

function db(): Promise<IDBPDatabase<CliptDB>> {
  dbPromise ??= openDB<CliptDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      const results = database.createObjectStore('results', { keyPath: 'id' });
      results.createIndex('createdAt', 'createdAt');
      database.createObjectStore('blobs');
      database.createObjectStore('chunks');
    },
    terminated() {
      dbPromise = null;
    },
  });
  return dbPromise;
}

/** 테스트용: 열린 연결을 닫고 다음 호출에서 다시 연다 */
export async function closeDb(): Promise<void> {
  if (!dbPromise) return;
  const database = await dbPromise;
  database.close();
  dbPromise = null;
}

export async function saveResult(
  meta: NewResult,
  blob: Blob,
  now: number = Date.now(),
): Promise<ResultMeta> {
  const full: ResultMeta = { ...meta, id: crypto.randomUUID(), bytes: blob.size, createdAt: now };
  const tx = (await db()).transaction(['results', 'blobs'], 'readwrite');
  await Promise.all([
    tx.objectStore('results').put(full),
    tx.objectStore('blobs').put(blob, full.id),
    tx.done,
  ]);
  return full;
}

export async function loadResult(id: string): Promise<{ meta: ResultMeta; blob: Blob } | null> {
  const tx = (await db()).transaction(['results', 'blobs'], 'readonly');
  const [meta, blob] = await Promise.all([
    tx.objectStore('results').get(id),
    tx.objectStore('blobs').get(id),
  ]);
  await tx.done;
  return meta && blob ? { meta, blob } : null;
}

export async function deleteResults(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const tx = (await db()).transaction(['results', 'blobs'], 'readwrite');
  await Promise.all([
    ...ids.flatMap((id) => [
      tx.objectStore('results').delete(id),
      tx.objectStore('blobs').delete(id),
    ]),
    tx.done,
  ]);
}

/** 보존 정책을 넘은 결과를 삭제하고 삭제한 id를 반환한다 */
export async function pruneResults(
  now: number = Date.now(),
  policy: RetentionPolicy = DEFAULT_RETENTION,
): Promise<string[]> {
  const metas = await (await db()).getAll('results');
  const expired = selectExpired(metas, now, policy);
  await deleteResults(expired);
  return expired;
}

export async function appendChunk(jobId: string, seq: number, chunk: Blob): Promise<void> {
  await (await db()).put('chunks', chunk, [jobId, seq]);
}

/** jobId의 chunk를 순서대로 반환한다 */
export async function readChunks(jobId: string): Promise<Blob[]> {
  const range = IDBKeyRange.bound([jobId, -Infinity], [jobId, Infinity]);
  return (await db()).getAll('chunks', range);
}

export async function deleteChunks(jobId: string): Promise<void> {
  const range = IDBKeyRange.bound([jobId, -Infinity], [jobId, Infinity]);
  await (await db()).delete('chunks', range);
}

/** chunk가 남아 있는 작업 id 목록. 비정상 종료된 녹화 복구에 사용 */
export async function listChunkJobIds(): Promise<string[]> {
  const keys = await (await db()).getAllKeys('chunks');
  return [...new Set(keys.map(([jobId]) => jobId))];
}
