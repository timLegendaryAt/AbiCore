import { ReactNode } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';

interface AppLayoutProps {
  children: ReactNode;
  defaultExpanded?: boolean;
}

export function AppLayout({ children, defaultExpanded = false }: AppLayoutProps) {
  return (
    <SidebarProvider defaultOpen={defaultExpanded}>
      <div className="h-screen flex w-full overflow-hidden">
        <AppSidebar />
        <main className="flex-1 flex flex-col overflow-hidden">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
