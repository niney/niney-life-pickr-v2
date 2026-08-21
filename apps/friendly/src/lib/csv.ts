// RFC 4180 CSV 파서 — 따옴표 필드(쉼표·줄바꿈·"" 이스케이프)와 CRLF/LF, BOM 을 처리한다.
// 공공데이터 CSV(CP949)는 호출자가 TextDecoder('euc-kr') 로 먼저 문자열로 만든다. 79MB 도
// 문자열 하나로 들고 파싱하는 단순 구현 — 적재 스크립트 전용이라 스트리밍은 하지 않는다.
// (subway-verify 의 splitCsv 는 단순 쉼표 목록용이라 여기 쓰지 않는다.)

export function* iterateCsvRows(text: string): Generator<string[]> {
  const n = text.length;
  let i = 0;
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  // 빈 줄(연속 개행)은 행으로 내보내지 않는다.
  let rowHasContent = false;
  while (i < n) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      rowHasContent = true;
      i += 1;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      rowHasContent = true;
      i += 1;
      continue;
    }
    if (c === '\r') {
      i += 1;
      continue;
    }
    if (c === '\n') {
      if (rowHasContent || field.length > 0) {
        row.push(field);
        yield row;
      }
      row = [];
      field = '';
      rowHasContent = false;
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (rowHasContent || field.length > 0) {
    row.push(field);
    yield row;
  }
}

export interface CsvTable {
  header: string[];
  rows: string[][];
}

// 첫 행을 헤더로. BOM(U+FEFF)·헤더 공백 제거. 열 수가 다른 행은 그대로 둔다(호출자가 검증·리포트).
export const parseCsv = (text: string): CsvTable => {
  const it = iterateCsvRows(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  const first = it.next();
  if (first.done) return { header: [], rows: [] };
  const header = first.value.map((h) => h.trim());
  const rows: string[][] = [];
  for (const row of it) rows.push(row);
  return { header, rows };
};

// 헤더 이름 → 열 인덱스. 같은 이름이 둘이면 앞 것.
export const csvColumnIndex = (header: string[]): Map<string, number> => {
  const m = new Map<string, number>();
  header.forEach((h, i) => {
    if (!m.has(h)) m.set(h, i);
  });
  return m;
};
