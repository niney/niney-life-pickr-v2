import { useState } from 'react';
import {
  ArrowLeft,
  AlertCircle,
  Clock,
  Code2,
  ExternalLink,
  Loader2,
  MapPin,
  Phone,
  Sparkles,
  Star,
  Train,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import {
  useCatchtableShop,
  useCatchtableShopMenus,
  useCatchtableShopReviewOverview,
} from '@repo/shared';
import type {
  CatchtableShopDataType,
  CatchtableShopMenusResponseType,
  CatchtableShopReviewOverviewResponseType,
} from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';

// 캐치테이블 가게 상세 — /admin/catchtable-test/:shopRef.
// 어드민 검증 페이지(/admin/catchtable-test)의 결과 카드 "상세 보기" 가 이 라우트로
// 진입한다. 직접 URL 로도 접근 가능 (북마크/공유 용도).

const SERVICE_LABEL: Record<string, string> = {
  DINING: '다이닝',
  WAITING: '웨이팅',
  PICKUP: '픽업',
};

const DAY_OF_WEEK_LABEL: Record<string, string> = {
  MONDAY: '월',
  TUESDAY: '화',
  WEDNESDAY: '수',
  THURSDAY: '목',
  FRIDAY: '금',
  SATURDAY: '토',
  SUNDAY: '일',
};

const formatTime = (t: string | null): string => (t ? t.slice(0, 5) : '—');

const StatBox = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="rounded-md border p-4">
    <div className="text-[11px] text-muted-foreground">{label}</div>
    <div className="mt-1 text-base font-semibold leading-tight">{value}</div>
    {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
  </div>
);

// ── AI 리뷰 종합 ────────────────────────────────────────────────────────────
// 캐치테이블이 자체 LLM 으로 만든 가게 한 줄 + 3-4 문장. 페이지 진입 시 자동
// 페치. 가벼운 호출 (~200-500ms) 이라 메인 데이터와 병렬로 가져옴.

const formatPrice = (s: string | null): string | null => {
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n === 0) return s;
  return `${n.toLocaleString()}원`;
};

const ReviewOverviewCard = ({
  data,
  isLoading,
  isError,
  error,
}: {
  data: CatchtableShopReviewOverviewResponseType | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}) => {
  if (isLoading) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground sm:p-5">
          <Loader2 className="size-4 animate-spin" />
          AI 리뷰 종합을 가져오는 중…
        </CardContent>
      </Card>
    );
  }
  if (isError) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="flex items-start gap-2 p-3 text-xs">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
          <span className="text-muted-foreground">
            AI 리뷰 종합 가져오기 실패: {error?.message ?? '알 수 없음'}
          </span>
        </CardContent>
      </Card>
    );
  }
  if (!data || (!data.title && data.sentences.length === 0)) return null;
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-5 sm:p-6">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium text-primary">
          <Sparkles className="size-3.5" />
          AI 리뷰 종합
          {data.latestUpdateDate && (
            <span className="ml-auto text-muted-foreground">업데이트 {data.latestUpdateDate}</span>
          )}
        </div>
        {data.title && (
          <p className="mb-3 text-base font-semibold leading-snug">{data.title}</p>
        )}
        {data.sentences.length > 0 && (
          <ul className="space-y-1.5 text-sm leading-relaxed">
            {data.sentences.map((s, i) => (
              <li key={i} className="flex gap-2 text-muted-foreground">
                <span className="text-primary/60">·</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

// ── 메뉴 ───────────────────────────────────────────────────────────────────
// "불러오기" 클릭 전까지 enabled=false. 버튼 클릭 후 fetch + 로딩 표시 + 결과.

const MenuSection = ({ shopRef }: { shopRef: string }) => {
  const [enabled, setEnabled] = useState(false);
  const q = useCatchtableShopMenus(shopRef, enabled);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <UtensilsCrossed className="size-4 text-muted-foreground" />
          메뉴
        </div>
        {q.data && (
          <span className="text-xs text-muted-foreground">
            {(q.data.elapsedMs / 1000).toFixed(1)}s · 메뉴 {q.data.menus.length} · 메뉴판 {q.data.menuBoards.length}
          </span>
        )}
      </div>
      {!enabled && !q.data && (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-4 sm:p-5">
            <p className="text-sm text-muted-foreground">
              메뉴는 별도 페이지에서 가져옵니다 (~10초).
            </p>
            <Button size="sm" onClick={() => setEnabled(true)}>
              메뉴 불러오기
            </Button>
          </CardContent>
        </Card>
      )}
      {enabled && q.isLoading && (
        <Card>
          <CardContent className="flex h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            메뉴 페이지에서 가져오는 중…
          </CardContent>
        </Card>
      )}
      {q.isError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-start gap-2 p-3 text-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div>
              <p className="text-destructive">메뉴 가져오기 실패</p>
              <p className="text-xs text-muted-foreground">
                {(q.error as Error | null)?.message ?? '알 수 없는 오류'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      {q.data && <MenuContent data={q.data} />}
    </div>
  );
};

const MenuContent = ({ data }: { data: CatchtableShopMenusResponseType }) => {
  const hasAny = data.menus.length > 0 || data.menuBoards.length > 0;
  if (!hasAny) {
    return (
      <Card>
        <CardContent className="p-4 text-xs text-muted-foreground sm:p-5">
          이 가게는 메뉴 정보를 캐치테이블에 등록하지 않았습니다.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {/* 메뉴판 이미지 (가게가 사진으로만 메뉴를 올린 경우) */}
      {data.menuBoards.length > 0 && (
        <div>
          <div className="mb-2 text-xs text-muted-foreground">메뉴판 사진</div>
          <div className="-mx-4 overflow-x-auto px-4 sm:-mx-0 sm:px-0">
            <div className="flex gap-2">
              {data.menuBoards.map((b, i) => (
                <a
                  key={`${b.imageUrl}-${i}`}
                  href={b.imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="size-36 shrink-0 overflow-hidden rounded-md bg-muted"
                  title="원본 이미지 열기"
                >
                  <img
                    src={b.thumbUrl}
                    alt=""
                    className="size-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 개별 메뉴 항목 */}
      {data.menus.length > 0 && (
        <ul className="divide-y rounded-md border">
          {data.menus.map((m, i) => {
            const minPrice = formatPrice(m.minPrice);
            const maxPrice = formatPrice(m.maxPrice);
            const priceText =
              minPrice && maxPrice && minPrice !== maxPrice
                ? `${minPrice} ~ ${maxPrice}`
                : minPrice ?? maxPrice;
            return (
              <li key={`${m.name}-${i}`} className="flex items-start gap-3 p-3 text-sm">
                {m.imageUrl ? (
                  <img
                    src={m.imageUrl}
                    alt=""
                    className="size-14 shrink-0 rounded object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="size-14 shrink-0 rounded bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="truncate font-medium">{m.name}</span>
                      {m.isRecommended && (
                        <Badge variant="secondary" className="text-[10px]">추천</Badge>
                      )}
                      {m.isNew && (
                        <Badge variant="outline" className="text-[10px]">신메뉴</Badge>
                      )}
                      {m.isRepresentative && (
                        <Badge variant="outline" className="text-[10px]">대표</Badge>
                      )}
                    </div>
                    {priceText && (
                      <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                        {priceText}
                      </span>
                    )}
                  </div>
                  {m.description && (
                    <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                      {m.description}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* 메뉴 부가 정보 (알레르기·비건·콜키지 등) */}
      {data.menuDetailInfo && (
        <Card>
          <CardContent className="space-y-2 p-5 text-xs sm:p-6">
            {data.menuDetailInfo.corkChargeGuide && (
              <div>
                <span className="font-medium">콜키지 · </span>
                <span className="whitespace-pre-line text-muted-foreground">
                  {data.menuDetailInfo.corkChargeGuide}
                </span>
              </div>
            )}
            {data.menuDetailInfo.kidsMenuGuide && (
              <div>
                <span className="font-medium">어린이 메뉴 · </span>
                <span className="text-muted-foreground">{data.menuDetailInfo.kidsMenuGuide}</span>
              </div>
            )}
            {data.menuDetailInfo.allergyMenuSubstituteGuide && (
              <div>
                <span className="font-medium">알레르기 대체 · </span>
                <span className="text-muted-foreground">{data.menuDetailInfo.allergyMenuSubstituteGuide}</span>
              </div>
            )}
            {data.menuDetailInfo.veganMenuSubstituteGuide && (
              <div>
                <span className="font-medium">비건 대체 · </span>
                <span className="text-muted-foreground">{data.menuDetailInfo.veganMenuSubstituteGuide}</span>
              </div>
            )}
            {data.menuDetailInfo.lastMenuUpdateDateTime && (
              <div className="text-muted-foreground">
                메뉴 업데이트: {data.menuDetailInfo.lastMenuUpdateDateTime}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const ShopDetailContent = ({
  data,
  shopRef,
}: {
  data: CatchtableShopDataType;
  shopRef: string;
}) => {
  const today = data.schedule?.today;
  const weekly = data.schedule?.weekly ?? [];
  return (
    <div className="space-y-6">
      {/* 이미지 갤러리 */}
      {data.images.length > 0 && (
        <div className="-mx-4 overflow-x-auto px-4 sm:-mx-0 sm:px-0">
          <div className="flex gap-2">
            {data.images.slice(0, 12).map((img, i) => (
              <div
                key={`${img.imgUrl}-${i}`}
                className="size-36 shrink-0 overflow-hidden rounded-md bg-muted"
              >
                <img
                  src={img.thumbUrl || img.imgUrl}
                  alt=""
                  className="size-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 메타 라인 + 설명 */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {data.category && <Badge variant="secondary">{data.category}</Badge>}
          {data.landName && <span className="text-muted-foreground">{data.landName}</span>}
          {data.mainService && SERVICE_LABEL[data.mainService] && (
            <Badge variant="outline" className="font-normal">
              {SERVICE_LABEL[data.mainService]}
            </Badge>
          )}
          {data.contractState === 'CONTRACTED' && (
            <Badge variant="outline" className="font-normal text-emerald-500">
              가맹점
            </Badge>
          )}
          <a
            href={data.rawSourceUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            title="캐치테이블에서 열기"
          >
            <ExternalLink className="size-3.5" />
            캐치테이블에서 열기
          </a>
        </div>
        {data.serviceDesc && (
          <p className="text-sm text-muted-foreground">{data.serviceDesc}</p>
        )}
      </div>

      {/* 통계 박스 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox
          label="평점"
          value={data.review.averageScore !== null ? data.review.averageScore.toFixed(1) : '—'}
          sub={`리뷰 ${data.review.totalCount.toLocaleString()}`}
        />
        <StatBox label="즐겨찾기" value={(data.bookmarkCount ?? 0).toLocaleString()} sub="명" />
        <StatBox
          label="점수 분포"
          value={
            data.review.foodScore || data.review.ambienceScore || data.review.serviceScore
              ? `🍽 ${data.review.foodScore ?? 0}`
              : '—'
          }
          sub={
            data.review.foodScore || data.review.ambienceScore || data.review.serviceScore
              ? `분위기 ${data.review.ambienceScore ?? 0} · 서비스 ${data.review.serviceScore ?? 0}`
              : '데이터 없음'
          }
        />
        <StatBox
          label="응답 시간"
          value={`${(data.elapsedMs / 1000).toFixed(1)}s`}
          sub="크롤 elapsed"
        />
      </div>

      {/* 주소·지하철·전화 */}
      <Card>
        <CardContent className="space-y-2.5 p-5 text-sm sm:p-6">
          {data.address && (
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                <p>{data.address}</p>
                {data.addressDetail && (
                  <p className="text-xs text-muted-foreground">{data.addressDetail}</p>
                )}
              </div>
            </div>
          )}
          {data.subways.length > 0 && (
            <div className="flex items-start gap-2">
              <Train className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="flex flex-wrap gap-3 text-xs">
                {data.subways.map((s, i) => (
                  <span key={`${s.station}-${i}`}>
                    {s.station} <span className="text-muted-foreground">({s.distance})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {data.phone && (
            <div className="flex items-center gap-2">
              <Phone className="size-4 shrink-0 text-muted-foreground" />
              <span>{data.phone}</span>
            </div>
          )}
          {!data.address && data.subways.length === 0 && !data.phone && (
            <p className="text-xs text-muted-foreground">위치 정보 없음</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 영업 시간 */}
        {(today || weekly.length > 0) && (
          <Card>
            <CardContent className="p-5 sm:p-6">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Clock className="size-4 text-muted-foreground" />
                영업 시간
              </div>
              {today && (
                <div className="mb-2 text-sm">
                  <span className="text-muted-foreground">
                    오늘 ({today.dayOfWeek && DAY_OF_WEEK_LABEL[today.dayOfWeek]}):
                  </span>{' '}
                  {today.isClosed ? (
                    <span className="text-destructive">휴무</span>
                  ) : (
                    <span>
                      {formatTime(today.startTime)} – {formatTime(today.endTime)}
                      {today.breakStartTime && (
                        <span className="text-muted-foreground">
                          {' '}
                          (브레이크 {formatTime(today.breakStartTime)}-{formatTime(today.breakEndTime)})
                        </span>
                      )}
                    </span>
                  )}
                </div>
              )}
              {weekly.length > 0 && (
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {weekly.map((w) => (
                    <li key={w.dayOfWeek} className="flex gap-2">
                      <span className="w-6">{DAY_OF_WEEK_LABEL[w.dayOfWeek] ?? w.dayOfWeek}</span>
                      <span>
                        {w.isClosed
                          ? '휴무'
                          : `${formatTime(w.startTime)} – ${formatTime(w.endTime)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {/* 가격대 */}
        {(data.priceRange.lunchText || data.priceRange.dinnerText) && (
          <Card>
            <CardContent className="p-5 sm:p-6">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Wallet className="size-4 text-muted-foreground" />
                가격대
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                {data.priceRange.lunchText && <div>점심: {data.priceRange.lunchText}</div>}
                {data.priceRange.dinnerText &&
                  data.priceRange.dinnerText !== data.priceRange.lunchText && (
                    <div>저녁: {data.priceRange.dinnerText}</div>
                  )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 관련 키워드 + 수상 */}
      {(data.relatedKeywords.length > 0 || data.awardItems.length > 0) && (
        <div className="space-y-3">
          {data.relatedKeywords.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-medium">관련 키워드</div>
              <div className="flex flex-wrap gap-1">
                {data.relatedKeywords.map((k, i) => (
                  <Badge key={`${k.label}-${i}`} variant="outline" className="font-normal">
                    {k.label}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {data.awardItems.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-medium">수상</div>
              <div className="flex flex-wrap gap-1">
                {data.awardItems.map((a, i) => (
                  <Badge key={`${a}-${i}`} variant="secondary" className="font-normal">
                    {a}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 메뉴 (lazy — 별도 페이지에서 가져옴) */}
      <MenuSection shopRef={shopRef} />

      {/* 리뷰 샘플 — 캐치테이블이 리뷰 본문을 로그인 사용자에게만 노출. 우리
          어댑터는 비로그인 BrowserContext 라 본문 페이지네이션을 못 가져온다.
          AI 리뷰 종합(상단 카드)으로 가게 특징을 대신 노출 — 검증 도구 목적엔
          충분. raw 리뷰가 필요해지는 시점(등록 파이프라인 + AI 분석)에 로그인
          컨텍스트 또는 네이버 매핑 도입을 고려. */}
      <div>
        <div className="mb-3 text-sm font-medium">리뷰 샘플</div>
        {data.reviewSamples && data.reviewSamples.length > 0 ? (
          <ul className="space-y-2">
            {data.reviewSamples.slice(0, 10).map((r, i) => (
              <li key={i} className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                  {r.authorName && <span className="font-medium">{r.authorName}</span>}
                  {r.score !== null && (
                    <span className="inline-flex items-center gap-0.5">
                      <Star className="size-3 fill-amber-400 text-amber-400" />
                      {r.score.toFixed(1)}
                    </span>
                  )}
                  {r.visitedAt && <span>· {r.visitedAt}</span>}
                </div>
                <p className="leading-relaxed">{r.body}</p>
              </li>
            ))}
          </ul>
        ) : (
          <Card>
            <CardContent className="p-4 text-xs text-muted-foreground sm:p-5">
              캐치테이블이 리뷰 본문을 로그인 사용자에게만 노출합니다. 위쪽의 AI 리뷰 종합을 참고하세요.
            </CardContent>
          </Card>
        )}
      </div>

      {/* 원본 JSON */}
      <details className="rounded-md border bg-muted/20">
        <summary className="cursor-pointer p-3 text-sm font-medium">
          <Code2 className="mr-1 inline size-4 align-text-bottom" />
          원본 응답 JSON
        </summary>
        <pre className="max-h-96 overflow-auto p-3 text-[11px] leading-relaxed">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
};

export const AdminCatchtableShopPage = () => {
  const { shopRef } = useParams<{ shopRef: string }>();
  const q = useCatchtableShop(shopRef ?? null);
  // AI 리뷰 종합 — 가벼운 호출이라 페이지 진입 시 자동 시작.
  const overview = useCatchtableShopReviewOverview(shopRef ?? null);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="gap-1 px-2">
          <Link to="/admin/catchtable-test">
            <ArrowLeft className="size-4" />
            검색 결과로 돌아가기
          </Link>
        </Button>
      </div>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {q.data?.shopName ?? (q.isLoading ? '불러오는 중…' : '캐치테이블 가게 상세')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          shopRef: <span className="font-mono">{shopRef}</span>
        </p>
      </header>

      {q.isLoading && (
        <Card>
          <CardContent className="flex h-48 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
            가게 정보를 가져오는 중… (첫 호출은 10~20초)
          </CardContent>
        </Card>
      )}

      {q.isError && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-start gap-2 p-4 sm:p-5">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="text-sm">
              <p className="font-medium text-destructive">상세 정보 가져오기 실패</p>
              <p className="text-muted-foreground">
                {(q.error as Error | null)?.message ?? '알 수 없는 오류'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {q.data && (
        <>
          <div className="mb-6">
            <ReviewOverviewCard
              data={overview.data}
              isLoading={overview.isLoading}
              isError={overview.isError}
              error={(overview.error as Error | null) ?? null}
            />
          </div>
          <ShopDetailContent data={q.data} shopRef={shopRef!} />
        </>
      )}
    </div>
  );
};
