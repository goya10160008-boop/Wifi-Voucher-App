import { formatPeso } from '@/lib/money';
import {
  BUSINESS_NAME, INSTRUCTION, THANKS, buildReceipt, buildReceiptText, durationLabel, manilaWhen, receiptNumber, type ReceiptSale,
} from '@/lib/receipt';
import { CopyCode } from './CopyCode';
import { ReceiptActions } from './ReceiptActions';

/** The paper receipt. `copyable` makes each live code a tap-to-copy button (the clean screenshot view has plain text). */
export function ReceiptPaper({ sales, tendered, refId, createdAt, guest, room, copyable = false }: {
  sales: ReceiptSale[]; tendered: number | null; refId: string; createdAt: string; guest: string | null; room: string | null; copyable?: boolean;
}) {
  const r = buildReceipt(sales, tendered);
  const number = receiptNumber(refId);
  const when = manilaWhen(createdAt);
  return (
  <article className="receipt" aria-label="Receipt" data-dense={r.codes.length > 5 ? '' : undefined}>
    <header className="text-center">
      <h1 className="receipt-name">{BUSINESS_NAME}</h1>
      <p className="receipt-meta">Receipt #{number}</p>
      <p className="receipt-meta">{when}</p>
    </header>

    {r.lines.map((l) => (
      <section key={`${l.plan}|${l.minutes}|${l.price}`} className="receipt-sec receipt-plan" aria-label={`${l.plan}, ${durationLabel(l.minutes)}`}>
        <h2 className="receipt-plan-head">
          <span>{l.plan} <small>({durationLabel(l.minutes)})</small></span>
          <span>{l.qty} × {formatPeso(l.price)} = {formatPeso(l.subtotal)}</span>
        </h2>
        <ol className="receipt-codes">
          {l.codes.map((c) => (
            <li key={c.seq}>
              <span className="receipt-seq" aria-hidden="true">{c.seq}.</span>
              {c.voided
                ? <span className="receipt-voided" role="text" aria-label={`Code ${c.seq} voided, do not use`}>VOIDED</span>
                : copyable ? <CopyCode code={c.code!} /> : <span className="receipt-code">{c.code}</span>}
            </li>
          ))}
        </ol>
      </section>
    ))}

    <dl className="receipt-sec receipt-sum">
      <dt>Total</dt><dd>{formatPeso(r.total)}</dd>
      {r.cash !== null && r.change !== null && <><dt>Cash</dt><dd>{formatPeso(r.cash)}</dd><dt>Change</dt><dd>{formatPeso(r.change)}</dd></>}
    </dl>

    {(guest || room) && (
      <p className="receipt-meta text-center">{[guest, room && `Room ${room}`].filter(Boolean).join(' · ')}</p>
    )}
    <footer className="receipt-sec text-center">
      {r.voidedCount > 0 && <p className="receipt-note">Voided codes cannot be used.</p>}
      <p>{INSTRUCTION}.</p>
      <p className="receipt-thanks">{THANKS}</p>
    </footer>
  </article>
  );
}

/**
 * Screenshot mode (?receipt=1). The paper fills the first screen so the buttons sit below the fold and stay out of
 * a normal phone screenshot. Built only from rows the page already loaded: no extra queries or writes.
 */
export function ReceiptScreen({ sales, tendered, id, createdAt, guest, room, backHref }: {
  sales: ReceiptSale[]; tendered: number | null; id: string; createdAt: string; guest: string | null; room: string | null; backHref: string;
}) {
  const r = buildReceipt(sales, tendered);
  const text = buildReceiptText(r, { number: receiptNumber(id), when: manilaWhen(createdAt), guest, room });
  return (
    <main className="receipt-screen">
      <div className="receipt-stage">
        <ReceiptPaper sales={sales} tendered={tendered} refId={id} createdAt={createdAt} guest={guest} room={room} />
      </div>
      <ReceiptActions text={text} backHref={backHref} />
    </main>
  );
}
