import { useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { ApiProvider } from '@/api/ApiProvider';
import type { KeelApi } from '@/api/contract';
import { usePaletteHotkey } from './palette';
import { routes } from './routes';
import { useApplyTheme } from './theme';

export function App({ api }: { api: KeelApi }) {
  const [router] = useState(() => createBrowserRouter(routes));
  useApplyTheme();
  // App-level so Ctrl+K works from first paint, even before the shell has data.
  usePaletteHotkey();
  return (
    <ApiProvider api={api}>
      <RouterProvider router={router} />
    </ApiProvider>
  );
}
