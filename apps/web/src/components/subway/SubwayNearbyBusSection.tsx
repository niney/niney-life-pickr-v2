import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bus, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useBusNearbyStations } from '@repo/shared';
import { roundCoord } from '@repo/utils';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';

// 도보권(m) — 버스 기본 반경(500)보다 좁게. 역 바로 옆 정류장만.
const NEARBY_RADIUS_M = 350;

// 거리(m) → 표기. 1km 미만 정수 m, 이상 소수 1자리 km(버스 리스트와 동일).
const formatDist = (m: number): string =>
  m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;

// ─────────────────────────────────────────────────────────────────────────────
// SubwayNearbyBusSection — 도착 패널 하단의 접이식 '주변 버스 정류장' 섹션. 버스
// 쿼터를 아끼려 기본 접힘 + 펼쳤을 때만 조회(enabled 게이트). 행 탭 → 버스 탭으로
// 딥링크 전환(/bus?near=&stId=). 서버·계약 변경 없이 기존 버스 nearby 를 재사용한다.
// ─────────────────────────────────────────────────────────────────────────────

export const SubwayNearbyBusSection = ({ lat, lng }: { lat: number; lng: number }) => {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  // 접힌 상태에서는 좌표를 null 로 넘겨 조회 자체를 막는다(버스 API 콜 0).
  const nearby = useBusNearbyStations(
    expanded ? lat : null,
    expanded ? lng : null,
    NEARBY_RADIUS_M,
  );
  const items = expanded ? (nearby.data?.items ?? []) : [];

  // 행 탭 → 버스 탭 전환. near 로 주변 목록 맥락 + stId 로 그 정류장 선택(도착 패널
  // 자동 오픈). SPA 라우트 전환이라 새 창이 아니라 탭 이동으로 보인다.
  const goToBus = (stId: string) => {
    navigate(`/bus?near=${roundCoord(lat)},${roundCoord(lng)}&stId=${encodeURIComponent(stId)}`);
  };

  return (
    <section className="mt-4 border-t pt-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <Bus className="size-3.5" />
        주변 버스 정류장
      </button>

      {expanded && (
        <div className="mt-1">
          {nearby.isLoading && items.length === 0 ? (
            <div className="flex h-16 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" /> 불러오는 중…
            </div>
          ) : nearby.isError ? (
            <div className="flex h-16 flex-col items-center justify-center gap-1.5 text-sm text-destructive">
              불러오지 못했습니다.
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void nearby.refetch()}
              >
                재시도
              </Button>
            </div>
          ) : items.length === 0 ? (
            <p className="px-1 py-3 text-center text-sm text-muted-foreground">
              주변에 정류장이 없어요.
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {items.map((it) => (
                <li key={it.stId}>
                  <button
                    type="button"
                    onClick={() => goToBus(it.stId)}
                    className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50"
                  >
                    <span className="truncate font-medium">{it.name}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatDist(it.dist)}
                      </span>
                      {/* arsId '0' = 가상정류장(표지판 번호 없음) — 배지 숨김(버스 규칙). */}
                      {it.arsId !== '0' && (
                        <Badge variant="secondary" className="tabular-nums">
                          {it.arsId}
                        </Badge>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};
