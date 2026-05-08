import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { PublicSidebar } from './PublicSidebar';
import { PublicTopBar } from './PublicTopBar';

export const PublicLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicTopBar onMenuClick={() => setSidebarOpen(true)} />
      <PublicSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
};
