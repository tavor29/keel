import type { ReactNode } from 'react';
import { Navigate, type RouteObject } from 'react-router';
import { BriefingPage } from '@/features/briefing/BriefingPage';
import { ItemPage } from '@/features/item/ItemSheet';
import { MailPage } from '@/features/mail/MailPage';
import { ReportPage } from '@/features/report/ReportPage';
import { RaidPage } from '@/features/raid/RaidPage';
import { NotFound, ScreenPlaceholder } from '@/features/ScreenPlaceholder';
import { TimelinePage } from '@/features/timeline/TimelinePage';
import { AppShell } from './layout/AppShell';
import { RootRedirect } from './RootRedirect';
import { screens, type ScreenKey } from './screens';

/** Screens built so far; the rest render their placeholder. */
const built: Partial<Record<ScreenKey, ReactNode>> = {
  briefing: <BriefingPage />,
  timeline: <TimelinePage />,
  mail: <MailPage />,
  report: <ReportPage />,
  raid: <RaidPage />,
};

export const routes: RouteObject[] = [
  { path: '/', element: <RootRedirect /> },
  {
    path: '/p/:programId',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="briefing" replace /> },
      ...screens.map((s) => ({ path: s.key, element: built[s.key] ?? <ScreenPlaceholder screen={s.key} /> })),
      { path: 'items/:itemId', element: <ItemPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  { path: '*', element: <NotFound /> },
];
