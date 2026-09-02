import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, CircleUserRound, LogOut, Receipt, ShieldCheck, Sparkles } from 'lucide-react';
import { buttonVariants } from '~/components/ui/button';
import { cn } from '~/lib/utils';

// 상단바 계정 메뉴(md+) — 로그인 사용자의 이메일·내 정산·관리자·로그아웃을 버튼 하나로 접는다.
// 이메일 + 버튼 2~3개를 가로로 늘어놓으면 lg(1024) 폭에서 NAV·내 위치 칩과 겹쳐 넘쳤다
// (PublicTopBar 의 폭 예산 메모). 외부 헤드리스 라이브러리 없이(ConfirmDialog 와 같은 결)
// 바깥 클릭·ESC·항목 선택으로 닫는 단순 디스클로저. 이메일은 xl+ 에서만 트리거에 같이
// 보이고, 그 아래 폭에선 패널 머리에만 둔다.

interface Props {
  email: string;
  isAdmin: boolean;
  onLogout: () => void;
}

const ITEM =
  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent';

export const AccountMenu = ({ email, isAdmin, onLogout }: Props) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`계정 메뉴 (${email})`}
        onClick={() => setOpen((v) => !v)}
        className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1.5 px-2')}
      >
        <CircleUserRound className="size-4" />
        <span className="hidden max-w-[12rem] truncate text-muted-foreground xl:inline">{email}</span>
        <ChevronDown
          className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div
          id={panelId}
          data-testid="account-menu"
          className="absolute right-0 top-full z-50 mt-1 w-60 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <p className="truncate px-2 py-1.5 text-xs text-muted-foreground" title={email}>
            {email}
          </p>
          <Link to="/me/settlements" onClick={close} className={ITEM}>
            <Receipt className="size-4 text-muted-foreground" />
            내 정산
          </Link>
          <Link to="/me/tarot" onClick={close} className={ITEM}>
            <Sparkles className="size-4 text-muted-foreground" />
            내 타로 기록
          </Link>
          {isAdmin && (
            <Link to="/admin" onClick={close} className={ITEM}>
              <ShieldCheck className="size-4 text-muted-foreground" />
              관리자
            </Link>
          )}
          <div className="my-1 h-px bg-border" role="separator" />
          <button
            type="button"
            onClick={() => {
              close();
              onLogout();
            }}
            className={ITEM}
          >
            <LogOut className="size-4 text-muted-foreground" />
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
};
