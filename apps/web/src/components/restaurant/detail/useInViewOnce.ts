import { useEffect, useRef, useState, type RefObject } from 'react';

// 요소가 화면에 한 번이라도 들어왔는지 — "보일 때부터 조회" 용도. 한 번 들어오면 true 로 굳는다
// (다시 나가도 끄지 않는다 — 스크롤이 오갈 때마다 조회·폴링을 켰다 껐다 하지 않게).
// IntersectionObserver 는 외부 시스템이라 useEffect 로 구독한다. 그것이 없는 환경(jsdom·구형
// 브라우저)에선 처음부터 true — 예전처럼 마운트 즉시 조회로 떨어진다.
//
// rootMargin 은 뷰포트 기준 여유(px). 상세 패널처럼 안쪽 스크롤 컨테이너에 들어 있으면 그 컨테이너가
// 가린 부분은 "안 보임" 으로 판정되므로(여유가 적용되지 않음) 실제로 스크롤돼 드러날 때 켜진다.
export const useInViewOnce = <T extends Element>(
  rootMargin = '200px',
): [RefObject<T | null>, boolean] => {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setInView(true);
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, rootMargin]);

  return [ref, inView];
};
