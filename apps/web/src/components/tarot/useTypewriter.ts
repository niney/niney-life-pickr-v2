import { useEffect, useState } from 'react';

// 타자 효과 — text 가 바뀌면 처음부터 한 글자씩(초당 cps 자). enabled=false(Lite·reduced-motion)
// 면 즉시 전체. text 변경 시 리셋은 렌더 중 파생(prev 비교), 진행은 interval(외부 시스템) 안에서만
// setState 한다.
export const useTypewriter = (text: string, enabled: boolean, cps = 60): string => {
  const [shown, setShown] = useState(0);
  const [prevText, setPrevText] = useState(text);
  if (prevText !== text) {
    setPrevText(text);
    setShown(0);
  }

  useEffect(() => {
    if (!enabled) return;
    const step = 2;
    const id = window.setInterval(() => {
      setShown((s) => {
        const next = Math.min(text.length, s + step);
        if (next >= text.length) window.clearInterval(id);
        return next;
      });
    }, (1000 * step) / cps);
    return () => window.clearInterval(id);
  }, [text, enabled, cps]);

  return enabled ? text.slice(0, Math.min(shown, text.length)) : text;
};
