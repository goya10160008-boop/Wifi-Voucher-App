'use client';
import { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

export function VoucherCode({ code }: { code: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [msg, setMsg] = useState('');
  const [taps, setTaps] = useState(0);

  async function copy() {
    setTaps((n) => n + 1); // new key replays the pop animation
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
    <div className="code-card card flex flex-col items-center gap-4 p-6">
      <p ref={ref} className="select-all font-mono text-[44px] font-medium tracking-[0.1em]">{code}</p>
      <button onClick={copy} className="btn w-full">Copy code</button>
      <p role="status" key={taps} className={`min-h-6 font-semibold text-ok-ink ${msg ? 'pop' : ''}`}>{msg}</p>
      <QRCodeSVG value={code} size={160} fgColor="#10281c" />
    </div>
  );
}
