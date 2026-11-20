import { ExternalLink, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { Link, useParams } from 'react-router';
import { Button } from '@/ui/Button';
import { ItemDetail } from './ItemDetail';

/** Right-side sheet showing an item without leaving the current screen. */
export function ItemSheet({ programId, itemId, onClose, onOpen }: { programId: string; itemId?: string; onClose: () => void; onOpen?: (id: string) => void }) {
  return (
    <Dialog.Root open={!!itemId} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay/40" />
        <Dialog.Content aria-describedby={undefined} className="fixed inset-y-0 right-0 z-50 flex w-[min(560px,100vw)] flex-col border-l border-border bg-bg shadow-pop">
          <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border bg-surface px-2">
            <Dialog.Title className="px-1 text-[13px] font-semibold">Item</Dialog.Title>
            {itemId && (
              <Button asChild variant="ghost" size="sm" className="ml-auto">
                <Link to={`/p/${programId}/items/${itemId}`}>
                  <ExternalLink /> Open
                </Link>
              </Button>
            )}
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close" className={itemId ? '' : 'ml-auto'}>
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{itemId && <ItemDetail programId={programId} itemId={itemId} onOpen={onOpen} />}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ItemPage() {
  const { programId = '', itemId = '' } = useParams();
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <ItemDetail programId={programId} itemId={itemId} />
    </div>
  );
}
