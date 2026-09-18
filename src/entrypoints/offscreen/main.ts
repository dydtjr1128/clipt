import { listen } from '@/shared/messages';

// 오프스크린 문서: 캔버스·MediaRecorder·클립보드 처리 담당 (docs/architecture.md 4절)
listen('offscreen', {
  'offscreen:ping': () => 'pong' as const,
});
