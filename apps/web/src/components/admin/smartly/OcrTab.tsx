import { useState, type ChangeEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImageUp, Loader2, Shuffle } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { cn } from '~/lib/utils';
import { readAsDataUrl } from './cropMath';
import { percent, randomSeed, SELECT_CLASS } from './format';
import { Confidence, ErrorNote } from './parts';
import { ocrSampleImageUrl, smartlyApi, useSmartlyOcr, type OcrResult } from './smartlyApi';

const SAMPLE_COUNTS = [12, 24, 48];

// 인식 탭 — 테스트셋 무작위 예시(정답 대조) + 직접 올린 한 줄 이미지 인식.
export const OcrTab = () => (
  <div className="space-y-6">
    <SampleGallery />
    <UploadCard />
  </div>
);

const SampleGallery = () => {
  const [count, setCount] = useState(SAMPLE_COUNTS[1]!);
  const [seed, setSeed] = useState(1);
  // 같은 seed 면 같은 표본이라 결과가 바뀌지 않는다 — 다시 부르지 않는다.
  const samples = useQuery({
    queryKey: ['smartly', 'ocr-samples', count, seed],
    queryFn: () => smartlyApi.evaluateOcr({ count, seed }),
    staleTime: Infinity,
    retry: false,
  });
  const data = samples.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">테스트셋 예시</CardTitle>
        <CardDescription>
          AI 허브 테스트셋(잘린 메뉴명 {data ? data.total.toLocaleString('ko-KR') : '129,104'}
          장)에서 무작위로 골라 인식합니다. 초록은 정답과 완전히 같은 것, 빨강은 틀린 것.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="예시 수"
            className={SELECT_CLASS}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          >
            {SAMPLE_COUNTS.map((n) => (
              <option key={n} value={n}>
                {n}장
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => setSeed(randomSeed())}>
            <Shuffle />
            다른 예시
          </Button>
          {samples.isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          {data && (
            <span className="text-xs text-muted-foreground">
              평균 CER {percent(data.meanCer)} · 완전 일치 {percent(data.exactRate)} ·{' '}
              {data.seconds.toFixed(1)}초 (seed {data.seed})
            </span>
          )}
        </div>
        {samples.isError && <ErrorNote error={samples.error} />}
        {data && (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map((item) => {
              const exact = item.gt === item.text;
              return (
                <li key={item.id} className="space-y-1.5 rounded-md border p-2">
                  <img
                    src={ocrSampleImageUrl(item.id)}
                    alt={`테스트 이미지 ${item.id}`}
                    className="h-12 w-full rounded bg-muted object-contain"
                    loading="lazy"
                  />
                  <p className="truncate text-xs text-muted-foreground" title={item.gt}>
                    정답 {item.gt}
                  </p>
                  <p
                    className={cn(
                      'truncate text-sm font-medium',
                      exact ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive',
                    )}
                    title={item.text}
                  >
                    {item.text || '(빈 결과)'}
                  </p>
                  <div className="flex items-center justify-between">
                    <Confidence value={item.confidence} />
                    {!exact && (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        CER {percent(item.cer, 0)}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

interface Uploaded {
  name: string;
  preview: string;
}

const UploadCard = () => {
  const [uploaded, setUploaded] = useState<Uploaded[]>([]);
  const ocr = useSmartlyOcr();

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 32);
    e.target.value = '';
    if (files.length === 0) return;
    const previews = await Promise.all(files.map(readAsDataUrl));
    setUploaded(files.map((f, i) => ({ name: f.name, preview: previews[i]! })));
    ocr.mutate(files.map((f) => ({ blob: f, name: f.name })));
  };

  const results: (OcrResult | undefined)[] = ocr.data?.results ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">직접 올리기</CardTitle>
        <CardDescription>
          메뉴명 <strong>한 줄만</strong> 잘라 낸 이미지를 올리세요(여러 장, 최대 32장). 모델은
          흑백으로 바꿔 비율과 상관없이 300×64 로 늘려 읽기 때문에 통사진이나 여러 줄은 엉뚱하게
          읽습니다 — 통사진은 &lsquo;사진 → 번역&rsquo; 탭에서 영역을 잘라 쓰세요.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
          <ImageUp className="size-4" />
          이미지 고르기
          <input type="file" accept="image/*" multiple className="sr-only" onChange={onFiles} />
        </label>
        {ocr.isPending && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> 인식 중…
          </p>
        )}
        {ocr.isError && <ErrorNote error={ocr.error} />}
        {uploaded.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {uploaded.map((u, i) => {
              const r = results[i];
              return (
                <li key={`${u.name}-${i}`} className="space-y-1.5 rounded-md border p-2">
                  <img
                    src={u.preview}
                    alt={u.name}
                    className="h-16 w-full rounded bg-muted object-contain"
                  />
                  <p className="truncate text-xs text-muted-foreground">{u.name}</p>
                  {r && (
                    <>
                      <p className="break-all text-sm font-medium">{r.text || '(빈 결과)'}</p>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <Confidence value={r.confidence} />
                        <span>
                          원본 {r.width}×{r.height}
                        </span>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
