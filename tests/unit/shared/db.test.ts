import {
  appendChunk,
  closeDb,
  DB_NAME,
  deleteChunks,
  listChunkJobIds,
  loadResult,
  pruneResults,
  readChunks,
  saveResult,
} from '@/shared/db';

const HOUR = 60 * 60 * 1000;
const image = { kind: 'image', mode: 'visible', mime: 'image/png', width: 2, height: 1 } as const;

afterEach(async () => {
  await closeDb();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = () => resolve();
  });
});

describe('results', () => {
  it('저장한 결과를 id로 다시 읽는다', async () => {
    const blob = new Blob([new Uint8Array(10)], { type: 'image/png' });
    const meta = await saveResult(image, blob, 1000);

    expect(meta).toMatchObject({ ...image, bytes: 10, createdAt: 1000 });
    const loaded = await loadResult(meta.id);
    expect(loaded?.meta).toEqual(meta);
    expect(loaded?.blob.size).toBe(10);
  });

  it('없는 id는 null', async () => {
    expect(await loadResult('missing')).toBeNull();
  });

  it('보존 기간이 지난 결과를 메타와 Blob 모두 삭제한다', async () => {
    const now = 100 * HOUR;
    const old = await saveResult(image, new Blob(['a']), now - 25 * HOUR);
    const fresh = await saveResult(image, new Blob(['b']), now - HOUR);

    expect(await pruneResults(now)).toEqual([old.id]);
    expect(await loadResult(old.id)).toBeNull();
    expect(await loadResult(fresh.id)).not.toBeNull();
  });
});

describe('chunks', () => {
  it('작업별로 순서대로 읽고 삭제한다', async () => {
    await appendChunk('job-a', 1, new Blob(['2']));
    await appendChunk('job-a', 0, new Blob(['1']));
    await appendChunk('job-b', 0, new Blob(['x']));

    const chunks = await readChunks('job-a');
    expect(await Promise.all(chunks.map((c) => c.text()))).toEqual(['1', '2']);
    expect((await listChunkJobIds()).sort()).toEqual(['job-a', 'job-b']);

    await deleteChunks('job-a');
    expect(await readChunks('job-a')).toEqual([]);
    expect(await listChunkJobIds()).toEqual(['job-b']);
  });
});
