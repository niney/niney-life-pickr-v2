import { useRef, useState } from 'react';
import { Camera, FileEdit, Loader2 } from 'lucide-react';
import {
  ApiError,
  useExtractReceipt,
  useSettlementDraftStore,
  useUploadReceipt,
} from '@repo/shared';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '~/components/ui/card';

interface Props {
  placeId: string;
  onBack: () => void;
  onProceedToEdit: () => void;
}

// 두 번째 단계 — 직접 입력 / 영수증 사진 중 선택. 영수증 분기는 업로드 →
// 추출 두 단계가 한 번에 진행되며, 완료 시 draftStore 에 items 가 prefill 된 채
// edit 단계로 넘긴다.
export const Step2Source = ({ placeId, onBack, onProceedToEdit }: Props) => {
  const setSource = useSettlementDraftStore((s) => s.setSource);
  const setItems = useSettlementDraftStore((s) => s.setItems);
  const setReceipt = useSettlementDraftStore((s) => s.setReceipt);

  const upload = useUploadReceipt();
  const extract = useExtractReceipt();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleManual = () => {
    setSource('MANUAL');
    setItems([]);
    onProceedToEdit();
  };

  const handleReceiptClick = () => {
    setError(null);
    fileRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 같은 파일을 다시 선택해도 onChange 가 트리거되도록 value 초기화.
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const uploaded = await upload.mutateAsync(file);
      const extracted = await extract.mutateAsync({
        imageToken: uploaded.imageToken,
        placeId,
      });
      // crypto.randomUUID 가 없는 환경 대응은 store 가 자동 처리.
      setReceipt({
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
      onProceedToEdit();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '업로드/추출 실패');
    }
  };

  const isWorking = upload.isPending || extract.isPending;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">어떻게 입력할까요?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          영수증 사진을 올리면 자동으로 메뉴와 금액을 추출합니다. 결과는 다음 단계에서 직접
          확인·수정할 수 있어요.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card
          className="cursor-pointer transition-colors hover:border-primary"
          onClick={isWorking ? undefined : handleManual}
          role="button"
          tabIndex={0}
          aria-disabled={isWorking}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileEdit className="size-5" />
              직접 입력
            </CardTitle>
            <CardDescription>메뉴와 가격을 손으로 추가합니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" disabled={isWorking} onClick={(e) => { e.stopPropagation(); handleManual(); }}>
              직접 입력하기
            </Button>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-colors hover:border-primary"
          onClick={isWorking ? undefined : handleReceiptClick}
          role="button"
          tabIndex={0}
          aria-disabled={isWorking}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Camera className="size-5" />
              영수증 사진
            </CardTitle>
            <CardDescription>사진 한 장으로 메뉴/가격 자동 추출.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              disabled={isWorking}
              onClick={(e) => { e.stopPropagation(); handleReceiptClick(); }}
            >
              {isWorking ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {upload.isPending ? '업로드 중…' : '추출 중…'}
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
              onChange={handleFileChange}
            />
          </CardContent>
        </Card>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-between pt-2">
        <Button type="button" variant="ghost" onClick={onBack} disabled={isWorking}>
          이전
        </Button>
      </div>
    </section>
  );
};
