import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ko from '../../public/_locales/ko/messages.json';
import en from '../../public/_locales/en/messages.json';

type Messages = Record<string, { message: string; description?: string }>;
const locales: Record<string, Messages> = { ko, en };

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/** 주석을 지운 소스. 문자열 안의 `//`(URL 등)는 건드리지 않는다 */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const placeholders = (message: string) => [...new Set(message.match(/\$\d/g) ?? [])].sort();

describe('_locales', () => {
  it('ko와 en의 메시지 키가 같다', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ko).sort());
  });

  it('모든 메시지가 비어 있지 않다', () => {
    for (const messages of Object.values(locales)) {
      for (const [key, value] of Object.entries(messages)) {
        expect(value.message.trim(), key).not.toBe('');
      }
    }
  });

  it('치환자($1, $2 …)가 두 언어에서 같다', () => {
    for (const key of Object.keys(ko)) {
      expect(placeholders((en as Messages)[key]!.message), key).toEqual(
        placeholders((ko as Messages)[key]!.message),
      );
    }
  });

  it('스토어 제한을 지킨다: 이름 75자, 설명 132자 이하', () => {
    for (const messages of Object.values(locales)) {
      expect(messages.appName!.message.length).toBeLessThanOrEqual(75);
      expect(messages.appDesc!.message.length).toBeLessThanOrEqual(132);
    }
  });
});

describe('소스', () => {
  const files = sourceFiles('src');
  const sources = files.map((file) => ({ file, code: readFileSync(file, 'utf8') }));

  it('주석 밖에 한글 문자열이 없다(화면 문구는 messages.json에만)', () => {
    const offenders = sources.flatMap(({ file, code }) =>
      stripComments(code)
        .split('\n')
        .map((line, index) => ({ line, where: `${file}:${index + 1}` }))
        .filter(({ line }) => /[가-힣]/.test(line))
        .map(({ where }) => where),
    );
    expect(offenders).toEqual([]);
  });

  it('쓰이지 않는 메시지 키가 없다', () => {
    const all = sources.map((s) => s.code).join('\n') + readFileSync('wxt.config.ts', 'utf8');
    const unused = Object.keys(ko).filter(
      (key) =>
        !key.startsWith('cmd_') && // wxt.config.ts가 명령 이름으로 조합해 쓴다
        !all.includes(`'${key}'`) &&
        !all.includes(`__MSG_${key}__`),
    );
    expect(unused).toEqual([]);
  });

  it('단축키 명령마다 설명 메시지가 있다', async () => {
    const { RECORDING_MENU, SCREENSHOT_MENU } = await import('@/core/menu');
    for (const { command } of [...SCREENSHOT_MENU, ...RECORDING_MENU]) {
      expect(Object.keys(ko)).toContain(`cmd_${command.replaceAll('-', '_')}`);
    }
  });
});
