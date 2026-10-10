import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, CircleDashed, Loader2, RefreshCw, ScanText, ServerOff } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { cn } from '~/lib/utils';
import { DictionaryTab } from '~/components/admin/smartly/DictionaryTab';
import { EvaluateTab } from '~/components/admin/smartly/EvaluateTab';
import { OcrTab } from '~/components/admin/smartly/OcrTab';
import { PhotoTab } from '~/components/admin/smartly/PhotoTab';
import { TranslateTab } from '~/components/admin/smartly/TranslateTab';
import { useSmartlyHealth, type SmartlyHealth } from '~/components/admin/smartly/smartlyApi';

// 메뉴판 AI 테스트 — AI 허브 관광 음식메뉴판(71553) 모델(메뉴명 OCR·4개 언어 번역)을 apps/smartly(Python)로
// 돌려 보는 로컬 임시 체험장. Vite 개발 프록시로만 닿아 운영에서는 '연결 안 됨' 안내만 보인다.

type Tab = 'ocr' | 'translate' | 'photo' | 'dictionary' | 'evaluate';

const TABS: { id: Tab; label: string }[] = [
  { id: 'ocr', label: '인식' },
  { id: 'translate', label: '번역' },
  { id: 'photo', label: '사진 → 번역' },
  { id: 'dictionary', label: '사전' },
  { id: 'evaluate', label: '정확도' },
];

const parseTab = (v: string | null): Tab => TABS.find((t) => t.id === v)?.id ?? 'ocr';

const SETUP_COMMANDS = `pnpm --filter smartly setup   # 처음 한 번 — 배포본에서 모델·데이터 추출(약 6GB)
pnpm dev:smartly              # 127.0.0.1:8700`;

export const AdminSmartlyTestPage = () => {
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get('tab'));
  const health = useSmartlyHealth();

  const changeTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    if (next === 'ocr') p.delete('tab');
    else p.set('tab', next);
    setParams(p, { replace: true });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ScanText className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">메뉴판 AI 테스트</h1>
          <p className="text-sm text-muted-foreground">
            AI 허브 관광 음식메뉴판 데이터의 메뉴명 인식(OCR)·4개 언어 번역 모델을 돌려 봅니다. 로컬
            전용.
          </p>
        </div>
      </header>

      {health.isPending && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> smartly 서버 확인 중…
        </p>
      )}
      {health.isError && (
        <ServerDown onRetry={() => void health.refetch()} retrying={health.isFetching} />
      )}
      {health.data && (
        <>
          <ServerStatus health={health.data} />
          <div
            role="tablist"
            aria-label="메뉴판 AI 기능"
            className="mb-6 flex flex-wrap gap-1 border-b"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => changeTab(t.id)}
                className={cn(
                  '-mb-px border-b-2 px-3 py-2 text-sm',
                  tab === t.id
                    ? 'border-primary font-semibold text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'ocr' && <OcrTab />}
          {tab === 'translate' && <TranslateTab />}
          {tab === 'photo' && <PhotoTab />}
          {tab === 'dictionary' && <DictionaryTab />}
          {tab === 'evaluate' && <EvaluateTab />}
        </>
      )}
    </div>
  );
};

const ServerDown = ({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) => (
  <Card>
    <CardContent className="space-y-3 py-6 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <ServerOff className="size-4 text-destructive" /> smartly 서버에 연결할 수 없습니다
      </p>
      <p className="text-muted-foreground">
        로컬 개발 서버(<code>pnpm dev:web</code>)에서만 쓰는 페이지입니다. 처음이면 모델·데이터를
        꺼낸 뒤 서버를 띄우세요.
      </p>
      <pre className="rounded-md bg-muted/40 p-3 text-xs">{SETUP_COMMANDS}</pre>
      <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
        {retrying ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        다시 확인
      </Button>
    </CardContent>
  </Card>
);

const StatusItem = ({
  label,
  available,
  loaded,
}: {
  label: string;
  available: boolean;
  loaded: boolean;
}) => (
  <Badge variant={!available ? 'red' : loaded ? 'green' : 'secondary'} className="gap-1">
    {loaded ? <CheckCircle2 className="size-3" /> : <CircleDashed className="size-3" />}
    {label}
    <span className="font-normal opacity-80">
      {!available ? '파일 없음' : loaded ? '올라감' : '대기'}
    </span>
  </Badge>
);

const ServerStatus = ({ health }: { health: SmartlyHealth }) => {
  const missing =
    !health.ocr.available ||
    !health.dictionary.available ||
    !health.ocrSamples ||
    health.translationModels.some((m) => !m.available);
  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">
          장치 {health.device}
          {health.deviceName && ` · ${health.deviceName}`}
        </Badge>
        <StatusItem label="OCR" available={health.ocr.available} loaded={health.ocr.loaded} />
        <StatusItem
          label={`사전${health.dictionary.size ? ` ${health.dictionary.size.toLocaleString('ko-KR')}개` : ''}`}
          available={health.dictionary.available}
          loaded={health.dictionary.loaded}
        />
        {health.translationModels.map((m) => (
          <StatusItem
            key={m.file}
            label={`번역 ${m.langs.join('·')}`}
            available={m.available}
            loaded={m.loaded}
          />
        ))}
      </div>
      {missing && (
        <p className="text-xs text-destructive">
          빠진 파일이 있습니다 — <code>pnpm --filter smartly setup</code> 으로 배포본에서 다시
          꺼내세요.
        </p>
      )}
    </div>
  );
};
