import { Link } from 'react-router-dom';
import type { Role } from '@repo/api-contract';
import { useAdminUsers, useSetUserRole } from '@repo/shared';

export const AdminPage = () => {
  const users = useAdminUsers();
  const setRole = useSetUserRole();

  if (users.isLoading) return <main className="container"><p>Loading…</p></main>;
  if (users.isError) {
    return (
      <main className="container">
        <h1>Admin</h1>
        <p>사용자 목록을 불러오지 못했습니다: {(users.error as Error).message}</p>
        <Link to="/">홈으로</Link>
      </main>
    );
  }

  const rows = users.data?.users ?? [];

  return (
    <main className="container">
      <header className="stack" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1>Admin · 사용자</h1>
        <Link to="/">홈으로</Link>
      </header>

      <table>
        <thead>
          <tr>
            <th align="left">Email</th>
            <th align="left">Role</th>
            <th align="left">Joined</th>
            <th align="left">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => {
            const nextRole: Role = u.role === 'ADMIN' ? 'USER' : 'ADMIN';
            return (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                <td>
                  <button
                    disabled={setRole.isPending}
                    onClick={() => setRole.mutate({ id: u.id, role: nextRole })}
                  >
                    Make {nextRole}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
};
