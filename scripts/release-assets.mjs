// GitHub Release에 올릴 파일을 .output/release/에 모은다. `npm run zip` 뒤에 실행한다.
//   clipt.zip            고정 이름. releases/latest/download/clipt.zip 링크용
//   clipt-<version>.zip  같은 내용의 버전 표기 파일
//   SHA256SUMS.txt       두 zip의 체크섬
//   RELEASE_NOTES.md     releases/<version>.md
// CHANGELOG.md 맨 위 행의 버전이 package.json과 같은지도 확인한다.
// 태그 빌드(GITHUB_REF_TYPE=tag)에서는 태그가 v<version>인지, 커밋이 origin/main에 속하는지도 확인한다.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))
  fail(`버전은 X.Y.Z 형식이어야 함: ${version}`);

const tag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : '';
if (tag) {
  if (tag !== `v${version}`) fail(`태그 ${tag} ≠ package.json 버전 v${version}`);
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', 'HEAD', 'refs/remotes/origin/main'], {
      stdio: 'pipe',
    });
  } catch {
    fail('릴리스 커밋이 origin/main에 없음(전체 이력을 받아 왔는지 확인)');
  }
}

const notesFile = path.join('releases', `${version}.md`);
const notes = existsSync(notesFile) ? readFileSync(notesFile, 'utf8').trim() : '';
if (!notes) fail(`릴리스 노트 ${notesFile} 없음`);

// CHANGELOG 맨 위 행의 버전이 이번 릴리스 버전이어야 한다(행을 빠뜨린 채 릴리스하지 않도록)
const changelog = readFileSync('CHANGELOG.md', 'utf8');
const topRow = changelog.split('\n').find((line) => /^\| \d+\.\d+\.\d+ \|/.test(line));
const topVersion = topRow?.split('|')[1]?.trim();
if (topVersion !== version)
  fail(`CHANGELOG.md 맨 위 행의 버전 ${topVersion ?? '(없음)'} ≠ package.json 버전 ${version}`);

const zip = path.join('.output', `clipt-${version}.zip`);
if (!existsSync(zip)) fail(`${zip} 없음. 먼저 npm run zip 실행`);

const out = path.join('.output', 'release');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const names = ['clipt.zip', `clipt-${version}.zip`];
for (const name of names) copyFileSync(zip, path.join(out, name));
const sums = names
  .map((name) => {
    const hash = createHash('sha256')
      .update(readFileSync(path.join(out, name)))
      .digest('hex');
    return `${hash}  ${name}`;
  })
  .join('\n');
writeFileSync(path.join(out, 'SHA256SUMS.txt'), `${sums}\n`);
writeFileSync(path.join(out, 'RELEASE_NOTES.md'), `${notes}\n`);

if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
console.log(`✓ 릴리스 파일 준비: ${out} (Clipt ${version}${tag ? `, ${tag}` : ', 빌드만'})`);
