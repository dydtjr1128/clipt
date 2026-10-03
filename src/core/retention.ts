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

/**
 * 삭제할 결과 id 목록을 오래된 순으로 반환한다.
 * 가장 최근 결과는 용량 한도를 넘어도 지우지 않는다. 긴 녹화 하나가 한도보다 크면 방금 만든 결과를
 * 보기도 전에 잃기 때문이다(그 녹화의 chunk는 저장 직후 지워져 복구할 수도 없다).
 * keep(지금 열려 있는 결과 등)은 기간·용량과 관계없이 남긴다.
 */
export function selectExpired(
  items: readonly RetainedItem[],
  now: number,
  policy: RetentionPolicy = DEFAULT_RETENTION,
  keep: readonly string[] = [],
): string[] {
  const sorted = [...items].sort((a, b) => a.createdAt - b.createdAt);
  const newest = sorted.at(-1)?.id;
  const expired: string[] = [];
  let total = sorted.reduce((sum, item) => sum + item.bytes, 0);

  for (const item of sorted) {
    if (keep.includes(item.id)) continue;
    const tooOld = now - item.createdAt > policy.maxAgeMs;
    const overBudget = total > policy.maxBytes && item.id !== newest;
    if (!tooOld && !overBudget) continue;
    expired.push(item.id);
    total -= item.bytes;
  }
  return expired;
}
