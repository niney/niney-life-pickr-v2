import { describe, expect, it } from 'vitest';
import { chunk } from './array.js';
import { escapeHtml, escapeTelegramHtml, formatThousands } from './html.js';
import { extractFirstJsonObject } from './json.js';
import { normalizeTerm } from './text.js';

describe('chunk', () => {
  it('n 개 단위 분할 + 꼬리 청크', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });

  it('n <= 0 은 전체 1청크(무한루프 가드)', () => {
    expect(chunk([1, 2], 0)).toEqual([[1, 2]]);
  });
});

describe('escapeHtml / escapeTelegramHtml', () => {
  it('HTML 문서용 — 5문자', () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });

  it('텔레그램용 — &, <, > 만 (따옴표 원문 유지)', () => {
    expect(escapeTelegramHtml(`<b>&"'`)).toBe(`&lt;b&gt;&amp;"'`);
  });
});

describe('formatThousands', () => {
  it('천단위 콤마 + 정수 반올림', () => {
    expect(formatThousands(1234567)).toBe('1,234,567');
    expect(formatThousands(999)).toBe('999');
    expect(formatThousands(1000.6)).toBe('1,001');
  });
});

describe('extractFirstJsonObject', () => {
  it('앞뒤 잡음 무시하고 첫 균형 객체만', () => {
    expect(extractFirstJsonObject('노이즈 {"a":1} 꼬리 {"b":2}')).toBe('{"a":1}');
  });

  it('문자열 리터럴 안 중괄호·이스케이프 따옴표 무시', () => {
    expect(extractFirstJsonObject('{"s":"a}b\\"c{"}')).toBe('{"s":"a}b\\"c{"}');
  });

  it('중첩 객체는 바깥 균형까지', () => {
    expect(extractFirstJsonObject('x{"a":{"b":2}}y')).toBe('{"a":{"b":2}}');
  });

  it('객체 없음/불균형은 null', () => {
    expect(extractFirstJsonObject('no json here')).toBeNull();
    expect(extractFirstJsonObject('{"a":1')).toBeNull();
  });
});

describe('normalizeTerm', () => {
  it('소문자화 + 공백/특수문자 제거, 문자·숫자 보존', () => {
    expect(normalizeTerm('트러플 크림 파스타')).toBe('트러플크림파스타');
    expect(normalizeTerm('SET Menu 2')).toBe('setmenu2');
    expect(normalizeTerm('김치-찌개!')).toBe('김치찌개');
  });
});
