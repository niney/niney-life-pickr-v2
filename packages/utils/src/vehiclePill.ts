// 차량(실시간 위치) 알약 + 진행 방향 다트 SVG 의 도메인 중립 기하 코어. 버스
// 노선번호 알약이 원형이었고 지하철 열차도 같은 규격을 쓴다 — 앵커 트릭(아래 절반
// 투명 여백 → 꼬리 끝이 세로 중앙 = 정차 좌표)이 미묘해 복제 드리프트를 막으려고
// 한 곳으로 추출했다. busMarker 는 기존 export 이름으로 이 함수들에 위임한다
// (바이트 동일 산출).
//
// 앵커 트릭: MapCanvas 는 비선택 아이콘을 [0.5, 0.5](이미지 중앙) 앵커로 배치하고
// 차량은 선택 개념이 없어 항상 비선택이다. 그래서 SVG 아래 절반을 투명 여백으로
// 채워 '꼬리 끝'이 세로 중앙에 오게 그린다 — 꼬리 끝이 정차 좌표를 정확히 가리키고,
// compact 축소(중앙 기준 scale)에도 그 지점이 고정된다.

const escapeXml = (s: string): string =>
  s.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;',
  );

export interface VehiclePillOptions {
  // 알약 표기('141', 'N61', '성수행'). 빈 문자열이면 번호 없이 색 알약만.
  label: string;
  // 노선색(폴리라인·경유지 점과 동일). '#rrggbb'.
  color: string;
  // '정차 중' 강조 — 알약 뒤에 은은한 노선색 후광 1겹.
  stopped?: boolean;
  // '따라가는 대상' 강조 — 알약 바깥에 흰 링 + 옅은 확산으로 살짝 도드라지게.
  // 정차 후광과 독립(둘 다일 수 있어 레이어를 나눠 그린다).
  highlighted?: boolean;
}

export function buildVehiclePillSvg({
  label,
  color,
  stopped = false,
  highlighted = false,
}: VehiclePillOptions): string {
  const fontSize = 13;
  // SVG 텍스트 실측이 불가 → bold 숫자·대문자 기준 문자폭 근사(넉넉히).
  const textW = Math.max(label.length * 8.4, 8);
  const padX = 9;
  const pillH = 24;
  const r = pillH / 2; // stadium(양끝 반원)
  const pillW = Math.max(pillH, Math.round(textW + padX * 2));
  const tailH = 8;
  const tailHalf = 6;
  // 후광/강조 링이 삐져나올 여백 — 주행·미강조 시엔 흰 스트로크만 감안.
  const margin = Math.max(stopped ? 6 : 3, highlighted ? 6 : 0);
  const w = pillW + margin * 2;
  const h = (pillH + tailH + margin) * 2; // 꼬리 끝 = 세로 중앙
  const cx = w / 2;
  const tipY = h / 2;
  const pillTop = tipY - tailH - pillH;
  const pillBottom = tipY - tailH;
  const left = cx - pillW / 2;
  const right = cx + pillW / 2;
  const midY = (pillTop + pillBottom) / 2;
  // 알약 + 하단 중앙 꼬리를 하나의 path 로(이음새 없는 말풍선).
  const bubble =
    `M${left + r} ${pillTop} H${right - r} ` +
    `A${r} ${r} 0 0 1 ${right - r} ${pillBottom} ` +
    `H${cx + tailHalf} L${cx} ${tipY} L${cx - tailHalf} ${pillBottom} ` +
    `H${left + r} ` +
    `A${r} ${r} 0 0 1 ${left + r} ${pillTop} Z`;
  // 강조 링 — 맨 뒤에 옅은 확산(라이트/다크 배경 모두 대응) + 흰 링 1겹.
  const highlight = highlighted
    ? `<rect x="${left - 5}" y="${pillTop - 5}" width="${pillW + 10}" height="${pillH + 10}" rx="${r + 5}" fill="${color}" opacity="0.22"/>` +
      `<rect x="${left - 3}" y="${pillTop - 3}" width="${pillW + 6}" height="${pillH + 6}" rx="${r + 3}" fill="none" stroke="#fff" stroke-width="2.5" opacity="0.95"/>`
    : '';
  const halo = stopped
    ? `<rect x="${left - 3}" y="${pillTop - 3}" width="${pillW + 6}" height="${pillH + 6}" rx="${r + 3}" fill="${color}" opacity="0.28"/>`
    : '';
  const text = label
    ? `<text x="${cx}" y="${midY + fontSize * 0.34}" text-anchor="middle" ` +
      `fill="#fff" font-family="system-ui, -apple-system, 'Malgun Gothic', sans-serif" ` +
      `font-size="${fontSize}" font-weight="700">${escapeXml(label)}</text>`
    : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    highlight +
    halo +
    `<path d="${bubble}" fill="${color}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>` +
    text +
    '</svg>'
  );
}

export function buildVehiclePillDataUrl(options: VehiclePillOptions): string {
  return (
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(buildVehiclePillSvg(options))
  );
}

// 진행 방향 화살표 — 알약 꼬리 끝(정차 좌표) 아래에 겹쳐 그리는 작은 다트(북쪽
// 기준, 지도 레이어가 방위각만큼 회전). 노선색 채움 + 흰 외곽선. 16×16 중앙 anchor.
export function buildVehicleDirSvg(color: string): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">' +
    // 위(북)를 가리키는 다트 — 꼬리를 살짝 파서 화살촉 실루엣.
    `<path d="M8 1.5 L13.5 13 L8 10.2 L2.5 13 Z" fill="${color}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>` +
    '</svg>'
  );
}

export function buildVehicleDirDataUrl(color: string): string {
  return (
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(buildVehicleDirSvg(color))
  );
}
