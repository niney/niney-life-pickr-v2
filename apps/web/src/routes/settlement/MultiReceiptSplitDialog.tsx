import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import {
  ApiError,
  settlementExtractionApi,
  useExtractReceipt,
  useUploadReceipt,
  type DraftItem,
  type DraftRound,
} from '@repo/shared';
import { Button } from '~/components/ui/button';

interface ApplyArgs {
  imageToken: string;
  previewUrl: string;
  items: DraftItem[];
  totalAmount: number | null;
  warning: string | null;
}

interface Props {
  open: boolean;
  // 매핑 대상 차수. 호출자가 placeId 있는 것만 골라 전달한다.
  rounds: DraftRound[];
  // 차수 총 수 (roundHint 의 분모). rounds 가 필터링된 경우에도
  // 사용자가 '전체 N차' 컨텍스트를 유지할 수 있게 분리해서 받는다.
  totalRounds: number;
  onClose: () => void;
  // 슬롯 추출이 끝날 때마다 즉시 호출 — 매핑된 차수에 결과 반영.
  onApplyOne: (roundClientId: string, args: ApplyArgs) => void;
}

// 한 장의 사진에 영수증이 가로로 N개 있을 때 사용. 업로드 후 사용자가
// 분할 개수 N(2~5) 와 "왼쪽부터 어느 차수" 매핑을 입력하면, 서버 split
// 옵션으로 N 번 순차 추출해서 매핑된 차수에 적용한다.
export const MultiReceiptSplitDialog = ({
  open,
  rounds,
  totalRounds,
  onClose,
  onApplyOne,
}: Props) => {
  const upload = useUploadReceipt();
  const extract = useExtractReceipt();
  const fileRef = useRef<HTMLInputElement | null>(null);

  // 사용자가 선택할 수 있는 분할 개수 최댓값 — 매핑 가능 차수와 서버 max(5)
  // 중 작은 쪽. 1 이면 분할 의미가 없어 이 다이얼로그 자체가 떠선 안 된다.
  const maxCount = Math.min(rounds.length, 5);

  const [uploaded, setUploaded] = useState<{
    imageToken: string;
    previewUrl: string;
  } | null>(null);
  const [count, setCount] = useState<number>(Math.min(2, Math.max(2, maxCount)));
  // 슬롯 i (0..count-1) → roundClientId. 길이는 항상 count 와 일치.
  const [mapping, setMapping] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 다이얼로그가 열릴 때 / 차수 변동 시 / count 변경 시 기본 매핑을 재계산.
  // 기본은 왼쪽부터 차수 순서대로 — 사용자가 "왼쪽이 1차" 라고 인지하는 가장
  // 자연스러운 매핑.
  useEffect(() => {
    if (!open) return;
    setMapping((prev) => {
      const next: string[] = [];
      for (let i = 0; i < count; i += 1) {
        // 기존 매핑이 유효하면 유지 — 사용자가 변경한 매핑을 count 만 바꿔도
        // 보존되게.
        const keep = prev[i];
        if (keep && rounds.some((r) => r.clientId === keep)) {
          next.push(keep);
          continue;
        }
        const fallback = rounds[i]?.clientId ?? rounds[0]?.clientId ?? '';
        next.push(fallback);
      }
      return next;
    });
  }, [open, count, rounds]);

  // 다이얼로그 닫힐 때 상태 리셋.
  useEffect(() => {
    if (open) return;
    setUploaded(null);
    setCount(Math.min(2, Math.max(2, maxCount)));
    setMapping([]);
    setProgress(null);
    setError(null);
  }, [open, maxCount]);

  const duplicateRounds = useMemo(() => {
    const seen = new Map<string, number>();
    for (const id of mapping) seen.set(id, (seen.get(id) ?? 0) + 1);
    return new Set(
      Array.from(seen.entries()).filter(([, c]) => c > 1).map(([id]) => id),
    );
  }, [mapping]);

  const isWorking = upload.isPending || extract.isPending || progress !== null;
  const canExtract =
    uploaded !== null && mapping.length === count && duplicateRounds.size === 0;

  const handlePick = () => {
    setError(null);
    fileRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const res = await upload.mutateAsync(file);
      setUploaded({ imageToken: res.imageToken, previewUrl: res.previewUrl });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '업로드 실패');
    }
  };

  const handleExtract = async () => {
    if (!uploaded) return;
    setError(null);
    setProgress({ done: 0, total: count });
    try {
      for (let i = 0; i < count; i += 1) {
        const roundClientId = mapping[i]!;
        const round = rounds.find((r) => r.clientId === roundClientId);
        if (!round) continue;
        const roundIndexInWhole =
          // rounds 자체가 전체 차수의 부분집합일 수 있어 placeId 와 같은
          // 식당명을 기반으로 사용자의 인지 차수(전체 기준)를 구하는 건
          // 의미가 없다. 매핑된 차수의 실제 위치(전체 rounds 기준)는
          // 호출자가 갖고 있어야 정확. 여기선 단순히 차수 카드에서 보이는
          // 1-based 순번을 그대로 쓴다 — totalRounds 가 분모.
          rounds.indexOf(round) + 1;
        const extracted = await extract.mutateAsync({
          imageToken: uploaded.imageToken,
          placeId: round.placeId,
          roundIndex: roundIndexInWhole,
          roundTotal: totalRounds,
          split: { count, index: i + 1 },
        });
        onApplyOne(roundClientId, {
          imageToken: uploaded.imageToken,
          previewUrl: uploaded.previewUrl,
          items: extracted.items.map((it) => ({
            clientId: '',
            name: it.name,
            unitPrice: it.unitPrice,
            quantity: it.quantity,
            amount: it.amount,
            category: it.category,
            matchedMenuName: it.matchedMenuName,
          })),
          totalAmount: extracted.totalAmount,
          warning: extracted.warning,
        });
        setProgress({ done: i + 1, total: count });
      }
      // 모두 끝났으면 자동 닫기.
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '추출 실패');
      setProgress(null);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={isWorking ? undefined : onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h3 className="text-base font-semibold">분할 영수증 업로드</h3>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={isWorking}
            aria-label="닫기"
          >
            <X className="size-4" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {!uploaded && (
            <div className="flex flex-col items-center gap-3 rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
              <p>한 사진에 영수증 여러 장이 가로로 나란히 있어야 합니다.</p>
              <Button type="button" onClick={handlePick} disabled={upload.isPending}>
                {upload.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> 업로드 중…
                  </>
                ) : (
                  '사진 선택'
                )}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/heic,image/webp"
                className="hidden"
                onChange={handleFile}
              />
            </div>
          )}

          {uploaded && (
            <>
              <div className="overflow-hidden rounded-md border">
                <ReceiptBlobImage url={uploaded.previewUrl} />
              </div>

              <div>
                <label className="text-sm font-medium">이 사진의 영수증 수</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {Array.from({ length: maxCount - 1 }, (_, i) => i + 2).map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={isWorking}
                      onClick={() => setCount(n)}
                      className={
                        'rounded-md border px-3 py-1.5 text-sm ' +
                        (count === n
                          ? 'border-primary bg-primary/10 font-medium text-primary'
                          : 'border-input hover:bg-accent')
                      }
                    >
                      {n}장
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">왼쪽부터 차수 매핑</label>
                <div className="mt-1 space-y-2">
                  {Array.from({ length: count }, (_, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-16 shrink-0 text-sm text-muted-foreground">
                        {i + 1}번째
                      </span>
                      <select
                        disabled={isWorking}
                        value={mapping[i] ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setMapping((prev) => {
                            const next = [...prev];
                            next[i] = v;
                            return next;
                          });
                        }}
                        className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
                      >
                        {rounds.map((r) => {
                          const orderIdx = rounds.indexOf(r) + 1;
                          return (
                            <option key={r.clientId} value={r.clientId}>
                              {orderIdx}차 — {r.placeName}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  ))}
                </div>
                {duplicateRounds.size > 0 && (
                  <p className="mt-1 text-xs text-destructive">
                    같은 차수에 두 슬롯이 매핑돼 있습니다. 매핑을 조정해주세요.
                  </p>
                )}
              </div>

              {progress && (
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    추출 중… {progress.done} / {progress.total}
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}
            </>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isWorking}
          >
            취소
          </Button>
          <Button
            type="button"
            disabled={!canExtract || isWorking}
            onClick={handleExtract}
          >
            {progress ? '추출 중…' : '추출 시작'}
          </Button>
        </footer>
      </div>
    </div>
  );
};

// 영수증 미리보기 — preview 라우트는 JWT 필요라 <img src> 직접 호출이 안 된다.
// fetch 로 blob 받아 objectURL 로 변환해 표시.
const ReceiptBlobImage = ({ url }: { url: string }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    const token = url.split('/').pop() ?? '';
    (async () => {
      try {
        const blob = await settlementExtractionApi.previewBlob(token);
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '미리보기 실패');
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [url]);

  if (error) return <p className="px-3 py-2 text-sm text-destructive">{error}</p>;
  if (!objectUrl)
    return (
      <p className="px-3 py-2 text-sm text-muted-foreground">미리보기 불러오는 중…</p>
    );
  return <img src={objectUrl} alt="업로드한 영수증" className="w-full object-contain" />;
};
