import { useEffect, useState, type DragEvent } from 'react';
import { ImagePlus, Loader2, RefreshCw, X } from 'lucide-react';
import { MEAL_DRAFT_MAX_PHOTOS, useMealDraftStore } from '@repo/shared';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { cn } from '~/lib/utils';
import { MealPhotoImg } from './MealPhotoImg';
import type { MealPhotoIntake } from './useMealPhotoIntake';

// 식단 입력의 사진 칸(웹) — 고르기(휴대전화 브라우저는 카메라도 고를 수 있다)·끌어다 놓기·붙여넣기(Ctrl+V).
// 넣는 일은 useMealPhotoIntake 가 하고, 이 칸은 사진 줄·진행 상태·안내만 그린다.

const takenAtLabel = (d: Date): string =>
  `${d.getMonth() + 1}월 ${d.getDate()}일 ${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;

const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes('Files');

export const MealPhotoSection = ({ intake }: { intake: MealPhotoIntake }) => {
  const photos = useMealDraftStore((s) => s.photos);
  const [dragging, setDragging] = useState(false);
  const { addFiles } = intake;
  const canAdd = photos.length < MEAL_DRAFT_MAX_PHOTOS && !intake.busy;

  // 붙여넣기는 입력칸에 포커스가 없을 때도 받아야 해 문서에 건다(브라우저 이벤트는 외부 시스템이라 effect).
  // 사진이 없는 붙여넣기(글자)는 건드리지 않는다.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'));
      if (files.length === 0) return;
      event.preventDefault();
      void addFiles(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [addFiles]);

  return (
    <Card
      onDragOver={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        // 칸 안의 다른 요소로 옮겨 갈 때도 leave 가 난다 — 칸 밖으로 나갈 때만 끈다.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setDragging(false);
        void addFiles(Array.from(event.dataTransfer.files));
      }}
      className={cn(dragging && 'ring-2 ring-primary')}
    >
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">사진</CardTitle>
        <p className="text-xs text-muted-foreground">
          최대 {MEAL_DRAFT_MAX_PHOTOS}장 · 넣으면 음식을 찾아 채우고 찍은 시각으로 먹은 시각을 맞춰요. 끌어다 놓거나
          복사한 사진을 붙여넣어도 돼요.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {photos.map((photo) => (
            <div key={photo.token} className="relative">
              <MealPhotoImg token={photo.token} className="size-20" />
              <button
                type="button"
                onClick={() => intake.removePhoto(photo.token)}
                disabled={intake.busy}
                aria-label="사진 빼기"
                className="absolute -right-1.5 -top-1.5 rounded-full border bg-background p-0.5 text-muted-foreground shadow-sm hover:text-destructive disabled:opacity-50"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          {photos.length < MEAL_DRAFT_MAX_PHOTOS ? (
            <label
              className={cn(
                'flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-accent',
                !canAdd && 'pointer-events-none opacity-50',
              )}
            >
              <ImagePlus className="size-5" />
              사진 추가
              <input
                type="file"
                accept="image/*,.heic,.heif"
                multiple
                disabled={!canAdd}
                className="sr-only"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = ''; // 같은 사진을 다시 골라도 바뀌게
                  void addFiles(files);
                }}
              />
            </label>
          ) : null}
        </div>

        {intake.uploading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            사진 올리는 중… {intake.uploading.done}/{intake.uploading.total}
          </p>
        ) : intake.recognizing ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            음식을 찾는 중…
          </p>
        ) : photos.length > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => void intake.recognizeAgain()}>
            <RefreshCw className="size-4" />
            다시 인식하기
          </Button>
        ) : null}

        {intake.takenAt ? (
          <p className="text-xs text-muted-foreground">
            사진 찍은 시각({takenAtLabel(intake.takenAt)})으로 먹은 시각을 맞췄어요.
          </p>
        ) : null}
        {intake.notice ? (
          <p className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">{intake.notice}</p>
        ) : null}
        {intake.error ? (
          <p role="alert" className="text-sm text-destructive">
            {intake.error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
};
