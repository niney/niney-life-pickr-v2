import { useState, type FormEvent } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { ErrorNote } from './parts';
import { SMARTLY_LANGS, useDictionarySearch } from './smartlyApi';

const EXAMPLES = ['비빔밥', '떡볶이', '갈비', '물회', '파스타', '아메리카노'];

// 사전 탭 — 번역 점수의 대부분을 만든 메뉴 사전(약 11.7만 개)을 직접 들여다본다.
export const DictionaryTab = () => {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const search = useDictionarySearch(query);

  const submit = (value: string) => {
    setInput(value);
    setQuery(value.trim());
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    submit(input);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">메뉴 사전 검색</CardTitle>
        <CardDescription>
          배포본에 든 한국어 메뉴명 → 영어·일본어·중국어 간체·번체 대응표입니다. 공백을 무시하고
          부분 일치로 찾고, 완전 일치·앞부분 일치·짧은 이름 순으로 보여 줍니다. 사람이 만든 표라도
          오류가 섞여 있습니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={onSubmit} className="flex gap-2">
          <Input
            aria-label="검색어"
            value={input}
            maxLength={50}
            onChange={(e) => setInput(e.target.value)}
            placeholder="예: 비빔밥"
            className="max-w-xs"
          />
          <Button type="submit" disabled={!input.trim()}>
            <Search />
            찾기
          </Button>
        </form>
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className="rounded-full border px-2.5 py-0.5 text-xs hover:bg-accent"
              onClick={() => submit(ex)}
            >
              {ex}
            </button>
          ))}
        </div>
        {search.isFetching && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> 찾는 중…
          </p>
        )}
        {search.isError && <ErrorNote error={search.error} />}
        {search.data && (
          <>
            <p className="text-xs text-muted-foreground">
              &lsquo;{query}&rsquo; 포함 {search.data.total.toLocaleString('ko-KR')}개
              {search.data.total > search.data.items.length &&
                ` 중 앞 ${search.data.items.length}개`}
            </p>
            {search.data.items.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>한국어</TableHead>
                    {SMARTLY_LANGS.map((l) => (
                      <TableHead key={l.id}>{l.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {search.data.items.map((item) => (
                    <TableRow key={item.ko}>
                      <TableCell className="font-medium">{item.ko}</TableCell>
                      {SMARTLY_LANGS.map((l) => (
                        <TableCell key={l.id} className="whitespace-normal">
                          {item.translations[l.id] ?? '—'}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
