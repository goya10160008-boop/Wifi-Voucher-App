import Link from 'next/link';
import { ReceiptPaper } from '@/components/Receipt';
import { buildReceipt, buildReceiptText, manilaWhen, receiptNumber } from '@/lib/receipt';
import { OWNER_TEST_MINUTES } from '@/lib/void-reasons';
import type { Database } from '@/lib/supabase/database.types';
import { ReceiptBar } from './ReceiptBar';
import { VoidPanel } from './VoidPanel';

type Sale = Database['public']['Tables']['sales']['Row'];

/**
 * The one screen for a sale: right after paying (`isNew`) and when opened later from Sales. A receipt with the codes,
 * Copy / Share / New sale, and for the owner a Void section. `refId` is the receipt's group id (or the sale id of an old sale).
 */
export function SaleReceipt({ sales, tendered, refId, isNew, role, userId, soldBy }: {
  sales: Sale[]; tendered: number | null; refId: string; isNew: boolean; role: 'owner' | 'staff'; userId: string; soldBy: string | null;
}) {
  const live = sales.filter((s) => s.status === 'completed');
  const voided = sales.filter((s) => s.status === 'voided');
  const first = sales[0];
  const returned = voided.some((s) => s.void_reason_code === 'owner_test');
  // Display only: the database repeats these checks when the owner tries Owner Test.
  const block = live.some((s) => s.sold_by !== userId) ? 'STAFF_SALE'
    : live.some((s) => Date.now() - new Date(s.created_at).getTime() > OWNER_TEST_MINUTES * 60_000) ? 'TOO_OLD' : null;
  const text = buildReceiptText(buildReceipt(sales, tendered), {
    number: receiptNumber(refId), when: manilaWhen(first.created_at), guest: first.buyer_name, room: first.buyer_room,
  });

  return (
    <main className="flex flex-col gap-4">
      {isNew && live.length > 0 && (
        <p role="status" className="alert alert-ok self-start font-semibold">
          Sale complete. Give {live.length === 1 ? 'this code' : `these ${live.length} codes`} to the guest.
        </p>
      )}
      {voided.length > 0 && (
        <p role="status" className="alert alert-bad">
          {live.length === 0 ? 'This whole receipt is voided' : `${voided.length} of ${sales.length} codes voided`}
          {voided[0].void_reason ? `: ${voided[0].void_reason}` : ''}.
          {returned ? ` ${voided.length === 1 ? 'The code was' : 'The codes were'} returned to stock.` : ' Voided codes stay burned.'}
        </p>
      )}
      {soldBy && <p className="text-mute">Sold by {soldBy}</p>}

      <ReceiptPaper sales={sales} tendered={tendered} refId={refId} createdAt={first.created_at} guest={first.buyer_name} room={first.buyer_room} copyable />
      <ReceiptBar codes={live.map((s) => s.voucher_code)} text={text} />

      {role === 'owner' && live.length > 0 && (
        <VoidPanel refId={refId} live={live.map((s) => ({ id: s.id, code: s.voucher_code }))} total={sales.length} block={block} />
      )}
      <Link href="?receipt=1" className="btn btn-ghost">Clean view for a screenshot</Link>
    </main>
  );
}
