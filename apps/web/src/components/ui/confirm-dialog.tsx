import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from './button';
import { cn } from '~/lib/utils';

interface Props {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // 'destructive' 면 confirm 버튼이 빨강. 삭제 같은 비가역 액션용.
  variant?: 'default' | 'destructive';
  pending?: boolean;
  onConfirm(): void | Promise<void>;
  onClose(): void;
}

// 가벼운 fixed overlay confirmation. 기존 MenuPickerDialog 등과 같은 패턴 —
// 외부 헤드리스 라이브러리 없이 ESC/배경 클릭으로 닫고 confirm 버튼만 강조.
export const ConfirmDialog = ({
  open,
  title,
  description,
  confirmLabel = '확인',
  cancelLabel = '취소',
  variant = 'default',
  pending = false,
  onConfirm,
  onClose,
}: Props) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, pending, onClose]);

  if (!open) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={() => {
        if (!pending) onClose();
      }}
    >
      <div
        className="w-full max-w-sm rounded-t-lg bg-background p-5 shadow-lg sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">{title}</h2>
        {description && (
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={pending}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={variant === 'destructive' ? 'default' : 'default'}
            disabled={pending}
            onClick={() => void onConfirm()}
            className={cn(
              variant === 'destructive' &&
                'bg-destructive text-destructive-foreground hover:bg-destructive/90',
            )}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};
