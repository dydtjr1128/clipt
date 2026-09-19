// 배포 빌드(.output/chrome-mv3)가 스토어에 올릴 수 있는 상태인지 확인한다.
// 릴리스 워크플로와 `npm run check:release`에서 실행한다.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const dir = '.output/chrome-mv3';
const problems = [];
const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

if (manifest.version !== pkg.version)
  problems.push(`manifest 버전 ${manifest.version} ≠ package.json ${pkg.version}`);
if (manifest.key) problems.push('E2E용 key가 배포 빌드에 들어 있음');
if ((manifest.host_permissions ?? []).length) problems.push('host_permissions가 있음');
for (const size of ['16', '32', '48', '128']) {
  const icon = manifest.icons?.[size];
  if (!icon || !existsSync(path.join(dir, icon))) problems.push(`아이콘 ${size}px 없음`);
}
for (const locale of ['ko', 'en']) {
  const file = path.join(dir, '_locales', locale, 'messages.json');
  if (!existsSync(file)) {
    problems.push(`_locales/${locale} 없음`);
    continue;
  }
  const messages = JSON.parse(readFileSync(file, 'utf8'));
  if ((messages.appName?.message ?? '').length > 75) problems.push(`${locale} 이름이 75자를 넘음`);
  if ((messages.appDesc?.message ?? '').length > 132)
    problems.push(`${locale} 설명이 132자를 넘음`);
}
// 소스맵·테스트 산출물이 섞이지 않았는지
const walk = (d) =>
  readdirSync(d).flatMap((name) => {
    const full = path.join(d, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
const files = walk(dir);
for (const file of files) if (file.endsWith('.map')) problems.push(`소스맵 포함: ${file}`);

const zip = readdirSync('.output').find((name) => name === `clipt-${pkg.version}.zip`);
if (process.argv.includes('--zip') || process.env.CI) {
  if (!zip) problems.push(`.output/clipt-${pkg.version}.zip 없음`);
}

const bytes = files.reduce((sum, file) => sum + statSync(file).size, 0);
console.log(
  `files: ${files.length}, size: ${(bytes / 1024).toFixed(0)} KB, version: ${manifest.version}`,
);
if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}
console.log('✓ 배포 빌드 검사 통과');
