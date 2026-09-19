import { CliptError } from '@/core/errors';
import { loadResult } from '@/shared/db';
import { listen, send } from '@/shared/messages';
import {
  discardRecording,
  pauseRecording,
  recordingStatus,
  resumeRecording,
  setEndedHandler,
  startRecording,
  stopRecording,
} from '@/offscreen/recorder';

// 오프스크린 문서: 캔버스·MediaRecorder·클립보드 처리 담당 (docs/architecture.md 4절)
setEndedHandler((jobId, resultId) => {
  void send('background', 'rec:ended', { jobId, resultId }).catch(() => undefined);
});

listen('offscreen', {
  'offscreen:ping': () => 'pong' as const,
  'rec:start': (options) => startRecording(options),
  'rec:pause': () => {
    pauseRecording();
    return null;
  },
  'rec:resume': () => {
    resumeRecording();
    return null;
  },
  'rec:stop': () => stopRecording(),
  'rec:discard': async () => {
    await discardRecording();
    return null;
  },
  'rec:status': () => recordingStatus(),
  'result:objectUrl': async ({ resultId }) => {
    const result = await loadResult(resultId);
    if (!result) throw new CliptError('NO_JOB', 'result not found');
    const url = URL.createObjectURL(result.blob);
    // 다운로드가 끝날 시간을 주고 해제한다
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
    return url;
  },
});
