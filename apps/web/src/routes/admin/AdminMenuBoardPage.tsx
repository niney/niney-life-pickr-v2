import { useSearchParams } from 'react-router-dom';
import { ScanText } from 'lucide-react';
import { EvalTab } from '~/components/admin/menu-board/EvalTab';
import { ReadTab } from '~/components/admin/menu-board/ReadTab';
import { cn } from '~/lib/utils';

// 메뉴판 읽기 — 메뉴판 사진 한 장을 비전 LLM(purpose menu-board, 기본 kimi-k3)이 메뉴·가격·설명 목록으로 읽는다.
// OCR 없이 사진 + 규칙 프롬프트 한 번(검수 정답 20장 F1 99.8%). 비교 근거는 docs/menu-board-ocr-probe.md.

type Tab = 'read' | 'eval';

const TABS: { id: Tab; label: string }[] = [
  { id: 'read', label: '읽기' },
  { id: 'eval', label: '정확도' },
];

const parseTab = (v: string | null): Tab => TABS.find((t) => t.id === v)?.id ?? 'read';

export const AdminMenuBoardPage = () => {
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get('tab'));

  const changeTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    if (next === 'read') p.delete('tab');
    else p.set('tab', next);
    setParams(p, { replace: true });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ScanText className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">메뉴판 읽기</h1>
          <p className="text-sm text-muted-foreground">
            메뉴판 사진 한 장을 비전 LLM 이 메뉴·가격·설명 목록으로 읽습니다. 모델은 어드민 AI 키의 '메뉴판 읽기'
            용도(기본 kimi-k3).
          </p>
        </div>
      </header>
      <div role="tablist" aria-label="메뉴판 읽기" className="mb-6 flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => changeTab(t.id)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              tab === t.id
                ? 'border-primary font-semibold text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'read' && <ReadTab />}
      {tab === 'eval' && <EvalTab />}
    </div>
  );
};
