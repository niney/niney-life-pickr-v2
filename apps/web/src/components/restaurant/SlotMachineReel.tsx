import { cn } from '~/lib/utils';

// 슬롯머신 릴 — 프레젠테이션 전용. 상태(스트립 rows/정지 위치/애니메이션 여부)는
// 부모(SmartPickSection)가 전부 소유하고, 여기는 세로 스트립을 CSS transform
// transition 으로 굴리기만 한다. rAF/useEffect 없음 — 커밋 간 transform 값
// 변화가 곧 transition 트리거이고, 종료는 onTransitionEnd 이벤트로 부모에 알린다.
//
// 표시 구조: 3행 높이 viewport 가운데 행이 "당첨 칸". rows 앞뒤에 빈 패딩 행을
// 붙여 position(논리 인덱스) 행이 항상 가운데 오도록 translateY(-position*ROW_H).

const ROW_H = 48; // px — h-12 와 일치.

interface SlotMachineReelProps {
  rows: string[];
  // rows 안에서 가운데 칸에 놓일 논리 인덱스. animate=true 로 커밋되면 직전
  // 위치에서 이 위치까지 감속 스크롤한다.
  position: number;
  animate: boolean;
  onSettled(): void;
  className?: string;
}

export const SlotMachineReel = ({
  rows,
  position,
  animate,
  onSettled,
  className,
}: SlotMachineReelProps) => {
  const displayRows = ['', ...rows, ''];
  return (
    <div className={cn('relative h-36 overflow-hidden rounded-xl border bg-card', className)}>
      <ul
        className={cn(
          'will-change-transform',
          animate
            ? 'transition-transform duration-[2200ms] ease-[cubic-bezier(0.12,0.8,0.22,1)] motion-reduce:transition-none'
            : 'transition-none',
        )}
        style={{ transform: `translateY(-${position * ROW_H}px)` }}
        onTransitionEnd={(e) => {
          // 자식 요소의 다른 transition 이벤트 버블을 걸러 transform 종료만 처리.
          if (e.target === e.currentTarget && e.propertyName === 'transform') onSettled();
        }}
        aria-hidden
      >
        {displayRows.map((name, i) => (
          <li
            key={i}
            className="flex h-12 items-center justify-center truncate px-6 text-lg font-semibold"
          >
            {name}
          </li>
        ))}
      </ul>

      {/* 가운데 당첨 칸 하이라이트 + 위아래 페이드 — 릴 위를 덮는 장식 레이어. */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-card to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent" />
        <div className="absolute inset-x-2 top-12 h-12 rounded-lg border-2 border-primary/50" />
      </div>
    </div>
  );
};
