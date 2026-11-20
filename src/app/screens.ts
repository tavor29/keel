import {
  CalendarRange,
  ClipboardList,
  FileText,
  Files,
  Inbox,
  KanbanSquare,
  MessagesSquare,
  Settings,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';

export type ScreenKey = 'briefing' | 'timeline' | 'boards' | 'channels' | 'mail' | 'report' | 'raid' | 'documents' | 'settings';

export interface Screen {
  key: ScreenKey;
  icon: LucideIcon;
  /** Build phase that delivers the screen (docs/build-plan.md). */
  phase: number;
}

/** Left-nav order. The item-detail screen has no nav entry. */
export const screens: Screen[] = [
  { key: 'briefing', icon: ClipboardList, phase: 2 },
  { key: 'timeline', icon: CalendarRange, phase: 2 },
  { key: 'boards', icon: KanbanSquare, phase: 5 },
  { key: 'channels', icon: MessagesSquare, phase: 3 },
  { key: 'mail', icon: Inbox, phase: 2 },
  { key: 'report', icon: FileText, phase: 2 },
  { key: 'raid', icon: ShieldAlert, phase: 2 },
  { key: 'documents', icon: Files, phase: 4 },
  { key: 'settings', icon: Settings, phase: 5 },
];

export const ITEM_SCREEN_PHASE = 2;

export function screenPath(programId: string, key: ScreenKey) {
  return `/p/${programId}/${key}`;
}

/** The screen segment of the current URL, e.g. "/p/prg_titan/timeline" → "timeline". */
export function currentScreen(pathname: string): ScreenKey {
  const seg = pathname.split('/')[3];
  return screens.find((s) => s.key === seg)?.key ?? 'briefing';
}
