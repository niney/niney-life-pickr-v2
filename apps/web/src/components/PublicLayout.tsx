import { Outlet } from 'react-router-dom';
import { PublicTopBar } from './PublicTopBar';

export const PublicLayout = () => (
  <div className="flex min-h-screen flex-col bg-background text-foreground">
    <PublicTopBar />
    <main className="flex-1">
      <Outlet />
    </main>
  </div>
);
