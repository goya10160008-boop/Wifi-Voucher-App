'use client';
import { useState } from 'react';

/** A live code on the paper receipt; tapping it copies it. If the clipboard is blocked the code stays on screen to be copied by hand. */
export function CopyCode({ code }: { code: string }) {
  const [msg, setMsg] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setMsg('Copied ✓');
    } catch {
      setMsg('Press and hold the code');
    }
    setTimeout(() => setMsg(''), 2000);
  }
  return (
    <button type="button" onClick={copy} aria-label={`Copy code ${code}`} className="codebtn">
      <span className="receipt-code">{code}</span>
      {msg && <span className="codeok" role="status">{msg}</span>}
    </button>
  );
}
