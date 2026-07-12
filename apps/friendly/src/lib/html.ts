// HTML/텔레그램 텍스트 이스케이프 + 표기 헬퍼 — 미리보기(OG)·텔레그램 메시지
// 생성 모듈들이 공용.

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

// HTML 문서/속성용 5문자 이스케이프.
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]!);

// 텔레그램 HTML 파스모드용 — 텔레그램 스펙이 요구하는 &, <, > 3문자만.
// (따옴표까지 엔티티로 바꾸면 클라이언트 렌더링에 따라 원문이 노출될 수 있어
// 문서용 escapeHtml 과 의도적으로 분리.)
export const escapeTelegramHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 1234567 → "1,234,567" — ICU 의존 없이 천단위 콤마만(정수 반올림).
export const formatThousands = (n: number): string =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
