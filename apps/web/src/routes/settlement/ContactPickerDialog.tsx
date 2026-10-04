import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Search, UserRoundPlus, X } from 'lucide-react';
import type { SettlementContactType } from '@repo/api-contract';
import { ApiError, useSettlementContacts } from '@repo/shared';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { useDebounced } from '~/lib/useDebounced';

interface Props {
  open: boolean;
  // 이미 현재 참여자 목록에 있는 단골을 비활성 처리하기 위한 식별자.
  // - contactIds: 자동완성으로 골랐던(또는 단골에서 부른) 행
  // - keys: 사용자가 직접 타이핑해 normalizedKey 만 일치하는 행
  // 둘 중 어느 쪽이든 매칭되면 "이미 추가됨" 으로 본다.
  existingContactIds: Set<string>;
  existingKeys: Set<string>;
  onClose(): void;
  onConfirm(picked: SettlementContactType[]): void;
}

// 정산 입력 1단계의 "단골에서 추가" 모달. 다중 선택 → 한 번에 append.
// 모바일에서는 화면 하단 슬라이드 시트, sm 이상은 중앙 다이얼로그
// (SettlementShareDialog / ContactEditDialog 와 동일 패턴).
//
// 정렬은 서버 기본(lastUsedAt desc) — 자동완성과 일관성. take 는 100 으로
// 잡아 보통 사용자의 모든 단골을 한 화면에 노출.
export const ContactPickerDialog = ({
  open,
  existingContactIds,
  existingKeys,
  onClose,
  onConfirm,
}: Props) => {
  const [q, setQ] = useState('');
  // 검색어는 디바운스해서 조회한다 — 한글은 조합 단계마다 change 가 와서, 입력값을
  // 그대로 키에 넣으면 "홍길동" 한 번에 요청이 아홉 번 나간다. 비울 때는 기다리지
  // 않는다(전체 목록은 캐시에 있고, 다시 열었을 때 직전 검색 결과가 잠깐 보이면 안 됨).
  // 비운 순간 디바운스 값도 곧바로 비워(지연 0) 두어, 이어서 새 글자를 칠 때 지우기
  // 전의 검색어가 되살아나지 않게 한다.
  const term = q.trim();
  const debouncedTerm = useDebounced(term, term === '' ? 0 : 250);
  const searchTerm = term === '' ? '' : debouncedTerm;
  // 닫혀 있는 동안엔 조회하지 않고(enabled), 검색어가 바뀌는 동안엔 직전 목록을
  // 그대로 둔다(keepPrevious) — 글자마다 목록이 스피너로 바뀌었다 돌아오지 않게.
  const list = useSettlementContacts(
    { q: searchTerm || undefined, take: 100 },
    { enabled: open, keepPrevious: true },
  );
  // 고른 단골은 id 만이 아니라 본체째 들고 있는다 — 검색어를 바꾸면 앞서 고른 사람이 목록에서
  // 빠지는데, id 만 들고 있으면 "N명 선택됨" 으로 세어지기만 하고 추가할 때는 찾을 수 없다.
  const [selected, setSelected] = useState<Map<string, SettlementContactType>>(new Map());

  // 모달이 열릴 때마다 검색·선택 초기화. 외부 시스템(다이얼로그 lifecycle)
  // 동기화라 useEffect 가 적절.
  useEffect(() => {
    if (!open) return;
    setQ('');
    setSelected(new Map());
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

  // 빈 단골 상태(0건) 인지, 검색결과 0건인지 메시지를 구분하기 위해 q 비어있을
  // 때의 total 도 같이 관찰. 굳이 별도 query 까지는 안 만들고 단순 메시지로.
  const items = list.data?.items ?? [];
  // 입력이 디바운스·응답을 기다리는 동안엔 직전 검색의 결과가 보이고 있다. 그 결과가
  // 비어 있어도 지금 검색어의 "결과 없음" 은 아니므로 답이 올 때까지 로딩으로 둔다.
  const settled = searchTerm === term && !list.isPlaceholderData;
  const waiting = list.isLoading || (!settled && items.length === 0 && !list.isError);

  const isAlreadyAdded = useMemo(
    () => (c: SettlementContactType) => {
      if (existingContactIds.has(c.id)) return true;
      const key = normalizeContactKey(c.name, c.nickname);
      return existingKeys.has(key);
    },
    [existingContactIds, existingKeys],
  );

  if (!open) return null;

  const toggle = (c: SettlementContactType) => {
    setSelected((cur) => {
      const next = new Map(cur);
      if (next.has(c.id)) next.delete(c.id);
      else next.set(c.id, c);
      return next;
    });
  };

  const handleConfirm = () => {
    // 지금 보이는 목록의 순서를 먼저 따르고(검색어를 안 바꿨다면 예전과 같은 순서), 검색어를
    // 바꿔 목록에서 빠진 선택은 고른 순서대로 뒤에 붙인다.
    const visible = items.filter((c) => selected.has(c.id));
    const visibleIds = new Set(visible.map((c) => c.id));
    const hidden = [...selected.values()].filter((c) => !visibleIds.has(c.id));
    onConfirm([...visible, ...hidden]);
    onClose();
  };

  const selectedCount = selected.size;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="단골에서 참여자 추가"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col gap-3 rounded-t-lg bg-background p-4 shadow-lg sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-base font-semibold">
            <UserRoundPlus className="size-4" />
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
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="이름·닉네임 검색"
            className="pl-9"
          />
        </div>

        <div className="-mx-1 flex-1 overflow-auto">
          {waiting && (
            <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
              <Loader2 className="mr-1.5 size-3 animate-spin" />
              불러오는 중…
            </div>
          )}

          {list.isError && (
            <p className="px-2 py-2 text-sm text-destructive">
              단골을 불러오지 못했습니다.{' '}
              {list.error instanceof ApiError ? list.error.message : ''}
            </p>
          )}

          {settled && list.data && items.length === 0 && (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              {q.trim()
                ? `'${q.trim()}' 에 일치하는 단골이 없습니다`
                : '아직 단골이 없습니다 — 정산을 저장하면 자동으로 적립됩니다'}
            </div>
          )}

          {items.length > 0 && (
            <ul className="space-y-1">
              {items.map((c) => {
                const already = isAlreadyAdded(c);
                const checked = selected.has(c.id);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      disabled={already}
                      onClick={() => !already && toggle(c)}
                      className={
                        'flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors ' +
                        (already
                          ? 'cursor-not-allowed opacity-50'
                          : checked
                            ? 'bg-primary/10'
                            : 'hover:bg-accent')
                      }
                    >
                      <span
                        className={
                          'flex size-5 shrink-0 items-center justify-center rounded border ' +
                          (checked
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-input')
                        }
                      >
                        {checked && <Check className="size-3.5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {displayName(c)}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                          {c.lastExcludeAlcohol && <Tag>술 X</Tag>}
                          {c.lastExcludeNonAlcohol && <Tag>음료 X</Tag>}
                          {c.lastExcludeSide && <Tag>안주 X</Tag>}
                          <Tag>{c.useCount}회</Tag>
                        </div>
                      </div>
                      {already && (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          이미 추가됨
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <span className="text-xs text-muted-foreground">
            {selectedCount > 0 ? `${selectedCount}명 선택됨` : '선택 없음'}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              취소
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirm}
              disabled={selectedCount === 0}
            >
              추가
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

// 서버 normalizeContactKey 와 동일 정의 — 사용자가 자동완성 안 거치고 직접
// 타이핑한 행이 서버 단골과 매칭될 수 있어, 중복 추가 회피 판정에 사용.
const normalizeContactKey = (
  name: string | null,
  nickname: string | null,
): string => {
  const n = (name ?? '').trim().toLowerCase();
  const k = (nickname ?? '').trim().toLowerCase();
  return `${n}|${k}`;
};
