import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { sajuGApi, sajuGShareCredential } from '@repo/shared';
import { SAJU_G_ELEMENT_META } from '@repo/utils';
import { SajuGSymbol } from '~/components/saju-g/SajuGVisual';
import { SajuGPairVisual } from '~/components/saju-g/SajuGPairVisual';
import '~/components/saju-g/saju-g.css';
import '~/components/saju-g/saju-g-next.css';

export function SajuGSharedPage() {
  const { token = '' } = useParams();
  return <SajuGSharedContent key={token} token={token} />;
}
function SajuGSharedContent({ token }: { token: string }) {
  const [revoked, setRevoked] = useState(false);
  const [message, setMessage] = useState('');
  const data = useQuery({
    queryKey: ['saju-g', 'share', token],
    queryFn: () => sajuGApi.getShared(token),
    retry: false,
    enabled: !revoked,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const [revokeToken] = useState(() => sajuGShareCredential.get(token));
  const revoke = async () => {
    if (!revokeToken) return;
    try {
      await sajuGApi.revokeShare(token, revokeToken);
      setRevoked(true);
      sajuGShareCredential.remove(token);
    } catch {
      setMessage('취소하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
  };
  const shared = data.data;
  return (
    <div className="saju-g-page">
      <div className="saju-g-shell">
        <header className="saju-g-nav">
          <Link className="saju-g-brand" to="/saju-g">
            <span>命</span>사주(G)
          </Link>
          <Link className="saju-g-history-link" to="/saju-g">
            나의 사주(G) 보기
          </Link>
        </header>
        {data.isLoading && (
          <p className="saju-g-empty" role="status">
            오행 지도를 펼치고 있어요…
          </p>
        )}
        {(data.isError || revoked) && (
          <div className="saju-g-empty">
            <p>
              {revoked ? '공유 링크를 취소했어요.' : '공유가 취소되었거나 존재하지 않는 지도예요.'}
            </p>
            <Link className="saju-g-secondary" to="/saju-g">
              나의 사주(G) 보기
            </Link>
          </div>
        )}
        {shared && !data.isError && !revoked && (
          <article className="saju-g-shared-card">
            <span className="saju-g-eyebrow">
              {shared.pair ? 'A LITTLE PIECE OF US' : 'A LITTLE PIECE OF ME'}
            </span>
            {shared.pair ? (
              <SajuGPairVisual first={shared} second={shared.pair} compact />
            ) : (
              <SajuGSymbol element={shared.element} className={shared.element ?? ''} />
            )}
            <h1>{shared.title}</h1>
            <p>{shared.description}</p>
            {!shared.pair && (
              <>
                <div className="saju-g-shared-elements">
                  {shared.elements.map((e) => (
                    <div key={e.element} style={{ color: SAJU_G_ELEMENT_META[e.element].color }}>
                      <strong>{SAJU_G_ELEMENT_META[e.element].hanja}</strong>
                      <span>
                        {SAJU_G_ELEMENT_META[e.element].name} {e.count}개
                      </span>
                    </div>
                  ))}
                </div>
                <p className="saju-g-field-hint">
                  확인된 {8 - shared.unknownCharacters}글자의 오행 구성이에요.
                </p>
              </>
            )}
            <Link className="saju-g-primary" to={shared.pair ? '/saju-g/pair' : '/saju-g'}>
              {shared.pair ? '우리의 궁합도 만나보기' : '나의 오행 지도도 만나보기'}
            </Link>
            {revokeToken && (
              <button className="saju-g-text-button" onClick={revoke}>
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
