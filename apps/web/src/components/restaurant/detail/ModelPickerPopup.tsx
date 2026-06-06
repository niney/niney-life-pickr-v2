import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Check, Loader2 } from 'lucide-react';
import { useProviderModels } from '@repo/shared';
import { groupModelsByFamily } from '@repo/utils';
import { cn } from '~/lib/utils';

interface Props {
  open: boolean;
  onClose(): void;
  // 모델을 고르면 호출 — 호출자가 재요약을 트리거한다.
  onSelect(model: string): void;
  // 현재 이 리뷰 요약에 쓰인 모델. 목록에서 체크로 표시.
  currentModel?: string | null;
  title?: string;
}

// 단건 재요약용 모델 선택 레이어 팝업. 설정 > AI 키 화면과 같은 모델 소스
// (useProviderModels: 저장된 ollama-cloud/chat 키로 받아온 목록)를 재사용하되,
// 평면 리스트 대신 계열(family)별로 묶어 보여준다. admin 전용 화면에서만 마운트.
export const ModelPickerPopup = ({
  open,
  onClose,
  onSelect,
  currentModel,
  title = '모델 선택 후 재요약',
}: Props) => {
  // chat 용도의 저장된 키로 사용 가능한 모델 목록 (admin 전용 API). 팝업이 열릴
  // 때만 fetch.
  const models = useProviderModels({ id: 'ollama-cloud', purpose: 'chat' }, open);
  const groups = useMemo(
    () => groupModelsByFamily(models.data?.models ?? []),
    [models.data?.models],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  // document.body 로 portal — 데스크톱 상세는 [리스트|상세|지도] 3-컬럼이고 각
  // 컬럼이 position:sticky 라 stacking context 를 만든다. 상세 컬럼 안에서 그대로
  // 렌더하면 z-50 이 그 context 안에서만 유효해, DOM 상 뒤에 오는 지도 컬럼이
  // 팝업 오른쪽을 덮어 잘렸다. body 로 빼면 컬럼 context 밖이라 전체를 덮는다.
  // (Lightbox 와 동일 패턴.)
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-md flex-col rounded-t-lg bg-background shadow-lg sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            계열별로 묶인 모델 — 고르면 이 리뷰만 다시 요약합니다 (1회성).
          </p>
        </div>

        {/* 상단 패딩을 빼서 sticky 그룹명이 모달 헤더에 딱 붙게 한다(top-0 이
            scroller content-box 최상단=헤더 경계에 stick). 초기 여백은 내부
            래퍼의 pt-2 로 주되 스크롤되면 사라진다. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {models.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> 모델 목록 불러오는 중…
            </div>
          ) : groups.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              사용 가능한 모델이 없습니다.
              <br />
              <span className="text-xs">
                설정 &gt; AI 키에서 키를 먼저 저장하세요.
              </span>
            </div>
          ) : (
            // 그룹 간 space-y(마진)를 두지 않는다 — 마진은 투명이라 sticky
            // 헤더가 붙을 때 그 위로 비쳐 미세한 간격처럼 보인다. 그룹 구분
            // 여백은 헤더 배경 안쪽(pt-2)으로 옮겨, 헤더 bg 가 그 영역을 덮어
            // 투명 간격이 생기지 않게 한다.
            <div>
              {groups.map((g) => (
                <div key={g.family}>
                  <div className="sticky top-0 bg-background px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.family}
                  </div>
                  <div className="flex flex-wrap gap-1.5 px-1 pt-0.5">
                    {g.models.map((m) => {
                      const selected = m === currentModel;
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            onSelect(m);
                            onClose();
                          }}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-accent',
                            selected
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border bg-background',
                          )}
                        >
                          {selected && <Check className="size-3" />}
                          {m}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
