import {
  buildPath,
  current,
  describe as describeEl,
  moveSibling,
  selectionOf,
  siblingOf,
  withDepth,
  type TreeAdapter,
} from '@/core/element-path';

/** 가짜 트리: body > main > (card1 > (img, p, hidden), card2), 그리고 숨김 래퍼 */
interface Node {
  name: string;
  parent: Node | null;
  children: Node[];
  hidden?: boolean;
}

function node(name: string, children: Node[] = [], hidden = false): Node {
  const n: Node = { name, parent: null, children, hidden };
  for (const c of children) c.parent = n;
  return n;
}

const img = node('img');
const p = node('p');
const hidden = node('span', [], true);
const card1 = node('card1', [img, p, hidden]);
const card2 = node('card2');
const wrapper = node('wrapper', [card1, card2], true); // 크기 0 래퍼(선택 불가)
const main = node('main', [wrapper]);
const body = node('body', [main]);

const tree: TreeAdapter<Node> = {
  parent: (n) => n.parent,
  children: (n) => n.children,
  selectable: (n) => !n.hidden,
};
const names = (nodes: Node[]) => nodes.map((n) => n.name);

describe('buildPath', () => {
  it('root부터 anchor까지, 선택 불가 조상은 건너뛴다', () => {
    expect(names(buildPath(img, body, tree))).toEqual(['body', 'main', 'card1', 'img']);
  });

  it('root 밖의 노드는 자신만 담는다', () => {
    const orphan = node('orphan');
    expect(names(buildPath(orphan, body, tree))).toEqual(['orphan']);
  });
});

describe('siblingOf', () => {
  it('선택 가능한 형제만 오간다', () => {
    expect(siblingOf(img, 1, tree)?.name).toBe('p');
    expect(siblingOf(p, 1, tree)).toBeNull(); // 다음 형제 span은 숨김
    expect(siblingOf(img, -1, tree)).toBeNull();
  });
});

describe('selection', () => {
  it('깊이를 왼쪽 끝→오른쪽 끝으로 왕복하면 처음 요소로 돌아온다', () => {
    let sel = selectionOf(img, body, tree);
    expect(current(sel).name).toBe('img');
    sel = withDepth(sel, 0);
    expect(current(sel).name).toBe('body');
    sel = withDepth(sel, 99);
    expect(current(sel).name).toBe('img');
  });

  it('상위로 올라간 뒤 형제로 이동하면 새 요소 기준으로 경로를 다시 만든다', () => {
    let sel = withDepth(selectionOf(img, body, tree), 2); // card1
    sel = moveSibling(sel, 1, body, tree);
    expect(current(sel).name).toBe('card2');
    expect(names(sel.path)).toEqual(['body', 'main', 'card2']);
    expect(sel.depth).toBe(2);
  });

  it('형제가 없으면 그대로', () => {
    const sel = selectionOf(img, body, tree);
    expect(moveSibling(sel, -1, body, tree)).toBe(sel);
  });
});

describe('describe', () => {
  it('태그·id·클래스 2개까지 표시하고 나머지는 줄인다', () => {
    expect(describeEl({ tag: 'div', id: 'main', classes: ['card', 'card--featured', 'x'] })).toBe(
      'div#main.card.card--featured…',
    );
    expect(describeEl({ tag: 'img' })).toBe('img');
    expect(describeEl({ tag: 'p', classes: ['a'.repeat(30)] })).toBe(`p.${'a'.repeat(19)}…`);
  });
});
