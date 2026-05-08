import { useLocation } from 'react-router-dom';
import { ThemeToggle } from '~/components/ThemeToggle';

interface TitleRule {
  match: (pathname: string) => boolean;
  label: string;
}

// 좌측 NAV와 별도로 상세 라우트 라벨도 커버하기 위해 단순 패턴 매칭으로 둔다.
const TITLE_RULES: TitleRule[] = [
  { match: (p) => p === '/admin', label: '홈' },
  { match: (p) => p.startsWith('/admin/restaurants'), label: '맛집' },
  { match: (p) => p.startsWith('/admin/crawl-test'), label: '크롤링 테스트' },
  { match: (p) => p.startsWith('/admin/ai-keys'), label: 'AI 키' },
  { match: (p) => p.startsWith('/admin/ai-test'), label: 'AI 테스트' },
];

const resolveTitle = (pathname: string) =>
  TITLE_RULES.find((r) => r.match(pathname))?.label ?? '관리자';

export const AdminTopBar = () => {
  const { pathname } = useLocation();
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/80 px-6 backdrop-blur">
      <h1 className="text-base font-semibold">{resolveTitle(pathname)}</h1>
      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
};
