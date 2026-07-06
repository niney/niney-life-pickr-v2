import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clock, Loader2, MapPin, Navigation, Route } from 'lucide-react';
import type {
  SubwayArrivalItemType,
  SubwayCongestionDirectionType,
  SubwayCongestionResultType,
  SubwayTimetableDirectionType,
  SubwayTimetableResultType,
} from '@repo/api-contract';
import { subwayLineName } from '@repo/utils';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { BusFavoriteStar } from '~/components/bus/BusFavoriteStar';
import { SubwayLineBadge } from './SubwayLineBadge';
import { SubwayNearbyBusSection } from './SubwayNearbyBusSection';
import { congestionBand, currentSlotKey, matchCongestionDir, slotLevel } from './congestionUtils';
import { arrivalUpdnToTimetable, formatHHMM, lastTrainRemainMin } from './timetableUtils';

// 실시간(30초 폴링)이라 초 단위 상대시각 — '방금/N초 전'이 의미를 가진다(검색
// 리스트의 분 단위와 다르다).
const formatRelativeSec = (iso: string): string => {
  const sec = Math.floor(Math.max(0, Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 10) return '방금 전';
  if (sec < 60) return `${sec}초 전`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  return `${Math.floor(min / 60)}시간 전`;
};

// arvlCd 원문 → 상태 문구. 0접근/1도착/2출발/3전역출발/4전역진입/5전역도착.
// 99(운행중)·기타·null 은 여기 없어 arrivalMsg 원문으로 폴백한다.
const STATUS_BY_CODE: Record<string, string> = {
  '0': '진입',
  '1': '도착',
  '2': '출발',
  '3': '전역 출발',
  '4': '전역 진입',
  '5': '전역 도착',
};

// 잔여초 파생 — receivedAt(원문 수신시각) 기준 보정이 공식 가이드. arrivalSec 이
// 0(상태 국면)·null 이면 카운트다운이 아니라 null 을 돌려 상태 문구로 넘긴다.
const remainSec = (it: SubwayArrivalItemType, nowMs: number): number | null => {
  if (it.arrivalSec === null || it.arrivalSec === 0) return null;
  if (it.receivedAt === null) return it.arrivalSec; // 보정 기준 없음 — 원값 그대로
  const elapsed = Math.floor((nowMs - Date.parse(it.receivedAt)) / 1000);
  return it.arrivalSec - elapsed;
};

// 상태 국면(카운트다운 종료/0·null) 문구 — arrivalCode 우선, 없으면 arrivalMsg 폴백.
const statusText = (it: SubwayArrivalItemType): string => {
  const byCode = it.arrivalCode ? STATUS_BY_CODE[it.arrivalCode] : undefined;
  return byCode ?? it.arrivalMsg ?? '운행 중';
};

// 'm분 s초' — m 이 0이면 's초'만(0분 생략).
const formatCountdown = (remain: number): string => {
  const m = Math.floor(remain / 60);
  const s = remain % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
};

export interface SubwayArrivalPanelProps {
  stationName: string;
  // 그룹의 lineId 집합(오름차순) — 헤더 뱃지·환승 표시.
  lines: string[];
  items: SubwayArrivalItemType[];
  fetchedAt: string | null;
  isLoading: boolean;
  isError: boolean;
  // 도착 조회가 404 — 즐겨찾기로 진입한 죽은 stationId(마스터 재적재로 대표 id
  // 소멸). 일반 에러와 다른 안내(재등록 유도)를 띄운다.
  notFound?: boolean;
  onBack(): void;
  onRetry(): void;
  // 역×호선 즐겨찾기 — 호선 섹션 헤더 별. 좌표를 확보할 수 없는(딥링크 직진입 등)
  // 경우 상위가 미지정 → 별 숨김. 스냅샷 조립(stationId/좌표)은 상위(SubwayPage).
  isLineFavorite?(lineId: string): boolean;
  onToggleLineFavorite?(lineId: string): void;
  // 5차 노선 보기 — 추적 중 lineId(있으면 그 섹션 버튼이 '노선 닫기'로). onTrackLine
  // 미지정이면 버튼 자체를 숨긴다. 토글은 상위(SubwayPage)가 line URL 로 처리.
  trackedLineId?: string | null;
  onTrackLine?(lineId: string): void;
  // 7차 도착↔지도 연계 — 열차 행 '지도에서 보기'. trainNo 있을 때만 버튼 노출.
  // 상위(SubwayPage)가 line 세팅 + 그 열차 따라가기 대기를 건다.
  onLocateTrain?(lineId: string, trainNo: string): void;
  // 8차 시간표 — 선택 stn 의 호선 시간표(오늘 dayType). coverage·lineId 가 맞는 섹션의
  // updn 그룹 푸터에 첫차/막차 + 막차 임박 뱃지. 요청 절제로 stn 의 호선 1개만
  // 조회하므로(환승역의 다른 호선 섹션은 푸터 생략) footerTimetable.lineId 로 매칭.
  footerTimetable?: SubwayTimetableResultType | null;
  // 섹션 헤더 '시간표' 버튼 — 그 호선 시간표 뷰로 전환. 미지정이면 버튼 숨김.
  onOpenTimetable?(lineId: string): void;
  // 10차 혼잡도(정적 통계) — 선택 stn 의 호선. coverage·lineId 매칭 섹션의 updn 그룹
  // 헤더에 현재 시간대 슬롯 게이지. 실시간 아님('통계' 라벨). 시간표 푸터와 동일 배선.
  footerCongestion?: SubwayCongestionResultType | null;
  // 11차 길찾기 — 헤더 버튼. 이 역을 출발로 길찾기 뷰 전환. 미지정이면 버튼 숨김.
  onOpenPath?(): void;
  // 12차 주변 버스 — 선택 역 대표 좌표. 있으면 스크롤 하단에 접이식 섹션. 좌표를
  // 못 구하면(딥링크 직진입 등) 미표시.
  nearbyBusCoord?: { lat: number; lng: number } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SubwayArrivalPanel — 선택 역의 실시간 도착정보. 데스크톱 좌패널/모바일 하단이
// 목록 대신 이 뷰로 전환된다('← 목록'으로 복귀). 호선(lineId asc) → 상하행(updnLine
// 원문) → 열차 행 3단 구조.
// ─────────────────────────────────────────────────────────────────────────────

export const SubwayArrivalPanel = ({
  stationName,
  lines,
  items,
  fetchedAt,
  isLoading,
  isError,
  notFound,
  onBack,
  onRetry,
  isLineFavorite,
  onToggleLineFavorite,
  trackedLineId,
  onTrackLine,
  onLocateTrain,
  footerTimetable,
  onOpenTimetable,
  footerCongestion,
  onOpenPath,
  nearbyBusCoord,
}: SubwayArrivalPanelProps) => {
  // 카운트다운 tick — 패널 하나의 1초 interval 만 둔다(행마다 interval 금지). 외부
  // 시계 동기화라 useEffect 허용, cleanup 필수. 각 행 잔여초는 렌더 중 파생.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // 호선(lineId asc) → 상하행(updnLine 원문, 첫 등장 순서=서버 arrivalSec asc) 그룹.
  const sections = useMemo(() => {
    const byLine = new Map<string, SubwayArrivalItemType[]>();
    for (const it of items) {
      const arr = byLine.get(it.lineId);
      if (arr) arr.push(it);
      else byLine.set(it.lineId, [it]);
    }
    return [...byLine.keys()]
      .sort()
      .map((lineId) => {
        const byUpDn = new Map<string, SubwayArrivalItemType[]>();
        for (const it of byLine.get(lineId)!) {
          const key = it.updnLine || '';
          const arr = byUpDn.get(key);
          if (arr) arr.push(it);
          else byUpDn.set(key, [it]);
        }
        return { lineId, groups: [...byUpDn.entries()].map(([updn, list]) => ({ updn, list })) };
      });
  }, [items]);

  const transfer = lines.length > 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-1.5 border-b p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <ArrowLeft className="size-3.5" /> 목록
          </button>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{stationName}</span>
            {transfer && (
              <Badge variant="secondary" className="shrink-0">
                환승
              </Badge>
            )}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {/* 길찾기 — 이 역을 출발로. */}
            {onOpenPath && (
              <button
                type="button"
                onClick={onOpenPath}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Navigation className="size-3.5" />
                길찾기
              </button>
            )}
            <span className="flex items-center gap-1">
              {lines.map((l) => (
                <SubwayLineBadge key={l} lineId={l} />
              ))}
            </span>
          </span>
        </div>
        {fetchedAt && (
          <div className="text-xs text-muted-foreground tabular-nums">
            갱신 {formatRelativeSec(fetchedAt)} · 30초마다 자동 갱신
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <PanelBody
          sections={sections}
          nowMs={nowMs}
          isLoading={isLoading}
          isError={isError}
          notFound={notFound}
          isEmpty={items.length === 0}
          onRetry={onRetry}
          isLineFavorite={isLineFavorite}
          onToggleLineFavorite={onToggleLineFavorite}
          trackedLineId={trackedLineId}
          onTrackLine={onTrackLine}
          onLocateTrain={onLocateTrain}
          footerTimetable={footerTimetable}
          onOpenTimetable={onOpenTimetable}
          footerCongestion={footerCongestion}
        />
        {/* 12차 — 스크롤 영역 끝 접이식 주변 버스 정류장(도착 뷰 전용). 좌표 없으면 생략. */}
        {nearbyBusCoord && (
          <SubwayNearbyBusSection lat={nearbyBusCoord.lat} lng={nearbyBusCoord.lng} />
        )}
      </div>
    </div>
  );
};

interface LineSection {
  lineId: string;
  groups: { updn: string; list: SubwayArrivalItemType[] }[];
}

const PanelBody = ({
  sections,
  nowMs,
  isLoading,
  isError,
  notFound,
  isEmpty,
  onRetry,
  isLineFavorite,
  onToggleLineFavorite,
  trackedLineId,
  onTrackLine,
  onLocateTrain,
  footerTimetable,
  onOpenTimetable,
  footerCongestion,
}: {
  sections: LineSection[];
  nowMs: number;
  isLoading: boolean;
  isError: boolean;
  notFound?: boolean;
  isEmpty: boolean;
  onRetry(): void;
  isLineFavorite?(lineId: string): boolean;
  onToggleLineFavorite?(lineId: string): void;
  trackedLineId?: string | null;
  onTrackLine?(lineId: string): void;
  onLocateTrain?(lineId: string, trainNo: string): void;
  footerTimetable?: SubwayTimetableResultType | null;
  onOpenTimetable?(lineId: string): void;
  footerCongestion?: SubwayCongestionResultType | null;
}) => {
  if (isLoading && isEmpty) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> 도착정보 불러오는 중…
      </div>
    );
  }
  if (isError) {
    // 404(죽은 즐겨찾기 id)는 재시도해도 소용없어 재등록을 안내한다.
    if (notFound) {
      return (
        <Hint>
          역 정보가 갱신되어 찾을 수 없습니다. 즐겨찾기를 다시 등록해 주세요.
        </Hint>
      );
    }
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-destructive">
        도착정보를 불러오지 못했습니다.
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          재시도
        </Button>
      </div>
    );
  }
  if (isEmpty) {
    return (
      <Hint>
        지금은 도착 정보가 없습니다 — 운행 종료 시간대이거나 실시간 미제공 역(서울 외
        구간)일 수 있어요.
      </Hint>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {sections.map((sec) => (
        <section key={sec.lineId}>
          <div className="mb-1.5 flex items-center gap-1.5">
            <SubwayLineBadge lineId={sec.lineId} />
            <span className="text-sm font-semibold">{subwayLineName(sec.lineId)}</span>
            <div className="ml-auto flex items-center gap-0.5">
              {/* 시간표 — 그 호선 시간표 뷰로 전환. */}
              {onOpenTimetable && (
                <button
                  type="button"
                  onClick={() => onOpenTimetable(sec.lineId)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <Clock className="size-3.5" />
                  시간표
                </button>
              )}
              {/* 노선 보기 토글 — 추적 중인 호선이면 '노선 닫기'. */}
              {onTrackLine && (
                <button
                  type="button"
                  onClick={() => onTrackLine(sec.lineId)}
                  aria-pressed={trackedLineId === sec.lineId}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                    trackedLineId === sec.lineId
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <Route className="size-3.5" />
                  {trackedLineId === sec.lineId ? '노선 닫기' : '노선 보기'}
                </button>
              )}
              {isLineFavorite && onToggleLineFavorite && (
                <BusFavoriteStar
                  active={isLineFavorite(sec.lineId)}
                  onToggle={() => onToggleLineFavorite(sec.lineId)}
                  label={`${subwayLineName(sec.lineId)} 즐겨찾기`}
                />
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {(() => {
              // 이 호선 섹션에 첫차/막차 푸터를 붙일지 — footerTimetable(선택 stn 의 호선
              // 1개만 조회)의 lineId·coverage 가 맞을 때만. 다른 호선 섹션은 생략.
              const secTt =
                footerTimetable &&
                footerTimetable.coverage &&
                footerTimetable.lineId === sec.lineId
                  ? footerTimetable
                  : null;
              // 혼잡도도 같은 섹션(선택 stn 호선)만 — coverage·lineId 매칭 시.
              const secCong =
                footerCongestion &&
                footerCongestion.coverage &&
                footerCongestion.lineId === sec.lineId
                  ? footerCongestion
                  : null;
              return sec.groups.map((g) => {
                const ttUpdn = arrivalUpdnToTimetable(g.updn);
                const ttDir =
                  secTt && ttUpdn
                    ? (secTt.directions.find((d) => d.updn === ttUpdn) ?? null)
                    : null;
                const congDir = secCong ? matchCongestionDir(g.updn, secCong.directions) : null;
                return (
                  <UpDnGroup
                    key={g.updn}
                    updn={g.updn}
                    list={g.list}
                    nowMs={nowMs}
                    lineId={sec.lineId}
                    onLocateTrain={onLocateTrain}
                    timetableDir={ttDir}
                    congestionDir={congDir}
                  />
                );
              });
            })()}
          </div>
        </section>
      ))}
    </div>
  );
};

// 상하행 그룹 — 상위 3개만 노출하고 나머지는 '더보기 N' 토글(로컬 state). 열차가
// 폴링마다 바뀌어도 그룹 키(lineId+updn)가 안정적이라 펼침 상태가 유지된다.
const VISIBLE_LIMIT = 3;

const UpDnGroup = ({
  updn,
  list,
  nowMs,
  lineId,
  onLocateTrain,
  timetableDir,
  congestionDir,
}: {
  updn: string;
  list: SubwayArrivalItemType[];
  nowMs: number;
  lineId: string;
  onLocateTrain?(lineId: string, trainNo: string): void;
  // 8차 — 이 방향의 시간표(첫차/막차). 없으면 푸터 생략.
  timetableDir?: SubwayTimetableDirectionType | null;
  // 10차 — 이 방향의 혼잡도(정적 통계). 현재 슬롯 게이지. 없으면 생략.
  congestionDir?: SubwayCongestionDirectionType | null;
}) => {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? list : list.slice(0, VISIBLE_LIMIT);
  const hidden = list.length - visible.length;
  // 막차 임박 — 현재 시각(1초 tick 재사용) 기준 ≤30분. 자정 넘김은 헬퍼가 보정.
  const lastRemain = timetableDir
    ? lastTrainRemainMin(timetableDir.lastTrain, new Date(nowMs))
    : null;
  const lastImminent = lastRemain !== null && lastRemain >= 0 && lastRemain <= 30;
  // 현재 시간대 혼잡 — 30분 슬롯 전환은 nowMs tick 으로 자연 갱신(파생). 슬롯 밖/null 이면 미표시.
  const congLevel = congestionDir
    ? slotLevel(congestionDir, currentSlotKey(new Date(nowMs)))
    : null;
  const congBand = congLevel !== null ? congestionBand(congLevel) : null;
  return (
    <div>
      {(updn || lastImminent || congBand) && (
        <div className="mb-0.5 flex flex-wrap items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
          {updn && <span>{updn}</span>}
          {lastImminent && (
            <Badge variant="amber" className="shrink-0">
              막차 {lastRemain}분 전
            </Badge>
          )}
          {congBand && congLevel !== null && (
            <span
              className="flex items-center gap-1"
              title="이 시간대 평균 혼잡도(정적 통계 — 실시간 아님)"
            >
              <span className={cn('size-2 shrink-0 rounded-full', congBand.dotClass)} />
              <span className={congBand.textClass}>
                {congBand.label} {Math.round(congLevel)}%
              </span>
              <span className="text-[10px] font-normal text-muted-foreground">통계</span>
            </span>
          )}
        </div>
      )}
      <ul className="flex flex-col gap-0.5">
        {visible.map((it, idx) => (
          <ArrivalRow
            key={`${it.trainNo ?? 'x'}-${idx}`}
            item={it}
            nowMs={nowMs}
            lineId={lineId}
            onLocateTrain={onLocateTrain}
          />
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-0.5 px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          더보기 {hidden}
        </button>
      )}
      {expanded && list.length > VISIBLE_LIMIT && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-0.5 px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          접기
        </button>
      )}
      {/* 첫차/막차 푸터 — 이 방향 시간표가 있을 때만(오늘 dayType). */}
      {timetableDir && (timetableDir.firstTrain || timetableDir.lastTrain) && (
        <div className="mt-1 px-3 text-xs text-muted-foreground tabular-nums">
          첫차 {timetableDir.firstTrain ? formatHHMM(timetableDir.firstTrain) : '—'} · 막차{' '}
          {timetableDir.lastTrain ? formatHHMM(timetableDir.lastTrain) : '—'}
        </div>
      )}
    </div>
  );
};

const ArrivalRow = ({
  item,
  nowMs,
  lineId,
  onLocateTrain,
}: {
  item: SubwayArrivalItemType;
  nowMs: number;
  lineId: string;
  onLocateTrain?(lineId: string, trainNo: string): void;
}) => {
  const remain = remainSec(item, nowMs);
  // 카운트다운(양수)이면 'm분 s초', 아니면 상태 문구. '곧 도착' 계열(≤30초 또는
  // 진입/도착 코드)은 색 강조.
  const counting = remain !== null && remain > 0;
  const text = counting ? formatCountdown(remain) : statusText(item);
  const imminent =
    (remain !== null && remain <= 30) || item.arrivalCode === '0' || item.arrivalCode === '1';
  // 주 표기 — trainLineNm('성수행 - 역삼방면') 우선, 없으면 종착역명 폴백.
  const label =
    item.trainLineNm ?? (item.destination ? `${item.destination}행` : '행선지 미상');
  const showKind = item.trainKind !== null && item.trainKind !== '일반';
  return (
    <li className="flex items-start justify-between gap-3 rounded-md px-3 py-2 text-sm">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate">{label}</span>
        {(showKind || item.isLastTrain) && (
          <span className="flex items-center gap-1">
            {showKind && (
              <Badge variant="amber" className="shrink-0">
                {item.trainKind}
              </Badge>
            )}
            {item.isLastTrain && (
              <Badge variant="secondary" className="shrink-0">
                막차
              </Badge>
            )}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <span
          className={cn(
            'whitespace-nowrap text-right tabular-nums',
            imminent
              ? 'font-semibold text-emerald-600 dark:text-emerald-400'
              : 'text-muted-foreground',
          )}
        >
          {text}
        </span>
        {/* 지도에서 보기 — trainNo 있을 때만(위치 API 조인 키). 상위가 line 세팅 +
            그 열차 따라가기. 과밀 방지로 아이콘만. */}
        {onLocateTrain && item.trainNo && (
          <button
            type="button"
            onClick={() => onLocateTrain(lineId, item.trainNo!)}
            aria-label={`${label} 지도에서 보기`}
            title="지도에서 보기"
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <MapPin className="size-3.5" />
          </button>
        )}
      </span>
    </li>
  );
};

const Hint = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-32 items-center justify-center rounded-md border border-dashed px-4 text-center text-sm text-muted-foreground">
    {children}
  </div>
);
