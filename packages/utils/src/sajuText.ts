// 사주 정적 텍스트 — 일간 10종 캐릭터·십신·십이운성·신살·관계·오행 행운 요소 설명과, 원국을 사람이 읽는
// 한국어 사실 목록으로 푸는 sajuFactLines. LLM 프롬프트([사주 사실] 블록)와 정적 폴백 풀이가 같이 쓴다.
// 문체는 타로와 같은 존댓말·따뜻·담백. 건강·수명·재물 액수 단정은 쓰지 않는다.

import { formatLunarDate } from './sajuCalendar.js';
import {
  branchMeta,
  SAJU_PILLAR_LABEL,
  SAJU_RELATION_META,
  SAJU_STAR_META,
  SAJU_TEN_GOD_META,
  SAJU_WUXING_META,
  stemMeta,
  type Branch,
  type RelationType,
  type SajuChart,
  type SajuPillar,
  type SajuStrengthLevel,
  type StarId,
  type Stem,
  type TenGod,
  type TenGodGroup,
  type TwelveStage,
  type Wuxing,
} from './saju.js';

// ── 일간 10종 ────────────────────────────────────────────────────────────────

export interface DayMasterText {
  stem: Stem;
  title: string;
  hanja: string;
  symbol: string;
  tagline: string;
  personality: string;
  strengths: readonly string[];
  cautions: readonly string[];
  love: string;
  work: string;
}

export const SAJU_DAY_MASTER_TEXT: readonly DayMasterText[] = [
  {
    stem: 0, title: '갑목', hanja: '甲木', symbol: '큰 나무', tagline: '곧게 위로 자라는 사람',
    personality: '하늘을 향해 곧게 자라는 큰 나무예요. 목표가 생기면 앞장서서 밀고 나가고, 옳다고 믿는 일에는 쉽게 굽히지 않아요. 자존심이 세고 책임감이 강해서 주변이 기대는 기둥이 되지만, 그만큼 꺾이는 순간 크게 흔들리기도 해요.',
    strengths: ['추진력과 리더십', '정직하고 책임감이 강함', '큰 그림을 보는 안목'],
    cautions: ['융통성이 부족해 고집으로 보일 수 있어요', '체면 때문에 도움 요청을 미루기 쉬워요'],
    love: '먼저 이끌고 지켜 주려는 연애. 상대의 속도를 기다려 주면 더 좋아요.',
    work: '방향을 정하고 조직을 세우는 일, 새로 시작하는 일에서 빛나요.',
  },
  {
    stem: 1, title: '을목', hanja: '乙木', symbol: '풀과 덩굴', tagline: '휘어져도 끝내 뻗어 가는 사람',
    personality: '바람에 휘어져도 부러지지 않는 풀과 덩굴이에요. 상황에 맞춰 유연하게 길을 찾고, 조용히 끈질기게 원하는 곳까지 뻗어 가요. 부드럽고 사교적이라 사람들과 잘 어울리지만, 기댈 곳을 찾다 보면 내 결정을 미루게 되기도 해요.',
    strengths: ['적응력과 협상 능력', '세심한 관찰력', '포기하지 않는 끈기'],
    cautions: ['우유부단해 보일 수 있어요', '남의 기대에 맞추다 나를 잃지 않게'],
    love: '상대에게 맞추며 관계를 가꾸는 연애. 내 바람도 분명히 말해 보세요.',
    work: '사람 사이를 잇는 일, 협업과 조율이 필요한 일에 강해요.',
  },
  {
    stem: 2, title: '병화', hanja: '丙火', symbol: '태양', tagline: '모두를 비추는 사람',
    personality: '한낮의 태양처럼 밝고 열정적이에요. 감정 표현이 시원하고 너그러워서 주변을 환하게 만들고, 숨기는 게 없어 신뢰를 얻어요. 다만 뜨거운 만큼 성급하거나 기복이 있고, 주목받고 싶은 마음이 앞설 때가 있어요.',
    strengths: ['긍정적인 에너지와 카리스마', '솔직하고 너그러움', '표현력과 설득력'],
    cautions: ['성급한 결정을 조심하세요', '감정이 얼굴에 그대로 드러나요'],
    love: '뜨겁게 시작하는 연애. 식지 않게 꾸준함을 더해 보세요.',
    work: '사람 앞에 서는 일, 알리고 퍼뜨리는 일에서 빛나요.',
  },
  {
    stem: 3, title: '정화', hanja: '丁火', symbol: '등불', tagline: '가까운 곳을 따뜻하게 밝히는 사람',
    personality: '어둠 속 등불처럼 조용하지만 꺼지지 않는 열정을 품고 있어요. 섬세하고 배려심이 깊어 가까운 사람을 세심하게 챙기고, 한 가지에 오래 집중해요. 대신 생각이 많아 걱정을 안고 살거나 작은 말에 마음이 흔들리기 쉬워요.',
    strengths: ['따뜻한 배려와 공감', '꾸준한 집중력', '사람과 상황을 읽는 통찰'],
    cautions: ['걱정이 앞서 시작을 미루기 쉬워요', '예민함이 쌓이면 혼자 지쳐요'],
    love: '깊고 오래가는 연애. 서운함은 쌓아 두지 말고 말해 주세요.',
    work: '정성과 디테일이 필요한 일, 가르치고 돌보는 일이 잘 맞아요.',
  },
  {
    stem: 4, title: '무토', hanja: '戊土', symbol: '큰 산', tagline: '흔들리지 않는 사람',
    personality: '넓고 듬직한 산이에요. 쉽게 흔들리지 않고 사람을 품어 주며, 한번 믿으면 오래 가요. 주변이 기대는 중심이 되지만, 변화가 필요한 순간에도 자리를 지키려다 기회를 놓치거나 고집으로 보일 수 있어요.',
    strengths: ['신뢰감과 안정감', '인내심', '포용력'],
    cautions: ['움직임이 느려 답답하다는 말을 들을 수 있어요', '속마음을 잘 드러내지 않아요'],
    love: '묵묵히 지켜 주는 연애. 표현을 조금만 더 해 보세요.',
    work: '기반을 다지고 지키는 일, 오래 걸리는 일에 강해요.',
  },
  {
    stem: 5, title: '기토', hanja: '己土', symbol: '논밭', tagline: '무엇이든 길러 내는 사람',
    personality: '씨앗을 받아 기르는 기름진 논밭이에요. 현실적이고 실속을 챙기며, 세심하게 사람과 일을 돌봐요. 겉으로는 온화하지만 속은 단단하고 계산이 빨라요. 다만 속내를 감추다 오해를 사거나, 소심하게 망설이기도 해요.',
    strengths: ['실용적인 판단', '꼼꼼함과 성실함', '사람을 키우는 재주'],
    cautions: ['속내를 감춰 오해를 살 수 있어요', '작은 손해에 오래 마음 쓰지 않게'],
    love: '알뜰하게 챙기는 연애. 계산보다 마음을 먼저 보여 주세요.',
    work: '관리·운영·양성처럼 꾸준히 가꾸는 일이 잘 맞아요.',
  },
  {
    stem: 6, title: '경금', hanja: '庚金', symbol: '바위와 무쇠', tagline: '단칼에 결정하는 사람',
    personality: '단단한 바위이자 다듬기 전의 무쇠예요. 결단이 빠르고 의리가 있으며 원칙을 지켜요. 한번 정하면 밀어붙이는 힘이 있지만, 딱딱하고 융통성 없다는 말을 듣거나 타협이 필요한 자리에서 부딪히기도 해요.',
    strengths: ['결단력과 실행력', '의리와 정의감', '단순하고 명쾌함'],
    cautions: ['말이 직설적이라 상처를 줄 수 있어요', '굽히지 않다가 고립되지 않게'],
    love: '직진하는 연애. 부드러운 표현을 연습해 보세요.',
    work: '결정하고 자르고 개혁하는 일, 몸으로 부딪히는 일에 강해요.',
  },
  {
    stem: 7, title: '신금', hanja: '辛金', symbol: '보석', tagline: '갈고닦아 빛나는 사람',
    personality: '잘 다듬어진 보석이에요. 예리하고 세련되며 완벽을 추구해요. 감각이 뛰어나고 분석이 정확해서 품격 있게 보이지만, 그만큼 예민하고 비판적이며 작은 흠에도 마음을 다치기 쉬워요.',
    strengths: ['뛰어난 감각과 안목', '정확한 분석력', '자존감과 품격'],
    cautions: ['비판이 날카로워 관계가 서늘해질 수 있어요', '스스로에게 너무 엄격하지 않게'],
    love: '까다롭지만 한번 마음을 주면 깊은 연애.',
    work: '정밀함·미적 감각·전문성이 필요한 일에서 빛나요.',
  },
  {
    stem: 8, title: '임수', hanja: '壬水', symbol: '바다', tagline: '넓게 품고 멀리 흐르는 사람',
    personality: '끝이 보이지 않는 바다예요. 포용력과 지혜가 있고 자유로우며 스케일이 커요. 생각이 깊고 유연해서 어디서든 길을 찾지만, 마음이 흘러가는 대로 두면 산만해지거나 방향을 잃기도 해요.',
    strengths: ['깊은 통찰과 지혜', '유연함과 도량', '큰 그림과 모험심'],
    cautions: ['변덕과 산만함을 조심하세요', '속을 알 수 없다는 말을 들을 수 있어요'],
    love: '자유롭고 너그러운 연애. 상대가 불안하지 않게 표현해 주세요.',
    work: '기획·연구·해외·유통처럼 흐름을 다루는 일이 잘 맞아요.',
  },
  {
    stem: 9, title: '계수', hanja: '癸水', symbol: '이슬비', tagline: '조용히 스며드는 사람',
    personality: '땅을 적시는 이슬비이자 맑은 샘물이에요. 섬세하고 감성이 풍부하며 직관이 빨라요. 조용히 스며들어 사람 마음을 움직이지만, 소극적으로 물러서거나 혼자 비관에 빠지기도 해요.',
    strengths: ['공감 능력과 직관', '상상력과 감수성', '조용한 끈기와 적응력'],
    cautions: ['생각이 우울 쪽으로 흐르지 않게', '소극적으로 기회를 놓치지 않게'],
    love: '조용히 오래 스며드는 연애. 마음을 먼저 열어 보세요.',
    work: '창작·상담·연구처럼 깊이 파고드는 일이 잘 맞아요.',
  },
];

export const dayMasterText = (stem: Stem): DayMasterText => SAJU_DAY_MASTER_TEXT[stem] as DayMasterText;

// ── 십신 ─────────────────────────────────────────────────────────────────────

export interface TenGodText {
  short: string;
  personality: string;
  many: string;
  none: string;
}
export const SAJU_TEN_GOD_TEXT: Record<TenGod, TenGodText> = {
  bigyeon: { short: '나와 같은 힘, 자립과 동료', personality: '스스로 서려는 힘이 강하고 친구·동료가 곁에 있어요.', many: '고집과 경쟁심이 세져 부딪히기 쉬워요.', none: '혼자 감당하려다 지치기 쉬우니 동료를 만들어 보세요.' },
  geopjae: { short: '승부와 추진, 나눔', personality: '배짱이 있고 승부를 즐겨요. 사람을 모으는 힘도 있어요.', many: '돈이 새거나 다툼이 잦을 수 있어 관리가 필요해요.', none: '경쟁보다 협력이 편한 편이에요.' },
  siksin: { short: '표현과 재능, 먹을 복', personality: '여유롭고 창작·표현을 즐기며 먹고 즐기는 복이 있어요.', many: '느긋함이 게으름으로 흐르지 않게 해 주세요.', none: '표현을 아끼는 편이라 재능을 드러낼 기회를 만드세요.' },
  sanggwan: { short: '재치와 비판, 기술', personality: '말재주와 기술이 있고 틀에 갇히길 싫어해요.', many: '반항심과 구설을 조심하세요.', none: '규칙을 잘 따르는 편이에요.' },
  pyeonjae: { short: '큰 돈과 활동, 사교', personality: '활동 범위가 넓고 사업·유통 감각이 있어요.', many: '씀씀이가 커지고 산만해질 수 있어요.', none: '큰 모험보다 안정적인 수입이 잘 맞아요.' },
  jeongjae: { short: '착실한 돈과 성실', personality: '성실하게 모으고 관리하는 힘이 있어요.', many: '지나치게 신중해 기회를 놓치거나 인색해 보일 수 있어요.', none: '돈을 관리하는 습관을 따로 만들면 좋아요.' },
  pyeongwan: { short: '도전과 권위, 압박', personality: '결단력 있고 어려운 자리를 맡아 내는 힘이 있어요.', many: '스트레스와 무리한 일정, 사고를 조심하세요.', none: '압박이 적은 대신 스스로 긴장을 만들어야 할 때가 있어요.' },
  jeonggwan: { short: '명예와 질서, 책임', personality: '규칙을 지키고 신뢰를 얻으며 안정적으로 올라가요.', many: '남의 눈치를 많이 보고 답답할 수 있어요.', none: '자유로운 대신 스스로 기준을 세워야 해요.' },
  pyeonin: { short: '특별한 재능과 직관', personality: '남다른 감각·연구·예술 재능이 있고 혼자 있는 시간을 좋아해요.', many: '변덕과 고립, 생각만 많아지는 걸 조심하세요.', none: '직관보다 배운 대로 가는 편이에요.' },
  jeongin: { short: '배움과 보호, 자애', personality: '배우는 복과 돌봐 주는 사람이 있고 마음이 따뜻해요.', many: '의존적이거나 게을러질 수 있어요.', none: '스스로 배우고 챙겨야 하는 자리가 많아요.' },
};

export const tenGodKo = (g: TenGod): string => SAJU_TEN_GOD_META[g].ko;

// ── 십이운성·신살·관계 ───────────────────────────────────────────────────────

export const SAJU_TWELVE_STAGE_TEXT: Record<TwelveStage, string> = {
  장생: '새싹처럼 시작하는 힘',
  목욕: '흔들리며 배우는 시기',
  관대: '옷을 갖춰 입고 나설 준비',
  건록: '스스로 서는 힘',
  제왕: '가장 왕성한 기운',
  쇠: '서서히 물러나는 기운',
  병: '기운이 약해지는 때',
  사: '멈추고 정리하는 때',
  묘: '갈무리하고 저장하는 때',
  절: '끊기고 다시 시작되는 전환',
  태: '새로 잉태되는 기운',
  양: '길러지고 준비되는 시기',
};

export const SAJU_STAR_TEXT: Record<StarId, string> = {
  cheoneul: '어려울 때 도와주는 귀인이 나타나는 자리예요.',
  munchang: '글·공부·시험에 힘이 붙는 자리예요.',
  yangin: '힘이 강해 과감하지만 다치기도 쉬워 속도 조절이 필요해요.',
  dohwa: '매력과 인기, 예술적 감각이 있어요.',
  yeokma: '이동·여행·변화가 많고 활동 범위가 넓어요.',
  hwagae: '예술·종교·연구처럼 혼자 깊어지는 재능이 있어요.',
  goegang: '카리스마가 강하고 극과 극을 오가는 리더의 기운이에요.',
  baekho: '기운이 세서 급하게 움직일 때 다치기 쉬우니 여유를 두세요.',
};

export const SAJU_RELATION_TEXT: Record<RelationType, string> = {
  'stem-combine': '두 천간이 손을 잡아 다른 기운으로 변해요. 협력과 결속의 표시예요.',
  'stem-clash': '두 천간이 맞부딪쳐요. 갈등이 있지만 그만큼 움직임도 커요.',
  'six-combine': '두 지지가 짝을 이뤄 서로를 묶어 줘요. 인연·결속의 표시예요.',
  'three-combine': '세 지지가 하나의 큰 기운을 이뤄요. 힘이 모이는 자리예요.',
  'half-combine': '두 지지가 절반의 합을 이뤄 그 기운 쪽으로 기울어요.',
  directional: '같은 계절의 지지가 모여 그 기운이 강해져요.',
  clash: '두 지지가 정면으로 부딪쳐요. 변화·이동·충돌이 잦은 자리예요.',
  punish: '서로를 찌르는 관계예요. 마찰·시비·수리(고침)가 생기기 쉬워요.',
  'self-punish': '같은 글자끼리 스스로를 찌르는 관계예요. 자책이나 자기 소모를 조심하세요.',
  break: '관계가 깨지거나 흩어지기 쉬운 자리예요.',
  harm: '가까운 사이에서 서운함이 생기기 쉬운 관계예요.',
  wonjin: '이유 없이 미워하거나 어긋나는 관계예요. 거리 두기가 도움이 돼요.',
};

// ── 오행 행운 요소 ───────────────────────────────────────────────────────────

export interface WuxingLucky {
  element: Wuxing;
  colors: readonly string[];
  colorHex: string;
  directions: readonly string[];
  numbers: readonly number[];
  season: string;
  taste: string;
  foods: readonly string[];
  activities: readonly string[];
  keywords: readonly string[];
}
export const SAJU_WUXING_LUCKY: Record<Wuxing, WuxingLucky> = {
  wood: { element: 'wood', colors: ['초록', '청록', '연두'], colorHex: '#3f9b7a', directions: ['동쪽'], numbers: [3, 8], season: '봄', taste: '신맛', foods: ['푸른 잎채소', '매실', '보리', '나물', '샐러드'], activities: ['산책', '식물 가꾸기', '새로운 시작'], keywords: ['성장', '시작', '유연함'] },
  fire: { element: 'fire', colors: ['빨강', '주황', '분홍'], colorHex: '#d9482b', directions: ['남쪽'], numbers: [2, 7], season: '여름', taste: '쓴맛', foods: ['구이', '붉은 음식', '커피', '고추', '토마토'], activities: ['운동', '모임', '표현하기'], keywords: ['열정', '표현', '밝음'] },
  earth: { element: 'earth', colors: ['노랑', '황토', '베이지'], colorHex: '#c9973a', directions: ['중앙', '남서쪽', '북동쪽'], numbers: [5, 10], season: '환절기', taste: '단맛', foods: ['곡물', '고구마', '호박', '감자', '소고기'], activities: ['정리·정돈', '요리', '땅 밟기'], keywords: ['안정', '신뢰', '중심'] },
  metal: { element: 'metal', colors: ['흰색', '은색', '금색'], colorHex: '#dcdcd2', directions: ['서쪽'], numbers: [4, 9], season: '가을', taste: '매운맛', foods: ['흰 음식', '무', '마늘', '닭고기', '배'], activities: ['정돈', '결단', '운동'], keywords: ['결단', '정리', '단단함'] },
  water: { element: 'water', colors: ['검정', '남색', '파랑'], colorHex: '#2f4d7a', directions: ['북쪽'], numbers: [1, 6], season: '겨울', taste: '짠맛', foods: ['해조류', '콩', '검은 음식', '국물', '생선'], activities: ['휴식', '독서', '목욕'], keywords: ['지혜', '유연', '휴식'] },
};

export const SAJU_STRENGTH_TEXT: Record<SajuStrengthLevel, { ko: string; text: string }> = {
  strong: { ko: '신강', text: '나를 받쳐 주는 기운이 많아 주관이 뚜렷하고 밀어붙이는 힘이 있어요. 기운을 밖으로 풀어 쓰는 쪽이 좋아요.' },
  balanced: { ko: '중화', text: '나를 돕는 기운과 쓰는 기운이 균형을 이뤄 상황에 맞춰 조절하는 힘이 있어요.' },
  weak: { ko: '신약', text: '나를 받쳐 주는 기운이 적어 주변 도움과 배움이 힘이 돼요. 무리하게 벌리기보다 채우는 쪽이 좋아요.' },
};

export const SAJU_ZODIAC_TRAIT: readonly string[] = [
  '재빠르고 눈치 빠른', '묵묵히 끝까지 가는', '당당하고 용감한', '온화하고 감각적인', '스케일 크고 이상이 높은', '차분하고 지혜로운',
  '활달하고 자유로운', '온순하고 예술적인', '재치 있고 영리한', '부지런하고 정확한', '의리 있고 충직한', '너그럽고 복이 많은',
];

export const SAJU_SEASON_KO: Record<SajuChart['season'], string> = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };

// ── 사실 목록(프롬프트·정적 풀이 공용) ────────────────────────────────────────

const pillarLine = (p: SajuPillar): string => {
  const s = stemMeta(p.stem);
  const b = branchMeta(p.branch);
  const stemGod = p.stemTenGod ? tenGodKo(p.stemTenGod) : '일간(나)';
  return `${SAJU_PILLAR_LABEL[p.key]} ${p.ko}(${p.hanja}) — 천간 ${s.ko}·${SAJU_WUXING_META[s.element].ko}·${stemGod} / 지지 ${b.ko}·${SAJU_WUXING_META[b.element].ko}·${tenGodKo(p.branchTenGod)} / 지장간 ${p.hidden.map((h) => stemMeta(h).ko).join('·')} / 십이운성 ${p.twelveStage}${p.isVoid ? ' / 공망' : ''}`;
};

const elementKo = (e: Wuxing): string => SAJU_WUXING_META[e].ko;

/** 원국을 한국어 사실 목록으로 — LLM 은 이 블록 밖의 사실을 만들지 않는다. */
export const sajuFactLines = (chart: SajuChart): string[] => {
  const p = chart.pillars;
  const pillarList = [p.year, p.month, p.day, ...(p.hour ? [p.hour] : [])];
  const time = chart.input.hour === null ? '시간 모름' : `${String(chart.input.hour).padStart(2, '0')}:${String(chart.input.minute ?? 0).padStart(2, '0')}`;
  const lines: string[] = [];
  lines.push(`생년월일: 양력 ${chart.solar.year}-${String(chart.solar.month).padStart(2, '0')}-${String(chart.solar.day).padStart(2, '0')} ${time}${chart.lunar ? ` (음력 ${formatLunarDate(chart.lunar)})` : ''}, ${chart.input.gender === 'M' ? '남성' : '여성'}, 만 ${chart.asOf.age}세`);
  lines.push(`사주: ${pillarList.map((x) => `${SAJU_PILLAR_LABEL[x.key]} ${x.ko}(${x.hanja})`).join(' · ')}${p.hour ? '' : ' · 시주 없음'}`);
  const dm = chart.dayMaster;
  lines.push(`일간(나): ${dm.ko}(${dm.hanja}) ${elementKo(dm.element)} ${dm.yang ? '양' : '음'} — ${dm.symbol}. 띠: ${chart.zodiac.animal}띠. 태어난 계절: ${SAJU_SEASON_KO[chart.season]}(월지 ${branchMeta(p.month.branch).ko})`);
  for (const x of pillarList) lines.push(pillarLine(x));
  const counts = Object.entries(chart.tenGodCounts).filter(([, n]) => n > 0).map(([g, n]) => `${tenGodKo(g as TenGod)} ${n}`).join(', ');
  lines.push(`십신 개수: ${counts}`);
  lines.push(`오행 분포: ${chart.elements.map((e) => `${elementKo(e.element)} ${e.score}(${e.percent}%)`).join(' · ')}${chart.excess.length ? ` / 과다: ${chart.excess.map(elementKo).join('·')}` : ''}${chart.lacking.length ? ` / 없음: ${chart.lacking.map(elementKo).join('·')}` : ''}`);
  const st = chart.strength;
  lines.push(`신강약: ${SAJU_STRENGTH_TEXT[st.level].ko}(${st.score}점) — 득령 ${st.gotSeason ? 'O' : 'X'} · 득지 ${st.gotPlace ? 'O' : 'X'} · 득세 ${st.supportCount}`);
  const fav = chart.favorable;
  lines.push(`보완하면 좋은 기운: ${elementKo(fav.primary)}${fav.secondary ? `(보조 ${elementKo(fav.secondary)})` : ''} — 근거 ${fav.reason === 'weak' ? '신약이라 인성·비겁으로 채움' : fav.reason === 'strong' ? '신강이라 식상·재성·관성으로 풀어냄' : fav.reason === 'season' ? '계절(조후) 보완' : '부족한 오행 보완'}`);
  if (chart.relations.length) lines.push(`글자 관계: ${chart.relations.map((r) => `${r.label}(${r.pillars.map((k) => (k === 'luck' ? '운' : SAJU_PILLAR_LABEL[k])).join('·')})`).join(', ')}`);
  else lines.push('글자 관계: 특별한 합·충 없음');
  if (chart.stars.length) lines.push(`신살: ${chart.stars.map((s) => `${s.ko}(${s.pillars.map((k) => SAJU_PILLAR_LABEL[k]).join('·')})`).join(', ')}`);
  lines.push(`공망: ${chart.voidBranches.map((b) => branchMeta(b).ko).join('·')}`);
  const luck = chart.luck;
  const luckList = luck.pillars
    .map((lp, i) => `${lp.ko}(${Math.floor(lp.fromAge)}~${Math.floor(lp.toAge)}세, ${tenGodKo(lp.stemTenGod)}/${tenGodKo(lp.branchTenGod)}, ${lp.twelveStage}${i === luck.currentIndex ? ', 현재' : ''})`)
    .join(' → ');
  lines.push(`대운: ${luck.forward ? '순행' : '역행'}, ${luck.startAgeYears}세 ${luck.startAgeMonths}개월부터 10년마다 — ${luckList}${luck.currentIndex < 0 ? ' (아직 첫 대운 전)' : ''}`);
  const yl = chart.yearLuck;
  lines.push(`올해 세운 ${yl.year}년 ${yl.ko}(${yl.hanja}): 천간 ${tenGodKo(yl.stemTenGod)} / 지지 ${tenGodKo(yl.branchTenGod)} / 십이운성 ${yl.twelveStage}${yl.relations.length ? ` / 원국과의 관계: ${yl.relations.map((r) => r.label).join(', ')}` : ''}`);
  return lines;
};

/** 관계 라벨용 — 지지 index → 한글. */
export const branchKo = (b: Branch): string => branchMeta(b).ko;
export const starText = (id: StarId): string => `${SAJU_STAR_META[id].ko}: ${SAJU_STAR_TEXT[id]}`;
export const relationText = (type: RelationType): string => `${SAJU_RELATION_META[type].ko}: ${SAJU_RELATION_TEXT[type]}`;

// ── 화면 요약(5차) — 원국 헤더·성격 탭이 쓰는 구조화 요약. 계산은 전부 chart 에 있고 여기선 문장만 만든다 ──

export interface SajuBirthSummary {
  /** '1990년 5월 15일 14:30' (시간 모르면 날짜만). */
  solar: string;
  /** '1990년 4월 21일' — 음력 표 범위 밖이면 null. */
  lunar: string | null;
  /** 진태양시 보정 후 시각 — '14:00 (표준시 −30분)' / 서머타임이면 '(서머타임 −90분)'. 시간 모름·보정 0 이면 null. */
  corrected: string | null;
  /** '여름(사월) 태생'. */
  season: string;
  age: number;
}

const two = (n: number): string => String(n).padStart(2, '0');

export const sajuBirthSummary = (chart: SajuChart): SajuBirthSummary => {
  const { solar, lunar, instant, input } = chart;
  const time = input.hour !== null ? ` ${two(input.hour)}:${two(input.minute ?? 0)}` : '';
  const corr = instant.correctionMinutes;
  const corrected =
    instant.hourKnown && corr !== 0
      ? `${two(instant.corrected.hour)}:${two(instant.corrected.minute)} (${instant.dst ? '서머타임 ' : '표준시 '}${corr < 0 ? '−' : '+'}${Math.abs(corr)}분)`
      : null;
  return {
    solar: `${solar.year}년 ${solar.month}월 ${solar.day}일${time}`,
    lunar: lunar ? formatLunarDate(lunar) : null,
    corrected,
    season: `${SAJU_SEASON_KO[chart.season]}(${branchMeta(chart.pillars.month.branch).ko}월) 태생`,
    age: chart.asOf.age,
  };
};

export interface SajuTenGodSummary {
  /** 개수 있는 십신, 많은 순. */
  chips: ReadonlyArray<{ god: TenGod; ko: string; count: number }>;
  /** 5그룹(비겁·식상·재성·관성·인성) 합계 — 0 인 그룹이 "없는 기운". */
  groups: ReadonlyArray<{ group: TenGodGroup; ko: string; count: number }>;
  /** 많음(3개 이상)·없음 한 줄씩, 최대 3줄. */
  notes: readonly string[];
}

const GROUP_ORDER: readonly TenGodGroup[] = ['self', 'output', 'wealth', 'power', 'resource'];
/** 그룹의 "없음" 문장은 정(正) 쪽 십신 텍스트를 빌린다. */
const GROUP_MAIN_GOD: Record<TenGodGroup, TenGod> = { self: 'bigyeon', output: 'siksin', wealth: 'jeongjae', power: 'jeonggwan', resource: 'jeongin' };

export const sajuTenGodSummary = (chart: SajuChart): SajuTenGodSummary => {
  const gods = Object.keys(SAJU_TEN_GOD_META) as TenGod[];
  const chips = gods
    .map((god) => ({ god, ko: SAJU_TEN_GOD_META[god].ko, count: chart.tenGodCounts[god] ?? 0 }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);
  const groups = GROUP_ORDER.map((group) => ({
    group,
    ko: SAJU_TEN_GOD_META[GROUP_MAIN_GOD[group]].groupKo,
    count: gods.filter((g) => SAJU_TEN_GOD_META[g].group === group).reduce((s, g) => s + (chart.tenGodCounts[g] ?? 0), 0),
  }));
  const notes: string[] = [];
  for (const c of chips) {
    if (c.count >= 3 && notes.length < 2) notes.push(`${c.ko} ${c.count}개 — ${SAJU_TEN_GOD_TEXT[c.god].many}`);
  }
  for (const g of groups) {
    if (g.count === 0 && notes.length < 3) notes.push(`${g.ko}이 없어요 — ${SAJU_TEN_GOD_TEXT[GROUP_MAIN_GOD[g.group]].none}`);
  }
  return { chips, groups, notes };
};

/** 띠 한 줄 — '당당하고 용감한 호랑이띠'. */
export const zodiacTraitLine = (chart: SajuChart): string => `${SAJU_ZODIAC_TRAIT[chart.zodiac.index] ?? ''} ${chart.zodiac.animal}띠`.trim();
