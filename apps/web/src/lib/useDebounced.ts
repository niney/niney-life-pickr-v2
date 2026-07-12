import { useEffect, useState } from 'react';

// 값이 delay 동안 안정된 뒤에야 갱신되는 디바운스 훅. 타이핑마다 즉시 갱신되는
// 입력값을 쿼리 키 등 "비싼 소비처"에 그대로 흘리지 않게 한다(타이머=외부 시스템
// 동기화라 useEffect 가 적절한 케이스). 입력 표시값은 원본을 그대로 쓰고, 쿼리에만
// 디바운스된 값을 넘기면 입력은 반응적이면서 API 호출은 안정 후 1회만 나간다.
export const useDebounced = <T,>(value: T, delayMs: number): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
};
