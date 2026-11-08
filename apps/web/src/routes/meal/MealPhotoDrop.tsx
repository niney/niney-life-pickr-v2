import { useEffect, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { prepareMealEntry } from './mealDraftStart';
import { useMealOpen } from './mealPanel';
import { MEAL_PATH } from './mealPaths';
import { handOffMealPhotos, hasMealPhotoReceiver } from './mealPhotoHandoff';
import { useMealDraftReady } from './useMealDraftReady';

// 사진으로 어디서든 기록 시작(2026-11-08 리뉴얼 4단계) — 식단 화면 아무 데나 사진을 끌어다 놓거나 붙여넣으면 새 기록을
// 열고(데스크톱은 패널) 그 사진을 넣는다. 입력 화면이 떠 있으면 그 기록에 넣는다(사진 칸 밖에 놓아도 — 전엔 브라우저가
// 사진 파일을 열어 화면을 떠났다). 사진 칸 위에 놓거나 입력 화면에서 붙여넣은 것은 그 칸이 맡는다(defaultPrevented·받는 쪽).
// 끌고 있는 동안 화면 전체에 안내를 띄운다. 창 이벤트는 외부 시스템이라 effect.

const hasFiles = (event: DragEvent): boolean =>
  Array.from(event.dataTransfer?.types ?? []).includes('Files');

export const MealPhotoDrop = () => {
  // dragenter/leave 는 자식 요소를 지날 때마다 짝으로 난다 — 깊이로 세어 창 밖으로 나갔을 때만 끈다.
  const [depth, setDepth] = useState(0);
  const open = useMealOpen();
  const draftReady = useMealDraftReady();
  const latest = useRef({ open, draftReady });
  useEffect(() => {
    latest.current = { open, draftReady };
  });

  useEffect(() => {
    const start = (files: File[]) => {
      if (files.length === 0) return;
      if (hasMealPhotoReceiver()) {
        handOffMealPhotos(files);
        return;
      }
      // 계정의 draft 복원 전(새로고침 직후)에는 쓴 값이 사라진다 — 그동안은 받지 않는다.
      if (!latest.current.draftReady) return;
      prepareMealEntry();
      handOffMealPhotos(files);
      latest.current.open(MEAL_PATH.new);
    };
    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDepth((d) => d + 1);
    };
    // 놓을 수 있다고 알려야 drop 이 온다.
    const onOver = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const onLeave = (event: DragEvent) => {
      if (hasFiles(event)) setDepth((d) => Math.max(0, d - 1));
    };
    const onDrop = (event: DragEvent) => {
      setDepth(0);
      if (event.defaultPrevented || !hasFiles(event)) return;
      event.preventDefault();
      start(Array.from(event.dataTransfer?.files ?? []));
    };
    const onPaste = (event: ClipboardEvent) => {
      // 입력 화면은 자기 붙여넣기(사진 칸)가 맡는다.
      if (event.defaultPrevented || hasMealPhotoReceiver()) return;
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
        file.type.startsWith('image/'),
      );
      if (files.length === 0) return;
      event.preventDefault();
      start(files);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    document.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
      document.removeEventListener('paste', onPaste);
    };
  }, []);

  if (depth === 0) return null;
  return (
    <div className="meal-drop" aria-hidden>
      <p>
        <ImagePlus className="size-6" aria-hidden />
        {hasMealPhotoReceiver()
          ? '사진을 놓으면 이 기록에 넣어요'
          : '사진을 놓으면 새 기록을 시작해요'}
      </p>
    </div>
  );
};
