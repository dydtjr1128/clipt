import 'fake-indexeddb/auto';
import { fakeBrowser } from 'wxt/testing/fake-browser';

// 테스트마다 chrome API 대역 상태를 초기화한다.
beforeEach(() => {
  fakeBrowser.reset();
});
