import { Eye, EyeOff } from 'lucide-react';
import { useTransitCrossShowStore } from '~/stores/transitCrossShowStore';

// 통합 주변 겸표시 토글 칩 — 지도 우상단 오버레이. 버스 탭 "지하철역 표시" /
// 지하철 탭 "정류장 표시". on/off 는 transitCrossShowStore(persist·양 탭 공유)로
// 관리한다. visible=false(주변 모드 아님/집중 모드)면 렌더하지 않는다.
//
// 위치는 우상단(right-3 top-3) — 상단 중앙(재검색/로딩 칩)·좌상단(지하철 노선
// 카드)·좌하단(레이어 컨트롤)·하단 중앙(따라가기 배지)과 겹치지 않는 빈 자리.
export const TransitCrossToggleChip = ({
  label,
  visible,
}: {
  label: string;
  visible: boolean;
}) => {
  const show = useTransitCrossShowStore((s) => s.show);
  const toggle = useTransitCrossShowStore((s) => s.toggle);
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={show}
      className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border bg-background/95 px-3 py-1.5 text-xs font-medium shadow-md transition-colors hover:bg-accent"
    >
      {show ? (
        <Eye className="size-3.5" />
      ) : (
        <EyeOff className="size-3.5 opacity-60" />
      )}
      {label}
    </button>
  );
};
