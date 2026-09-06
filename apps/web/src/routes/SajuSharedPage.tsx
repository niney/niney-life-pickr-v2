import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { sajuApi, sajuShareCredential } from '@repo/shared';
import { SAJU_ELEMENT_META } from '@repo/utils';
import { SajuSymbol } from '~/components/saju/SajuVisual';
import { SajuPairVisual } from '~/components/saju/SajuPairVisual';
import '~/components/saju/saju.css';
import '~/components/saju/saju-next.css';

export function SajuSharedPage() {
  const { token = '' } = useParams();
  return <SajuSharedContent key={token} token={token} />;
}
function SajuSharedContent({ token }: { token: string }) {
  const [revoked, setRevoked] = useState(false);
  const [message, setMessage] = useState('');
  const data = useQuery({
    queryKey: ['saju', 'share', token],
    queryFn: () => sajuApi.getShared(token),
    retry: false,
    enabled: !revoked,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const [revokeToken] = useState(() => sajuShareCredential.get(token));
  const revoke = async () => {
    if (!revokeToken) return;
    try {
      await sajuApi.revokeShare(token, revokeToken);
      setRevoked(true);
      sajuShareCredential.remove(token);
    } catch {
      setMessage('취소하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
  };
  const shared = data.data;
  return (
    <div className="saju-page">
      <div className="saju-shell">
        <header className="saju-nav">
          <Link className="saju-brand" to="/saju">
            <span>命</span>사주
          </Link>
          <Link className="saju-history-link" to="/saju">
            나의 사주 보기
          </Link>
        </header>
        {data.isLoading && (
          <p className="saju-empty" role="status">
            오행 지도를 펼치고 있어요…
          </p>
        )}
        {(data.isError || revoked) && (
          <div className="saju-empty">
            <p>
              {revoked ? '공유 링크를 취소했어요.' : '공유가 취소되었거나 존재하지 않는 지도예요.'}
            </p>
            <Link className="saju-secondary" to="/saju">
              나의 사주 보기
            </Link>
          </div>
        )}
        {shared && !data.isError && !revoked && (
          <article className="saju-shared-card">
            <span className="saju-eyebrow">
              {shared.pair ? 'A LITTLE PIECE OF US' : 'A LITTLE PIECE OF ME'}
            </span>
            {shared.pair ? (
              <SajuPairVisual first={shared} second={shared.pair} compact />
            ) : (
              <SajuSymbol element={shared.element} className={shared.element ?? ''} />
            )}
            <h1>{shared.title}</h1>
            <p>{shared.description}</p>
            {!shared.pair && (
              <>
                <div className="saju-shared-elements">
                  {shared.elements.map((e) => (
                    <div key={e.element} style={{ color: SAJU_ELEMENT_META[e.element].color }}>
                      <strong>{SAJU_ELEMENT_META[e.element].hanja}</strong>
                      <span>
                        {SAJU_ELEMENT_META[e.element].name} {e.count}개
                      </span>
                    </div>
                  ))}
                </div>
                <p className="saju-field-hint">
                  확인된 {8 - shared.unknownCharacters}글자의 오행 구성이에요.
                </p>
              </>
            )}
            <Link className="saju-primary" to={shared.pair ? '/saju/pair' : '/saju'}>
              {shared.pair ? '우리의 궁합도 만나보기' : '나의 오행 지도도 만나보기'}
            </Link>
            {revokeToken && (
              <button className="saju-text-button" onClick={revoke}>
                이 공유 링크 취소
              </button>
            )}
            {message && <p role="status">{message}</p>}
          </article>
        )}
      </div>
    </div>
  );
}
