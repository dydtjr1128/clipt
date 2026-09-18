import { restrictionOf } from '@/core/restricted';

const noFile = { fileAccess: false };

describe('restrictionOf', () => {
  it.each(['https://example.com/a', 'http://localhost:3000', 'https://chrome.google.com/search'])(
    '일반 웹페이지는 허용: %s',
    (url) => {
      expect(restrictionOf(url, noFile)).toBeNull();
    },
  );

  it.each([
    ['chrome://extensions', 'browser'],
    ['chrome-extension://abc/popup.html', 'browser'],
    ['edge://settings', 'browser'],
    ['about:blank', 'browser'],
    ['view-source:https://example.com', 'browser'],
    ['https://chromewebstore.google.com/detail/x', 'webstore'],
    ['https://chrome.google.com/webstore/detail/x', 'webstore'],
    ['https://microsoftedge.microsoft.com/addons/detail/x', 'webstore'],
    ['data:text/html,hi', 'unsupported'],
    ['blob:https://example.com/1', 'unsupported'],
    [undefined, 'no-access'],
    ['not a url', 'no-access'],
  ])('%s → %s', (url, reason) => {
    expect(restrictionOf(url, noFile)).toBe(reason);
  });

  it('file URL은 파일 접근을 허용한 경우에만 허용', () => {
    expect(restrictionOf('file:///C:/a.html', noFile)).toBe('file');
    expect(restrictionOf('file:///C:/a.html', { fileAccess: true })).toBeNull();
  });
});
