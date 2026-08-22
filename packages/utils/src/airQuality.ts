// 에어코리아(한국환경공단) 대기오염정보 — friendly 어댑터/서비스와 웹이 함께 쓰는
// 순수 헬퍼. 등급 기준표(통합대기환경지수 CAI 고시값), 업스트림 문자열 파서
// ("서울 : 좋음,제주 : 좋음" / "2026-08-20 24:00" / "2026-08-21 11시 발표"),
// 예측모델 이미지 URL 라벨러. 네트워크/DOM 의존 없음.
//
// 실측(2026-08-21, ArpltnInforInqireSvc ver=1.5):
//  - 측정값은 문자열, 결측은 "-"(값) / null(등급) / "통신장애" 등(Flag).
//  - dataTime 은 "YYYY-MM-DD HH:00" 이며 자정이 "24:00" 으로 온다(전일 날짜 + 24시).
//  - 예보 informGrade 는 19권역(영동/영서·경기남부/북부 분리) 콤마 구분.
//  - 주간예보 frcst*Cn 은 같은 형식 + 마지막에 "신뢰도 : 높음" 이 붙는다.

export type AirGradeLevel = 1 | 2 | 3 | 4;

// 업스트림 등급 코드(1~4) ↔ 표기. 예보 텍스트(좋음/보통/나쁨/매우나쁨)와 동일 어휘.
export const AIR_GRADE_LABEL: Record<AirGradeLevel, string> = {
  1: '좋음',
  2: '보통',
  3: '나쁨',
  4: '매우나쁨',
};

export const AIR_GRADE_LEVELS: readonly AirGradeLevel[] = [1, 2, 3, 4];

// 등급 색 hex — 에어코리아가 쓰는 파랑/초록/노랑/빨강 관행. 웹은 Tailwind 클래스(airGrade.ts)와 함께,
// 앱은 이 hex 를 직접 쓴다. 항상 등급 글자와 같이 쓴다(색만으로 뜻을 전하지 않는다).
export const AIR_GRADE_HEX: Record<AirGradeLevel, string> = {
  1: '#0ea5e9',
  2: '#10b981',
  3: '#f59e0b',
  4: '#f43f5e',
};
// 결측/등급 없음.
export const AIR_GRADE_NONE_HEX = '#9ca3af';

export type AirPollutant = 'pm10' | 'pm25' | 'o3' | 'no2' | 'co' | 'so2' | 'khai';

export interface AirPollutantMeta {
  key: AirPollutant;
  // 화면 표기('미세먼지'처럼 풀네임)와 약호('PM10').
  label: string;
  short: string;
  unit: string;
  // 등급 상한 — [좋음 상한, 보통 상한, 나쁨 상한]; 초과는 매우나쁨. 통합대기환경지수
  // (환경부 고시) 구간값. PM 은 24시간 평균 기준이지만 1시간 등급(pm10Grade1h)도
  // 같은 구간을 쓴다(에어코리아 표기 관행).
  breakpoints: readonly [number, number, number];
  // 표시 소수 자릿수 — ppm 항목은 소수 3~4자리, ㎍/㎥·지수는 정수.
  digits: number;
}

export const AIR_POLLUTANTS: readonly AirPollutantMeta[] = [
  { key: 'pm10', label: '미세먼지', short: 'PM10', unit: '㎍/㎥', breakpoints: [30, 80, 150], digits: 0 },
  { key: 'pm25', label: '초미세먼지', short: 'PM2.5', unit: '㎍/㎥', breakpoints: [15, 35, 75], digits: 0 },
  { key: 'o3', label: '오존', short: 'O₃', unit: 'ppm', breakpoints: [0.03, 0.09, 0.15], digits: 3 },
  { key: 'no2', label: '이산화질소', short: 'NO₂', unit: 'ppm', breakpoints: [0.03, 0.06, 0.2], digits: 3 },
  { key: 'co', label: '일산화탄소', short: 'CO', unit: 'ppm', breakpoints: [2, 9, 15], digits: 2 },
  { key: 'so2', label: '아황산가스', short: 'SO₂', unit: 'ppm', breakpoints: [0.02, 0.05, 0.15], digits: 3 },
  { key: 'khai', label: '통합대기환경지수', short: 'CAI', unit: '', breakpoints: [50, 100, 250], digits: 0 },
];

export const airPollutantMeta = (key: AirPollutant): AirPollutantMeta =>
  AIR_POLLUTANTS.find((p) => p.key === key) ?? AIR_POLLUTANTS[0]!;

// 농도/지수 → 등급. 업스트림이 등급을 주지 않는 행(과거 시계열·결측 복원)이나
// 일평균처럼 서버가 만든 값에 쓴다. 음수/NaN 은 결측 취급.
export const airGradeFromValue = (
  pollutant: AirPollutant,
  value: number | null | undefined,
): AirGradeLevel | null => {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return null;
  const [good, normal, bad] = airPollutantMeta(pollutant).breakpoints;
  if (value <= good) return 1;
  if (value <= normal) return 2;
  if (value <= bad) return 3;
  return 4;
};

// '좋음'/'보통'/'나쁨'/'매우나쁨' → 1~4. 예보 등급 텍스트 색칠용. 공백·'매우 나쁨'
// 변형도 흡수. 주간예보의 '낮음'/'높음' 은 2단계 체계라 별도(airWeeklyLevel).
export const airGradeFromText = (text: string | null | undefined): AirGradeLevel | null => {
  if (!text) return null;
  const t = text.replace(/\s+/g, '');
  if (t === '좋음') return 1;
  if (t === '보통') return 2;
  if (t === '나쁨') return 3;
  if (t === '매우나쁨') return 4;
  return null;
};

// 주간예보(초미세먼지) 2단계 — '낮음'(보통 이하) / '높음'(나쁨 이상). 색은 좋음/나쁨
// 토큰을 빌려 쓰되 라벨은 원문 그대로 둔다.
export type AirWeeklyLevel = 'low' | 'high';
export const airWeeklyLevel = (text: string | null | undefined): AirWeeklyLevel | null => {
  if (!text) return null;
  const t = text.replace(/\s+/g, '');
  if (t === '낮음') return 'low';
  if (t === '높음') return 'high';
  return null;
};

export interface AirRegionGrade {
  region: string;
  grade: string;
}

// "서울 : 좋음,제주 : 좋음,…" → [{region,grade}]. 구분자 콤마, 권역/등급은 ' : '.
// 빈 조각·형식 불일치 조각은 버린다. 주간예보의 "신뢰도 : 높음" 도 한 항목으로
// 나오므로 호출자가 splitAirReliability 로 분리한다.
export const parseAirRegionGrades = (text: string | null | undefined): AirRegionGrade[] => {
  if (!text) return [];
  const out: AirRegionGrade[] = [];
  for (const part of text.split(',')) {
    const idx = part.indexOf(':');
    if (idx < 0) continue;
    const region = part.slice(0, idx).trim();
    const grade = part.slice(idx + 1).trim();
    if (!region || !grade) continue;
    out.push({ region, grade });
  }
  return out;
};

// 주간예보 권역 목록에서 "신뢰도" 항목을 떼어낸다 — 권역 그리드에 섞이면 안 되고,
// 값('높음'/'보통'/'낮음')은 별도 배지로 보여준다.
export const splitAirReliability = (
  grades: AirRegionGrade[],
): { regions: AirRegionGrade[]; reliability: string | null } => {
  let reliability: string | null = null;
  const regions: AirRegionGrade[] = [];
  for (const g of grades) {
    if (g.region === '신뢰도') reliability = g.grade;
    else regions.push(g);
  }
  return { regions, reliability };
};

// 예보 권역 표준 순서 — 업스트림 문자열 순서가 발표마다 흔들려도 그리드가 같은 자리에
// 같은 권역을 놓도록 정렬 키로 쓴다. 목록에 없는 권역은 뒤에 원문 순서로 붙인다.
export const AIR_FORECAST_REGION_ORDER: readonly string[] = [
  '서울',
  '인천',
  '경기북부',
  '경기남부',
  '강원영서',
  '강원영동',
  '영서',
  '영동',
  '대전',
  '세종',
  '충남',
  '충북',
  '광주',
  '전북',
  '전남',
  '부산',
  '대구',
  '울산',
  '경북',
  '경남',
  '제주',
];

export const sortAirRegions = <T extends { region: string }>(items: readonly T[]): T[] => {
  const rank = (r: string): number => {
    const i = AIR_FORECAST_REGION_ORDER.indexOf(r);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...items].sort((a, b) => rank(a.region) - rank(b.region));
};

const pad2 = (n: number): string => String(n).padStart(2, '0');

// "YYYY-MM-DD HH:mm" (KST) → ISO 8601 (+09:00). 업스트림은 자정을 전일 "24:00" 으로
// 표기하므로 날짜를 하루 넘기고 00:00 으로 정규화한다. 형식 불일치/결측은 null.
export const airDataTimeToIso = (dataTime: string | null | undefined): string | null => {
  if (!dataTime) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/.exec(dataTime.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  let h = Number(m[4]);
  const mi = Number(m[5]);
  if (h > 24 || mi > 59) return null;
  // UTC 산술로 일자 이월을 처리(24:00 → 다음날 00:00). 타임존은 표기만 +09:00.
  let dayMs = Date.UTC(y, mo - 1, d);
  if (Number.isNaN(dayMs)) return null;
  if (h === 24) {
    h = 0;
    dayMs += 86_400_000;
  }
  const dt = new Date(dayMs);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}T${pad2(h)}:${pad2(mi)}:00+09:00`;
};

// 예보 통보시간 "2026-08-21 11시 발표" → ISO(+09:00). 형식 불일치는 null.
export const airAnnouncedToIso = (dataTime: string | null | undefined): string | null => {
  if (!dataTime) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2})시/.exec(dataTime.trim());
  if (!m) return null;
  return airDataTimeToIso(`${m[1]}-${m[2]}-${m[3]} ${m[4]}:00`);
};

// "YYYY-MM-DD HH:mm" → 화면용 짧은 표기. 같은 날이면 "HH시", 아니면 "M/D HH시".
// 24:00 은 그대로 "24시"(전일 자정) — 시계열 축 라벨에서 하루 경계를 드러낸다.
export const formatAirHourLabel = (dataTime: string, todayYmd?: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):/.exec(dataTime);
  if (!m) return dataTime;
  const hh = String(Number(m[4]));
  if (todayYmd && `${m[1]}-${m[2]}-${m[3]}` === todayYmd) return `${hh}시`;
  return `${Number(m[2])}/${Number(m[3])} ${hh}시`;
};

export interface AirDustImageInfo {
  url: string;
  // 파일명에서 읽은 항목(PM10 / PM2.5 / O3) — 못 읽으면 null.
  pollutant: 'PM10' | 'PM2.5' | 'O3' | null;
  // "1hsp.2026082103" 에서 읽은 예측 시각 라벨("8/21 03시"). 애니메이션은 null.
  at: string | null;
  animated: boolean;
}

// 예보 응답 imageUrl1~9 — 실측 URL 형식:
//   .../AQF.20260820.NIER_09_01.PM10.1hsp.2026082103.png   (시각별 정지 이미지)
//   .../AQF.20260820.NIER_09_01.PM10.2days.ani.gif          (2일 애니메이션, ver=1.1)
// 비어 있거나 디렉터리로 끝나는 값("https://www.airkorea.or.kr/dustImage/")은
// 없음으로 취급한다. 파일명 해석 실패 시 URL 만 보존(라벨 없이도 표시는 가능).
export const parseAirDustImage = (url: string | null | undefined): AirDustImageInfo | null => {
  if (!url) return null;
  const u = url.trim();
  if (!/^https?:\/\//i.test(u)) return null;
  if (!/\.(png|gif|jpe?g|webp)$/i.test(u)) return null;
  const file = u.slice(u.lastIndexOf('/') + 1);
  const pollutant = /\.PM10\./i.test(file)
    ? 'PM10'
    : /\.PM2P5\./i.test(file)
      ? 'PM2.5'
      : /\.O3\./i.test(file)
        ? 'O3'
        : null;
  const animated = /\.ani\./i.test(file) || /\.gif$/i.test(file);
  const m = /\.1hsp\.(\d{4})(\d{2})(\d{2})(\d{2})\./.exec(file);
  const at = m ? `${Number(m[2])}/${Number(m[3])} ${m[4]}시` : null;
  return { url: u, pollutant, at, animated };
};

// 시도 선택지 — 업스트림 sidoName 어휘. 2026-07 광주·전남 행정통합 이후 업스트림이
// 두 지역을 '전남광주' 한 라벨로 내려주며(전국 응답 실측), 개별 '광주'/'전남' 조회는
// 게이트웨이 타임아웃이 잦다. 그래서 서버는 '전국' 1콜을 캐시해 sidoName 포함 매칭
// 으로 거르고, 선택지도 통합 라벨을 쓴다.
export interface AirSidoOption {
  value: string;
  label: string;
}
export const AIR_SIDO_OPTIONS: readonly AirSidoOption[] = [
  { value: '전국', label: '전국' },
  { value: '서울', label: '서울' },
  { value: '인천', label: '인천' },
  { value: '경기', label: '경기' },
  { value: '강원', label: '강원' },
  { value: '세종', label: '세종' },
  { value: '대전', label: '대전' },
  { value: '충북', label: '충북' },
  { value: '충남', label: '충남' },
  { value: '전북', label: '전북' },
  { value: '전남광주', label: '광주·전남' },
  { value: '대구', label: '대구' },
  { value: '경북', label: '경북' },
  { value: '부산', label: '부산' },
  { value: '울산', label: '울산' },
  { value: '경남', label: '경남' },
  { value: '제주', label: '제주' },
];

// 업스트림 sidoName(예: '전남광주') 이 요청 시도(예: '광주', '전남', '전남광주')에
// 해당하는지 — 포함 매칭으로 통합 라벨과 구 라벨을 모두 받는다. '전국' 은 전부.
export const airSidoMatches = (itemSido: string | null, wanted: string): boolean => {
  if (wanted === '전국') return true;
  if (!itemSido) return false;
  return itemSido === wanted || itemSido.includes(wanted) || wanted.includes(itemSido);
};

// 나쁨 이상 측정소 목록의 addr("인천 연수구 …", "경기도 수원시 …")에서 시도 추정 —
// 첫 공백 전 토큰을 표준 약칭으로 접는다. 못 찾으면 null(FE 는 '기타' 묶음).
const SIDO_PREFIXES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^서울/, '서울'],
  [/^부산/, '부산'],
  [/^대구/, '대구'],
  [/^인천/, '인천'],
  [/^광주/, '광주'],
  [/^대전/, '대전'],
  [/^울산/, '울산'],
  [/^세종/, '세종'],
  [/^경기/, '경기'],
  [/^강원/, '강원'],
  [/^충청북도|^충북/, '충북'],
  [/^충청남도|^충남/, '충남'],
  [/^전라북도|^전북/, '전북'],
  [/^전라남도|^전남/, '전남'],
  [/^경상북도|^경북/, '경북'],
  [/^경상남도|^경남/, '경남'],
  [/^제주/, '제주'],
];
export const airSidoFromAddr = (addr: string | null | undefined): string | null => {
  if (!addr) return null;
  const head = addr.trim();
  for (const [re, name] of SIDO_PREFIXES) {
    if (re.test(head)) return name;
  }
  return null;
};

// 숫자 표기 — 항목별 자릿수. null 은 '-'.
export const formatAirValue = (pollutant: AirPollutant, value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  const { digits } = airPollutantMeta(pollutant);
  return digits === 0 ? String(Math.round(value)) : value.toFixed(digits);
};
