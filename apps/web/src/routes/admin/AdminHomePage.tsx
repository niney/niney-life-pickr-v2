import { ShieldCheck, ShieldOff, Users } from 'lucide-react';
import type { Role } from '@repo/api-contract';
import { useAdminUsers, useSetUserRole } from '@repo/shared';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';

export const AdminHomePage = () => {
  const users = useAdminUsers();
  const setRole = useSetUserRole();

  const total = users.data?.users.length ?? 0;
  const admins = users.data?.users.filter((u) => u.role === 'ADMIN').length ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Users className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">대시보드</h1>
          <p className="text-sm text-muted-foreground">사용자와 권한을 관리합니다.</p>
        </div>
      </header>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>총 사용자</CardDescription>
            <CardTitle className="text-3xl">{total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>관리자</CardDescription>
            <CardTitle className="text-3xl">{admins}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>사용자</CardTitle>
          <CardDescription>
            가입한 모든 사용자 목록입니다. 역할을 토글하면 즉시 적용됩니다.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {users.isLoading && (
            <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중…</p>
          )}

          {users.isError && (
            <p className="py-10 text-center text-sm text-destructive">
              목록을 불러오지 못했습니다: {(users.error as Error).message}
            </p>
          )}

          {users.data && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>가입일</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data.users.map((u) => {
                  const isAdmin = u.role === 'ADMIN';
                  const nextRole: Role = isAdmin ? 'USER' : 'ADMIN';
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.email}</TableCell>
                      <TableCell>
                        <Badge variant={isAdmin ? 'default' : 'secondary'}>
                          {isAdmin ? (
                            <ShieldCheck className="mr-1 size-3" />
                          ) : (
                            <ShieldOff className="mr-1 size-3" />
                          )}
                          {u.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(u.createdAt).toLocaleDateString('ko-KR')}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant={isAdmin ? 'outline' : 'default'}
                          size="sm"
                          disabled={setRole.isPending}
                          onClick={() => setRole.mutate({ id: u.id, role: nextRole })}
                        >
                          {isAdmin ? 'USER로 강등' : 'ADMIN 승격'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {users.data.users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                      아직 가입한 사용자가 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
