import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Search, Users, X } from 'lucide-react';
import type { SettlementContactType } from '@repo/api-contract';
import { ApiError, useSettlementContacts } from '@repo/shared';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';

interface Props {
  open: boolean;
  // 이미 정산에 추가된 contactId 집합. 모달은 이 항목들을 "추가됨" 으로 표시
  // 하고 체크박스를 disabled 처리한다 — 같은 사람을 중복으로 또 넣지 못하게.
  alreadyAddedContactIds: ReadonlySet<string>;
  onClose(): void;
  onAdd(contacts: SettlementContactType[]): void;
}

// "단골에서 추가" 모달. SettlementShareDialog/ContactEditDialog 와 동일한
// fixed overlay 패턴 — 모바일은 화면 하단 슬라이드 시트(items-end), sm 이상은
// 중앙 다이얼로그. 자동완성 드롭다운보다 훨씬 큰 영역을 써서 한 번에 여러
// 명을 골라 일괄 추가하는 흐름을 빠르게 한다.
export const ContactPickerDialog = ({
  open,
  alreadyAddedContactIds,
  onClose,
  onAdd,
}: Props) => {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // 100 개까지 — 자동완성보다 넉넉. 검색이 있으면 서버에서 필터링.
  const list = useSettlementContacts({
    q: q.trim() || undefined,
    take: 100,
  });

  // 열릴 때마다 초기화. 닫혀 있는 동안엔 호출 안 한다 — open 가드는 아래.
  useEffect(() => {
    if (!open) return;
    setQ('');
    setPicked(new Set());
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

  // 새로 고를 수 있는 후보(=아직 추가되지 않은 단골) 개수 — 푸터 카운트의
  // 분모로도 표시.
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const selectableCount = useMemo(
    () => items.filter((c) => !alreadyAddedContactIds.has(c.id)).length,
    [items, alreadyAddedContactIds],
  );

  if (!open) return null;

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = () => {
    if (picked.size === 0) return;
    const chosen = items.filter((c) => picked.has(c.id));
    onAdd(chosen);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="단골에서 추가"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col gap-3 rounded-t-lg bg-background p-4 shadow-lg sm:max-h-[80vh] sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-base font-semibold">
            <Users className="size-4" />
            단골에서 추가
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            aria-label="닫기"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="이름·닉네임 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="-mx-1 flex-1 overflow-auto">
          {list.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              불러오는 중…
            </div>
          ) : list.isError ? (
            <p className="px-1 py-4 text-sm text-destructive">
              단골을 불러오지 못했습니다.{' '}
              {list.error instanceof ApiError ? list.error.message : ''}
            </p>
          ) : items.length === 0 ? (
            <p className="px-1 py-8 text-center text-sm text-muted-foreground">
              {q.trim()
                ? `"${q.trim()}" 에 일치하는 단골이 없습니다`
                : '아직 단골이 없습니다 — 정산을 저장하면 자동으로 적립됩니다'}
            </p>
          ) : (
            <ul className="space-y-1 px-1">
              {items.map((c) => {
                const already = alreadyAddedContactIds.has(c.id);
                const checked = picked.has(c.id);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      disabled={already}
                      onClick={() => toggle(c.id)}
                      className={`flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${
                        already
                          ? 'cursor-not-allowed opacity-60'
                          : checked
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-accent'
                      }`}
                    >
                      <span
                        className={`inline-flex size-5 shrink-0 items-center justify-center rounded border ${
                          checked
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-muted-foreground/30 bg-background'
                        }`}
                      >
                        {checked && <Check className="size-3.5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {displayName(c)}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                          {c.lastExcludeAlcohol && <Tag>주류 X</Tag>}
                          {c.lastExcludeNonAlcohol && <Tag>비주류 X</Tag>}
                          {c.lastExcludeSide && <Tag>안주 X</Tag>}
                          {!c.lastExcludeAlcohol &&
                            !c.lastExcludeNonAlcohol &&
                            !c.lastExcludeSide && <Tag>기본</Tag>}
                          {c.useCount > 1 && <Tag>{c.useCount}회</Tag>}
                          {already && <Tag>추가됨</Tag>}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <div className="text-xs text-muted-foreground">
            {selectableCount > 0 && (
              <>
                {picked.size}/{selectableCount} 선택됨
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              취소
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleAdd}
              disabled={picked.size === 0}
            >
              {picked.size > 0 ? `${picked.size}명 추가` : '추가'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Tag = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded bg-muted px-1 py-px">{children}</span>
);

const displayName = (c: SettlementContactType): string => {
  const nm = (c.name ?? '').trim();
  const nick = (c.nickname ?? '').trim();
  if (nm && nick) return `${nm} (${nick})`;
  return nm || nick || '(이름 없음)';
};
