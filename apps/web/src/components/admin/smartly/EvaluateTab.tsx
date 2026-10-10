import { useState } from 'react';
import { Gauge, Loader2 } from 'lucide-react';
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
import { cn } from '~/lib/utils';
import { decimal, DOCUMENTED, percent, randomSeed, SELECT_CLASS } from './format';
import { Confidence, ErrorNote, Field, Segmented, SourceBadge, Stat } from './parts';
import {
  ocrSampleImageUrl,
  SMARTLY_LANGS,
  useEvaluateOcr,
  useEvaluateTranslation,
  type SmartlyLang,
  type TranslationSource,
} from './smartlyApi';

const ROW_LIMIT = 100;

// 정확도 탭 — 원본 채점식(get_cer.py·get_bleu.py)으로 표본을 다시 매겨 문서 수치와 비교한다.
export const EvaluateTab = () => (
  <div className="space-y-6">
    <OcrEvaluation />
    <TranslationEvaluation />
  </div>
);

const SeedInput = ({ seed, onChange }: { seed: number; onChange: (v: number) => void }) => (
  <Field label="seed (같으면 같은 표본)">
    <div className="flex gap-1">
      <Input
        type="number"
        className="w-28"
        value={seed}
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9"
        onClick={() => onChange(randomSeed())}
      >
        무작위
      </Button>
    </div>
  </Field>
);

const OcrEvaluation = () => {
  const [count, setCount] = useState(1000);
  const [seed, setSeed] = useState(1);
  const [wrongOnly, setWrongOnly] = useState(true);
  const evaluate = useEvaluateOcr();
  const data = evaluate.data;
  const rows = data
    ? [...data.items].filter((i) => !wrongOnly || i.gt !== i.text).sort((a, b) => b.cer - a.cer)
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">인식(OCR) — 문자 오류율 CER</CardTitle>
        <CardDescription>
          테스트 이미지를 무작위로 골라 인식하고 정답과 글자 단위로 비교합니다. 문서 수치는 테스트셋
          전체 기준 CER {percent(DOCUMENTED.cer)}. CPU 에서 1,000장에 15초 안팎 걸립니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="표본 수">
            <select
              className={SELECT_CLASS}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            >
              {[100, 500, 1000, 3000, 5000].map((n) => (
                <option key={n} value={n}>
                  {n.toLocaleString('ko-KR')}장
                </option>
              ))}
            </select>
          </Field>
          <SeedInput seed={seed} onChange={setSeed} />
          <Button disabled={evaluate.isPending} onClick={() => evaluate.mutate({ count, seed })}>
            {evaluate.isPending ? <Loader2 className="animate-spin" /> : <Gauge />}
            측정
          </Button>
        </div>
        {evaluate.isError && <ErrorNote error={evaluate.error} />}
        {data && (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Stat
                label="평균 CER"
                value={percent(data.meanCer, 2)}
                hint={`문서 ${percent(DOCUMENTED.cer)}`}
              />
              <Stat label="완전 일치" value={percent(data.exactRate)} />
              <Stat
                label="표본"
                value={`${data.count.toLocaleString('ko-KR')}장`}
                hint={`전체 ${data.total.toLocaleString('ko-KR')}장`}
              />
              <Stat
                label="걸린 시간"
                value={`${data.seconds.toFixed(1)}초`}
                hint={`장당 ${((data.seconds / data.count) * 1000).toFixed(1)}ms`}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={wrongOnly}
                onChange={(e) => setWrongOnly(e.target.checked)}
              />
              틀린 것만 ({data.items.filter((i) => i.gt !== i.text).length}건) · 오류율 높은 순
            </label>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-48">이미지</TableHead>
                  <TableHead>정답</TableHead>
                  <TableHead>인식</TableHead>
                  <TableHead className="text-right">CER</TableHead>
                  <TableHead className="text-right">확신</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, ROW_LIMIT).map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <img
                        src={ocrSampleImageUrl(item.id)}
                        alt={`테스트 이미지 ${item.id}`}
                        className="h-8 w-44 object-contain"
                        loading="lazy"
                      />
                    </TableCell>
                    <TableCell className="whitespace-normal">{item.gt}</TableCell>
                    <TableCell
                      className={cn(
                        'whitespace-normal',
                        item.gt !== item.text && 'text-destructive',
                      )}
                    >
                      {item.text || '(빈 결과)'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {percent(item.cer, 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Confidence value={item.confidence} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length > ROW_LIMIT && (
              <p className="text-xs text-muted-foreground">
                {rows.length.toLocaleString('ko-KR')}건 중 앞 {ROW_LIMIT}건만 표시
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

type SourceFilter = 'all' | Exclude<TranslationSource, 'none'>;

const SOURCE_FILTERS: { id: SourceFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'dictionary', label: '사전에서' },
  { id: 'model', label: '모델이 번역' },
];

const TranslationEvaluation = () => {
  const [lang, setLang] = useState<SmartlyLang>('en');
  const [count, setCount] = useState(300);
  const [seed, setSeed] = useState(1);
  const [filter, setFilter] = useState<SourceFilter>('model');
  const evaluate = useEvaluateTranslation();
  const data = evaluate.data;
  const rows = data ? data.items.filter((i) => filter === 'all' || i.source === filter) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">번역 — 글자 단위 BLEU</CardTitle>
        <CardDescription>
          테스트셋 메뉴명을 원본 흐름(사전 → 모델)으로 번역해 정답과 비교합니다. 원본 채점은
          문자열을 그대로 넘겨 글자 단위로 매긴 BLEU 이고, 사전에서 온 몫과 모델이 번역한 몫을 나눠
          보여 줍니다. 처음 쓰는 언어는 모델을 올리느라 몇 초 더 걸립니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="언어">
            <select
              className={SELECT_CLASS}
              value={lang}
              onChange={(e) => setLang(e.target.value as SmartlyLang)}
            >
              {SMARTLY_LANGS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="표본 수">
            <select
              className={SELECT_CLASS}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            >
              {[100, 300, 500, 1000].map((n) => (
                <option key={n} value={n}>
                  {n.toLocaleString('ko-KR')}건
                </option>
              ))}
            </select>
          </Field>
          <SeedInput seed={seed} onChange={setSeed} />
          <Button
            disabled={evaluate.isPending}
            onClick={() => evaluate.mutate({ lang, count, seed })}
          >
            {evaluate.isPending ? <Loader2 className="animate-spin" /> : <Gauge />}
            측정
          </Button>
        </div>
        {evaluate.isError && <ErrorNote error={evaluate.error} />}
        {data && (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              <Stat
                label="전체 BLEU"
                value={decimal(data.meanBleu)}
                hint={`문서 ${DOCUMENTED.bleu[data.lang]}`}
              />
              <Stat label="사전에서 찾은 비율" value={percent(data.dictionaryRate)} />
              <Stat label="사전 몫 BLEU" value={decimal(data.dictionaryBleu)} />
              <Stat label="모델 몫 BLEU" value={decimal(data.modelBleu)} hint="사전에 없는 메뉴" />
              <Stat label="걸린 시간" value={`${data.seconds.toFixed(1)}초`} />
            </div>
            <Segmented
              label="출처 필터"
              value={filter}
              options={SOURCE_FILTERS}
              onChange={setFilter}
            />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>한국어</TableHead>
                  <TableHead>정답</TableHead>
                  <TableHead>결과</TableHead>
                  <TableHead>출처</TableHead>
                  <TableHead className="text-right">BLEU</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, ROW_LIMIT).map((item, i) => (
                  <TableRow key={`${item.ko}-${i}`}>
                    <TableCell className="whitespace-normal font-medium">{item.ko}</TableCell>
                    <TableCell className="whitespace-normal">{item.reference}</TableCell>
                    <TableCell className="whitespace-normal">{item.text ?? '—'}</TableCell>
                    <TableCell>
                      <SourceBadge source={item.source} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {decimal(item.bleu, 2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length > ROW_LIMIT && (
              <p className="text-xs text-muted-foreground">
                {rows.length.toLocaleString('ko-KR')}건 중 앞 {ROW_LIMIT}건만 표시
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
