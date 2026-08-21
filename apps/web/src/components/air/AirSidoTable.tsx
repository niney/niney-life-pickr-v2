import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { AirMeasureItemType } from '@repo/api-contract';
import { airPollutantMeta, formatAirValue, type AirGradeLevel, type AirPollutant } from '@repo/utils';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { airGradeStyle } from './airGrade';
import { AirGradeBadge, AirGradeDot } from './AirPrimitives';

// 시도 측정소 현황 — 요약 타일(측정소 수·평균·나쁨 이상·결측) + 측정망 필터 + 정렬 표.
// 행 클릭 = 측정소 선택(히어로/시계열이 그 측정소로 바뀐다). 표의 숫자는 tabular.
// 등급색은 값 옆 점으로만(상태색 규율), 통합지수는 배지로 글자까지.

interface Props {
  items: AirMeasureItemType[];
  selectedStation: string | null;
  onSelectStation: (stationName: string) => void;
  dim?: boolean;
}

type SortKey = 'name' | 'khai' | 'pm10' | 'pm25' | 'o3' | 'no2' | 'co' | 'so2';
const VALUE_COLS: Array<{ key: Exclude<AirPollutant, 'khai'>; grade: (m: AirMeasureItemType) => AirGradeLevel | null }> = [
  { key: 'pm10', grade: (m) => m.pm10Grade ?? m.pm10Grade1h },
  { key: 'pm25', grade: (m) => m.pm25Grade ?? m.pm25Grade1h },
  { key: 'o3', grade: (m) => m.o3Grade },
  { key: 'no2', grade: (m) => m.no2Grade },
  { key: 'co', grade: (m) => m.coGrade },
  { key: 'so2', grade: (m) => m.so2Grade },
];
const PAGE = 50;

const mean = (xs: Array<number | null>): number | null => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length === 0 ? null : v.reduce((a, b) => a + b, 0) / v.length;
};

const hasFlag = (m: AirMeasureItemType): boolean =>
  Object.values(m.flags).some((f) => f !== null);

export const AirSidoTable = ({ items, selectedStation, onSelectStation, dim }: Props) => {
  const [mang, setMang] = useState<string>('전체');
  const [sortKey, setSortKey] = useState<SortKey>('khai');
  const [desc, setDesc] = useState(true);
  const [limit, setLimit] = useState(PAGE);

  const mangs = [...new Set(items.map((m) => m.mangName ?? '기타'))];
  const filtered = mang === '전체' ? items : items.filter((m) => (m.mangName ?? '기타') === mang);

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'name') {
      const c = a.stationName.localeCompare(b.stationName, 'ko');
      return desc ? -c : c;
    }
    const av = a[sortKey];
    const bv = b[sortKey];
    // 결측은 정렬 방향과 무관하게 항상 뒤로.
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return desc ? bv - av : av - bv;
  });
  const visible = sorted.slice(0, limit);

  const avgPm10 = mean(items.map((m) => m.pm10));
  const avgPm25 = mean(items.map((m) => m.pm25));
  const badCount = items.filter((m) => (m.khaiGrade ?? 0) >= 3).length;
  const flaggedCount = items.filter(hasFlag).length;
  const worst = items.reduce<AirMeasureItemType | null>(
    (acc, m) => (m.khai !== null && (acc === null || (acc.khai ?? -1) < m.khai) ? m : acc),
    null,
  );

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setDesc((d) => !d);
    else {
      setSortKey(key);
      setDesc(key !== 'name');
    }
  };
  // 렌더 중 컴포넌트를 새로 만들지 않도록(react-compiler static-components) 요소를 반환하는 함수.
  const sortIcon = (k: SortKey) =>
    k !== sortKey ? (
      <ArrowUpDown className="size-3 opacity-40" />
    ) : desc ? (
      <ArrowDown className="size-3" />
    ) : (
      <ArrowUp className="size-3" />
    );

  return (
    <div className={cn('flex flex-col gap-4', dim && 'opacity-60')}>
      {/* 요약 타일 */}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="측정소" value={`${items.length}곳`} sub={mangs.length > 1 ? `${mangs.length}개 측정망` : mangs[0]} />
        <Tile
          label="평균 PM10 / PM2.5"
          value={`${formatAirValue('pm10', avgPm10)} / ${formatAirValue('pm25', avgPm25)}`}
          sub="㎍/㎥ · 결측 제외"
        />
        <Tile
          label="통합지수 나쁨 이상"
          value={`${badCount}곳`}
          sub={worst ? `최고 ${worst.stationName} ${formatAirValue('khai', worst.khai)}` : '-'}
          tone={badCount > 0 ? 'warn' : undefined}
        />
        <Tile label="점검·통신장애" value={`${flaggedCount}곳`} sub="측정 상태 플래그 보유" />
      </dl>

      {/* 측정망 필터 */}
      {mangs.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">측정망</span>
          {['전체', ...mangs].map((mg) => {
            const active = mg === mang;
            const count = mg === '전체' ? items.length : items.filter((m) => (m.mangName ?? '기타') === mg).length;
            return (
              <button
                key={mg}
                type="button"
                onClick={() => {
                  setMang(mg);
                  setLimit(PAGE);
                }}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 transition-colors',
                  active ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
                )}
              >
                {mg} <span className={cn('tabular-nums', active ? 'opacity-80' : 'text-muted-foreground')}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 표 */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr className="[&>th]:h-9 [&>th]:px-2 [&>th]:text-left [&>th]:font-medium">
              <th>
                <HeadBtn onClick={() => toggleSort('name')}>
                  측정소 {sortIcon('name')}
                </HeadBtn>
              </th>
              <th>측정망</th>
              <th className="!text-right">
                <HeadBtn onClick={() => toggleSort('khai')} right>
                  통합지수 {sortIcon('khai')}
                </HeadBtn>
              </th>
              {VALUE_COLS.map((c) => (
                <th key={c.key} className="!text-right">
                  <HeadBtn onClick={() => toggleSort(c.key)} right>
                    {airPollutantMeta(c.key).short} {sortIcon(c.key)}
                  </HeadBtn>
                </th>
              ))}
              <th>측정시각 · 상태</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((m) => {
              const selected = m.stationName === selectedStation;
              const khaiStyle = airGradeStyle(m.khaiGrade);
              const flags = Object.entries(m.flags).filter(([, v]) => v !== null);
              return (
                <tr
                  key={`${m.stationCode ?? ''}:${m.stationName}`}
                  onClick={() => onSelectStation(m.stationName)}
                  className={cn(
                    'cursor-pointer border-t transition-colors hover:bg-muted/50',
                    selected && 'bg-primary/5',
                  )}
                  aria-selected={selected}
                >
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectStation(m.stationName);
                      }}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded px-1 text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                        selected && 'text-primary',
                      )}
                    >
                      {selected && <span aria-hidden className="size-1.5 rounded-full bg-primary" />}
                      {m.stationName}
                    </button>
                    {m.sidoName && <span className="ml-1 text-xs text-muted-foreground">{m.sidoName}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-xs text-muted-foreground">{m.mangName ?? '-'}</td>
                  <td className="px-2 py-1.5 text-right">
                    <span className="inline-flex items-center justify-end gap-1.5">
                      <span className="tabular-nums">{formatAirValue('khai', m.khai)}</span>
                      {m.khaiGrade ? (
                        <AirGradeBadge grade={m.khaiGrade} />
                      ) : (
                        <span className="text-xs text-muted-foreground">{khaiStyle.label}</span>
                      )}
                    </span>
                  </td>
                  {VALUE_COLS.map((c) => (
                    <td key={c.key} className="px-2 py-1.5 text-right tabular-nums">
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {formatAirValue(c.key, m[c.key])}
                        <AirGradeDot grade={c.grade(m)} />
                      </span>
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-xs text-muted-foreground">
                    <span className="tabular-nums">{m.dataTime?.slice(5) ?? '-'}</span>
                    {flags.length > 0 && (
                      <span className="ml-1.5 rounded bg-amber-500/15 px-1 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                        {[...new Set(flags.map(([, v]) => v))].join('·')}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={10} className="px-2 py-8 text-center text-sm text-muted-foreground">
                  조건에 맞는 측정소가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {sorted.length > visible.length && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          {visible.length}/{sorted.length}곳 표시
          <Button type="button" variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
            더 보기
          </Button>
        </div>
      )}
    </div>
  );
};

const Tile = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' }) => (
  <div className={cn('rounded-lg border p-3', tone === 'warn' && 'border-amber-500/40')}>
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="mt-0.5 text-lg font-semibold leading-tight">{value}</dd>
    {sub && <dd className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</dd>}
  </div>
);

const HeadBtn = ({ children, onClick, right }: { children: ReactNode; onClick: () => void; right?: boolean }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn('inline-flex items-center gap-1 rounded px-1 hover:text-foreground', right && 'justify-end')}
  >
    {children}
  </button>
);
