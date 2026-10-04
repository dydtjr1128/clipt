// PR이 배포 빌드를 바꾸는데 버전을 올리지 않았으면 경고한다(AGENTS.md 버전과 변경기록).
// 배포 빌드 변경: src/·public/·wxt.config.ts 파일, 또는 런타임 의존성(lockfile에서 dev가 아닌 패키지) 변경.
// 묶음의 중간 PR은 버전을 올리지 않으므로 실패하지 않고 GitHub 경고·요약만 남긴다.
//   BASE  비교 기준 커밋(PR의 base). 로컬: BASE=origin/main node scripts/check-version-bump.mjs
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

const base = process.env.BASE ?? 'origin/main';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const readBase = (file) => {
  try {
    return git('show', `${base}:${file}`);
  } catch {
    return null;
  }
};

const files = git('diff', '--name-only', `${base}...HEAD`, '--', 'src', 'public', 'wxt.config.ts')
  .split(/\r?\n/)
  .filter(Boolean);

/** lockfile에서 런타임에 쓰이는(dev가 아닌) 패키지 → 버전·출처·무결성(같은 버전 번호의 다른 출처도 변경으로 본다) */
function runtimePackages(lockText) {
  if (!lockText) return new Map();
  const { packages = {} } = JSON.parse(lockText);
  return new Map(
    Object.entries(packages)
      .filter(([name, info]) => name && !info.dev)
      .map(([name, info]) => [
        name.replace(/^node_modules\//, ''),
        [info.version, info.resolved, info.integrity].join(' '),
      ]),
  );
}
const before = runtimePackages(readBase('package-lock.json'));
const after = runtimePackages(readFileSync('package-lock.json', 'utf8'));
const deps = [...new Set([...before.keys(), ...after.keys()])]
  .filter((name) => before.get(name) !== after.get(name))
  .map((name) => {
    const version = (entry) => entry?.split(' ')[0];
    return `${name} ${version(before.get(name)) ?? '(없음)'} → ${version(after.get(name)) ?? '(삭제)'}`;
  });

const baseVersion = JSON.parse(readBase('package.json') ?? '{}').version;
const headVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
const changed = [...files, ...deps.map((d) => `의존성: ${d}`)];

if (changed.length && baseVersion === headVersion) {
  console.log(
    `::warning title=버전을 올리지 않음::배포 빌드가 바뀌었지만 버전이 ${headVersion} 그대로입니다. 단독 PR이나 묶음의 마지막 PR이면 버전을 올리고 releases/X.Y.Z.md와 CHANGELOG 행을 추가하세요.`,
  );
  if (process.env.GITHUB_STEP_SUMMARY) {
    const list = changed.map((c) => `- ${c}`).join('\n');
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### 버전을 올리지 않음\n\n바뀐 배포 빌드:\n\n${list}\n`,
    );
  }
  for (const c of changed) console.log(`· ${c}`);
} else {
  console.log(`버전 ${baseVersion} → ${headVersion}, 배포 빌드 변경 ${changed.length}개`);
}
