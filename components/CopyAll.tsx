'use client';
import { useRef, useState } from 'react';

/** Copies every code, one per line. If the clipboard is blocked, shows them selected for a manual copy. */
export function CopyAll({ codes }: { codes: string[] }) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [msg, setMsg] = useState('');
  const [manual, setManual] = useState(false);
  const [taps, setTaps] = useState(0);
  const text = codes.join('\n');

  async function copy() {
    setTaps((n) => n + 1); // new key replays the pop animation
    try {
      await navigator.clipboard.writeText(text);
      setMsg(`Copied ${codes.length} codes`);
      setManual(false);
    } catch {
      setManual(true);
      setMsg('Codes selected. Press and hold to copy.');
      requestAnimationFrame(() => area.current?.select());
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={copy} className="btn">Copy all {codes.length} codes</button>
      <p role="status" key={taps} className={`min-h-6 text-center font-semibold text-ok-ink ${msg ? 'pop' : ''}`}>{msg}</p>
      {manual && <textarea ref={area} readOnly value={text} rows={Math.min(codes.length, 10)} aria-label="All codes" className="field font-mono" />}
    </div>
  );
}
