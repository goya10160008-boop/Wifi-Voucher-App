'use client';
import { useState } from 'react';
import Link from 'next/link';

// Stroke icons, 24x24, decorative (the label names the action). Same style as the bottom menu.
const ICONS = {
  copy: 'M9 9h10v11H9zM5 15V4h10',
  share: 'M12 15V4M7 9l5-5 5 5M5 14v6h14v-6',
  shot: 'M4 7h4l2-3h4l2 3h4v13H4zM12 17a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
  plus: 'M12 5v14M5 12h14',
} as const;
const Icon = ({ k }: { k: keyof typeof ICONS }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[k]} /></svg>
);

/** Copy the live codes, share the receipt text, screenshot view, new sale. Takes the place of the bottom menu on the receipt screen. */
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
    <div className="takeover" role="group" aria-label="Receipt actions">
      <p role="status" className="min-h-6 text-center font-semibold text-ok-ink">{msg}</p>
      <div>
        {codes.length > 0
          ? <button type="button" onClick={copy} aria-label={codes.length === 1 ? 'Copy code' : `Copy all ${codes.length} codes`}><Icon k="copy" />{codes.length === 1 ? 'Copy' : 'Copy all'}</button>
          : <span />}
        <button type="button" onClick={share}><Icon k="share" />Share</button>
        <Link href="?receipt=1" aria-label="Clean view for a screenshot"><Icon k="shot" />Screenshot</Link>
        <Link href="/sell" className="go"><Icon k="plus" />New sale</Link>
      </div>
    </div>
  );
}
