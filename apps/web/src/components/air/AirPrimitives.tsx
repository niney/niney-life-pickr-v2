import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import type { AirGradeLevel } from '@repo/utils';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { airGradeStyle, airGradeStyleFromText, type AirGradeStyle } from './airGrade';

// 대기정보 페이지 공용 프리미티브 — 섹션 카드(제목 + 원천 오퍼레이션 eyebrow), 등급
// 배지/점, 상태(로딩/에러/빈/stale) 블록. 예시 페이지의 구조 장치는 "이 섹션이 어느
// API 오퍼레이션에서 나왔는가" — 장식이 아니라 사실을 적는 eyebrow 다.

interface SectionProps {
  title: string;
  // 업스트림 오퍼레이션명(예: getCtprvnRltmMesureDnsty) + 한글 이름.
  op: string;
  opLabel: string;
  description?: ReactNode;
  // 우측 상단 슬롯 — 토글/필터.
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}

export const AirSection = ({
  title,
  op,
  opLabel,
  description,
  aside,
  children,
  className,
  id,
}: SectionProps) => (
  <section
    id={id}
    aria-label={title}
    className={cn('rounded-xl border bg-card text-card-foreground shadow-sm', className)}
  >
    <header className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-4 text-muted-foreground">
            {op}
            <span className="font-sans">· {opLabel}</span>
          </span>
        </div>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      {aside && <div className="flex shrink-0 flex-wrap items-center gap-2">{aside}</div>}
    </header>
    <div className="p-4 sm:p-5">{children}</div>
  </section>
);

// 등급 배지 — 점 + 글자. 색만으로 뜻을 전달하지 않는다(상태색 규율).
export const AirGradeBadge = ({
  grade,
  text,
  size = 'sm',
  className,
}: {
  grade?: AirGradeLevel | null;
  // 예보 등급 텍스트('좋음'/'낮음' 등) — grade 대신 쓰면 텍스트로 색을 고른다.
  text?: string | null;
  size?: 'sm' | 'md';
  className?: string;
}) => {
  const style: AirGradeStyle = text !== undefined ? airGradeStyleFromText(text) : airGradeStyle(grade);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md font-medium',
        style.tint,
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm',
        className,
      )}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', style.dot)} />
      {style.label}
    </span>
  );
};

export const AirGradeDot = ({
  grade,
  className,
}: {
  grade: AirGradeLevel | null | undefined;
  className?: string;
}) => {
  const style = airGradeStyle(grade);
  return (
    <span
      aria-label={style.label}
      title={style.label}
      className={cn('inline-block size-2 shrink-0 rounded-full', style.dot, className)}
    />
  );
};

// 상태 블록 — 섹션 본문 대신 들어가는 로딩/에러/빈 안내. 문구는 다음 행동을 말한다.
export const AirStateBlock = ({
  kind,
  message,
  onRetry,
  retrying,
}: {
  kind: 'loading' | 'error' | 'empty';
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
}) => {
  if (kind === 'loading') {
    return (
      <div className="flex h-28 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> 불러오는 중…
      </div>
    );
  }
  if (kind === 'error') {
    return (
      <div className="flex h-28 flex-col items-center justify-center gap-2 rounded-md border border-dashed text-sm text-destructive">
        {message ?? '불러오지 못했습니다.'}
        {onRetry && (
          <Button type="button" variant="outline" size="sm" disabled={retrying} onClick={onRetry}>
            다시 시도
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="flex h-28 items-center justify-center rounded-md border border-dashed px-4 text-center text-sm text-muted-foreground">
      {message ?? '표시할 데이터가 없습니다.'}
    </div>
  );
};

// stale(업스트림 장애로 서버가 마지막 성공본을 대신 서빙) 안내 띠.
export const AirStaleNote = ({ fetchedAtLabel }: { fetchedAtLabel: string }) => (
  <div className="mb-3 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-300">
    에어코리아 API 응답이 없어 {fetchedAtLabel} 받아둔 정보를 표시하고 있습니다.
  </div>
);
