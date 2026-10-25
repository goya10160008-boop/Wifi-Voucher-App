'use client';
import { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

export function VoucherCode({ code }: { code: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [msg, setMsg] = useState('');

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setMsg('Copied');
    } catch {
      // Clipboard needs HTTPS and permission; fall back to selecting the text.
      const range = document.createRange();
      range.selectNodeContents(ref.current!);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(range);
      setMsg('Code selected. Press and hold to copy.');
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-blue-700 p-6">
      <p ref={ref} className="select-all font-mono text-5xl font-bold tracking-widest">{code}</p>
      <button onClick={copy} className="min-h-12 w-full rounded-lg bg-blue-700 px-4 text-lg font-semibold text-white">Copy code</button>
      <p role="status" className="min-h-6 text-green-700">{msg}</p>
      <QRCodeSVG value={code} size={160} />
    </div>
  );
}
