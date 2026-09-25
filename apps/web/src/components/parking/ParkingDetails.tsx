import { useState } from 'react';
import { ArrowLeft, Crosshair, ExternalLink, Phone } from 'lucide-react';
import type { EvStationDetailType, ParkingAirportType, ParkingLotDetailType, ParkingPatternType } from '@repo/api-contract';
import {
  EV_LEVEL_COLOR,
  EV_LEVEL_LABEL,
  EV_STAT_AVAILABLE,
  EV_STAT_CHARGING,
  PARKING_DAY_KIND_LABEL,
  PARKING_FEE_ESTIMATE_MINUTES,
  PARKING_LEVEL_LABEL,
  PARKING_SOURCE_LABEL,
  estimateParkingFee,
  evChargerTypeLabel,
  evStatLabel,
  formatDistanceM,
  formatParkingFeeRule,
  formatParkingHours,
  formatRelativeMin,
  parkingKstSlot,
  parkingLevelColor,
  parkingLevelOf,
  type ParkingDayKind,
} from '@repo/utils';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { feeRuleOf, formatWon, lotAddress, lotTypeLine, naverCarDirections, todayHours } from './parkingFormat';

// 주차 상세 — 주차장(실시간 여석·오늘 운영·요금과 예상 요금·요일별 운영시간·평소 혼잡도 24시간 막대)·충전소(충전기별 타입·
// 용량·상태)·공항(주차장별 점유 막대와 평소 점유율). 패널의 주변 목록 자리를 대신 차지하고 '← 목록' 으로 돌아간다.

interface ShellProps {
  onBack: () => void;
  center: { lat: number; lng: number } | null;
  onFlyTo: (lat: number, lng: number) => void;
  testId: string;
  children: React.ReactNode;
}

export const DetailShell = ({ onBack, center, onFlyTo, testId, children }: ShellProps) => (
  <div className="flex min-h-0 flex-1 flex-col" data-testid={testId}>
    <div className="flex items-center gap-1 border-b px-2 py-1.5">
      <Button variant="ghost" size="sm" onClick={onBack} className="h-7 gap-1 px-2 text-xs">
        <ArrowLeft className="size-3.5" /> 목록
      </Button>
      {center && (
        <Button variant="ghost" size="sm" onClick={() => onFlyTo(center.lat, center.lng)} className="ml-auto h-7 gap-1 px-2 text-xs">
          <Crosshair className="size-3.5" /> 지도 중심으로
        </Button>
      )}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">{children}</div>
  </div>
);

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2 py-1.5 text-sm">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="min-w-0 break-words">{children}</dd>
  </div>
);

const PhoneLink = ({ phone }: { phone: string }) => (
  <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
    <Phone className="size-3" /> {phone}
  </a>
);

const DirectionsLink = ({ lat, lng, name }: { lat: number; lng: number; name: string }) => (
  <a
    href={naverCarDirections(lat, lng, name)}
    target="_blank"
    rel="noreferrer"
    className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
  >
    네이버 지도 길찾기(자동차) <ExternalLink className="size-3" />
  </a>
);

const Pill = ({ children }: { children: React.ReactNode }) => <span className="rounded-full border px-2 py-0.5 text-[11px]">{children}</span>;

// ── 주차장 ──────────────────────────────────────────────────────────────────
interface LotProps {
  item: ParkingLotDetailType;
  distM: number | null;
  onBack: () => void;
  onFlyTo: (lat: number, lng: number) => void;
}

const DAY_KINDS: ParkingDayKind[] = ['wd', 'sat', 'hol'];

export const ParkingLotDetailCard = ({ item, distM, onBack, onFlyTo }: LotProps) => {
  const live = item.live;
  const today = todayHours(item);
  const rule = feeRuleOf(item);
  const center = item.lat !== null && item.lng !== null ? { lat: item.lat, lng: item.lng } : null;
  const addr = lotAddress(item);
  const extras: string[] = [];
  if (item.disabledZone === true) extras.push('장애인 전용구역');
  if (item.satFree === true) extras.push('토요일 무료');
  if (item.holFree === true) extras.push('공휴일 무료');
  return (
    <DetailShell onBack={onBack} center={center} onFlyTo={onFlyTo} testId="parking-lot-detail">
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-1.5 size-3 shrink-0 rounded-full" style={{ backgroundColor: parkingLevelColor(live?.level) }} />
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-tight">{item.name}</h2>
          <p className="text-xs text-muted-foreground">
            {lotTypeLine(item)}
            {item.totalSpaces !== null ? ` · ${item.totalSpaces.toLocaleString('ko-KR')}면` : ''}
            {distM !== null ? ` · 내 위치에서 ${formatDistanceM(distM)}` : ''}
          </p>
        </div>
      </div>

      {live && live.available !== null && (
        <div className="mt-3 rounded-md border px-3 py-2" data-testid="parking-live">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold">여석 {live.available.toLocaleString('ko-KR')}</span>
            {live.total !== null && <span className="text-sm text-muted-foreground">/ {live.total.toLocaleString('ko-KR')}면</span>}
            {live.level && (
              <span className="ml-auto inline-flex items-center gap-1 text-sm font-medium">
                <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: parkingLevelColor(live.level) }} />
                {PARKING_LEVEL_LABEL[live.level]}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">실시간 {formatRelativeMin(live.updatedAt ?? live.fetchedAt)} 기준 · 서버가 5분마다 갱신</p>
        </div>
      )}

      {extras.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {extras.map((e) => (
            <Pill key={e}>{e}</Pill>
          ))}
        </div>
      )}

      <dl className="mt-3 divide-y">
        <Row label={`오늘(${today.label})`}>
          {today.text}
          {today.open === true && <span className="ml-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">운영 중</span>}
          {today.open === false && <span className="ml-1.5 text-xs font-medium text-muted-foreground">운영 전·종료</span>}
          {today.freeToday && <span className="ml-1.5 text-xs text-muted-foreground">오늘 무료</span>}
        </Row>
        <Row label="요금">
          {formatParkingFeeRule(rule)}
          {item.fee.dayMaxFee !== null && <span className="block text-xs text-muted-foreground">일 최대 {formatWon(item.fee.dayMaxFee)}</span>}
          {item.fee.dayPassFee !== null && <span className="block text-xs text-muted-foreground">1일권 {formatWon(item.fee.dayPassFee)}</span>}
          {item.fee.monthlyFee !== null && <span className="block text-xs text-muted-foreground">월 정기권 {formatWon(item.fee.monthlyFee)}</span>}
        </Row>
        {item.feeType !== 'free' && item.fee.baseFee !== null && (
          <Row label="예상 요금">
            <span className="flex flex-wrap gap-x-3 gap-y-0.5" data-testid="parking-fee-estimates">
              {PARKING_FEE_ESTIMATE_MINUTES.map((m) => {
                const fee = estimateParkingFee(rule, m);
                return (
                  <span key={m} className="tabular-nums">
                    {m / 60}시간 {fee === null ? '-' : fee === 0 ? '무료' : formatWon(fee)}
                  </span>
                );
              })}
            </span>
          </Row>
        )}
        <Row label="운영시간">
          {DAY_KINDS.map((k) => (
            <span key={k} className="block">
              <span className="inline-block w-14 text-xs text-muted-foreground">{PARKING_DAY_KIND_LABEL[k]}</span>
              {formatParkingHours(item.hours[k])}
            </span>
          ))}
          <span className="block text-[11px] text-muted-foreground">공휴일은 따로 판정하지 않아 일요일 시간으로 봅니다.</span>
        </Row>
        {item.payMethods && <Row label="결제">{item.payMethods}</Row>}
        {item.note && <Row label="참고">{item.note}</Row>}
        {addr && <Row label="주소">{addr}</Row>}
        {(item.phone || item.orgName) && (
          <Row label="관리">
            {item.orgName}
            {item.phone && (
              <span className="block">
                <PhoneLink phone={item.phone} />
              </span>
            )}
          </Row>
        )}
        <Row label="출처">
          {PARKING_SOURCE_LABEL[item.source]}
          {item.baseDate ? ` · ${item.baseDate}` : ''}
          {item.geoSource === 'road' || item.geoSource === 'parcel' ? <span className="block text-[11px] text-muted-foreground">위치는 주소로 찾은 값</span> : null}
        </Row>
      </dl>

      {item.pattern && <PatternChart pattern={item.pattern} />}
      {center && <DirectionsLink lat={center.lat} lng={center.lng} name={item.name} />}
    </DetailShell>
  );
};

// 평소 혼잡도 — 오늘(KST 요일) 24시간 평균 점유율 막대(단일 계열 — 범례 없이 제목이 설명). 지금 시각 막대만 진하게,
// 표본 부족 시각은 옅은 짧은 막대. 막대에 올리면 값, 스크린리더는 요약 문장.
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
const PatternChart = ({ pattern }: { pattern: ParkingPatternType }) => {
  const [hover, setHover] = useState<number | null>(null);
  // 지금 시각(KST)은 카드를 연 때 한 번만 — 렌더마다 시계를 읽지 않는다.
  const [nowHour] = useState(() => parkingKstSlot().hour);
  const ready = pattern.hours.filter((h) => h.occ !== null);
  const maxSamples = Math.max(...pattern.hours.map((h) => h.samples));
  const shown = hover !== null ? pattern.hours[hover]! : pattern.hours[nowHour]!;
  if (ready.length === 0) {
    return (
      <p className="mt-4 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground" data-testid="parking-pattern-pending">
        평소 혼잡도는 실시간 값을 쌓는 중입니다(시각별 표본 {maxSamples}/{pattern.minSamples}). 쌓이면 여기에 요일·시간대 평균이 나옵니다.
      </p>
    );
  }
  const busiest = ready.reduce((a, b) => ((b.occ ?? 0) > (a.occ ?? 0) ? b : a));
  const pct = (v: number): number => Math.round(Math.min(1, v) * 100);
  const summary = `${WEEKDAY[pattern.dow]}요일 평소 가장 붐비는 시각 ${busiest.hour}시(${pct(busiest.occ!)}%)`;
  return (
    <section className="mt-4" aria-label={`평소 혼잡도 — ${summary}`} data-testid="parking-pattern">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold">{WEEKDAY[pattern.dow]}요일 평소 혼잡도</h3>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {shown.hour}시 · {shown.occ === null ? '표본 부족' : `${pct(shown.occ)}% 사용${shown.fullRatio ? ` · 만차 ${Math.round(shown.fullRatio * 100)}%` : ''}`}
        </span>
      </div>
      <div className="relative mt-2 h-16" onMouseLeave={() => setHover(null)}>
        {/* 50%·100% 기준선 — 헤어라인 */}
        <div aria-hidden className="absolute inset-x-0 top-0 border-t border-border/70" />
        <div aria-hidden className="absolute inset-x-0 top-1/2 border-t border-border/40" />
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {pattern.hours.map((h) => (
            <div
              key={h.hour}
              className="flex h-full min-w-0 flex-1 items-end justify-center"
              onMouseEnter={() => setHover(h.hour)}
              title={`${h.hour}시 ${h.occ === null ? '표본 부족' : `${pct(h.occ)}%`}`}
            >
              <div
                className={cn(
                  'w-full max-w-[24px] rounded-t-[4px]',
                  h.occ === null ? 'bg-muted' : h.hour === nowHour ? 'bg-primary' : 'bg-primary/45',
                  hover === h.hour && 'ring-2 ring-primary/30',
                )}
                style={{ height: h.occ === null ? '6%' : `${Math.max(4, pct(h.occ))}%` }}
              />
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>0시</span>
        <span>6시</span>
        <span>12시</span>
        <span>18시</span>
        <span>23시</span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        5분마다 받은 실시간 값을 요일·시간대로 평균낸 값입니다. 진한 막대가 지금 시각.
      </p>
    </section>
  );
};

// ── 충전소 ──────────────────────────────────────────────────────────────────
interface EvProps {
  item: EvStationDetailType;
  distM: number | null;
  onBack: () => void;
  onFlyTo: (lat: number, lng: number) => void;
}

const statColor = (stat: number): string =>
  stat === EV_STAT_AVAILABLE ? EV_LEVEL_COLOR.available : stat === EV_STAT_CHARGING ? EV_LEVEL_COLOR.busy : EV_LEVEL_COLOR.offline;

export const EvStationDetailCard = ({ item, distM, onBack, onFlyTo }: EvProps) => {
  const floor = item.floorType === 'B' ? `지하${item.floorNum ? ` ${item.floorNum}층` : ''}` : item.floorType === 'F' ? `지상${item.floorNum ? ` ${item.floorNum}층` : ''}` : null;
  return (
    <DetailShell onBack={onBack} center={{ lat: item.lat, lng: item.lng }} onFlyTo={onFlyTo} testId="parking-ev-detail">
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-1.5 size-3 shrink-0 rounded-full" style={{ backgroundColor: EV_LEVEL_COLOR[item.level] }} />
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-tight">{item.name}</h2>
          <p className="text-xs text-muted-foreground">
            {item.kindLabel ?? '충전소'}
            {distM !== null ? ` · 내 위치에서 ${formatDistanceM(distM)}` : ''}
          </p>
        </div>
      </div>
      <div className="mt-3 rounded-md border px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold">사용 가능 {item.availableCount}</span>
          <span className="text-sm text-muted-foreground">/ {item.chargerCount}기</span>
          <span className="ml-auto text-sm font-medium">{EV_LEVEL_LABEL[item.level]}</span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          충전 중 {item.chargingCount} · 급속 {item.fastCount} · 완속 {item.chargerCount - item.fastCount}
          {item.statusAt ? ` · 상태 ${formatRelativeMin(item.statusAt)} 반영(10분마다)` : ''}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {item.parkingFree === true && <Pill>주차료 무료</Pill>}
        {item.parkingFree === false && <Pill>주차료 유료</Pill>}
        {item.limited === true && <Pill>이용 제한{item.limitDetail ? ` — ${item.limitDetail}` : ''}</Pill>}
        {floor && <Pill>{floor}</Pill>}
      </div>
      <ul className="mt-3 divide-y rounded-md border" data-testid="parking-ev-chargers">
        {item.chargers.map((c) => (
          <li key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
            <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: statColor(c.stat) }} />
            <span className="w-14 shrink-0 text-xs text-muted-foreground">{c.fast ? '급속' : '완속'}{c.outputKw !== null ? ` ${Math.round(c.outputKw)}kW` : ''}</span>
            <span className="min-w-0 flex-1 truncate text-xs">{evChargerTypeLabel(c.type)}</span>
            <span className="shrink-0 text-xs font-medium">
              {evStatLabel(c.stat)}
              {c.stat === EV_STAT_CHARGING && c.chargingSince ? <span className="ml-1 font-normal text-muted-foreground">{formatRelativeMin(c.chargingSince)}부터</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <dl className="mt-3 divide-y">
        {item.useTime && <Row label="이용 시간">{item.useTime}</Row>}
        <Row label="주소">
          {item.addr ?? '-'}
          {item.addrDetail && <span className="block text-xs text-muted-foreground">{item.addrDetail}</span>}
          {item.location && <span className="block text-xs text-muted-foreground">{item.location}</span>}
        </Row>
        {(item.operator || item.operatorCall) && (
          <Row label="운영">
            {item.operator}
            {item.operatorCall && (
              <span className="block">
                <PhoneLink phone={item.operatorCall} />
              </span>
            )}
          </Row>
        )}
        {item.note && <Row label="안내">{item.note}</Row>}
        <Row label="출처">한국환경공단 전기자동차 충전소 정보</Row>
      </dl>
      <DirectionsLink lat={item.lat} lng={item.lng} name={item.name} />
    </DetailShell>
  );
};

// ── 공항 ────────────────────────────────────────────────────────────────────
interface AirportProps {
  airport: ParkingAirportType;
  onBack: () => void;
  onFlyTo: (lat: number, lng: number) => void;
}

// 인천은 구역명이 'T1 …'·'T2 …' 로 시작 — 터미널별로 묶는다. 나머지 공항은 한 묶음.
const groupLots = (a: ParkingAirportType): { title: string | null; lots: ParkingAirportType['lots'] }[] => {
  if (a.code !== 'ICN') return [{ title: null, lots: a.lots }];
  const groups = new Map<string, ParkingAirportType['lots']>();
  for (const l of a.lots) {
    const t = /^T\d/.exec(l.name)?.[0] ?? '기타';
    groups.set(t, [...(groups.get(t) ?? []), l]);
  }
  return [...groups.entries()].map(([t, lots]) => ({ title: t === '기타' ? '기타' : `제${t.slice(1)}여객터미널`, lots }));
};

export const AirportDetailCard = ({ airport, onBack, onFlyTo }: AirportProps) => {
  const updated = airport.lots.map((l) => l.updatedAt).filter((v): v is string => v !== null).sort().at(-1) ?? null;
  return (
    <DetailShell onBack={onBack} center={{ lat: airport.lat, lng: airport.lng }} onFlyTo={onFlyTo} testId="parking-airport-detail">
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-1.5 size-3 shrink-0 rounded-full" style={{ backgroundColor: parkingLevelColor(airport.level) }} />
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-tight">{airport.name} 주차장</h2>
          <p className="text-xs text-muted-foreground">
            {airport.level ? `전체 ${PARKING_LEVEL_LABEL[airport.level]}` : '실시간 정보 없음'}
            {updated ? ` · ${formatRelativeMin(updated)} 기준` : ''}
          </p>
        </div>
      </div>
      {airport.lots.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">아직 이 공항의 실시간 주차 정보를 받지 못했습니다.</p>
      ) : (
        groupLots(airport).map((g) => (
          <section key={g.title ?? 'all'} className="mt-3">
            {g.title && <h3 className="mb-1 text-xs font-semibold text-muted-foreground">{g.title}</h3>}
            <ul className="divide-y rounded-md border">
              {g.lots.map((l) => {
                const level = l.level ?? parkingLevelOf(l.total, l.occupied);
                const pct = l.rate !== null ? Math.round(l.rate * 100) : null;
                return (
                  <li key={l.name} className="px-3 py-2">
                    <div className="flex items-baseline gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{l.name}</span>
                      {level && <span className="shrink-0 text-xs font-medium">{PARKING_LEVEL_LABEL[level]}</span>}
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {l.occupied !== null && l.total !== null ? `${l.occupied.toLocaleString('ko-KR')}/${l.total.toLocaleString('ko-KR')}` : '정보 없음'}
                      </span>
                    </div>
                    {pct !== null && (
                      <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: parkingLevelColor(level) }} />
                        {l.usualOcc !== null && (
                          <div className="absolute top-0 h-full w-0.5 bg-foreground/70" style={{ left: `${Math.min(99, Math.round(l.usualOcc * 100))}%` }} />
                        )}
                      </div>
                    )}
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {pct !== null ? `${pct}% 사용` : ''}
                      {l.usualOcc !== null ? ` · 평소 이 시간 ${Math.round(Math.min(1, l.usualOcc) * 100)}%` : ''}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        출처 {airport.code === 'ICN' ? '인천국제공항공사 주차 정보' : '한국공항공사 전국공항 주차장 혼잡도'} · 서버가 5분마다 갱신. 세로 선은 평소 이 시간 점유율(이력이 쌓이면 표시).
      </p>
    </DetailShell>
  );
};
