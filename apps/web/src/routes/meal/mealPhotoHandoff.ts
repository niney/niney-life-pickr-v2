// 식단 어디서든 사진을 끌어다 놓거나 붙여넣었을 때(2026-11-08 리뉴얼 4단계) 그 파일을 입력 화면에 넘긴다.
// 입력 화면(새 기록·수정)이 떠 있으면 바로 그 기록의 사진 넣기로, 없으면 맡아 두었다가 새 기록 화면이 열리면 넘긴다.
// 넘겨받는 쪽은 한 곳(지금 떠 있는 입력 화면)뿐이다 — 식단 입력은 한 번에 하나다.

type Receiver = (files: File[]) => void;

let receiver: Receiver | null = null;
let pending: File[] = [];

/** 입력 화면이 떠 있는 동안 사진을 받는다(맡아 둔 것이 있으면 바로 받는다). 돌려준 함수로 그만 받는다. */
export const receiveMealPhotos = (next: Receiver): (() => void) => {
  receiver = next;
  if (pending.length > 0) {
    const files = pending;
    pending = [];
    next(files);
  }
  return () => {
    if (receiver === next) receiver = null;
  };
};

/** 지금 사진을 받을 입력 화면이 떠 있는가. */
export const hasMealPhotoReceiver = (): boolean => receiver !== null;

/** 입력 화면에 넘긴다 — 떠 있으면 바로, 아니면 열릴 때까지 맡아 둔다. */
export const handOffMealPhotos = (files: File[]): void => {
  if (files.length === 0) return;
  if (receiver) receiver(files);
  else pending = [...pending, ...files];
};
