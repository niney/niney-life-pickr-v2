import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Share2, Trash2 } from 'lucide-react';
import {
  readDeviceSaju,
  removeDeviceSaju,
  sajuApi,
  useAuthStore,
  useMySajuReadings,
} from '@repo/shared';
import type { SajuReadingResultType } from '@repo/api-contract';
import { SAJU_KIND_LABEL } from '@repo/utils';
import { SajuReportView } from '~/components/saju/SajuReportView';
import { SajuShareDialog } from '~/components/saju/SajuShareDialog';
import { SajuSaveProfileDialog } from '~/components/saju/SajuSaveProfileDialog';
import '~/components/saju/saju.css';
import '~/components/saju/saju-next.css';

export function SajuHistoryPage() {
  const principal = useAuthStore((s) => s.user?.id ?? 'guest');
  return <History key={principal} principal={principal} />;
}
function History({ principal }: { principal: string }) {
  const { id } = useParams();
  const mine = useMySajuReadings();
  const client = useQueryClient();
  const [device, setDevice] = useState(() => readDeviceSaju(principal));
  const [localResult, setLocalResult] = useState<SajuReadingResultType | null>(null);
  const [share, setShare] = useState(false);
  const [profileSave, setProfileSave] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const detail = useQuery({
    queryKey: ['saju', 'detail', principal, id],
    queryFn: () => sajuApi.getMine(id!),
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
        removeDeviceSaju(principal, key);
        setDevice(readDeviceSaju(principal));
      } else {
        await sajuApi.deleteMine(key);
        await client.invalidateQueries({ queryKey: ['saju', 'mine', principal] });
        client.removeQueries({ queryKey: ['saju', 'detail', principal, key] });
      }
      setDeleting(null);
    } catch {
      setMessage('삭제하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="saju-page">
      <div className="saju-shell">
        <header className="saju-nav">
          <Link to="/saju" className="saju-brand">
            <span>命</span>사주
          </Link>
          <div className="saju-next-nav">
            <Link to="/me/saju/profiles">프로필 관리</Link>
            <Link to="/saju" className="saju-history-link">
              새 사주 보기
            </Link>
          </div>
        </header>
        <main className="saju-history">
          {result ? (
            <>
              <Link className="saju-text-button" to="/me/saju" onClick={() => setLocalResult(null)}>
                <ArrowLeft size={15} />
                보관함으로
              </Link>
              <h1>{result.chart.period.label}</h1>
              <SajuReportView chart={result.chart} result={result} />
              <div className="saju-result-actions">
                <button className="saju-secondary" onClick={() => setProfileSave(true)}>
                  출생 프로필로 저장
                </button>
                <button className="saju-primary" onClick={() => setShare(true)}>
                  <Share2 size={16} />
                  오행 지도 공유
                </button>
              </div>
              {share && <SajuShareDialog result={result} onClose={() => setShare(false)} />}
              {profileSave && (
                <SajuSaveProfileDialog birth={result.birth} onClose={() => setProfileSave(false)} />
              )}
            </>
          ) : (
            <>
              <span className="saju-eyebrow">YOUR COLLECTION</span>
              <h1>나의 사주 보관함</h1>
              <p>
                {principal === 'guest'
                  ? '이 브라우저에 직접 보관한 결과예요. 최근 20개까지 보관해요.'
                  : '내 계정에 직접 보관한 결과예요. 삭제하면 이 결과의 공유 링크도 함께 취소돼요.'}
              </p>
              {((mine.isLoading && principal !== 'guest') || (detail.isLoading && !!id)) && (
                <p className="saju-empty" role="status">
                  보관한 이야기를 불러오고 있어요…
                </p>
              )}
              {((mine.isError && principal !== 'guest') ||
                detail.isError ||
                (!!id && principal === 'guest')) && (
                <div className="saju-error" role="alert">
                  보관한 결과를 불러올 수 없어요. 로그인 상태와 연결을 확인해 주세요.
                </div>
              )}
              {!id && rows.length === 0 && !mine.isLoading && (
                <div className="saju-empty">
                  <p>아직 보관한 사주가 없어요.</p>
                  <Link className="saju-secondary" to="/saju">
                    나의 첫 사주 펼치기
                  </Link>
                </div>
              )}
              <div className="saju-history-list">
                {rows.map((row) => (
                  <div className="saju-history-row" key={row.id}>
                    {principal === 'guest' ? (
                      <button
                        onClick={() =>
                          setLocalResult(device.find((v) => v.createdAt === row.id) ?? null)
                        }
                      >
                        <strong>{row.title}</strong>
                        <span>
                          {SAJU_KIND_LABEL[row.kind]} · {row.period}
                        </span>
                      </button>
                    ) : (
                      <Link to={`/me/saju/${row.id}`}>
                        <strong>{row.title}</strong>
                        <span>
                          {SAJU_KIND_LABEL[row.kind]} · {row.period}
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
                  className="saju-secondary"
                  disabled={mine.isFetchingNextPage}
                  onClick={() => mine.fetchNextPage()}
                >
                  더 보기
                </button>
              )}
              {message && (
                <p className="saju-error" role="alert">
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
