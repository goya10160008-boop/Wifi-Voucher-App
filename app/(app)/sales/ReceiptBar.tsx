'use client';
import { useState } from 'react';
import Link from 'next/link';

/** Copy the live codes, share the receipt text, start a new sale. Stays above the bottom menu while scrolling. */
export function ReceiptBar({ codes, text }: { codes: string[]; text: string }) {
  const [msg, setMsg] = useState('');
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      flash(codes.length === 1 ? 'Code copied' : `Copied ${codes.length} codes`);
    } catch {
      flash('Could not copy. Press and hold a code to copy it.');
    }
  }
  async function share() {
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); flash('Receipt copied as text'); }
    } catch {
      /* the share sheet was closed: nothing to do */
    }
  }

  return (
    <div className="receipt-bar" role="group" aria-label="Receipt actions">
      <p role="status" className="min-h-6 text-center font-semibold text-ok-ink">{msg}</p>
      <div className="grid grid-cols-3 gap-2">
        {codes.length > 0
          ? <button type="button" onClick={copy} className="btn">{codes.length === 1 ? 'Copy code' : `Copy all ${codes.length}`}</button>
          : <span />}
        <button type="button" onClick={share} className="btn btn-ghost">Share</button>
        <Link href="/sell" className="btn btn-ghost">New sale</Link>
      </div>
    </div>
  );
}
