import { Navigate, type RouteObject } from 'react-router';
import { NotFound, ScreenPlaceholder } from '@/features/ScreenPlaceholder';
import { AppShell } from './layout/AppShell';
import { RootRedirect } from './RootRedirect';
import { screens } from './screens';

export const routes: RouteObject[] = [
  { path: '/', element: <RootRedirect /> },
  {
    path: '/p/:programId',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="briefing" replace /> },
      ...screens.map((s) => ({ path: s.key, element: <ScreenPlaceholder screen={s.key} /> })),
      { path: 'items/:itemId', element: <ScreenPlaceholder screen="item" /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  { path: '*', element: <NotFound /> },
];
