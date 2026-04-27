import { Link } from 'react-router-dom';
import { APP_NAME, useAuthStore, useLogout } from '@repo/shared';

export const HomePage = () => {
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();

  return (
    <main className="container">
      <h1>{APP_NAME}</h1>
      <p>무엇을 할지 고민될 때, 대신 골라드립니다.</p>

      {user ? (
        <div className="stack">
          <p>안녕하세요, <strong>{user.name}</strong>님</p>
          <Link to="/picks">내 Pick 목록</Link>
          <button onClick={() => logout.mutate()}>로그아웃</button>
        </div>
      ) : (
        <Link to="/login">시작하기</Link>
      )}
    </main>
  );
};
