import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { AirForecastCodeType, AirForecastItemType, AirForecastResultType } from '@repo/api-contract';
import { sortAirRegions } from '@repo/utils';
import { cn } from '~/lib/utils';
import { airGradeStyleFromText, relativeDayLabel } from './airGrade';
import { AIR_FORECAST_TABS } from './airOptions';
import { AirGradeBadge } from './AirPrimitives';

// 대기질 예보통보 — 항목 탭(PM10/PM2.5/O3) → 발표 시각 선택 → 대상일(오늘/내일/모레)별
// 19권역 등급 그리드 + 예보개황/발생원인/행동요령 원문 + 예측모델 이미지.
// 업스트림은 같은 발표에 대상일별 행이 따로 오므로 발표 시각으로 묶어 열로 펼친다.

interface Props {
  data: AirForecastResultType;
  code: AirForecastCodeType;
  todayYmd: string;
  dim?: boolean;
}

export const AirForecastSection = ({ data, code, todayYmd, dim }: Props) => {
  const items = data.items.filter((i) => i.code === code);
  // 발표 시각 목록(최신 먼저) — 서버 정렬 보장이지만 방어적으로 다시 정렬.
  const announcements = [...new Set(items.map((i) => i.announced))];
  const [picked, setPicked] = useState<string | null>(null);
  const announced = picked && announcements.includes(picked) ? picked : (announcements[0] ?? null);
  const current: AirForecastItemType[] = items
    .filter((i) => i.announced === announced)
    .sort((a, b) => (a.targetDate < b.targetDate ? -1 : a.targetDate > b.targetDate ? 1 : 0));

  if (current.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        {data.date} 통보분에 이 항목의 예보가 없습니다.
      </div>
    );
  }

  // 권역 합집합(표준 순서) — 대상일마다 권역 구성이 같지만 방어.
  const regionSet = new Map<string, true>();
  for (const it of current) for (const g of it.grades) regionSet.set(g.region, true);
  const regions = sortAirRegions([...regionSet.keys()].map((region) => ({ region }))).map((r) => r.region);
  const gradeOf = (it: AirForecastItemType, region: string): string | null =>
    it.grades.find((g) => g.region === region)?.grade ?? null;

  // 텍스트는 대상일마다 다를 수 있어 대상일별로 펼친다(같으면 한 번만).
  const texts = current.map((it) => ({
    targetDate: it.targetDate,
    overall: it.overall,
    cause: it.cause,
    actionKnack: it.actionKnack,
  }));
  const uniqueTexts = texts.filter(
    (t, i) => texts.findIndex((u) => u.overall === t.overall && u.cause === t.cause && u.actionKnack === t.actionKnack) === i,
  );

  // 이미지 — 이 발표의 모든 행에서 URL 중복 제거, 선택 항목 것을 앞에.
  const tab = AIR_FORECAST_TABS.find((t) => t.code === code)!;
  const imgMap = new Map<string, AirForecastItemType['images'][number]>();
  for (const it of current) for (const img of it.images) imgMap.set(img.url, img);
  const images = [...imgMap.values()].sort((a, b) => {
    const ap = a.pollutant === tab.image ? 0 : 1;
    const bp = b.pollutant === tab.image ? 0 : 1;
    return ap - bp || Number(a.animated) - Number(b.animated);
  });

  return (
    <div className={cn('flex flex-col gap-4', dim && 'opacity-60')}>
      {/* 발표 시각 */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">발표</span>
        {announcements.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setPicked(a)}
            className={cn(
              'rounded-full border px-2.5 py-0.5 transition-colors',
              a === announced ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
            )}
          >
            {a.replace(/^\d{4}-/, '')}
          </button>
        ))}
        <span className="ml-auto text-muted-foreground">{data.date} 통보분 · 권역별 일평균 등급</span>
      </div>

      {/* 권역 × 대상일 그리드 */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="sticky left-0 z-10 h-9 bg-muted/40 px-2 text-left font-medium backdrop-blur">권역</th>
              {current.map((it) => (
                <th key={it.targetDate} className="h-9 px-2 text-left font-medium">
                  <span className="font-semibold text-foreground">{relativeDayLabel(it.targetDate, todayYmd)}</span>{' '}
                  <span className="tabular-nums">{it.targetDate.slice(5).replace('-', '/')}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {regions.map((region) => (
              <tr key={region} className="border-t">
                <th scope="row" className="sticky left-0 z-10 bg-card px-2 py-1 text-left text-xs font-medium">
                  {region}
                </th>
                {current.map((it) => {
                  const g = gradeOf(it, region);
                  const style = airGradeStyleFromText(g);
                  return (
                    <td key={it.targetDate} className="p-1">
                      <div className={cn('flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium', style.tint)}>
                        <span aria-hidden className={cn('size-1.5 rounded-full', style.dot)} />
                        {g ?? '-'}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 원문 텍스트 */}
      <div className="grid gap-3 md:grid-cols-2">
        {uniqueTexts.map((t, i) => (
          <div key={`${t.targetDate}-${i}`} className="flex flex-col gap-2 rounded-md border p-3 text-sm">
            {uniqueTexts.length > 1 && (
              <div className="text-xs font-medium text-muted-foreground">
                {relativeDayLabel(t.targetDate, todayYmd)} {t.targetDate}
              </div>
            )}
            <TextRow label="예보개황" text={t.overall} />
            <TextRow label="발생원인" text={t.cause} />
            <TextRow label="행동요령" text={t.actionKnack} emptyText="이번 발표에는 행동요령이 없습니다." />
          </div>
        ))}
      </div>

      {/* 예측모델 이미지 */}
      {images.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-muted-foreground">
            예측모델 결과 이미지 {images.length}장 — 클릭하면 원본(airkorea.or.kr)을 새 탭에서 엽니다.
          </div>
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {images.map((img) => (
              <li key={img.url} className="w-44 shrink-0">
                <a
                  href={img.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="group flex flex-col gap-1 rounded-md border p-1.5 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <img
                    src={img.url}
                    alt={`${img.pollutant ?? '대기질'} 예측모델 ${img.animated ? '애니메이션' : (img.at ?? '')}`}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="aspect-[4/3] w-full rounded bg-muted object-cover"
                  />
                  <span className="flex items-center justify-between gap-1 text-[11px]">
                    <span className="truncate">
                      <span className="font-medium">{img.pollutant ?? '-'}</span>{' '}
                      {img.animated ? '애니메이션(2일)' : img.at}
                    </span>
                    <ExternalLink className="size-3 shrink-0 text-muted-foreground group-hover:text-foreground" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        등급 범례
        {['좋음', '보통', '나쁨', '매우나쁨'].map((g) => (
          <AirGradeBadge key={g} text={g} />
        ))}
      </div>
    </div>
  );
};

const TextRow = ({ label, text, emptyText }: { label: string; text: string | null; emptyText?: string }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-xs font-medium text-muted-foreground">{label}</span>
    <p className={cn('whitespace-pre-line leading-relaxed', !text && 'text-muted-foreground')}>
      {text ?? emptyText ?? '-'}
    </p>
  </div>
);
