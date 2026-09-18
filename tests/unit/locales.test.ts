import ko from '../../public/_locales/ko/messages.json';
import en from '../../public/_locales/en/messages.json';

describe('_locales', () => {
  it('ko와 en의 메시지 키가 같다', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ko).sort());
  });

  it('모든 메시지가 비어 있지 않다', () => {
    for (const messages of [ko, en]) {
      for (const [key, value] of Object.entries(messages)) {
        expect(value.message.trim(), key).not.toBe('');
      }
    }
  });
});
