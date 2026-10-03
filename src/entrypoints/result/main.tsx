import { mount } from '@/components/mount';
import { DEFAULT_RETENTION } from '@/core/retention';
import { pruneResults } from '@/shared/db';
import { RecoveryBanner } from './RecoveryBanner';
import { ResultView } from './ResultView';
import './result.css';

const id = new URLSearchParams(location.search).get('id');

mount(
  <>
    <RecoveryBanner />
    <ResultView id={id} />
  </>,
);

// 결과 페이지 진입 시에도 보존 정책을 적용한다. 지금 여는 결과는 기간·용량과 관계없이 남긴다
void pruneResults(Date.now(), DEFAULT_RETENTION, id ? [id] : []).catch(() => undefined);
