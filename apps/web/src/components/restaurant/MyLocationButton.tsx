import { useEffect, useRef, useState } from 'react';
import { Loader2, LocateFixed } from 'lucide-react';
import type { UserLocationStatus } from '@repo/shared';
import { Button } from '~/components/ui/button';

// "내 위치" 버튼 — 공개 맛집 지도(PublicRestaurantsMap)와 어드민 발견 지도
// (DiscoverMap)가 공유한다. disabled/스피너/안내 분기를 맵 본체 JSX 에서 떼어
// 가독성 유지.
//
// 'denied'(권한 차단)는 사용자가 브라우저 사이트 설정에서 직접 풀 수 있으므로
// 버튼을 비활성하지 않고, 클릭하면 해제 방법 callout 을 띄운다. 클릭 시 onClick
// (refetch)도 같이 걸어, 사용자가 이미 설정을 풀어둔 경우 즉시 재시도되게 한다.
// (설정을 푸는 즉시 useUserLocation 의 permission 'change' 구독이 자동 반영하므로,
// 클릭조차 안 해도 버튼은 살아난다.)
// 'unavailable'(비-secure context·미지원)은 앱에서 손쓸 수 없으니 비활성 유지.
export const MyLocationButton = ({
  status,
  onClick,
}: {
  status: UserLocationStatus;
  onClick: () => void;
}) => {
  const isPending = status === 'pending';
  const isDenied = status === 'denied';
  const isUnavailable = status === 'unavailable';

  const [guideOpen, setGuideOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 바깥 클릭으로 안내 닫기 — document 이벤트(외부 시스템 동기화)라 useEffect 적합.
  useEffect(() => {
    if (!guideOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setGuideOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [guideOpen]);

  // 'unavailable' 중에서도 비-secure context(평문 HTTP) 가 원인이면, 손쓸 수
  // 없는 '미지원' 이 아니라 접속 방식 문제이므로 메시지를 구체적으로 안내한다.
  // 프로덕션(HTTPS)에서는 여기 걸리지 않으니 dev/LAN 접속 때만 보인다.
  const insecure =
    isUnavailable &&
    typeof window !== 'undefined' &&
    window.isSecureContext === false;
  // denied(권한 차단)·insecure(평문 HTTP)는 클릭 시 안내 callout 을 띄운다.
  const showGuide = isDenied || insecure;
  const title = isDenied
    ? '위치 권한이 차단됨 — 클릭하면 해제 방법을 안내해요'
    : insecure
      ? 'HTTPS 또는 localhost 로 접속해야 위치를 쓸 수 있어요'
      : isUnavailable
        ? '위치를 가져오지 못했어요 — 다시 시도'
        : '내 위치';

  // pending 만 비활성. unavailable 은 timeout/일시 실패도 포함하므로 재시도
  // 여지를 남긴다(disabled 면 title 툴팁도 안 뜨고 재시도도 막힘).
  const handleClick = () => {
    if (showGuide) setGuideOpen((v) => !v);
    // insecure(HTTP)는 재시도해도 무의미하니 안내만. 그 외(denied 포함·timeout)는
    // 재시도 — denied 도 사용자가 이미 설정을 풀어뒀을 수 있어 한 번 확인.
    if (!insecure) onClick();
  };

  return (
    <div ref={wrapRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={handleClick}
        disabled={isPending}
        title={title}
        aria-label={title}
        className="size-8 bg-background/95 shadow-sm"
      >
        {isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <LocateFixed className="size-4" />
        )}
      </Button>

      {guideOpen && showGuide && (
        <div className="absolute right-0 top-full z-10 mt-2 w-64 rounded-md border bg-background p-3 text-left text-xs shadow-md">
          {isDenied ? (
            <>
              <p className="font-medium text-foreground">위치 권한이 차단되어 있어요</p>
              <p className="mt-1 leading-relaxed text-muted-foreground">
                주소창 왼쪽의 자물쇠(또는 ⓘ) 아이콘 →{' '}
                <span className="font-medium text-foreground">위치</span> →{' '}
                <span className="font-medium text-foreground">허용</span> 으로 바꾼 뒤
                다시 시도하세요. 설정을 바꾸면 자동으로 반영돼요.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-foreground">위치를 쓸 수 없는 환경이에요</p>
              <p className="mt-1 leading-relaxed text-muted-foreground">
                평문 HTTP로 접속 중이라 브라우저가 위치를 막았어요.{' '}
                <span className="font-medium text-foreground">localhost</span> 나{' '}
                <span className="font-medium text-foreground">HTTPS</span> 로 접속하면
                쓸 수 있어요.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
};
