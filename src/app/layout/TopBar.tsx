import { Bell, Check, Menu, Monitor, Moon, Search, Sparkles, Sun } from 'lucide-react';
import { DropdownMenu, Popover } from 'radix-ui';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { useMe, useMembers, useNotifications, usePersonas, useSwitchPersona } from '@/api/queries';
import { Button } from '@/ui/Button';
import { cn } from '@/ui/cn';
import { menuItem, menuLabel, popContent } from '@/ui/menu';
import { Avatar, Kbd } from '@/ui/primitives';
import { usePalette } from '../palette';
import { currentScreen } from '../screens';
import { useTheme, type ThemePref } from '../theme';

const themeIcons = { light: Sun, dark: Moon, system: Monitor } as const;

export function TopBar({ programId, onOpenNav }: { programId: string; onOpenNav: () => void }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const openPalette = usePalette((s) => s.setOpen);
  const screen = currentScreen(pathname);
  const isItem = pathname.includes('/items/');

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-surface px-2 sm:px-3">
      <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label={t('nav.openMenu')} onClick={onOpenNav}>
        <Menu />
      </Button>
      <h1 className="min-w-0 truncate text-[14px] font-semibold">
        {isItem ? t('screens.item.title') : t(`screens.${screen}.title`)}
      </h1>

      <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
        <button
          type="button"
          onClick={() => openPalette(true)}
          className="hidden h-8 w-64 items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 text-subtle hover:border-border-strong lg:flex"
        >
          <Search className="size-4" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left">{t('topbar.search')}</span>
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </button>
        <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label={t('topbar.search')} onClick={() => openPalette(true)}>
          <Search />
        </Button>
        <Button variant="ghost" size="sm" className="text-ai hover:text-ai" onClick={() => openPalette(true)}>
          <Sparkles />
          <span className="hidden sm:inline">{t('topbar.askKeel')}</span>
        </Button>
        <NotificationsButton />
        <ThemeMenu />
        <PersonaMenu programId={programId} />
      </div>
    </header>
  );
}

function NotificationsButton() {
  const { t } = useTranslation();
  const unread = (useNotifications().data ?? []).filter((n) => !n.read);
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('topbar.notifications')} className="relative">
          <Bell />
          {unread.length > 0 && <span className="absolute right-1 top-1 size-2 rounded-full bg-red" aria-hidden />}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className={cn(popContent, 'w-80 p-0')}>
          <div className="border-b border-border px-3 py-2 font-semibold">{t('topbar.notifications')}</div>
          <p className="px-3 py-6 text-center text-muted">{t('topbar.noNotifications')}</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ThemeMenu() {
  const { t } = useTranslation();
  const pref = useTheme((s) => s.pref);
  const setPref = useTheme((s) => s.setPref);
  const Icon = themeIcons[pref];
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('topbar.theme')}>
          <Icon />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={cn(popContent, 'min-w-40')}>
          <DropdownMenu.Label className={menuLabel}>{t('topbar.theme')}</DropdownMenu.Label>
          {(Object.keys(themeIcons) as ThemePref[]).map((p) => {
            const I = themeIcons[p];
            return (
              <DropdownMenu.Item key={p} className={menuItem} onSelect={() => setPref(p)}>
                <I aria-hidden />
                <span className="flex-1">{t(`theme.${p}`)}</span>
                {p === pref && <Check aria-hidden />}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function PersonaMenu({ programId }: { programId: string }) {
  const { t } = useTranslation();
  const me = useMe().data;
  const switchPersona = useSwitchPersona();
  const personas = usePersonas().data;
  const allMembers = useMembers(programId).data;
  // Demo personas who belong to this program (a full member list would be 80+ people).
  const members = allMembers?.filter((m) => personas?.some((p) => p.id === m.personId));
  const myRole = me?.memberships.find((m) => m.programId === programId)?.role;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={t('topbar.persona')}
        className="flex h-8 items-center gap-2 rounded-md px-1.5 hover:bg-surface-2"
      >
        {me && <Avatar name={me.person.name} color={me.person.avatarColor} />}
        <span className="hidden flex-col text-left leading-tight xl:flex">
          <span className="text-[12.5px] font-medium">{me?.person.name}</span>
          <span className="text-[11px] text-subtle">{myRole && t(`roles.${myRole}`)}</span>
        </span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={cn(popContent, 'w-64')}>
          <DropdownMenu.Label className={menuLabel}>{t('topbar.viewingAs')}</DropdownMenu.Label>
          {members?.map((m) => (
            <DropdownMenu.Item
              key={m.personId}
              className={cn(menuItem, 'h-10')}
              onSelect={() => switchPersona.mutate(m.personId)}
            >
              <Avatar name={m.person.name} color={m.person.avatarColor} size={22} />
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate">{m.person.name}</span>
                <span className="truncate text-[11px] text-subtle">
                  {t(`roles.${m.role}`)} · {m.person.org}
                </span>
              </span>
              {m.personId === me?.person.id && <Check aria-hidden />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
