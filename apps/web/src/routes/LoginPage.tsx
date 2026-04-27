import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogin } from '@repo/shared';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const navigate = useNavigate();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate(
      { email, password },
      { onSuccess: () => navigate('/picks') },
    );
  };

  return (
    <main className="container">
      <h1>로그인</h1>
      <form onSubmit={onSubmit} className="stack">
        <input
          type="email"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={login.isPending}>
          {login.isPending ? '로그인 중…' : '로그인'}
        </button>
        {login.isError && <p className="error">{login.error.message}</p>}
      </form>
    </main>
  );
};
