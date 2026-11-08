import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp, X } from 'lucide-react';
import { useMealFrame, useMealLeave } from './mealPanel';

// 상세·수정·새 기록의 틀(2026-11-08 리뉴얼 3단계) — 같은 내용을 '화면' 또는 '패널'로 그린다.
//
// 패널(데스크톱, 배경 위치가 있을 때): 본문 위 오른쪽에 겹쳐 뜬다. 상세는 비모달(약 640px — 뒤 화면을 그대로 쓰고 옆 목록을
// 눌러 내용만 바꾼다, ↑↓ 이전·다음), 수정·새 기록은 모달(약 880px — 뒤를 어둡게, 지금 입력 두 단 그대로).
// 닫기(✕·Esc·바깥 누름) = 뒤로. 열면 패널로 포커스를 옮기고 닫으면 보던 기록 줄로 돌려준다.
// 화면(좁은 화면·주소로 바로 연 경우): 휴대폰은 자체 상단바(← + 제목)와 아래 고정 동작 줄, 태블릿 이상은 큰 제목과
// 화면 아래에 붙는 동작 줄. 안쪽 배치는 컨테이너 쿼리(@container)라 패널 폭·화면 폭 어디서든 같은 규칙으로 접힌다.

export interface MealSurfaceNav {
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}

interface MealSurfaceProps {
  title: string;
  meta?: ReactNode;
  /** 돌아갈 곳이 없을 때(주소로 바로 연 화면) 갈 곳과 그 이름. */
  fallback: { to: string; label: string };
  /** 닫기·나가기를 가로챈다(고친 내용이 있으면 확인). 없으면 들어온 곳으로 돌아간다. */
  onClose?: () => void;
  /** 상세 패널의 이전·다음. */
  nav?: MealSurfaceNav;
  /** 닫힐 때 포커스를 돌려줄 기록 줄(data-meal-entry). */
  entryId?: string;
  footer?: ReactNode;
  /** 확인 창처럼 화면 위에 뜨는 것 — @container 바깥에 그린다(컨테이너는 fixed 자식의 기준 상자가 될 수 있다). */
  overlay?: ReactNode;
  children: ReactNode;
}

const EDITABLE = 'input, textarea, select, [contenteditable="true"]';

// 이 패널 말고 다른 대화상자(삭제 확인·사진 크게 보기)가 떠 있으면 키를 그쪽에 맡긴다.
const otherDialogOpen = (self: HTMLElement | null): boolean =>
  Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).some(
    (el) => el !== self,
  );

export const MealSurface = (props: MealSurfaceProps) => {
  const frame = useMealFrame();
  return frame.type === 'panel' ? (
    <MealPanelSurface {...props} kind={frame.kind} />
  ) : (
    <MealPageSurface {...props} />
  );
};

// ── 화면 ──────────────────────────────────────────────────────────────────────
const MealPageSurface = ({
  title,
  meta,
  fallback,
  onClose,
  footer,
  overlay,
  children,
}: MealSurfaceProps) => {
  const location = useLocation();
  const leave = useMealLeave(fallback.to);
  const backLabel = location.key !== 'default' ? '뒤로' : fallback.label;
  return (
    <div className="meal-screen" data-has-foot={footer ? 'true' : undefined}>
      <header className="meal-screen-head">
        <button type="button" className="meal-screen-back" onClick={onClose ?? leave}>
          <ArrowLeft className="size-5 shrink-0" aria-hidden />
          <span className="meal-screen-back-label">{backLabel}</span>
        </button>
        <div className="min-w-0">
          <h1 className="meal-screen-title">{title}</h1>
          {meta ? <p className="meal-screen-meta">{meta}</p> : null}
        </div>
      </header>
      <div className="@container">{children}</div>
      {footer ? <div className="meal-screen-foot">{footer}</div> : null}
      {overlay}
    </div>
  );
};

// ── 패널 ──────────────────────────────────────────────────────────────────────
const MealPanelSurface = ({
  kind,
  title,
  meta,
  fallback,
  onClose,
  nav,
  entryId,
  footer,
  overlay,
  children,
}: MealSurfaceProps & { kind: 'detail' | 'form' }) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const leave = useMealLeave(fallback.to);
  const close = onClose ?? leave;
  // 들어올 때만 밀려 들어온다 — 수정에서 돌아오거나(뒤로) 새로고침으로 다시 그릴 때는 그 자리에 있던 것처럼.
  const navigationType = useNavigationType();
  const [enter] = useState(navigationType === 'POP' ? 'none' : 'slide');

  // 키·포커스·스크롤은 문서(외부)와 맞추는 일이라 effect 다. 최신 콜백은 ref 로 읽어 리스너를 다시 달지 않는다.
  const latest = useRef({ close, nav, entryId });
  useEffect(() => {
    latest.current = { close, nav, entryId };
  });

  // 열면 패널로 포커스, 닫으면 보던 기록 줄(없으면 연 버튼)로 돌려준다.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      const id = latest.current.entryId;
      const row = id
        ? document.querySelector<HTMLElement>(`[data-meal-entry="${CSS.escape(id)}"]`)
        : null;
      const target = row ?? (opener?.isConnected ? opener : null);
      target?.focus({ preventScroll: true });
    };
  }, []);

  // 모달(수정·새 기록)은 뒤 화면 스크롤을 막는다 — 스크롤바 자리는 식단 틀이 고정해 둬 화면이 밀리지 않는다.
  useEffect(() => {
    if (kind !== 'form') return undefined;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = before;
    };
  }, [kind]);

  // 다른 기록으로 바뀌면 패널 안 스크롤을 처음으로.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [entryId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      if (otherDialogOpen(panelRef.current)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        latest.current.close();
        return;
      }
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      const current = latest.current.nav;
      if (!current) return;
      // 패널 안이나 기록 줄에 포커스가 있을 때만 — 뒤 화면을 화살표로 스크롤하는 건 막지 않는다. 입력칸은 제외.
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || active.closest(EDITABLE)) return;
      if (!panelRef.current?.contains(active) && !active.closest('[data-meal-entry]')) return;
      const go = event.key === 'ArrowUp' ? current.onPrev : current.onNext;
      if (!go) return;
      event.preventDefault();
      go();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {kind === 'form' ? <div className="meal-scrim" aria-hidden onClick={close} /> : null}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={kind === 'form' ? true : undefined}
        aria-labelledby={titleId}
        tabIndex={-1}
        className="meal-panel"
        data-kind={kind}
        data-enter={enter}
      >
        <header className="meal-panel-head">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="meal-panel-title">
              {title}
            </h2>
            {meta ? <p className="meal-panel-meta">{meta}</p> : null}
          </div>
          <div className="meal-panel-tools">
            {nav ? (
              <>
                <button
                  type="button"
                  onClick={nav.onPrev ?? undefined}
                  disabled={!nav.onPrev}
                  aria-label="이전 기록"
                  aria-keyshortcuts="ArrowUp"
                  title="이전 기록 (↑)"
                >
                  <ChevronUp className="size-5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={nav.onNext ?? undefined}
                  disabled={!nav.onNext}
                  aria-label="다음 기록"
                  aria-keyshortcuts="ArrowDown"
                  title="다음 기록 (↓)"
                >
                  <ChevronDown className="size-5" aria-hidden />
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={close}
              aria-label="닫기"
              aria-keyshortcuts="Escape"
              title="닫기 (Esc)"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
        </header>
        <div ref={bodyRef} className="meal-panel-body @container">
          {children}
        </div>
        {footer ? <div className="meal-panel-foot">{footer}</div> : null}
      </div>
      {overlay}
    </>
  );
};
