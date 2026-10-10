import { useRef, useState, type ChangeEvent, type PointerEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Crop, ImageUp, Languages, Loader2, Trash2, X } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { cn } from '~/lib/utils';
import {
  cropImage,
  isUsableSelection,
  readAsDataUrl,
  rectBetween,
  rectStyle,
  toFracPoint,
  type FracPoint,
  type FracRect,
} from './cropMath';
import { Confidence, ErrorNote, SourceBadge } from './parts';
import { SMARTLY_LANGS, smartlyApi, type TranslateResponse } from './smartlyApi';

// 사진 → 번역 — 모델에 검출기가 없어서 메뉴명 한 줄씩 직접 드래그해 잘라 인식·번역한다.

interface Selection {
  id: number;
  rect: FracRect;
  preview?: string;
  text: string;
  confidence?: number;
  translation?: TranslateResponse;
  status: 'idle' | 'running' | 'done' | 'error';
  error?: string;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : '실패');

export const PhotoTab = () => {
  const [photo, setPhoto] = useState<{ name: string; src: string } | null>(null);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [draft, setDraft] = useState<{ start: FracPoint; end: FracPoint } | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const nextId = useRef(1);
  const imageRef = useRef<HTMLImageElement>(null);
  const qc = useQueryClient();

  const busy = selections.some((s) => s.status === 'running');
  const pending = selections.filter((s) => s.status === 'idle' || s.status === 'error');

  const update = (id: number, patch: Partial<Selection>) =>
    setSelections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setPhoto({ name: file.name, src: await readAsDataUrl(file) });
      setSelections([]);
      setLoadError(null);
    } catch (error) {
      setLoadError(error);
    }
  };

  const pointFrom = (e: PointerEvent<HTMLDivElement>) =>
    toFracPoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pointFrom(e);
    setDraft({ start: p, end: p });
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!draft) return;
    setDraft({ ...draft, end: pointFrom(e) });
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!draft) return;
    const rect = rectBetween(draft.start, pointFrom(e));
    setDraft(null);
    if (!isUsableSelection(rect, e.currentTarget.getBoundingClientRect())) return;
    const id = nextId.current++;
    setSelections((prev) => [...prev, { id, rect, text: '', status: 'idle' }]);
  };

  const translateOne = async (id: number, text: string) => {
    const translation = await smartlyApi.translate({
      text,
      langs: SMARTLY_LANGS.map((l) => l.id),
      mode: 'auto',
      beamSize: 5,
      nBest: 1,
      replaceUnk: false,
    });
    update(id, { translation, status: 'done' });
  };

  // 아직 안 한 영역을 한 번에 잘라 인식(한 요청)하고, 인식된 글자를 하나씩 번역한다.
  const recognizeAll = async () => {
    const image = imageRef.current;
    if (!image || pending.length === 0) return;
    const targets = pending;
    for (const s of targets) update(s.id, { status: 'running', error: undefined });
    try {
      const crops = await Promise.all(targets.map((s) => cropImage(image, s.rect)));
      for (const [i, s] of targets.entries()) update(s.id, { preview: crops[i]!.preview });
      const { results } = await smartlyApi.ocr(
        crops.map((c, i) => ({ blob: c.blob, name: `crop-${targets[i]!.id}.png` })),
      );
      for (const [i, s] of targets.entries()) {
        const r = results[i]!;
        update(s.id, { text: r.text, confidence: r.confidence });
        if (!r.text) {
          update(s.id, { status: 'done' });
          continue;
        }
        try {
          await translateOne(s.id, r.text);
        } catch (error) {
          update(s.id, { status: 'error', error: errorText(error) });
        }
      }
    } catch (error) {
      for (const s of targets) update(s.id, { status: 'error', error: errorText(error) });
    } finally {
      void qc.invalidateQueries({ queryKey: ['smartly', 'health'] });
    }
  };

  // 인식이 틀렸으면 글자를 고쳐 번역만 다시.
  const retranslate = async (s: Selection) => {
    if (!s.text.trim()) return;
    update(s.id, { status: 'running', error: undefined });
    try {
      await translateOne(s.id, s.text.trim());
    } catch (error) {
      update(s.id, { status: 'error', error: errorText(error) });
    }
  };

  const draftRect = draft ? rectBetween(draft.start, draft.end) : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">메뉴판 사진</CardTitle>
          <CardDescription>
            사진을 올린 뒤 메뉴명 <strong>한 줄씩</strong> 마우스로 드래그해 영역을 지정하세요.
            모델에 글자 위치를 찾는 기능이 없어 영역을 사람이 정해 줘야 합니다. 가로로 쓴 한 줄일 때
            가장 잘 읽습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
              <ImageUp className="size-4" />
              {photo ? '다른 사진' : '사진 고르기'}
              <input type="file" accept="image/*" className="sr-only" onChange={onFile} />
            </label>
            {photo && <span className="truncate text-xs text-muted-foreground">{photo.name}</span>}
          </div>
          {loadError !== null && <ErrorNote error={loadError} />}
          {photo ? (
            <div className="relative select-none overflow-hidden rounded-md border bg-muted">
              <img
                ref={imageRef}
                src={photo.src}
                alt="메뉴판 사진"
                className="block h-auto w-full"
                draggable={false}
              />
              <div
                data-testid="crop-surface"
                className={cn(
                  'absolute inset-0 touch-none',
                  busy ? 'cursor-wait' : 'cursor-crosshair',
                )}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => setDraft(null)}
              >
                {selections.map((s, i) => (
                  <div
                    key={s.id}
                    className={cn(
                      'pointer-events-none absolute border-2',
                      s.status === 'done'
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-sky-500 bg-sky-500/10',
                    )}
                    style={rectStyle(s.rect)}
                  >
                    {/* 번호는 영역 왼쪽 바깥에 — 위아래로 붙은 줄끼리 가리지 않게. 사진 왼쪽 끝이면 안쪽에. */}
                    <span
                      className={cn(
                        'absolute top-0 rounded bg-sky-600 px-1 text-[11px] font-semibold text-white',
                        s.rect.x < 0.04 ? 'left-0' : 'right-full mr-0.5',
                      )}
                    >
                      {i + 1}
                    </span>
                  </div>
                ))}
                {draftRect && (
                  <div
                    className="pointer-events-none absolute border-2 border-dashed border-amber-500"
                    style={rectStyle(draftRect)}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-56 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              메뉴판 사진을 올려 주세요
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>선택한 영역 {selections.length}개</span>
            {selections.length > 0 && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setSelections([])}>
                <Trash2 />
                모두 지우기
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full" disabled={busy || pending.length === 0} onClick={recognizeAll}>
            {busy ? <Loader2 className="animate-spin" /> : <Crop />}
            {pending.length > 0 ? `${pending.length}개 영역 인식·번역` : '인식할 영역 없음'}
          </Button>
          {selections.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              사진 위에서 드래그하면 영역이 추가됩니다.
            </p>
          )}
          <ol className="space-y-3">
            {selections.map((s, i) => (
              <li key={s.id} className="space-y-2 rounded-md border p-2">
                <div className="flex items-center gap-2">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded bg-sky-600 text-[11px] font-semibold text-white">
                    {i + 1}
                  </span>
                  {s.preview ? (
                    <img
                      src={s.preview}
                      alt={`영역 ${i + 1}`}
                      className="h-8 min-w-0 flex-1 rounded bg-muted object-contain"
                    />
                  ) : (
                    <span className="flex-1 text-xs text-muted-foreground">아직 인식 전</span>
                  )}
                  {s.status === 'running' && (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`영역 ${i + 1} 지우기`}
                    disabled={s.status === 'running'}
                    onClick={() => setSelections((prev) => prev.filter((x) => x.id !== s.id))}
                  >
                    <X />
                  </Button>
                </div>
                {(s.preview || s.text) && (
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label={`영역 ${i + 1} 인식 결과`}
                      value={s.text}
                      onChange={(e) => update(s.id, { text: e.target.value })}
                      className="h-8"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={s.status === 'running' || !s.text.trim()}
                      onClick={() => retranslate(s)}
                      title="고친 글자로 다시 번역"
                    >
                      <Languages />
                    </Button>
                  </div>
                )}
                {s.confidence !== undefined && <Confidence value={s.confidence} />}
                {s.error && <p className="text-xs text-destructive">{s.error}</p>}
                {s.translation && (
                  <ul className="space-y-1 text-sm">
                    {s.translation.results.map((r) => (
                      <li key={r.lang} className="flex items-start gap-2">
                        <span className="w-20 shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                          {SMARTLY_LANGS.find((l) => l.id === r.lang)?.label}
                        </span>
                        <span className="min-w-0 flex-1 break-words">{r.text ?? '—'}</span>
                        <SourceBadge source={r.source} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
};
