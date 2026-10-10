import { useState, type ChangeEvent, type DragEvent } from 'react';
import { AlertCircle, ImageUp, Loader2, ScanText } from 'lucide-react';
import { MENU_BOARD_MAX_UPLOAD_MB, type MenuBoardReadResultType } from '@repo/api-contract';
import { useMenuBoardSampleImage, useMenuBoardSamples, useReadMenuBoard } from '@repo/shared';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { cn } from '~/lib/utils';
import { SELECT_CLASS, seconds } from './format';
import { ZoomableImage } from './ZoomableImage';

// 읽기 — 사진을 올리거나 수집 샘플을 골라 비전 LLM 한 번으로 메뉴·가격·설명 목록을 받는다.

interface Picked {
  url: string; // 미리보기 object URL
  blob: Blob;
  name: string;
  label: string;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : '실패');

export const ReadTab = () => {
  const samples = useMenuBoardSamples();
  const sampleImage = useMenuBoardSampleImage();
  const read = useReadMenuBoard();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [sampleKey, setSampleKey] = useState('');
  const [dragging, setDragging] = useState(false);

  // 새 사진으로 바꿀 때 이전 미리보기 URL 을 놓는다(페이지를 떠날 때 남는 하나는 문서와 함께 정리된다).
  const choose = (next: Picked) => {
    if (picked) URL.revokeObjectURL(picked.url);
    setPicked(next);
    setPickError(null);
    read.reset();
  };

  const takeFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPickError('사진 파일(JPEG·PNG·WebP)만 올릴 수 있습니다.');
      return;
    }
    if (file.size > MENU_BOARD_MAX_UPLOAD_MB * 1024 * 1024) {
      setPickError(`파일이 너무 큽니다(최대 ${MENU_BOARD_MAX_UPLOAD_MB}MB).`);
      return;
    }
    setSampleKey('');
    choose({ url: URL.createObjectURL(file), blob: file, name: file.name, label: file.name });
  };

  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    takeFile(e.target.files?.[0]);
    e.target.value = ''; // 같은 파일을 다시 골라도 바뀌게
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    takeFile(e.dataTransfer.files[0]);
  };

  const onSample = (key: string) => {
    setSampleKey(key);
    const sample = samples.data?.samples.find((s) => s.key === key);
    if (!sample) return;
    sampleImage.mutate(key, {
      onSuccess: (blob) =>
        choose({ url: URL.createObjectURL(blob), blob, name: sample.file, label: `${sample.shopName} · ${sample.file}` }),
      onError: (error) => setPickError(errorText(error)),
    });
  };

  // 검수 정답이 있는 사진을 먼저(정확도 탭과 대조하기 쉽게).
  const sampleList = [...(samples.data?.samples ?? [])].sort(
    (a, b) => Number(b.hasTruth) - Number(a.hasTruth) || a.shopName.localeCompare(b.shopName, 'ko'),
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">메뉴판 사진</CardTitle>
          <CardDescription>
            사진을 올리거나 끌어다 놓고, 또는 수집해 둔 캐치테이블 메뉴판 샘플을 고르세요. 서버가 긴 변을 2,000px 로
            맞춰(작은 사진은 키워) 모델에 넘깁니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <label className="cursor-pointer">
                <ImageUp />
                사진 올리기
                <input type="file" accept="image/*" className="sr-only" onChange={onFileInput} />
              </label>
            </Button>
            <select
              aria-label="샘플 사진"
              className={cn(SELECT_CLASS, 'min-w-0 flex-1')}
              value={sampleKey}
              onChange={(e) => onSample(e.target.value)}
              disabled={!sampleList.length}
            >
              <option value="">
                {samples.isPending
                  ? '샘플 불러오는 중…'
                  : sampleList.length
                    ? `샘플 고르기 (${sampleList.length}장)`
                    : '샘플 없음 — pnpm --filter friendly collect:menu-boards'}
              </option>
              {sampleList.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.hasTruth ? '[정답] ' : ''}
                  {s.shopName} · {s.file}
                </option>
              ))}
            </select>
          </div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            // 사진이 있어도 새 사진을 끌어다 놓을 수 있다.
            className={cn(
              'rounded-md',
              !picked || sampleImage.isPending
                ? 'flex min-h-48 items-center justify-center border border-dashed bg-muted/30'
                : 'ring-offset-2',
              dragging && 'border-primary bg-primary/5 ring-2 ring-primary',
            )}
          >
            {sampleImage.isPending ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> 샘플 사진 받는 중…
              </p>
            ) : picked ? (
              <ZoomableImage src={picked.url} alt={picked.label} />
            ) : (
              <p className="px-4 text-center text-sm text-muted-foreground">여기에 메뉴판 사진을 끌어다 놓으세요</p>
            )}
          </div>
          {pickError && <ErrorLine message={pickError} />}
          <div className="flex items-center gap-3">
            <Button
              onClick={() => picked && read.mutate({ file: picked.blob, filename: picked.name })}
              disabled={!picked || read.isPending}
            >
              {read.isPending ? <Loader2 className="animate-spin" /> : <ScanText />}
              메뉴 읽기
            </Button>
            {picked && <span className="truncate text-xs text-muted-foreground">{picked.label}</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">읽은 메뉴</CardTitle>
          <CardDescription>사진에 적힌 그대로(번역·교정 없음). 가격은 표기 그대로, 여러 개면 첫 번째.</CardDescription>
        </CardHeader>
        <CardContent>
          {read.isPending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> 읽는 중… 장당 약 7초
            </p>
          )}
          {read.isError && <ErrorLine message={errorText(read.error)} />}
          {read.data && <ReadResult result={read.data} />}
          {!read.isPending && !read.isError && !read.data && (
            <p className="text-sm text-muted-foreground">사진을 고르고 '메뉴 읽기'를 누르세요.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const ErrorLine = ({ message }: { message: string }) => (
  <p className="flex items-center gap-1.5 text-sm text-destructive">
    <AlertCircle className="size-4 shrink-0" />
    {message}
  </p>
);

const ReadResult = ({ result }: { result: MenuBoardReadResultType }) => (
  <div className="space-y-3">
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="violet">{result.model}</Badge>
      <Badge variant="secondary">항목 {result.items.length}개</Badge>
      <Badge variant="secondary">{seconds(result.durationMs)}</Badge>
      {result.promptTokens !== null && (
        <Badge variant="outline">
          토큰 입력 {result.promptTokens.toLocaleString('ko-KR')} · 출력{' '}
          {(result.completionTokens ?? 0).toLocaleString('ko-KR')}
        </Badge>
      )}
      <Badge variant="outline">
        사진 {result.image.width}×{result.image.height}
      </Badge>
    </div>
    {result.items.length === 0 ? (
      <p className="text-sm text-muted-foreground">메뉴가 없습니다(표지·안내판 사진이면 정상).</p>
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>메뉴</TableHead>
            <TableHead className="whitespace-nowrap text-right">가격</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.items.map((item, i) => (
            <TableRow key={i}>
              <TableCell className="text-xs tabular-nums text-muted-foreground">{i + 1}</TableCell>
              <TableCell>
                <div className="font-medium">{item.name}</div>
                {item.description && <div className="text-xs text-muted-foreground">{item.description}</div>}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right tabular-nums">
                {item.price ?? <span className="text-muted-foreground">–</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )}
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground">모델 응답 원문</summary>
      <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3">{result.rawText}</pre>
    </details>
  </div>
);
