import { useState, type FormEvent } from 'react';
import { Languages, Loader2 } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { SELECT_CLASS } from './format';
import { ErrorNote, Field, Segmented, SourceBadge } from './parts';
import {
  SMARTLY_LANGS,
  useSmartlyTranslate,
  type SmartlyLang,
  type TranslateLangResult,
  type TranslateMode,
} from './smartlyApi';

// 사전에 있는 것·없는 것을 섞은 예시 — 없는 것은 모델 실력이 그대로 드러난다.
const EXAMPLES = [
  '김치찌개',
  '떡산적 스테이크',
  '고추장 닭고기 덮밥',
  '새우바질파스타',
  '갈비맛 목살 덮밥',
  '흑염소전골',
];

const MODES: { id: TranslateMode; label: string; hint: string }[] = [
  { id: 'auto', label: '원본 흐름', hint: '사전에 있으면 사전, 없으면 모델(배포본 그대로)' },
  { id: 'model', label: '모델만', hint: '사전을 무시하고 번역 모델만 — 모델 자체 실력' },
  { id: 'compare', label: '나란히 비교', hint: '사전 결과와 모델 결과를 둘 다 보여 준다' },
];

const LANG_LABEL = Object.fromEntries(SMARTLY_LANGS.map((l) => [l.id, l.label])) as Record<
  SmartlyLang,
  string
>;

export const TranslateTab = () => {
  const [text, setText] = useState('');
  const [langs, setLangs] = useState<SmartlyLang[]>(SMARTLY_LANGS.map((l) => l.id));
  const [mode, setMode] = useState<TranslateMode>('compare');
  const [beamSize, setBeamSize] = useState(5);
  const [nBest, setNBest] = useState(3);
  const [replaceUnk, setReplaceUnk] = useState(false);
  const translate = useSmartlyTranslate();

  const run = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || langs.length === 0) return;
    translate.mutate({
      text: trimmed,
      langs,
      mode,
      beamSize,
      nBest: Math.min(nBest, beamSize),
      replaceUnk,
    });
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    run(text);
  };

  const toggleLang = (id: SmartlyLang, on: boolean) =>
    setLangs((prev) =>
      on
        ? SMARTLY_LANGS.map((l) => l.id).filter((l) => l === id || prev.includes(l))
        : prev.filter((l) => l !== id),
    );

  const data = translate.data;

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">입력</CardTitle>
          <CardDescription>
            한국어 메뉴명을 넣으면 메뉴 사전(약 11.7만 개)에서 먼저 찾고, 없으면 번역 모델이
            번역합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="메뉴명">
              <Input
                value={text}
                maxLength={200}
                onChange={(e) => setText(e.target.value)}
                placeholder="예: 김치찌개"
              />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className="rounded-full border px-2.5 py-0.5 text-xs hover:bg-accent"
                  onClick={() => {
                    setText(ex);
                    run(ex);
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>
            <Field label="방식">
              <Segmented label="번역 방식" value={mode} options={MODES} onChange={setMode} />
            </Field>
            <Field label="언어">
              <div className="flex flex-wrap gap-3 text-sm text-foreground">
                {SMARTLY_LANGS.map((l) => (
                  <label key={l.id} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={langs.includes(l.id)}
                      onChange={(e) => toggleLang(l.id, e.target.checked)}
                    />
                    {l.label}
                  </label>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="빔 크기">
                <select
                  className={SELECT_CLASS}
                  value={beamSize}
                  onChange={(e) => setBeamSize(Number(e.target.value))}
                >
                  {[1, 2, 3, 5, 8, 10].map((n) => (
                    <option key={n} value={n}>
                      {n === 1 ? '1 (탐욕)' : n}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="모델 후보 수">
                <select
                  className={SELECT_CLASS}
                  value={nBest}
                  onChange={(e) => setNBest(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n} disabled={n > beamSize}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={replaceUnk}
                onChange={(e) => setReplaceUnk(e.target.checked)}
              />
              <span>
                <code className="text-xs">&lt;unk&gt;</code> 를 원문 단어로 바꾸기
                <span className="block text-xs text-muted-foreground">
                  모르는 단어 자리에 주의를 가장 많이 둔 한국어 토큰을 넣는다
                </span>
              </span>
            </label>
            <Button
              type="submit"
              className="w-full"
              disabled={translate.isPending || !text.trim() || langs.length === 0}
            >
              {translate.isPending ? <Loader2 className="animate-spin" /> : <Languages />}
              번역
            </Button>
            {translate.isPending && (
              <p className="text-xs text-muted-foreground">
                처음 쓰는 언어는 모델(약 1GB)을 올리느라 몇 초 걸립니다.
              </p>
            )}
            {translate.isError && <ErrorNote error={translate.error} />}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">결과</CardTitle>
          {data && (
            <CardDescription>
              {data.dictionaryKo ? (
                <>
                  사전 항목 <strong>{data.dictionaryKo}</strong> 과 일치(공백 무시)
                </>
              ) : (
                '사전에 없는 메뉴 — 모델이 번역했습니다'
              )}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {!data && !translate.isPending && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              메뉴명을 넣거나 예시를 눌러 보세요.
            </p>
          )}
          {data && (
            <ul className="divide-y">
              {data.results.map((r) => (
                <ResultRow key={r.lang} result={r} label={LANG_LABEL[r.lang]} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const ResultRow = ({ result, label }: { result: TranslateLangResult; label: string }) => (
  <li className="space-y-2 py-3 first:pt-0 last:pb-0">
    <div className="flex items-start gap-2">
      <span className="w-20 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <p className="min-w-0 flex-1 break-words text-base font-medium">{result.text ?? '—'}</p>
      <SourceBadge source={result.source} />
    </div>
    {(result.dictionary || result.candidates.length > 0) && (
      <div className="ml-22 space-y-1 text-sm">
        {result.dictionary && result.candidates.length > 0 && (
          <p>
            <span className="mr-2 text-xs text-muted-foreground">사전</span>
            {result.dictionary}
          </p>
        )}
        {result.candidates.map((c, i) => (
          <div key={i} className="rounded-md bg-muted/30 px-2 py-1">
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-muted-foreground">모델 {i + 1}</span>
              <span className="min-w-0 flex-1 break-words">{c.text || '(빈 결과)'}</span>
              <span
                className="shrink-0 text-xs tabular-nums text-muted-foreground"
                title="로그 확률 합 — 0 에 가까울수록 확신"
              >
                {c.score.toFixed(2)}
              </span>
            </div>
            {c.raw !== c.text && (
              <p
                className="mt-0.5 line-clamp-2 break-all font-mono text-[11px] text-muted-foreground"
                title={c.raw}
              >
                원출력 {c.raw}
              </p>
            )}
          </div>
        ))}
      </div>
    )}
  </li>
);
