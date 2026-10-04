import { useEffect, useRef, useState } from 'react';
import { useMealPhotoUrl } from '@repo/shared';
import { cn } from '~/lib/utils';

// 식단 사진 — 서버가 JWT 를 요구해 <img src={url}> 로 직접 못 부른다. useMealPhotoUrl 이
// blob 을 받아 웹에서는 objectURL 로 바꿔 캐시에 두고(다시 마운트돼도 바로 그린다) 해제까지 맡는다.
//
// 처음 받는 사진은 화면 가까이 왔을 때만 받는다 — 목록은 한 쪽에 30줄이라 보이지 않는 줄의 사진까지 한꺼번에
// 인증 fetch 를 걸지 않게. 이미 받아 둔 사진은 기다리지 않고 바로 그린다.

// 뷰포트 밖으로 이만큼 남았을 때 미리 받기 시작한다.
const NEAR_VIEWPORT_MARGIN = '200px';

export const MealPhotoImg = ({
  token,
  variant = 'thumb',
  className,
  alt = '식단 사진',
}: {
  token: string;
  variant?: 'full' | 'thumb';
  className?: string;
  alt?: string;
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  // IntersectionObserver 가 없는 환경(jsdom·구형 브라우저)은 예전처럼 마운트하자마자 받는다.
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  const { url, error } = useMealPhotoUrl(token, { variant, enabled: near });
  const waiting = !near && !url;

  // 자리표시자(또는 지난 실패 표시)가 화면 가까이 오는지 지켜본다 — 브라우저 관찰자는 외부 시스템이라 effect.
  // 한 번 가까워지면 더 볼 것이 없다.
  useEffect(() => {
    const el = boxRef.current;
    if (!waiting || !el) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: NEAR_VIEWPORT_MARGIN },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [waiting]);

  if (error) {
    return (
      <div
        ref={boxRef}
        className={cn('flex items-center justify-center rounded-md bg-muted text-xs text-muted-foreground', className)}
      >
        !
      </div>
    );
  }
  if (!url) {
    return <div ref={boxRef} className={cn('animate-pulse rounded-md bg-muted', className)} />;
  }
  return <img src={url} alt={alt} className={cn('rounded-md object-cover', className)} />;
};
