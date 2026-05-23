import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { MenuItemType } from '@repo/api-contract';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';

interface Props {
  open: boolean;
  menus: MenuItemType[];
  onPick(menu: MenuItemType): void;
  onClose(): void;
}

// 식당의 등록 메뉴 중에서 검색해 항목을 추가하는 모달. 외부 UI 라이브러리에
// Dialog 가 없어 가벼운 fixed overlay 로 구현.
export const MenuPickerDialog = ({ open, menus, onPick, onClose }: Props) => {
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  // ESC 닫기.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (term.length === 0) return menus;
    return menus.filter((m) => m.name.toLowerCase().includes(term));
  }, [menus, q]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="메뉴에서 추가"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col gap-3 rounded-t-lg bg-background p-4 shadow-lg sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">메뉴에서 추가</h3>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="닫기">
            <X className="size-4" />
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="메뉴 검색"
            className="pl-8"
            autoFocus
          />
        </div>

        <div className="-mx-1 flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {menus.length === 0
                ? '등록된 메뉴가 없습니다.'
                : '검색 결과가 없습니다.'}
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((m, idx) => (
                <li key={`${m.name}-${idx}`}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded px-2 py-2.5 text-left text-sm hover:bg-accent"
                    onClick={() => onPick(m)}
                  >
                    <span className="min-w-0 truncate">{m.name}</span>
                    {m.price && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {m.price}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
