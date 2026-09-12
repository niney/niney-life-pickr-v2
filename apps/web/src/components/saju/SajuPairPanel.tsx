import { useState } from 'react';
import { Loader2, RotateCcw, X } from 'lucide-react';
import type { SajuMatchResultType } from '@repo/api-contract';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { glass } from './SajuForm';
import { SajuMatchResultView } from './SajuTools';
import { SAJU_DISCLAIMER } from './sajuTheme';

// "우리 궁합" 결과 패널(8차) — 입구에서 궁합 모드를 고르면 두 사주를 맞춰 이 패널 하나로 보여 준다(탭 없음).
// 연출은 v1 에선 건너뛴다(두 원판 연출은 v2 후보). "내 사주 자세히 보기" 로 단독 모드에 나를 프리필해 넘어간다.

export interface SajuPairPanelProps {
  labels: { a: string; b: string };
  result: SajuMatchResultType | null;
  status: 'pending' | 'ready' | 'failed';
  side: 'right' | 'bottom';
  onRetry: () => void;
  onEdit: () => void;
  onDetail: () => void;
}

export const SajuPairPanel = ({ labels, result, status, side, onRetry, onEdit, onDetail }: SajuPairPanelProps) => {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <section
      aria-label="궁합"
      data-testid="saju-pair-panel"
      className={cn(
        glass,
        'pointer-events-auto absolute flex flex-col overflow-hidden',
        side === 'right' ? 'bottom-4 right-4 top-16 w-[32rem] max-w-[calc(100%-2rem)] xl:w-[34rem]' : cn('inset-x-0 bottom-0 rounded-b-none', collapsed ? 'max-h-14' : 'max-h-[70dvh]'),
      )}
    >
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <div className="min-w-0 flex-1 text-xs text-[#e9e2d2]/60">
          <span className="font-serif-kr text-sm text-[#f3e9c6]">우리 궁합</span>
          <span className="ml-2">
            {labels.a} × {labels.b}
          </span>
        </div>
        {side === 'bottom' && (
          <button type="button" className="rounded px-2 py-1 text-xs text-[#e9e2d2]/60 hover:text-[#e9e2d2]" onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? '펼치기' : '접기'}
          </button>
        )}
        <button type="button" aria-label="다시 입력" onClick={onEdit} className="rounded p-1 text-[#e9e2d2]/60 hover:text-[#e9e2d2]">
          <X className="size-4" />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">
        {status === 'pending' && (
          <div className="flex items-center gap-2 py-8 text-xs text-[#e9e2d2]/60">
            <Loader2 className="size-4 animate-spin text-[#d9b65b]" /> 두 사주를 맞춰 보는 중…
          </div>
        )}
        {status === 'failed' && (
          <div className="rounded-lg border border-[#ffb4a2]/40 p-2 text-xs text-[#ffb4a2]">
            궁합을 불러오지 못했어요.
            <Button type="button" size="sm" variant="ghost" onClick={onRetry} className="ml-2 h-7 text-[#f3e9c6]">
              <RotateCcw className="size-3" /> 다시 시도
            </Button>
          </div>
        )}
        {result && <SajuMatchResultView m={result} />}
        <p className="mt-3 text-[10px] text-[#e9e2d2]/45">두 사람의 생년월일은 서버에 저장하지 않아요.</p>
      </div>
      <footer className="flex items-center gap-2 border-t border-white/10 px-3 py-2">
        <Button type="button" variant="ghost" size="sm" onClick={onEdit} className="h-8 text-[#e9e2d2]/80">
          다시 입력
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDetail} className="h-8 text-[#d9b65b]">
          내 사주 자세히 보기
        </Button>
        <span className="ml-auto text-[10px] text-[#e9e2d2]/40">{SAJU_DISCLAIMER}</span>
      </footer>
    </section>
  );
};
