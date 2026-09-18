/** 결과 보존 정책 (docs/architecture.md 10절): 24시간 또는 총 500MB 초과 시 오래된 것부터 삭제 */
export interface RetentionPolicy {
  maxAgeMs: number;
  maxBytes: number;
}

export const DEFAULT_RETENTION: RetentionPolicy = {
  maxAgeMs: 24 * 60 * 60 * 1000,
  maxBytes: 500 * 1024 * 1024,
};

export interface RetainedItem {
  id: string;
  createdAt: number;
  bytes: number;
}

/** 삭제할 결과 id 목록을 오래된 순으로 반환한다. */
export function selectExpired(
  items: readonly RetainedItem[],
  now: number,
  policy: RetentionPolicy = DEFAULT_RETENTION,
): string[] {
  const sorted = [...items].sort((a, b) => a.createdAt - b.createdAt);
  const expired: string[] = [];
  let total = sorted.reduce((sum, item) => sum + item.bytes, 0);

  for (const item of sorted) {
    const tooOld = now - item.createdAt > policy.maxAgeMs;
    const overBudget = total > policy.maxBytes;
    if (!tooOld && !overBudget) continue;
    expired.push(item.id);
    total -= item.bytes;
  }
  return expired;
}
