import { Dialog } from 'radix-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useParams } from 'react-router';
import { usePrograms } from '@/api/queries';
import { DemoPanel } from '@/features/demo/DemoPanel';
import { CommandPalette } from '../CommandPalette';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

/**
 * Program-scoped layout. If the current persona can't see this program
 * (e.g. the supplier guest opening Lumen AI), redirect to one they can.
 */
export function AppShell() {
  const { t } = useTranslation();
  const { programId = '' } = useParams();
  const programs = usePrograms();
  const [navOpen, setNavOpen] = useState(false);

  if (programs.data && !programs.data.some((p) => p.id === programId)) {
    const first = programs.data[0];
    return first ? <Navigate to={`/p/${first.id}/briefing`} replace /> : null;
  }

  return (
    <div className="flex h-full">
      <div className="hidden md:flex">
        <Sidebar programId={programId} />
      </div>

      {/* Below md the sidebar becomes a drawer. */}
      <Dialog.Root open={navOpen} onOpenChange={setNavOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay md:hidden" />
          <Dialog.Content aria-describedby={undefined} className="fixed inset-y-0 left-0 z-50 flex shadow-pop md:hidden">
            <Dialog.Title className="sr-only">{t('nav.program')}</Dialog.Title>
            <Sidebar programId={programId} onNavigate={() => setNavOpen(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar programId={programId} onOpenNav={() => setNavOpen(true)} />
        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <CommandPalette />
      <DemoPanel />
    </div>
  );
}
