'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/** Below the paper, so it is not in a screenshot of the receipt. */
export function ReceiptActions({ text, backHref }: { text: string; backHref: string }) {
  const router = useRouter();
  const area = useRef<HTMLTextAreaElement>(null);
  const [msg, setMsg] = useState('');
  const [manual, setManual] = useState(false);
  const [taps, setTaps] = useState(0);

  async function copy() {
    setTaps((n) => n + 1); // new key replays the pop animation
    try {
      await navigator.clipboard.writeText(text);
      setMsg('Receipt copied');
      setManual(false);
    } catch {
      // Clipboard needs HTTPS and permission; show the text selected so it can be copied by hand.
      setManual(true);
      setMsg('Receipt selected. Press and hold to copy.');
      requestAnimationFrame(() => area.current?.select());
    }
  }

  // Receipt mode is its own history entry, so Done goes back; a fresh tab has nothing to go back to.
  const done = () => (window.history.length > 1 ? router.back() : router.replace(backHref));

  return (
    <div className="receipt-actions">
      <p className="text-center text-mute">Take a screenshot of the receipt above.</p>
      <button type="button" onClick={copy} className="btn btn-ghost">Copy receipt as text</button>
      <p role="status" key={taps} className={`min-h-6 text-center font-semibold text-ok-ink ${msg ? 'pop' : ''}`}>{msg}</p>
      {manual && <textarea ref={area} readOnly value={text} rows={12} aria-label="Receipt text" className="field font-mono" />}
      <button type="button" onClick={done} className="btn">Done</button>
    </div>
  );
}
