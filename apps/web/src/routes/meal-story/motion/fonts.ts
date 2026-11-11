// 영상 글꼴을 미리 받기 — 웹 재생기(mealStoryFont.ts)와 MP4 렌더 도구(tools/meal-motion/src/index.ts)가 함께 쓴다.
// 원티드 산스(숫자·작은 글)와 개구(손글씨 제목, OFL)는 글자 묶음별로 나뉜 분할판이라, 글자가 처음 보일 때 그 조각을 받는다.
// 미리 받지 않으면 장면마다 첫 몇 프레임이 다른 글꼴로 그려진다(웹에서 재 보니 표지 제목이 0.6초 넘게 그랬다).

export const FONT_STYLESHEETS = {
  wanted: 'https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.3/packages/wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.min.css',
  hand: 'https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&display=swap',
} as const;

/** document.fonts.load 에 넘길 글꼴 — 원티드 산스는 가변 글꼴 하나가 모든 굵기, 개구는 제목 굵기(700)만 쓴다. */
export const FONT_LOADS = ['700 100px "Wanted Sans Variable"', '700 100px Gaegu'] as const;

// 장면 틀이 스스로 쓰는 글(원고에 없는 글자) — 틀에 새 문구를 넣으면 여기에도.
const FIXED_TEXT =
  '만드는 법 인분 기준 영양정보 팁 값 없음 소금 약 기준의 분의 1 로그인하면 내 숟가락도 채워 봐요 내 값도 보여요 ' +
  '기록이 더 필요해요 — 두 끼 이상 적은 날이 있어야 해요 많음 충분 기준 안 부족 조금 판단 보류 내 기준 0123456789 ,.·/%~-+()× mg kcal g Na K ' +
  '직전 2주보다 하루 늘었어요 줄었어요 직전엔 ' +
  '소스 햄 소금 올리브유 나트륨 참기름 간장 ※ ? …';

/** 영상에 나올 글자 전부 — 영상 입력(스토리 원고·내 값)을 통째로 글로 만들어 틀의 고정 문구와 합친다. */
export const motionFontText = (input: unknown): string => `${FIXED_TEXT} ${JSON.stringify(input)}`;
