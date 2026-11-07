import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { FoodAdminNutrientRefType, FoodNutrientRefMethodType } from '@repo/api-contract';
import {
  useClearNutrientRef,
  useNutrientRefCandidates,
  useNutrientRefs,
  useRelinkNutrientRefs,
  useSetNutrientRef,
} from '@repo/shared';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';

// 어드민 > 음식 카탈로그 "영양 기준 음식" — 비타민·무기질이 없는 음식 이름(외식 어휘·레시피·카탈로그 밖 식단 이름)을
// 어느 표준 음식의 영양 구성으로 계산하는지 보여 주고 바로잡는다. 영양소 점검은 "먹은 열량 × 기준 음식의 열량당
// 영양소"로 계산한다. 규칙(같은 이름·다른 이름·이름 끝)이 먼저 잇고, 못 이은 이름은 AI 가 후보 중에서 고른다.
// 어드민이 고른 기준(또는 '없음' 고정)은 다시 연결해도 바뀌지 않는다.

const METHOD_LABEL: Record<FoodNutrientRefMethodType, string> = {
  same: '같은 이름',
  borrowed: '빌려온 영양',
  synonym: '다른 이름',
  rule: '이름 규칙',
  llm: 'AI',
  admin: '어드민',
  // 규칙·AI 가 못 찾았다('기준 음식' 칸의 '없음' 배지와 구분).
  none: '못 찾음',
};

const CONFIDENCE_LABEL: Record<string, string> = { high: '높음', medium: '보통', low: '낮음' };

export const NutrientRefSection = () => {
  const refs = useNutrientRefs();
  const setRef = useSetNutrientRef();
  const clearRef = useClearNutrientRef();
  const relink = useRelinkNutrientRefs();
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const data = refs.data;
  const busy = setRef.isPending || clearRef.isPending || relink.isPending;

  const fail = (e: unknown, fallback: string): void => setMessage(e instanceof Error ? e.message : fallback);

  const runRelink = (names?: string[]): void => {
    setMessage(null);
    relink.mutate(names, {
      onSuccess: (res) =>
        setMessage(
          res.scheduled > 0
            ? `${res.scheduled}개 이름을 규칙·AI 로 다시 잇는 중(끝나면 새로 불러오세요)`
            : 'AI 가 설정되지 않았거나 이미 다시 잇는 중이라 보내지 못했습니다',
        ),
      onError: (e) => fail(e, '다시 연결하지 못했습니다'),
    });
  };

  const choose = (name: string, refFoodId: string | null): void => {
    setMessage(null);
    setRef.mutate(
      { name, refFoodId },
      {
        onSuccess: () => setEditing(null),
        onError: (e) => fail(e, '지정하지 못했습니다'),
      },
    );
  };

  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">영양 기준 음식</CardTitle>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => void refs.refetch()} disabled={refs.isFetching}>
              <RefreshCw className="size-4" />
              새로 불러오기
            </Button>
            <Button type="button" size="sm" onClick={() => runRelink()} disabled={busy}>
              식단 이름 다시 연결
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          비타민·무기질이 없는 음식은 여기 이어 둔 표준 음식의 영양 구성으로 영양소 점검을 계산한다(열량은 기록 그대로).
          규칙이 먼저 잇고 못 이은 이름은 AI 가 고른다. 틀린 짝은 바꾸고, 영양을 말하기 어려운 이름(양념·소스)은
          '없음'으로 고정한다. 어드민 지정은 다시 연결해도 유지된다.
          {data ? ` 연결 ${data.linked}개 · 없음 ${data.unlinked}개.` : ''}
        </p>
        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      </CardHeader>
      <CardContent>
        {refs.isLoading ? (
          <p className="text-xs text-muted-foreground">불러오는 중…</p>
        ) : refs.isError ? (
          <p className="text-xs text-destructive">목록을 불러오지 못했습니다.</p>
        ) : !data || data.items.length === 0 ? (
          <p className="text-xs text-muted-foreground">아직 이어 둔 이름이 없습니다. '식단 이름 다시 연결'을 눌러 보세요.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>기준 음식</TableHead>
                <TableHead>방법</TableHead>
                <TableHead className="text-right">기록</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.flatMap((it) => [
                <RefRow
                  key={it.nameNorm}
                  it={it}
                  busy={busy}
                  editing={editing === it.nameNorm}
                  onEdit={() => setEditing(editing === it.nameNorm ? null : it.nameNorm)}
                  onNone={() => choose(it.name, null)}
                  onAdopt={() => it.candidateFoodId && choose(it.name, it.candidateFoodId)}
                  onClear={() => {
                    setMessage(null);
                    clearRef.mutate(it.name, { onError: (e) => fail(e, '해제하지 못했습니다') });
                  }}
                  onAsk={() => runRelink([it.name])}
                />,
                editing === it.nameNorm ? (
                  <TableRow key={`${it.nameNorm}-edit`}>
                    <TableCell colSpan={5}>
                      <CandidatePicker name={it.name} disabled={busy} onPick={(id) => choose(it.name, id)} />
                    </TableCell>
                  </TableRow>
                ) : null,
              ])}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

const RefRow = ({
  it,
  busy,
  editing,
  onEdit,
  onNone,
  onAdopt,
  onClear,
  onAsk,
}: {
  it: FoodAdminNutrientRefType;
  busy: boolean;
  editing: boolean;
  onEdit: () => void;
  onNone: () => void;
  onAdopt: () => void;
  onClear: () => void;
  onAsk: () => void;
}) => (
  <TableRow>
    <TableCell className="font-medium">{it.name}</TableCell>
    <TableCell className="max-w-xs">
      {it.refFoodName ? (
        <span>{it.refFoodName}</span>
      ) : (
        <Badge variant="amber">없음</Badge>
      )}
      {it.reason ? <span className="ml-2 text-xs text-muted-foreground">{it.reason}</span> : null}
      {/* AI 가 골랐지만 확신이 높지 않아 채택하지 않은 후보 — 맞으면 한 번에 지정한다. */}
      {!it.refFoodId && it.candidateFoodId && it.candidateFoodName ? (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            AI 후보: {it.candidateFoodName}
            {it.confidence ? ` (확신 ${CONFIDENCE_LABEL[it.confidence] ?? it.confidence})` : ''}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            disabled={busy}
            onClick={onAdopt}
            aria-label={`${it.name} 기준을 ${it.candidateFoodName}(으)로`}
          >
            이걸로
          </Button>
        </div>
      ) : null}
    </TableCell>
    <TableCell className="text-xs text-muted-foreground">{METHOD_LABEL[it.method]}</TableCell>
    <TableCell className="text-right tabular-nums">{it.itemCount}</TableCell>
    <TableCell>
      <div className="flex justify-end gap-1">
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={busy} onClick={onEdit} aria-label={`${it.name} 기준 바꾸기`}>
          {editing ? '닫기' : '바꾸기'}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={busy} onClick={onNone} aria-label={`${it.name} 없음으로`}>
          없음으로
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={busy} onClick={onAsk} aria-label={`${it.name} 다시 묻기`}>
          다시 묻기
        </Button>
        {it.method === 'admin' ? (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={busy} onClick={onClear} aria-label={`${it.name} 지정 해제`}>
            해제
          </Button>
        ) : null}
      </div>
    </TableCell>
  </TableRow>
);

const CandidatePicker = ({ name, disabled, onPick }: { name: string; disabled: boolean; onPick: (id: string) => void }) => {
  const [q, setQ] = useState(name);
  const candidates = useNutrientRefCandidates(q);
  const items = candidates.data?.items ?? [];
  return (
    <div className="space-y-2">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="기준으로 쓸 음식 이름(두 글자 이상)"
        aria-label={`${name} 기준 음식 검색`}
        className="h-8 max-w-sm text-sm"
      />
      {q.trim().length < 2 ? null : candidates.isLoading ? (
        <p className="text-xs text-muted-foreground">찾는 중…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">기준이 될 수 있는 음식이 없습니다(비타민·무기질이 있는 음식만 고를 수 있어요).</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {items.map((c) => (
            <Button key={c.id} type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={disabled} onClick={() => onPick(c.id)}>
              {c.name}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
};
