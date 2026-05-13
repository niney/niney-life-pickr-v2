import { Menu } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { ThemeToggle } from '~/components/ThemeToggle';

interface TitleRule {
  match: (pathname: string) => boolean;
  label: string;
}

// 좌측 NAV와 별도로 상세 라우트 라벨도 커버하기 위해 단순 패턴 매칭으로 둔다.
// 더 구체적인 prefix 가 먼저 매칭되도록 순서 유지 — '/admin' 은 가장 마지막.
const TITLE_RULES: TitleRule[] = [
  { match: (p) => p.startsWith('/admin/restaurants'), label: '맛집' },
  { match: (p) => p.startsWith('/admin/discover'), label: '맛집 발견' },
  { match: (p) => p.startsWith('/admin/analytics'), label: 'AI 분석 관리' },
  { match: (p) => p.startsWith('/admin/crawl-test'), label: '크롤링 테스트' },
  { match: (p) => p.startsWith('/admin/ai-keys'), label: 'AI 키' },
  { match: (p) => p.startsWith('/admin/ai-test'), label: 'AI 테스트' },
  { match: (p) => p.startsWith('/admin/map-keys'), label: '지도 키' },
  { match: (p) => p.startsWith('/admin/settings'), label: '설정' },
  { match: (p) => p === '/admin', label: '홈' },
];

const resolveTitle = (pathname: string) =>
  TITLE_RULES.find((r) => r.match(pathname))?.label ?? '관리자';

interface Props {
  onMenuClick: () => void;
}

export const AdminTopBar = ({ onMenuClick }: Props) => {
  const { pathname } = useLocation();
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        {/* md+ 에서는 사이드바가 항상 보이므로 햄버거 불필요. */}
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="메뉴 열기"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground md:hidden"
        >
          <Menu className="size-4" />
        </button>
        <h1 className="truncate text-base font-semibold">{resolveTitle(pathname)}</h1>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
};
