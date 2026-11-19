import { FileQuestion } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ITEM_SCREEN_PHASE, screens, type ScreenKey } from '@/app/screens';
import { Button } from '@/ui/Button';
import { Badge, EmptyState } from '@/ui/primitives';

/** Phase 0 stand-in for each screen: says what it will be and when it lands. */
export function ScreenPlaceholder({ screen }: { screen: ScreenKey | 'item' }) {
  const { t } = useTranslation();
  const def = screens.find((s) => s.key === screen);
  const Icon = def?.icon ?? FileQuestion;
  const phase = def?.phase ?? ITEM_SCREEN_PHASE;
  return (
    <EmptyState
      icon={<Icon />}
      title={t(`screens.${screen}.title`)}
      footer={<Badge tone="accent">{t('screens.plannedFor', { phase })}</Badge>}
    >
      {t(`screens.${screen}.body`)}
    </EmptyState>
  );
}

export function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState
        icon={<FileQuestion />}
        title={t('screens.notFound')}
        footer={
          <Button asChild variant="primary">
            <Link to="/">{t('screens.backHome')}</Link>
          </Button>
        }
      >
        {t('screens.notFoundBody')}
      </EmptyState>
    </div>
  );
}
