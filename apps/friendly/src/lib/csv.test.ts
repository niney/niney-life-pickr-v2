import { describe, expect, it } from 'vitest';
import { csvColumnIndex, iterateCsvRows, parseCsv } from './csv.js';

describe('csv — RFC 4180', () => {
  it('따옴표 안 쉼표·줄바꿈·"" 이스케이프, CRLF, BOM', () => {
    const text = String.fromCharCode(0xfeff) + 'a,b,c\r\n1,"x, y","he said ""hi"""\r\n2,"multi\nline",z\r\n';
    const t = parseCsv(text);
    expect(t.header).toEqual(['a', 'b', 'c']);
    expect(t.rows).toEqual([
      ['1', 'x, y', 'he said "hi"'],
      ['2', 'multi\nline', 'z'],
    ]);
  });

  it('빈 줄은 건너뛰고 마지막 줄 개행 유무와 무관', () => {
    expect([...iterateCsvRows('a,b\n\n1,2\n\n')]).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect([...iterateCsvRows('a,b\n1,2')]).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('빈 필드·끝 쉼표 보존', () => {
    expect([...iterateCsvRows('a,,c\n,,\n')]).toEqual([
      ['a', '', 'c'],
      ['', '', ''],
    ]);
  });

  it('헤더 인덱스 — 중복 이름은 앞 것', () => {
    const idx = csvColumnIndex(['관리번호', 'STN', 'STN']);
    expect(idx.get('관리번호')).toBe(0);
    expect(idx.get('STN')).toBe(1);
    expect(idx.get('없음')).toBeUndefined();
  });

  it('빈 입력', () => {
    expect(parseCsv('')).toEqual({ header: [], rows: [] });
  });
});
