import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Share2, Trash2 } from 'lucide-react';
import {
  readDeviceSajuG,
  removeDeviceSajuG,
  sajuGApi,
  useAuthStore,
  useMySajuGReadings,
} from '@repo/shared';
import type { SajuGReadingResultType } from '@repo/api-contract';
import { SAJU_G_KIND_LABEL } from '@repo/utils';
import { SajuGReportView } from '~/components/saju-g/SajuGReportView';
import { SajuGShareDialog } from '~/components/saju-g/SajuGShareDialog';
import { SajuGSaveProfileDialog } from '~/components/saju-g/SajuGSaveProfileDialog';
import '~/components/saju-g/saju-g.css';
import '~/components/saju-g/saju-g-next.css';

export function SajuGHistoryPage() {
  const principal = useAuthStore((s) => s.user?.id ?? 'guest');
  return <History key={principal} principal={principal} />;
}
function History({ principal }: { principal: string }) {
  const { id } = useParams();
  const mine = useMySajuGReadings();
  const client = useQueryClient();
  const [device, setDevice] = useState(() => readDeviceSajuG(principal));
  const [localResult, setLocalResult] = useState<SajuGReadingResultType | null>(null);
  const [share, setShare] = useState(false);
  const [profileSave, setProfileSave] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const detail = useQuery({
    queryKey: ['saju-g', 'detail', principal, id],
    queryFn: () => sajuGApi.getMine(id!),
    enabled: !!id && principal !== 'guest',
    retry: false,
    refetchOnWindowFocus: 'always',
  });
  const result = localResult ?? (detail.isError ? null : detail.data) ?? null;
  const rows =
    principal === 'guest'
      ? device.map((v) => ({
          id: v.createdAt,
          title: v.report.headline,
          kind: v.kind,
          period: v.chart.period.label,
          createdAt: v.createdAt,
        }))
      : (mine.data?.pages.flatMap((p) => p.items) ?? []);
  const remove = async (key: string) => {
    setBusy(true);
    setMessage('');
    try {
      if (principal === 'guest') {
        removeDeviceSajuG(principal, key);
        setDevice(readDeviceSajuG(principal));
      } else {
        await sajuGApi.deleteMine(key);
        await client.invalidateQueries({ queryKey: ['saju-g', 'mine', principal] });
        client.removeQueries({ queryKey: ['saju-g', 'detail', principal, key] });
      }
      setDeleting(null);
    } catch {
      setMessage('삭제하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="saju-g-page">
      <div className="saju-g-shell">
        <header className="saju-g-nav">
          <Link to="/saju-g" className="saju-g-brand">
            <span>命</span>사주(G)
          </Link>
          <div className="saju-g-next-nav">
            <Link to="/me/saju-g/profiles">프로필 관리</Link>
            <Link to="/saju-g" className="saju-g-history-link">
              새 사주(G) 보기
            </Link>
          </div>
        </header>
        <main className="saju-g-history">
          {result ? (
            <>
              <Link
                className="saju-g-text-button"
                to="/me/saju-g"
                onClick={() => setLocalResult(null)}
              >
                <ArrowLeft size={15} />
                보관함으로
              </Link>
              <h1>{result.chart.period.label}</h1>
              <SajuGReportView chart={result.chart} result={result} />
              <div className="saju-g-result-actions">
                <button className="saju-g-secondary" onClick={() => setProfileSave(true)}>
                  출생 프로필로 저장
                </button>
                <button className="saju-g-primary" onClick={() => setShare(true)}>
                  <Share2 size={16} />
                  오행 지도 공유
                </button>
              </div>
              {share && <SajuGShareDialog result={result} onClose={() => setShare(false)} />}
              {profileSave && (
                <SajuGSaveProfileDialog
                  birth={result.birth}
                  onClose={() => setProfileSave(false)}
                />
              )}
            </>
          ) : (
            <>
              <span className="saju-g-eyebrow">YOUR COLLECTION</span>
              <h1>나의 사주(G) 보관함</h1>
              <p>
                {principal === 'guest'
                  ? '이 브라우저에 직접 보관한 결과예요. 최근 20개까지 보관해요.'
                  : '내 계정에 직접 보관한 결과예요. 삭제하면 이 결과의 공유 링크도 함께 취소돼요.'}
              </p>
              {((mine.isLoading && principal !== 'guest') || (detail.isLoading && !!id)) && (
                <p className="saju-g-empty" role="status">
                  보관한 이야기를 불러오고 있어요…
                </p>
              )}
              {((mine.isError && principal !== 'guest') ||
                detail.isError ||
                (!!id && principal === 'guest')) && (
                <div className="saju-g-error" role="alert">
                  보관한 결과를 불러올 수 없어요. 로그인 상태와 연결을 확인해 주세요.
                </div>
              )}
              {!id && rows.length === 0 && !mine.isLoading && (
                <div className="saju-g-empty">
                  <p>아직 보관한 사주가 없어요.</p>
                  <Link className="saju-g-secondary" to="/saju-g">
                    나의 첫 사주(G) 펼치기
                  </Link>
                </div>
              )}
              <div className="saju-g-history-list">
                {rows.map((row) => (
                  <div className="saju-g-history-row" key={row.id}>
                    {principal === 'guest' ? (
                      <button
                        onClick={() =>
                          setLocalResult(device.find((v) => v.createdAt === row.id) ?? null)
                        }
                      >
                        <strong>{row.title}</strong>
                        <span>
                          {SAJU_G_KIND_LABEL[row.kind]} · {row.period}
                        </span>
                      </button>
                    ) : (
                      <Link to={`/me/saju-g/${row.id}`}>
                        <strong>{row.title}</strong>
                        <span>
                          {SAJU_G_KIND_LABEL[row.kind]} · {row.period}
                        </span>
                      </Link>
                    )}
                    {deleting === row.id ? (
                      <>
                        <button disabled={busy} onClick={() => remove(row.id)}>
                          삭제할게요
                        </button>
                        <button onClick={() => setDeleting(null)}>취소</button>
                      </>
                    ) : (
                      <button onClick={() => setDeleting(row.id)} aria-label={`${row.title} 삭제`}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {mine.hasNextPage && principal !== 'guest' && (
                <button
                  className="saju-g-secondary"
                  disabled={mine.isFetchingNextPage}
                  onClick={() => mine.fetchNextPage()}
                >
                  더 보기
                </button>
              )}
              {message && (
                <p className="saju-g-error" role="alert">
                  {message}
                </p>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
