import { mount } from '@/components/mount';
import { pruneResults } from '@/shared/db';
import { ResultView } from './ResultView';
import './result.css';

const id = new URLSearchParams(location.search).get('id');

mount(<ResultView id={id} />);

// 결과 페이지 진입 시에도 보존 정책을 적용한다 (현재 결과는 방금 저장돼 대상이 아님)
void pruneResults().catch(() => undefined);
