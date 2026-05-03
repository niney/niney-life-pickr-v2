import { useState, type FormEvent } from 'react';
import { Link as LinkIcon, Plus, Trash2, UtensilsCrossed } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';

const NAVER_PLACE_HOSTS = ['naver.com', 'naver.me'];

const isValidNaverPlaceUrl = (raw: string): boolean => {
  try {
    const url = new URL(raw.trim());
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    return NAVER_PLACE_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
};

interface PendingPlace {
  id: string;
  url: string;
  addedAt: string;
}

export const AdminRestaurantsPage = () => {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PendingPlace[]>([]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setError('URL을 입력해 주세요.');
      return;
    }
    if (!isValidNaverPlaceUrl(trimmed)) {
      setError('네이버 플레이스 URL 형식이 아닙니다 (naver.com / naver.me).');
      return;
    }
    if (items.some((it) => it.url === trimmed)) {
      setError('이미 추가된 URL입니다.');
      return;
    }
    setItems((prev) => [
      { id: crypto.randomUUID(), url: trimmed, addedAt: new Date().toISOString() },
      ...prev,
    ]);
    setUrl('');
    setError(null);
  };

  const handleRemove = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <UtensilsCrossed className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">맛집</h1>
          <p className="text-sm text-muted-foreground">네이버 플레이스 URL로 맛집을 등록합니다.</p>
        </div>
      </header>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>URL 추가</CardTitle>
          <CardDescription>
            네이버 지도에서 가게 페이지를 열고 공유 URL을 붙여넣으세요. (예: <code>https://map.naver.com/...</code> 또는 <code>https://naver.me/abc</code>)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex-1">
              <div className="relative">
                <LinkIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="url"
                  inputMode="url"
                  placeholder="https://naver.me/..."
                  className="pl-9"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (error) setError(null);
                  }}
                  aria-invalid={!!error || undefined}
                />
              </div>
              {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
            </div>
            <Button type="submit" disabled={!url.trim()}>
              <Plus />
              추가
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>등록 대기 ({items.length})</CardTitle>
          <CardDescription>현재 화면 세션에만 보관됩니다. 백엔드 저장은 다음 단계에서 연결됩니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              아직 추가된 URL이 없습니다.
            </div>
          ) : (
            <ul className="divide-y rounded-md border">
              {items.map((it) => (
                <li key={it.id} className="flex items-center gap-3 px-4 py-3">
                  <LinkIcon className="size-4 shrink-0 text-muted-foreground" />
                  <a
                    href={it.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex-1 truncate text-sm hover:underline"
                  >
                    {it.url}
                  </a>
                  <span className="text-xs text-muted-foreground">
                    {new Date(it.addedAt).toLocaleTimeString('ko-KR')}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="삭제"
                    onClick={() => handleRemove(it.id)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
