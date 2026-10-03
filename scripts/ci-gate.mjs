// 태그 릴리스 게시 전: 태그 커밋에 대해 CI 워크플로(main 푸시)가 성공했는지 확인한다.
// 실행 중이면 끝날 때까지 기다리고, 실패·취소·실행 없음이면 실패한다. release.yml의 게시 단계 앞에서 실행한다.
//   GH_TOKEN  actions:read 권한 토큰(워크플로에서는 github.token)
//   GH_REPO   owner/repo
//   SHA       확인할 커밋(태그가 가리키는 커밋)
// 로컬 확인: GH_TOKEN=$(gh auth token) GH_REPO=dydtjr1128/clipt SHA=<커밋> node scripts/ci-gate.mjs
const { GH_TOKEN, GH_REPO, SHA } = process.env;
const WAIT_MS = Number(process.env.CI_GATE_WAIT_MS ?? 25 * 60_000);
const MISSING_MS = Number(process.env.CI_GATE_MISSING_MS ?? 3 * 60_000);
const POLL_MS = Number(process.env.CI_GATE_POLL_MS ?? 30_000);

class GateError extends Error {}
const fail = (message) => {
  throw new GateError(message);
};

async function latestRun() {
  const url = `https://api.github.com/repos/${GH_REPO}/actions/workflows/ci.yml/runs?head_sha=${SHA}&event=push&per_page=10`;
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${GH_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) fail(`CI 실행 조회 실패: HTTP ${response.status}`);
  const { workflow_runs: runs } = await response.json();
  // 같은 커밋을 다시 실행했으면 가장 최근 시도를 본다
  return runs.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] ?? null;
}

async function gate() {
  if (!GH_TOKEN || !GH_REPO || !SHA) fail('GH_TOKEN, GH_REPO, SHA 환경 변수가 필요함');
  const started = Date.now();
  for (;;) {
    const run = await latestRun();
    const elapsed = Date.now() - started;
    if (!run) {
      if (elapsed > MISSING_MS) {
        fail(
          `커밋 ${SHA.slice(0, 7)}의 CI(main 푸시) 실행이 없음. main에 머지된 커밋에 태그를 붙였는지 확인`,
        );
      }
    } else if (run.status === 'completed') {
      if (run.conclusion === 'success') return `CI 성공: ${run.html_url}`;
      fail(`CI가 ${run.conclusion}(으)로 끝남: ${run.html_url}`);
    }
    if (elapsed > WAIT_MS) fail(`CI가 ${Math.round(WAIT_MS / 60_000)}분 안에 끝나지 않음`);
    console.log(
      `· CI ${run ? run.status : '실행 대기'}, ${Math.round(POLL_MS / 1000)}초 뒤 다시 확인`,
    );
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

// process.exit 대신 exitCode를 둬 열린 네트워크 핸들이 정리된 뒤 끝나게 한다
try {
  console.log(`✓ ${await gate()}`);
} catch (error) {
  console.error(`✗ ${error instanceof GateError ? error.message : String(error)}`);
  process.exitCode = 1;
}
