import { ExternalLink } from 'lucide-react';
import { HIKING_KNPS_CLOSURE_URL, HIKING_KNPS_ENTRY_TIME_URL } from '@repo/utils';
import { cn } from '~/lib/utils';

// 국립공원 산행 전 확인 — 탐방로 통제·입산 시각은 공개 API 가 없어 국립공원공단 누리집으로 보낸다.
export const KnpsLinks = ({ className }: { className?: string }) => (
  <p className={cn('flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground', className)} data-testid="hiking-knps-links">
    <span>산행 전 확인</span>
    <a href={HIKING_KNPS_CLOSURE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-sky-700 underline-offset-2 hover:underline dark:text-sky-300">
      탐방로 통제정보 <ExternalLink className="size-3" />
    </a>
    <a href={HIKING_KNPS_ENTRY_TIME_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-sky-700 underline-offset-2 hover:underline dark:text-sky-300">
      입산 가능 시각 <ExternalLink className="size-3" />
    </a>
  </p>
);
