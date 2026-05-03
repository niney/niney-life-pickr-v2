import { UtensilsCrossed } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';

export const AdminRestaurantsPage = () => (
  <div className="mx-auto max-w-5xl px-6 py-10">
    <header className="mb-8 flex items-center gap-3">
      <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <UtensilsCrossed className="size-5" />
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">맛집</h1>
        <p className="text-sm text-muted-foreground">맛집 데이터를 관리합니다.</p>
      </div>
    </header>

    <Card>
      <CardHeader>
        <CardTitle>준비 중</CardTitle>
        <CardDescription>
          맛집 등록·수정·삭제 기능은 다음 단계에서 추가됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
          여기에 맛집 테이블이 들어옵니다.
        </div>
      </CardContent>
    </Card>
  </div>
);
