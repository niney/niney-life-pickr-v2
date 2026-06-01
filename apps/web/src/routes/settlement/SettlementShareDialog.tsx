import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  ImageDown,
  Link2,
  Loader2,
  MessageSquare,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import {
  ApiError,
  useCreateSettlementShare,
  useRevokeSettlementShare,
} from '@repo/shared';
import type { ShareOgImageType, ShareTtlType } from '@repo/api-contract';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';

interface Props {
  open: boolean;
  sessionId: string;
  onClose(): void;
}

// 유효 기간 프리셋. 무제한 없음 — 모든 링크가 최대 30일 내 만료된다.
const TTL_OPTIONS: { value: ShareTtlType; label: string }[] = [
  { value: '1d', label: '1일' },
  { value: '7d', label: '7일' },
  { value: '30d', label: '30일' },
];

// 만료 ISO → "YYYY.MM.DD HH:mm". 받는 사람이 아니라 owner 에게만 보이는 안내.
const formatExpiry = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// 결과 페이지의 "공유" 버튼이 여는 다이얼로그. open 되면 서버에 POST /share
// 를 한 번 호출 — 서버가 멱등이라 이미 토큰이 있으면 같은 토큰을 돌려준다.
// 토큰을 받으면 절대 URL(현재 origin + 서버 경로) 로 만들어 보여준다.
//
// MenuPickerDialog 와 동일하게 외부 dialog 라이브러리 없이 fixed overlay 로
// 구현. ESC 닫기, 백드롭 클릭 닫기.
export const SettlementShareDialog = ({ open, sessionId, onClose }: Props) => {
  const create = useCreateSettlementShare();
  const revoke = useRevokeSettlementShare();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [ttl, setTtl] = useState<ShareTtlType>('7d');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageCopied, setImageCopied] = useState(false);
  const [kakaoCopied, setKakaoCopied] = useState(false);
  // 링크 미리보기(OG) 이미지 선택. 서버가 저장한 값으로 동기화한다.
  const [ogImage, setOgImage] = useState<ShareOgImageType>('restaurant');

  // 다이얼로그가 열리거나 기간을 바꾸면 토큰 생성/갱신. 토큰은 멱등(같은 세션
  // → 같은 링크)이고 ttl 만 만료를 갱신한다. 닫혀 있는 동안에는 호출하지 않는다.
  // ogImage 는 보내지 않는다 — 서버가 기존 선택을 유지하고 그 값을 돌려준다.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setCopied(false);
    create
      .mutateAsync({ id: sessionId, ttl })
      .then((res) => {
        if (cancelled) return;
        if (res.shareUrl) setShareUrl(absoluteUrl(res.shareUrl));
        setExpiresAt(res.expiresAt);
        setOgImage(res.ogImage);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : '공유 링크 생성 실패');
      });
    return () => {
      cancelled = true;
    };
    // sessionId/ttl 이 바뀌면 다시 — 일반 사용에선 한 페이지가 한 세션을 다룬다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionId, ttl]);

  // 미리보기 이미지 토글 — 선택을 서버에 저장(같은 토큰 유지) 후 서버가 돌려준
  // 값으로 상태를 확정한다.
  const handleSelectOgImage = (mode: ShareOgImageType) => {
    if (mode === ogImage || create.isPending) return;
    setOgImage(mode); // 낙관적
    create
      .mutateAsync({ id: sessionId, ttl, ogImage: mode })
      .then((res) => {
        if (res.shareUrl) setShareUrl(absoluteUrl(res.shareUrl));
        setExpiresAt(res.expiresAt);
        setOgImage(res.ogImage);
      })
      .catch((e: unknown) => {
        setError(e instanceof ApiError ? e.message : '미리보기 이미지 변경 실패');
      });
  };

  // ESC 닫기.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('복사 실패 — 수동으로 선택해서 복사하세요.');
    }
  };

  // Web Share API — 모바일 단말에서 네이티브 공유 시트(카톡/메시지/메일 등)
  // 호출. 데스크톱 일부 브라우저에서도 동작. 미지원이면 버튼 숨김.
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  // 파일(이미지) 공유 가능 여부 — 주로 모바일 단말. 데스크톱은 보통 false →
  // '공유' 버튼 숨기고 '이미지 복사'(클립보드)만 노출.
  const canShareFiles =
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] });
  const handleShare = async () => {
    if (!shareUrl) return;
    try {
      await navigator.share({ title: '정산 결과', url: shareUrl });
    } catch {
      // 사용자가 취소하면 그대로 무시. 다른 에러는 isolated 라 별도 토스트 없이.
    }
  };

  // 이미지는 SPA 라우트(/s/...)가 아니라 백엔드 카드 라우트에서만 나온다. 동일
  // 출처 상대경로로 받아 dev(Vite proxy)·prod(nginx) 모두에서 Fastify 에 도달.
  // 토큰은 shareUrl(.../s/<token>) 의 마지막 세그먼트.
  const imageUrl = (): string => {
    const token = (shareUrl ?? '').split('/').pop() ?? '';
    return `/share/settlements/${encodeURIComponent(token)}/image.png`;
  };

  const downloadImage = async () => {
    const res = await fetch(imageUrl());
    if (!res.ok) throw new Error(`image ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '정산표.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // 정산표 이미지를 클립보드에 PNG 로 복사. 성공 시 'copied', 클립보드 쓰기를
  // 못 해서 다운로드로 폴백했으면 'downloaded'. Safari 는 사용자 제스처가 만료되면
  // 거부하므로 fetch 를 await 하지 않고 ClipboardItem 값에 Promise<Blob> 를 그대로
  // 넘겨 클립보드 쓰기 '안'에서 받아오게 한다.
  const copyImageToClipboard = async (): Promise<'copied' | 'downloaded'> => {
    if (
      navigator.clipboard &&
      'write' in navigator.clipboard &&
      typeof ClipboardItem !== 'undefined'
    ) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': fetch(imageUrl()).then((r) => {
            if (!r.ok) throw new Error(`image ${r.status}`);
            return r.blob();
          }),
        }),
      ]);
      return 'copied';
    }
    await downloadImage();
    return 'downloaded';
  };

  // "복사" 와 "카카오톡 복사" 는 동작이 같다(이미지를 클립보드로) — 다만 카카오톡
  // 버튼은 색/문구로 "카톡에 붙여넣기" 를 강조한다. 카카오 SDK 미연동이라 톡을
  // 직접 열지는 않고 붙여넣기 안내만 한다.
  const runCopyImage = async (mark: () => void) => {
    if (!shareUrl || imageBusy) return;
    setImageBusy(true);
    setError(null);
    try {
      const r = await copyImageToClipboard();
      if (r === 'copied') mark();
    } catch {
      try {
        await downloadImage(); // 클립보드 실패 → 다운로드 폴백
      } catch {
        setError('이미지 복사 실패 — 잠시 후 다시 시도하세요.');
      }
    } finally {
      setImageBusy(false);
    }
  };

  const handleCopyImage = () =>
    runCopyImage(() => {
      setImageCopied(true);
      window.setTimeout(() => setImageCopied(false), 1500);
    });

  const handleCopyForKakao = () =>
    runCopyImage(() => {
      setKakaoCopied(true);
      window.setTimeout(() => setKakaoCopied(false), 2500);
    });

  // 파일 공유가 되는 환경(주로 모바일 단말): 네이티브 공유 시트(카톡 등)로 첨부.
  const handleShareImageFile = async () => {
    if (!shareUrl || imageBusy) return;
    setImageBusy(true);
    setError(null);
    try {
      const res = await fetch(imageUrl());
      if (!res.ok) throw new Error(`image ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], '정산표.png', { type: 'image/png' });
      await navigator.share({ files: [file], title: '정산표' });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // 사용자 취소
      setError('이미지 공유 실패 — 잠시 후 다시 시도하세요.');
    } finally {
      setImageBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (!window.confirm('공유 링크를 해제할까요? 이전에 공유한 링크는 더 이상 동작하지 않습니다.')) {
      return;
    }
    try {
      await revoke.mutateAsync(sessionId);
      setShareUrl(null);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '공유 해제 실패');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="정산 결과 공유"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col gap-4 rounded-t-lg bg-background p-5 shadow-lg sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-base font-semibold">
            <Link2 className="size-4" />
            공유 링크
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            aria-label="닫기"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          링크 받은 사람은 로그인 없이 결과를 볼 수 있습니다. 영수증 사진은 공유되지 않으며,
          설정한 기간이 지나거나 공유를 해제하면 링크는 더 이상 동작하지 않습니다.
        </p>

        {/* 유효 기간 선택 — 바꾸면 같은 링크의 만료만 갱신된다. */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">유효 기간</span>
          <div className="flex gap-1.5" role="group" aria-label="유효 기간">
            {TTL_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                type="button"
                size="sm"
                variant={ttl === opt.value ? 'default' : 'outline'}
                className="flex-1"
                aria-pressed={ttl === opt.value}
                disabled={create.isPending}
                onClick={() => setTtl(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {!shareUrl && !error && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {shareUrl && (
          <>
            <div className="flex gap-2">
              <Input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-xs"
                aria-label="공유 URL"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="shrink-0"
                aria-label="복사"
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                <span className="hidden sm:inline">{copied ? '복사됨' : '복사'}</span>
              </Button>
            </div>

            {expiresAt && (
              <p className="text-xs text-muted-foreground">
                {formatExpiry(expiresAt)}까지 유효
              </p>
            )}

            {/* 링크 미리보기(카톡 등에 링크 붙였을 때 뜨는 그림) 선택.
                기본 식당 사진(랜덤) — 식당 사진이 없으면 자동으로 정산표가 뜬다. */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                링크 미리보기 이미지
              </span>
              <div className="flex gap-1.5" role="group" aria-label="미리보기 이미지">
                {(
                  [
                    ['restaurant', '식당 사진'],
                    ['table', '정산표'],
                  ] as const
                ).map(([val, label]) => (
                  <Button
                    key={val}
                    type="button"
                    size="sm"
                    variant={ogImage === val ? 'default' : 'outline'}
                    className="flex-1"
                    aria-pressed={ogImage === val}
                    disabled={create.isPending}
                    onClick={() => handleSelectOgImage(val)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {/* 정산표 이미지 — '복사' 와 '카카오톡 복사' 둘 다 클립보드에 PNG 를
                넣는다. 카카오톡 버튼은 카톡 색/문구로 붙여넣기를 강조(SDK 미연동). */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="default"
                className="flex-1"
                onClick={handleCopyImage}
                disabled={imageBusy}
              >
                {imageBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : imageCopied ? (
                  <Check className="size-4" />
                ) : (
                  <ImageDown className="size-4" />
                )}
                {imageCopied ? '복사됨' : '이미지 복사'}
              </Button>
              <Button
                type="button"
                onClick={handleCopyForKakao}
                disabled={imageBusy}
                className="flex-1 bg-[#FEE500] text-[#391B1B] hover:bg-[#FADA0A]"
              >
                {imageBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : kakaoCopied ? (
                  <Check className="size-4" />
                ) : (
                  <MessageSquare className="size-4" />
                )}
                {kakaoCopied ? '복사됨' : '카카오톡 복사'}
              </Button>
            </div>
            {canShareFiles && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleShareImageFile}
                disabled={imageBusy}
              >
                <Share2 className="size-4" />
                공유 시트로 보내기…
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              {kakaoCopied
                ? '이미지가 복사됐어요 — 카카오톡 대화창에 붙여넣기(Ctrl/⌘+V) 하세요.'
                : '복사 후 카카오톡·메모·그림판 등에 붙여넣기(Ctrl/⌘+V) 하세요.'}
            </p>

            <div className="flex items-center justify-between gap-2">
              {canShare ? (
                <Button type="button" variant="outline" size="sm" onClick={handleShare}>
                  <Share2 className="size-4" />
                  링크 공유…
                </Button>
              ) : (
                <span />
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRevoke}
                disabled={revoke.isPending}
              >
                {revoke.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                공유 해제
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// 서버는 항상 /api/v1/share/settlements/<token> 같은 상대 경로를 돌려준다.
// 브라우저에서 그대로 공유하려면 origin 까지 붙여야 한다. SSR 환경 고려하지
// 않음 — apps/web 은 클라이언트 전용 SPA.
const absoluteUrl = (path: string): string => {
  if (/^https?:/i.test(path)) return path;
  if (typeof window === 'undefined') return path;
  // 공유 페이지는 SPA 라우트(/s/:token) 로 매핑된다. 서버가 돌려주는 API
  // 경로(/api/v1/share/settlements/:token) 에서 토큰만 떼어 짧은 SPA 경로로
  // 다시 조립한다.
  const token = path.split('/').pop() ?? '';
  return `${window.location.origin}/s/${token}`;
};
