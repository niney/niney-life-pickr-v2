import { Link } from 'react-router-dom';
import { APP_NAME, useAuthStore, useLogout } from '@repo/shared';

export const HomePage = () => {
  const user = useAuthStore((s) => s.user);
  const isGuest = useAuthStore((s) => s.isGuest);
  const clearSession = useAuthStore((s) => s.clearSession);
  const logout = useLogout();

  return (
    <main className="container">
      <h1>{APP_NAME}</h1>
      <p>무엇을 할지 고민될 때, 대신 골라드립니다.</p>

      {user ? (
        <div className="stack">
          <p><strong>{user.email}</strong>님 환영합니다</p>
          <Link to="/picks" className="link-primary">내 Pick 목록</Link>
          {user.role === 'ADMIN' && <Link to="/admin" className="link-primary">관리자 페이지</Link>}
          <button onClick={() => logout.mutate()}>로그아웃</button>
        </div>
      ) : isGuest ? (
        <div className="stack">
          <p>게스트로 이용 중입니다. 저장하려면 회원가입하세요.</p>
          <Link to="/picks" className="link-primary">계속하기</Link>
          <Link to="/login" className="link-primary" onClick={() => clearSession()}>로그인 / 회원가입</Link>
        </div>
      ) : (
        <Link to="/login" className="link-primary">시작하기</Link>
      )}
    </main>
  );
};
