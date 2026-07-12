// LLM 응답처럼 잡음 섞인 텍스트에서 JSON 을 건져내는 헬퍼.

// 균형잡힌 첫 JSON 객체 추출. 문자열 리터럴 안의 `{` `}` 와 이스케이프된
// `\"` 를 무시하고, 깊이 0이 되는 시점에 종료한다. summary·menu-grouping·
// analytics·auto-discover·logs·settlement-extraction 이 공용.
export const extractFirstJsonObject = (s: string): string | null => {
  const start = s.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i += 1) {
    const c = s[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
};
