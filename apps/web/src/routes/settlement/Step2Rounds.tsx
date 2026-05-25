import { useMemo, useRef, useState } from 'react';
import { Camera, FileEdit, Loader2, MapPin, Plus, Trash2 } from 'lucide-react';
import {
  ApiError,
  useExtractReceipt,
  useSettlementDraftStore,
  useUploadReceipt,
  type DraftItem,
  type DraftRound,
} from '@repo/shared';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { RestaurantSearchDialog } from './RestaurantSearchDialog';

interface Props {
  onBack: () => void;
  onNext: () => void;
}

// 차수 구성 + 영수증 업로드 단계.
// - 차수 카드 N개: 각각 식당 / 입력 방식(MANUAL/RECEIPT) / 영수증 업로드.
// - '+ 차수 추가' 로 빈 차수를 만든 뒤 식당 선택 → 입력 방식 선택.
// - 영수증 모드는 사진 1장씩 또는 여러 장 일괄 (한 번에 N장 선택 시 차수
//   순서대로 채움 + 부족하면 차수가 자동 추가).
//
// 각 차수의 source 가 결정되면 (MANUAL 선택 또는 RECEIPT 추출 완료) 다음
// 단계로 갈 수 있다. 차수 1개라도 source 가 비어 있으면 게이팅.
export const Step2Rounds = ({ onBack, onNext }: Props) => {
  const rounds = useSettlementDraftStore((s) => s.rounds);
  const addRound = useSettlementDraftStore((s) => s.addRound);
  const removeRound = useSettlementDraftStore((s) => s.removeRound);
  const updateRoundMeta = useSettlementDraftStore((s) => s.updateRoundMeta);
  const setRoundItems = useSettlementDraftStore((s) => s.setRoundItems);
  const setRoundReceipt = useSettlementDraftStore((s) => s.setRoundReceipt);

  const [pickingRoundClientId, setPickingRoundClientId] = useState<string | null>(null);
  // 차수가 아직 없을 때 '+ 추가' 가 모달을 띄울 수 있도록 다른 상태도 분기.
  const [pickingForNewRound, setPickingForNewRound] = useState(false);

  const handlePickRestaurant = (target: { placeId: string; name: string }) => {
    if (pickingForNewRound) {
      addRound(target.placeId, target.name);
      setPickingForNewRound(false);
      return;
    }
    if (pickingRoundClientId) {
      updateRoundMeta(pickingRoundClientId, {
        placeId: target.placeId,
        placeName: target.name,
      });
      setPickingRoundClientId(null);
    }
  };

  const alreadyPicked = useMemo(
    () => new Set(rounds.map((r) => r.placeId).filter((x) => x.length > 0)),
    [rounds],
  );

  const canProceed = rounds.length > 0 && rounds.every((r) => r.source !== null);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">차수 구성</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          1차 식당부터 시작해 2차·3차로 자리가 옮겨졌다면 차수를 추가하세요. 같은 자리에서
          영수증이 여러 장이면 차수마다 1장씩 업로드해도 되고, 한 번에 여러 장 올려 자동
          분배할 수도 있습니다.
        </p>
      </div>

      {rounds.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <p>아직 차수가 없습니다.</p>
            <Button
              type="button"
              variant="default"
              onClick={() => setPickingForNewRound(true)}
            >
              <Plus className="size-4" />
              1차 식당 선택
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {rounds.map((r, idx) => (
          <RoundCard
            key={r.clientId}
            round={r}
            index={idx}
            total={rounds.length}
            onPickRestaurant={() => setPickingRoundClientId(r.clientId)}
            onRemove={() => removeRound(r.clientId)}
            onChooseManual={() => {
              setRoundItems(r.clientId, []);
              updateRoundMeta(r.clientId, { source: 'MANUAL' });
            }}
            onReceiptDone={(args) => setRoundReceipt(r.clientId, args)}
          />
        ))}
      </div>

      {rounds.length > 0 && (
        <Button
          type="button"
          variant="outline"
          onClick={() => setPickingForNewRound(true)}
          className="w-full"
        >
          <Plus className="size-4" />
          차수 추가
        </Button>
      )}

      <RestaurantSearchDialog
        open={pickingRoundClientId !== null || pickingForNewRound}
        alreadyPicked={alreadyPicked}
        onClose={() => {
          setPickingRoundClientId(null);
          setPickingForNewRound(false);
        }}
        onPick={handlePickRestaurant}
      />

      <div className="flex justify-between gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          이전
        </Button>
        <Button type="button" disabled={!canProceed} onClick={onNext}>
          다음
        </Button>
      </div>
    </section>
  );
};

interface RoundCardProps {
  round: DraftRound;
  index: number;
  total: number;
  onPickRestaurant: () => void;
  onRemove: () => void;
  onChooseManual: () => void;
  onReceiptDone: (args: {
    imageToken: string;
    previewUrl: string;
    items: DraftItem[];
    totalAmount: number | null;
    warning: string | null;
  }) => void;
}

const RoundCard = ({
  round,
  index,
  total,
  onPickRestaurant,
  onRemove,
  onChooseManual,
  onReceiptDone,
}: RoundCardProps) => {
  const upload = useUploadReceipt();
  const extract = useExtractReceipt();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleReceiptClick = () => {
    setError(null);
    fileRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!round.placeId) {
      setError('식당을 먼저 선택해 주세요.');
      return;
    }
    setError(null);
    try {
      const uploaded = await upload.mutateAsync(file);
      const extracted = await extract.mutateAsync({
        imageToken: uploaded.imageToken,
        placeId: round.placeId,
        roundIndex: index + 1,
        roundTotal: total,
      });
      onReceiptDone({
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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '업로드/추출 실패');
    }
  };

  const isWorking = upload.isPending || extract.isPending;

  const sourceLabel =
    round.source === 'MANUAL'
      ? '직접 입력'
      : round.source === 'RECEIPT'
        ? '영수증'
        : '미선택';

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
              {index + 1}차
            </span>
            <span className="truncate text-sm">{round.placeName || '식당 미선택'}</span>
          </span>
          {/* 1차도 삭제 가능 — 사용자가 0개로 만들면 stepper 가 다시 잠금. */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="차수 삭제"
            onClick={onRemove}
          >
            <Trash2 className="size-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <div className="flex min-w-0 items-center gap-2">
            <MapPin className="size-4 text-muted-foreground" />
            <span className="truncate">
              {round.placeName || <span className="text-muted-foreground">식당 미선택</span>}
            </span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onPickRestaurant}>
            {round.placeId ? '변경' : '식당 선택'}
          </Button>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>입력 방식: {sourceLabel}</span>
          {round.items.length > 0 && (
            <span>
              항목 {round.items.length}개
              {round.totalAmount != null && (
                <> · 총액 {round.totalAmount.toLocaleString('ko-KR')}원</>
              )}
            </span>
          )}
        </div>

        {round.source === null && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              disabled={!round.placeId || isWorking}
              onClick={onChooseManual}
            >
              <FileEdit className="size-4" />
              직접 입력
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!round.placeId || isWorking}
              onClick={handleReceiptClick}
            >
              {isWorking ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {upload.isPending ? '업로드 중…' : '추출 중…'}
                </>
              ) : (
                <>
                  <Camera className="size-4" />
                  영수증 사진
                </>
              )}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/heic,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        )}

        {round.source !== null && (
          <div className="flex items-center justify-between rounded-md border bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            <span>입력 완료 — 다음 단계에서 항목을 확인·수정하세요.</span>
            {round.source === 'RECEIPT' && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isWorking}
                onClick={handleReceiptClick}
                className="h-7 text-xs"
              >
                {isWorking ? <Loader2 className="size-3 animate-spin" /> : '다른 사진'}
              </Button>
            )}
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
};
