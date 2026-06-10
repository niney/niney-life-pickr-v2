import { useState, type FormEvent } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import type { AutoDiscoverJobInputType } from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { cn } from '~/lib/utils';

// 자동 발견 잡 입력 폼. 키워드 한 줄 + 카테고리 칩 다중 선택 + targetCount.
// 잡 1개만 진행 가능 — 진행 중이면 "시작" 비활성, isJobRunning prop 으로 전달.
// 시작하면 검색까지만 진행되고, 등록은 후보 리스트 확인 후 "등록 시작"으로 개시.

const CATEGORY_PRESETS = [
  '한식',
  '중식',
  '일식',
  '양식',
  '분식',
  '치킨',
  '카페',
  '술집',
  '디저트',
  '아시안',
];

const DEFAULT_TARGET = 10;

interface Props {
  isJobRunning: boolean;
  isStarting: boolean;
  onStart: (input: AutoDiscoverJobInputType) => void;
}

export const AutoDiscoverForm = ({
  isJobRunning,
  isStarting,
  onStart,
}: Props) => {
  const [q, setQ] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [targetCount, setTargetCount] = useState<number>(DEFAULT_TARGET);

  const toggleCategory = (c: string) => {
    setCategories((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  };

  const disabled = isJobRunning || isStarting;
  const canSubmit = q.trim().length > 0 && targetCount > 0 && !disabled;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) return;
    onStart({ q: trimmed, categories, targetCount });
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" />
          자동 발견 시작
        </CardTitle>
        <CardDescription className="text-xs">
          영역/지명 한 줄과 카테고리(선택) 를 입력하면 AI 가 검색어 8 개를 만들어
          네이버 지도를 검색하고, 중복 제거한 후보 리스트를 보여줍니다. 리스트
          확인 후 등록 시작을 누르면 한 곳씩 순차로 크롤·등록합니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              기본 키워드
            </label>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="예: 강남역, 압구정 파스타"
              disabled={disabled}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              카테고리 (선택)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_PRESETS.map((c) => {
                const selected = categories.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleCategory(c)}
                    disabled={disabled}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                      disabled && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
            {categories.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                선택: {categories.join(' · ')}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                목표 등록 수
              </label>
              <Badge variant="outline" className="font-normal">
                {targetCount} 개
              </Badge>
            </div>
            <input
              type="range"
              min={1}
              max={50}
              value={targetCount}
              onChange={(e) => setTargetCount(Number(e.target.value))}
              disabled={disabled}
              className="w-full"
            />
            <p className="text-[11px] text-muted-foreground">
              새로 등록한 가게 수가 이 값에 도달하면 잔여 후보는 건너뜁니다.
            </p>
          </div>

          <Button
            type="submit"
            size="sm"
            disabled={!canSubmit}
            className="gap-1.5"
          >
            {isStarting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {isJobRunning ? '진행 중' : '자동 발견 시작'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
