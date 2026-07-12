const parseWonNumber = (text: string): number | null => {
  const normalized = text.replace(/[,\s₩원]/g, '');
  if (!/^\d+$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const formatWonNumber = (value: number): string => `${value.toLocaleString('ko-KR')}원`;

export const formatWonPrice = (price: string | null | undefined): string | null => {
  const text = price?.trim();
  if (!text) return null;

  const single = parseWonNumber(text);
  if (single !== null) return formatWonNumber(single);

  const rangeParts = text.split(/\s*(?:~|〜|-|–|—)\s*/);
  if (rangeParts.length === 2) {
    const min = parseWonNumber(rangeParts[0]!);
    const max = parseWonNumber(rangeParts[1]!);
    if (min !== null && max !== null) return `${formatWonNumber(min)} ~ ${formatWonNumber(max)}`;
  }

  return text.replace(/(\d[\d,\s]*)원/g, (_, raw: string) => {
    const value = parseWonNumber(raw);
    return value === null ? `${raw}원` : formatWonNumber(value);
  });
};
