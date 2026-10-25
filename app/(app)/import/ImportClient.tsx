'use client';
import { useState, useTransition } from 'react';
import { parseCodes } from '@/lib/parse-codes';
import { extractPdfText } from '@/lib/pdf-text';
import { importCodes, type ImportResult } from './actions';

type Plan = { id: string; name: string };

export function ImportClient({ plans }: { plans: Plan[] }) {
  const [codes, setCodes] = useState<string[]>([]);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [planId, setPlanId] = useState('');
  const [paste, setPaste] = useState('');
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<ImportResult>();
  const [pending, start] = useTransition();

  const load = (text: string) => {
    const found = parseCodes(text);
    setCodes(found);
    setOff(new Set());
    setResult(undefined);
    setStatus(found.length ? '' : 'No codes found. Check the file, or paste the codes below.');
  };

  async function onFile(file?: File) {
    if (!file) return;
    setStatus('Reading PDF…');
    try {
      load(await extractPdfText(file, setStatus));
    } catch {
      setStatus('Could not read that PDF. Try pasting the codes instead.');
    }
  }

  const selected = codes.filter((c) => !off.has(c));
  const toggle = (c: string) =>
    setOff((prev) => {
      const next = new Set(prev);
      if (!next.delete(c)) next.add(c);
      return next;
    });

  const submit = () =>
    start(async () => {
      const r = await importCodes(planId, selected);
      setResult(r);
      if (!('error' in r)) setCodes([]);
    });

  return (
    <div className="flex flex-col gap-5">
      <label className="card flex min-h-16 cursor-pointer items-center justify-center border-2 border-dashed border-line text-center font-semibold focus-within:outline-3 focus-within:outline-pri">
        Choose Omada PDF
        <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      <details className="card">
        <summary className="flex min-h-12 cursor-pointer items-center font-semibold">Or paste codes / CSV</summary>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={5}
          className="field mt-2 font-mono" aria-label="Pasted codes" />
        <button onClick={() => load(paste)} className="btn btn-ghost mt-2">Read codes</button>
      </details>
      {status && <p role="status" className="alert alert-warn">{status}</p>}

      {codes.length > 0 && (
        <>
          <p className="font-semibold">{selected.length} of {codes.length} codes selected. Tap a code to untick it.</p>
          <p className="text-sm text-mute">Compare the count and a few codes with your PDF. Reading a picture can misread a digit.</p>
          <ul className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto p-1">
            {codes.map((c) => (
              <li key={c}>
                <button onClick={() => toggle(c)} aria-pressed={!off.has(c)}
                  className={`chip w-full font-mono ${off.has(c) ? 'text-mute line-through' : ''}`}>
                  {c}
                </button>
              </li>
            ))}
          </ul>
          <select value={planId} onChange={(e) => setPlanId(e.target.value)} aria-label="Plan" className="field">
            <option value="">Choose plan…</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button disabled={!planId || !selected.length || pending} aria-busy={pending} onClick={submit} className="btn">
            {pending ? 'Importing…' : `Import ${selected.length} codes`}
          </button>
        </>
      )}

      {result && ('error' in result
        ? <p role="alert" className="alert alert-bad">{result.error}</p>
        : <p role="status" className="alert alert-ok">
            Imported {result.inserted}. Already had {result.skippedDuplicate}. Invalid {result.skippedInvalid}.
          </p>)}
    </div>
  );
}
