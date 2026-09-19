/**
 * 요소 경로·깊이·형제 이동 규칙 (docs/architecture.md 8.2절).
 * DOM에 의존하지 않도록 트리 접근을 어댑터로 받는다. 콘텐츠 스크립트는 DOM 어댑터를,
 * 단위 테스트는 가짜 트리를 넘긴다.
 */
export interface TreeAdapter<N> {
  /** Shadow DOM 경계를 넘는 부모(ShadowRoot면 host). 루트면 null */
  parent(node: N): N | null;
  children(node: N): readonly N[];
  /** 선택 가능 여부(크기 0, 숨김, 오버레이 자신 제외) */
  selectable(node: N): boolean;
}

/**
 * root부터 anchor까지의 경로. root·anchor 포함, 선택 불가 조상은 건너뛴다.
 * anchor가 root 밖이면 anchor만 담는다.
 */
export function buildPath<N>(anchor: N, root: N, tree: TreeAdapter<N>): N[] {
  const path: N[] = [];
  let node: N | null = anchor;
  while (node !== null) {
    if (node === anchor || node === root || tree.selectable(node)) path.unshift(node);
    if (node === root) return path;
    node = tree.parent(node);
  }
  return [anchor];
}

/** 같은 부모의 선택 가능한 이전(-1)·다음(+1) 형제. 없으면 null */
export function siblingOf<N>(node: N, direction: -1 | 1, tree: TreeAdapter<N>): N | null {
  const parent = tree.parent(node);
  if (!parent) return null;
  const siblings = tree.children(parent).filter((n) => n === node || tree.selectable(n));
  const index = siblings.indexOf(node);
  if (index < 0) return null;
  return siblings[index + direction] ?? null;
}

/**
 * 고정된 선택 상태: 기준 경로(path)와 그 안의 현재 깊이(depth).
 * ↑/↓·슬라이더는 depth만 바꾸므로 왕복하면 원래 요소로 돌아온다.
 * ←/→ 형제 이동과 경로 밖 요소 선택은 기준 경로를 새로 만든다.
 */
export interface Selection<N> {
  path: N[];
  depth: number;
}

export function selectionOf<N>(anchor: N, root: N, tree: TreeAdapter<N>): Selection<N> {
  const path = buildPath(anchor, root, tree);
  return { path, depth: path.length - 1 };
}

export function current<N>(selection: Selection<N>): N {
  return selection.path[selection.depth]!;
}

export function withDepth<N>(selection: Selection<N>, depth: number): Selection<N> {
  const clamped = Math.min(Math.max(depth, 0), selection.path.length - 1);
  return { ...selection, depth: clamped };
}

export function moveSibling<N>(
  selection: Selection<N>,
  direction: -1 | 1,
  root: N,
  tree: TreeAdapter<N>,
): Selection<N> {
  const next = siblingOf(current(selection), direction, tree);
  return next ? selectionOf(next, root, tree) : selection;
}

/** 요소 표시 이름: `tag#id.class1.class2` (클래스는 2개까지, 긴 값은 줄임) */
export function describe(info: { tag: string; id?: string; classes?: readonly string[] }): string {
  const short = (value: string, max: number) =>
    value.length > max ? `${value.slice(0, max - 1)}…` : value;
  const id = info.id ? `#${short(info.id, 24)}` : '';
  const classes = (info.classes ?? [])
    .filter(Boolean)
    .slice(0, 2)
    .map((c) => `.${short(c, 20)}`)
    .join('');
  const more = (info.classes?.filter(Boolean).length ?? 0) > 2 ? '…' : '';
  return `${info.tag}${id}${classes}${more}`;
}
