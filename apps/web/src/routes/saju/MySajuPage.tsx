import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, MessageCircleQuestion, Sparkles, Star, Trash2 } from 'lucide-react';
import type { SajuProfileType, SajuReadingSummaryType } from '@repo/api-contract';
import { useDeleteSajuProfile, useDeleteSajuReading, useMySajuReadingsInfinite, useSajuProfiles, useUpsertSajuProfile } from '@repo/shared';
import { Button } from '~/components/ui/button';

// 내 사주 — 회원 프로필(나·가족, primary 별) + 자동 저장된 풀이 목록(최신순, 커서 더 보기). 항목 → 상세.
// 삭제는 두 번 클릭(확인).

const fmtDate = (iso: string): string => new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
const fmtBirth = (p: SajuProfileType): string =>
  `${p.birth.calendar === 'lunar' ? '음력 ' : ''}${p.birth.year}.${p.birth.month}.${p.birth.day}${p.birth.leapMonth ? '(윤)' : ''}${p.birth.hour === null ? ' 시간 모름' : ` ${String(p.birth.hour).padStart(2, '0')}:${String(p.birth.minute ?? 0).padStart(2, '0')}`} · ${p.birth.gender === 'M' ? '남' : '여'}`;

export const MySajuPage = () => {
  const profiles = useSajuProfiles();
  const query = useMySajuReadingsInfinite(20);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  // 사주에 묻기(9차) — 답까지 목록에서 바로 본다.
  const asked = useMySajuReadingsInfinite(20, 'question');
  const askedItems = asked.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">내 사주(C)</h1>
          <p className="text-sm text-muted-foreground">프로필과 로그인 상태로 본 풀이가 저장돼요.</p>
        </div>
        <Button asChild size="sm" className="ml-auto">
          <Link to="/saju-c">
            <Sparkles className="size-4" /> 사주 보기
          </Link>
        </Button>
      </header>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">프로필</h2>
        {profiles.isLoading ? (
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        ) : (profiles.data?.items.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">저장된 프로필이 없어요. 사주 화면에서 "이 계정에 저장" 을 켜면 여기 남아요.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {profiles.data!.items.map((p) => (
              <li key={p.id}>
                <ProfileRow profile={p} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {askedItems.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <MessageCircleQuestion className="size-4" /> 물어본 것
          </h2>
          <ul className="flex flex-col gap-2" data-testid="saju-asked-list">
            {askedItems.map((item) => (
              <li key={item.id}>
                <AskedRow item={item} />
              </li>
            ))}
          </ul>
          {asked.hasNextPage && (
            <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => void asked.fetchNextPage()} disabled={asked.isFetchingNextPage}>
              더 보기
            </Button>
          )}
        </section>
      )}

      <h2 className="mb-2 text-sm font-semibold text-muted-foreground">풀이 기록</h2>
      {query.isLoading ? (
        <p className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 불러오는 중…
        </p>
      ) : query.isError ? (
        <p className="py-12 text-center text-sm text-destructive">기록을 불러오지 못했습니다.</p>
      ) : items.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">아직 저장된 풀이가 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <ReadingRow item={item} />
            </li>
          ))}
        </ul>
      )}
      {query.hasNextPage && (
        <div className="mt-4 text-center">
          <Button type="button" variant="outline" size="sm" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? <Loader2 className="size-4 animate-spin" /> : null} 더 보기
          </Button>
        </div>
      )}
    </div>
  );
};

const ProfileRow = ({ profile }: { profile: SajuProfileType }) => {
  const del = useDeleteSajuProfile();
  const upsert = useUpsertSajuProfile();
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
      <button
        type="button"
        aria-label={profile.isPrimary ? '내 사주' : '내 사주로 지정'}
        disabled={profile.isPrimary || upsert.isPending}
        onClick={() => upsert.mutate({ id: profile.id, input: { label: profile.label, birth: profile.birth, isPrimary: true } })}
        className="rounded p-1"
      >
        <Star className={profile.isPrimary ? 'size-4 fill-[#d9b65b] text-[#d9b65b]' : 'size-4 text-muted-foreground'} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{profile.label}</div>
        <div className="text-xs text-muted-foreground">{fmtBirth(profile)}</div>
      </div>
      {confirming ? (
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="destructive" onClick={() => del.mutate(profile.id)} disabled={del.isPending}>
            삭제
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            취소
          </Button>
        </div>
      ) : (
        <button type="button" aria-label="프로필 삭제" onClick={() => setConfirming(true)} className="rounded p-1 text-muted-foreground hover:text-destructive">
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  );
};

const AskedRow = ({ item }: { item: SajuReadingSummaryType }) => {
  const del = useDeleteSajuReading();
  const [open, setOpen] = useState(false);
  const a = item.ask;
  if (!a) return null;
  return (
    <div className="rounded-xl border bg-card p-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-3 text-left">
        <span className="rounded-full border px-2 py-px text-[11px] text-muted-foreground">{a.topicKo}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-medium">{a.question || `${a.topicKo} — ${a.whenKo}`}</span>
            <span className="text-xs text-muted-foreground">{a.whenKo} · {a.verdictKo}</span>
          </div>
          <div className={open ? 'mt-1 text-sm leading-relaxed' : 'mt-1 truncate text-xs text-muted-foreground'}>{a.answer}</div>
          <div className="mt-1 text-xs text-muted-foreground">{fmtDate(item.createdAt)}</div>
        </div>
      </button>
      {open && (
        <div className="mt-2 flex justify-end">
          <Button type="button" size="sm" variant="ghost" onClick={() => del.mutate(item.id)} disabled={del.isPending} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="size-4" /> 삭제
          </Button>
        </div>
      )}
    </div>
  );
};

const ReadingRow = ({ item }: { item: SajuReadingSummaryType }) => {
  const del = useDeleteSajuReading();
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3 transition hover:bg-muted/40">
      <Link to={`/me/saju-c/${item.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span className="font-serif-kr text-2xl">{item.dayMaster.slice(-1)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-serif-kr text-base font-bold">{item.keyword || item.dayMaster}</span>
            <span className="text-xs text-muted-foreground">
              {item.signature}
              {item.source === 'static' ? ' · 기본 풀이' : ''}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">{fmtDate(item.createdAt)}</div>
        </div>
      </Link>
      {confirming ? (
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="destructive" onClick={() => del.mutate(item.id)} disabled={del.isPending}>
            삭제
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            취소
          </Button>
        </div>
      ) : (
        <button type="button" aria-label="기록 삭제" onClick={() => setConfirming(true)} className="rounded p-1 text-muted-foreground hover:text-destructive">
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  );
};
