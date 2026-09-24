import { buildPinMarkerSvg } from './markerFrame.js';
import type { HousingDealType } from './housing.js';
import type { HousingFloodLevel } from './lifeFlood.js';

// 집값 지도 마커 — 단지는 가격을 새긴 알약 배지(줌과 무관하게 원본 크기 = MapCanvas fixedScale),
// 저줌 집계 셀은 평당가를 새긴 반투명 알약, 선택 단지는 꼬리가 달린 큰 배지(anchor 아래 꼭지점 —
// MapCanvas 가 선택 마커를 [0.5, 1] 로 찍는 규약). 거래 없는 단지는 회색 작은 점(선택 시 회색 핀).
//
// 색은 거래 유형당 하나 — 한 화면엔 한 유형만 그리므로 유형 사이 대비만 있으면 된다(매매 주황·전세
// 파랑·월세 초록, 흰 외곽선으로 야간 타일과 분리). 글자는 흰색 굵게, 11px(선택 12px).

export const HOUSING_DEAL_COLOR: Record<HousingDealType, string> = {
  trade: '#c2410c',
  jeonse: '#1d4ed8',
  monthly: '#047857',
};
export const HOUSING_EMPTY_COLOR = '#9ca3af';

const BUILDING_ICON =
  '<path d="M6 20V6l6-2v16"/><path d="M12 20V10l6 2v8"/><path d="M4 20h16"/><path d="M9 9h1M9 12h1M9 15h1M15 15h1"/>';

const toDataUrl = (svg: string): string => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 글자폭 추정(px) — 시스템 산세리프 굵게 기준: 숫자·구두점 ≈0.6em, 한글 ≈1em, 그 외 ≈0.65em.
const estimateTextWidth = (text: string, fontSize: number): number => {
  let w = 0;
  for (const ch of text) {
    if (/[0-9.,/]/.test(ch)) w += fontSize * 0.6;
    else if (/[ㄱ-힝]/.test(ch)) w += fontSize * 1.0;
    else w += fontSize * 0.65;
  }
  return Math.ceil(w);
};

const FONT = 'system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

// ── 침수 흔적 물방울 — 알약 안 왼쪽 원(반경 100m 침수 흔적 단계, lifeFlood.ts) ─────────────────────
// some(1~4건) = 흰 원 + 하늘색 물방울, many(5건 이상) = 하늘색 원 + 흰 물방울. 알약 색(유형·회색·공시)과
// 무관하게 같은 모양이라 범례 하나로 읽힌다. 물방울이 있으면 글자가 원 오른쪽으로 밀리고 알약이 넓어진다.
export const HOUSING_FLOOD_COLOR = '#0284c7';
const DROP_PATH = 'M0 -4.6C1.4 -2.6 3.2 -0.9 3.2 1.2A3.2 3.2 0 0 1 -3.2 1.2C-3.2 -0.9 -1.4 -2.6 0 -4.6Z';
const floodGlyph = (cx: number, cy: number, r: number, level: HousingFloodLevel): string => {
  if (level === 'none') return '';
  const many = level === 'many';
  const scale = (r / 7.5).toFixed(3);
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${many ? HOUSING_FLOOD_COLOR : '#fff'}" stroke="${many ? '#fff' : HOUSING_FLOOD_COLOR}" stroke-width="1"/>` +
    `<path d="${DROP_PATH}" transform="translate(${cx} ${cy + 0.6}) scale(${scale})" fill="${many ? '#fff' : HOUSING_FLOOD_COLOR}"/>`
  );
};

// 알약 치수 — 글자폭 tw + 좌우 여백 pad. 물방울이 있으면 왼쪽에 원(반지름 (h-7)/2)+간격 3 을 더하고 글자
// 중심을 원 오른쪽 구간 가운데로 옮긴다.
interface PillLayout {
  w: number;
  textX: number;
  glyph: string;
}
const pillLayout = (tw: number, pad: number, h: number, flood: HousingFloodLevel): PillLayout => {
  if (flood === 'none') return { w: tw + pad * 2, textX: (tw + pad * 2) / 2, glyph: '' };
  const r = (h - 7) / 2;
  const cx = 3.5 + r;
  const textStart = cx + r + 3;
  return { w: Math.ceil(textStart + tw + pad), textX: textStart + tw / 2, glyph: floodGlyph(cx, h / 2, r, flood) };
};

// 비선택 배지 — 높이 22, 글자폭 + 좌우 8px(물방울이 있으면 왼쪽에 원). 중앙 앵커.
export function buildHousingBadgeSvg(text: string, color: string, flood: HousingFloodLevel = 'none'): string {
  const font = 11;
  const h = 22;
  const { w, textX, glyph } = pillLayout(estimateTextWidth(text, font), 8, h, flood);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${(h - 2) / 2}" fill="${color}" stroke="#fff" stroke-width="1.5"/>` +
    glyph +
    `<text x="${textX}" y="${h / 2}" fill="#fff" font-family='${FONT}' font-size="${font}" font-weight="700" text-anchor="middle" dominant-baseline="central">${escapeXml(text)}</text>` +
    '</svg>'
  );
}

// 선택 배지 — 높이 26 알약 + 아래 꼬리 7 = 33. 앵커는 꼬리 끝(아래 중앙) — 물방울로 글자가 밀려도 꼬리는 가운데.
export function buildHousingSelectedBadgeSvg(text: string, color: string, flood: HousingFloodLevel = 'none'): string {
  const font = 12;
  const pill = 26;
  const tail = 7;
  const h = pill + tail;
  const { w, textX, glyph } = pillLayout(estimateTextWidth(text, font), 10, pill, flood);
  const cx = w / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<path d="M${cx - 6} ${pill - 1} L${cx} ${h - 1} L${cx + 6} ${pill - 1} Z" fill="${color}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<rect x="1" y="1" width="${w - 2}" height="${pill - 2}" rx="${(pill - 2) / 2}" fill="${color}" stroke="#fff" stroke-width="2"/>` +
    glyph +
    `<text x="${textX}" y="${pill / 2}" fill="#fff" font-family='${FONT}' font-size="${font}" font-weight="700" text-anchor="middle" dominant-baseline="central">${escapeXml(text)}</text>` +
    '</svg>'
  );
}

export function buildHousingBadgeDataUrl(
  text: string,
  dealType: HousingDealType,
  selected: boolean,
  flood: HousingFloodLevel = 'none',
): string {
  const color = HOUSING_DEAL_COLOR[dealType];
  return toDataUrl(selected ? buildHousingSelectedBadgeSvg(text, color, flood) : buildHousingBadgeSvg(text, color, flood));
}

// 거래 없는 단지 — 10px 회색 점 / 선택 시 회색 핀(건물 아이콘).
export function buildHousingEmptyDotSvg(): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10">' +
    `<circle fill="${HOUSING_EMPTY_COLOR}" stroke="#fff" stroke-width="1.5" cx="5" cy="5" r="3.75"/>` +
    '</svg>'
  );
}
export function buildHousingEmptyMarkerDataUrl(selected: boolean): string {
  return toDataUrl(
    selected ? buildPinMarkerSvg({ fill: HOUSING_EMPTY_COLOR, innerSvg: BUILDING_ICON }) : buildHousingEmptyDotSvg(),
  );
}

// 집계 셀 — 평당가 텍스트를 새긴 반투명 알약(중앙 앵커). 단지 수가 많을수록 살짝 크게(1~9/10~49/50+).
export function buildHousingCellSvg(text: string, count: number, dealType: HousingDealType): string {
  const bucket = count < 10 ? 0 : count < 50 ? 1 : 2;
  const font = [11, 12, 13][bucket]!;
  const h = [24, 27, 30][bucket]!;
  const w = estimateTextWidth(text, font) + 18;
  const color = HOUSING_DEAL_COLOR[dealType];
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${(h - 2) / 2}" fill="${color}" fill-opacity="0.88" stroke="#fff" stroke-width="2"/>` +
    `<text x="${w / 2}" y="${h / 2}" fill="#fff" font-family='${FONT}' font-size="${font}" font-weight="700" text-anchor="middle" dominant-baseline="central">${escapeXml(text)}</text>` +
    '</svg>'
  );
}
export function buildHousingCellDataUrl(text: string, count: number, dealType: HousingDealType): string {
  return toDataUrl(buildHousingCellSvg(text, count, dealType));
}

// ── 회색 배지 — 선택 축에 거래가 없는 단지의 보강 표시 ─────────────────────────────────
// 폴백(다른 조건의 마지막 거래)·임대 표시는 회색 채움, 공시가격은 **점선 외곽선 + 연한 채움**으로
// "실거래가 아님" 을 색뿐 아니라 모양으로도 구분한다. 선택 시엔 유형 배지와 같은 꼬리 프레임을 회색으로.
export const HOUSING_FALLBACK_COLOR = '#6b7280';
const OFFICIAL_FILL = '#e5e7eb';
const OFFICIAL_TEXT = '#374151';

export interface HousingMutedBadgeOptions {
  // true = 공시가격(점선 외곽선·연한 채움·진한 글자).
  dashed?: boolean;
  // 침수 흔적 물방울 단계(기본 none).
  flood?: HousingFloodLevel;
}

const mutedStyle = (dashed: boolean, strokeWidth: number) =>
  dashed
    ? {
        fill: OFFICIAL_FILL,
        text: OFFICIAL_TEXT,
        stroke: `stroke="${HOUSING_FALLBACK_COLOR}" stroke-width="${strokeWidth}" stroke-dasharray="3 2"`,
      }
    : { fill: HOUSING_FALLBACK_COLOR, text: '#fff', stroke: `stroke="#fff" stroke-width="${strokeWidth}"` };

// 비선택 회색 배지 — 유형 배지와 같은 치수(높이 22, 중앙 앵커).
export function buildHousingMutedBadgeSvg(text: string, opts: HousingMutedBadgeOptions = {}): string {
  const font = 11;
  const h = 22;
  const { w, textX, glyph } = pillLayout(estimateTextWidth(text, font), 8, h, opts.flood ?? 'none');
  const s = mutedStyle(opts.dashed === true, 1.5);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${(h - 2) / 2}" fill="${s.fill}" ${s.stroke}/>` +
    glyph +
    `<text x="${textX}" y="${h / 2}" fill="${s.text}" font-family='${FONT}' font-size="${font}" font-weight="700" text-anchor="middle" dominant-baseline="central">${escapeXml(text)}</text>` +
    '</svg>'
  );
}

// 선택 회색 배지 — 꼬리 프레임(높이 33, 아래 중앙 앵커).
export function buildHousingMutedSelectedBadgeSvg(text: string, opts: HousingMutedBadgeOptions = {}): string {
  const font = 12;
  const pill = 26;
  const tail = 7;
  const h = pill + tail;
  const { w, textX, glyph } = pillLayout(estimateTextWidth(text, font), 10, pill, opts.flood ?? 'none');
  const cx = w / 2;
  const s = mutedStyle(opts.dashed === true, 2);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<path d="M${cx - 6} ${pill - 1} L${cx} ${h - 1} L${cx + 6} ${pill - 1} Z" fill="${s.fill}" ${s.stroke} stroke-linejoin="round"/>` +
    `<rect x="1" y="1" width="${w - 2}" height="${pill - 2}" rx="${(pill - 2) / 2}" fill="${s.fill}" ${s.stroke}/>` +
    glyph +
    `<text x="${textX}" y="${pill / 2}" fill="${s.text}" font-family='${FONT}' font-size="${font}" font-weight="700" text-anchor="middle" dominant-baseline="central">${escapeXml(text)}</text>` +
    '</svg>'
  );
}

export function buildHousingMutedBadgeDataUrl(
  text: string,
  opts: HousingMutedBadgeOptions & { selected?: boolean } = {},
): string {
  return toDataUrl(
    opts.selected ? buildHousingMutedSelectedBadgeSvg(text, opts) : buildHousingMutedBadgeSvg(text, opts),
  );
}
