import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { SettlementContactType } from '@repo/api-contract';
import { useSettlementContacts } from '@repo/shared';

interface Props {
  // 현재 행에서 사용자가 입력 중인 이름. 닉네임도 같이 검색되지만 표시 위치는
  // 이름 input 아래라 prop 이름은 query 로 일반화.
  query: string;
  // 드롭다운 노출 여부. 부모(Step1) 가 focused row 기준으로 토글한다.
  open: boolean;
  onPick(contact: SettlementContactType): void;
}

// 정산 입력 단계의 자동완성 드롭다운. 250ms 디바운스 후 GET /me/contacts?q=
// 호출. 빈 검색어로 focus 하면 최근 사용 순으로 단골이 나열되어, 새 정산을
// 만들 때 자주 쓰는 참여자를 한 번에 채울 수 있다.
//
// 위치/배경은 호출 측이 relative wrapper 로 감싸 absolute 가 input 바로 아래
// 정렬되도록 한다. 외부 닫기 처리는 부모(Step1) 가 맡는다.
export const ContactSuggestions = ({ query, open, onPick }: Props) => {
  const debounced = useDebounced(query.trim(), 250);
  const list = useSettlementContacts({
    q: debounced || undefined,
    take: 6,
  });

  if (!open) return null;

  const items = list.data?.items ?? [];

  return (
    <div
      role="listbox"
      className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-md border bg-popover p-1 shadow-md"
    >
      {list.isLoading ? (
        <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          단골 찾는 중…
        </div>
      ) : items.length === 0 ? (
        <div className="px-2 py-2 text-xs text-muted-foreground">
          {debounced
            ? `"${debounced}" 에 일치하는 단골이 없습니다`
            : '아직 단골이 없습니다 — 정산을 저장하면 자동으로 적립됩니다'}
        </div>
      ) : (
        items.map((c) => (
          <button
            key={c.id}
            type="button"
            role="option"
            // 부모 input 의 blur 보다 mousedown 이 먼저 발동 — blur 가 드롭다운을
            // 닫아 onClick 가 도달 안 하는 흔한 사고를 피한다.
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(c);
            }}
            className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left hover:bg-accent"
          >
            <div className="min-w-0">
              <div className="truncate text-sm">
                {displayName(c)}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                {c.lastExcludeAlcohol && <Tag>주류 X</Tag>}
                {c.lastExcludeNonAlcohol && <Tag>비주류 X</Tag>}
                {c.lastExcludeSide && <Tag>안주 X</Tag>}
                {!c.lastExcludeAlcohol &&
                  !c.lastExcludeNonAlcohol &&
                  !c.lastExcludeSide && <Tag>기본</Tag>}
              </div>
            </div>
            {c.useCount > 1 && (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {c.useCount}회
              </span>
            )}
          </button>
        ))
      )}
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

// 외부 시스템(서버 검색 요청)을 keystroke 마다 두드리지 않도록 입력값을 N ms
// 지난 뒤의 안정 값으로 늦춰 반환. setTimeout 정리가 필요해 useEffect 사용.
const useDebounced = <T,>(value: T, delay: number): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return debounced;
};
