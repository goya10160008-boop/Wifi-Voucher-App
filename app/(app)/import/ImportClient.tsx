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
      <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-400 p-4 text-center font-medium">
        Choose Omada PDF
        <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      <details>
        <summary className="min-h-12 cursor-pointer py-3">Or paste codes / CSV</summary>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={5}
          className="w-full rounded-lg border border-gray-400 p-3 font-mono" aria-label="Pasted codes" />
        <button onClick={() => load(paste)} className="mt-2 min-h-12 rounded-lg border border-gray-400 px-4">Read codes</button>
      </details>
      {status && <p role="status">{status}</p>}

      {codes.length > 0 && (
        <>
          <p className="font-semibold">{selected.length} of {codes.length} codes selected. Tap a code to untick it.</p>
          <ul className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto">
            {codes.map((c) => (
              <li key={c}>
                <button onClick={() => toggle(c)} aria-pressed={!off.has(c)}
                  className={`min-h-12 w-full rounded-lg border font-mono ${off.has(c) ? 'border-gray-300 text-gray-400 line-through' : 'border-blue-700 bg-blue-50'}`}>
                  {c}
                </button>
              </li>
            ))}
          </ul>
          <select value={planId} onChange={(e) => setPlanId(e.target.value)} aria-label="Plan"
            className="min-h-12 rounded-lg border border-gray-400 px-3 text-base">
            <option value="">Choose plan…</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button disabled={!planId || !selected.length || pending} onClick={submit}
            className="min-h-14 rounded-lg bg-blue-700 px-4 text-lg font-semibold text-white disabled:opacity-50">
            {pending ? 'Importing…' : `Import ${selected.length} codes`}
          </button>
        </>
      )}

      {result && ('error' in result
        ? <p role="alert" className="text-red-700">{result.error}</p>
        : <p role="status" className="rounded-lg bg-green-50 p-3 text-green-800">
            Imported {result.inserted}. Already had {result.skippedDuplicate}. Invalid {result.skippedInvalid}.
          </p>)}
    </div>
  );
}
