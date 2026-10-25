'use client';
import { useState, useTransition } from 'react';
import { parseCodes } from '@/lib/parse-codes';
import { extractPdfText } from '@/lib/pdf-text';
import { formatSize, importSummary, previousImport, recordImport, shortName, type Store } from '@/lib/import-history';
import { importCodes, type ImportResult } from './actions';

type Plan = { id: string; name: string };
type Source = { name: string; size?: number };

// localStorage can throw when blocked (private mode): fall back to "no history".
const history = (): Store => {
  try { return window.localStorage; } catch { return { getItem: () => null, setItem: () => {} }; }
};
const manila = (iso: string) =>
  new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(iso));

export function ImportClient({ plans }: { plans: Plan[] }) {
  const [codes, setCodes] = useState<string[]>([]);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [planId, setPlanId] = useState('');
  const [paste, setPaste] = useState('');
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<ImportResult>();
  const [source, setSource] = useState<Source | null>(null);
  const [repeatAt, setRepeatAt] = useState<string | null>(null);
  const [done, setDone] = useState('');
  const [pending, start] = useTransition();

  const load = (text: string, from: Source) => {
    const found = parseCodes(text);
    setSource(from);
    setCodes(found);
    setOff(new Set());
    setResult(undefined);
    setStatus(found.length ? '' : 'No codes found. Check the file, or paste the codes below.');
  };

  async function onFile(file?: File) {
    if (!file) return;
    const from = { name: file.name, size: file.size };
    setSource(from); // show the name straight away, before the slow reading starts
    setCodes([]);
    setResult(undefined);
    setRepeatAt(previousImport(history(), file.name, file.size)?.at ?? null);
    setStatus('Reading PDF…');
    try {
      load(await extractPdfText(file, setStatus), from);
    } catch {
      setSource(null);
      setStatus('Could not read that PDF. Try pasting the codes instead.');
    }
  }

  const selected = codes.filter((c) => !off.has(c));
  const planName = plans.find((p) => p.id === planId)?.name ?? '';
  const sourceName = source ? shortName(source.name) : 'Pasted text';
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
      if (!('error' in r)) {
        setDone(`from ${sourceName} into ${planName}`);
        if (source?.size !== undefined) recordImport(history(), source.name, source.size, new Date().toISOString());
        setCodes([]);
        setSource(null);
        setRepeatAt(null);
      }
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
        <button onClick={() => load(paste, { name: 'Pasted text' })} className="btn btn-ghost mt-2">Read codes</button>
      </details>

      {source && (
        <div className="card flex flex-col gap-1" title={source.name}>
          <span className="text-sm text-mute">{source.size === undefined ? 'Source' : 'File'}</span>
          <b className="break-all">{sourceName}</b>
          {source.size !== undefined && <span className="text-sm text-mute">{formatSize(source.size)}</span>}
        </div>
      )}
      {repeatAt && source && (
        <p role="alert" className="alert alert-warn">
          You already imported a file named {sourceName} on {manila(repeatAt)}. Importing it again will skip codes already in the system.
        </p>
      )}
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
          <p role="status" className="card break-words font-semibold">{importSummary(selected.length, sourceName, planName)}</p>
          <button disabled={!planId || !selected.length || pending} aria-busy={pending} onClick={submit} className="btn">
            {pending ? 'Importing…' : `Import ${selected.length} codes`}
          </button>
        </>
      )}

      {result && ('error' in result
        ? <p role="alert" className="alert alert-bad">{result.error}</p>
        : <p role="status" className="alert alert-ok">
            Imported {result.inserted} {done}. Already had {result.skippedDuplicate}. Invalid {result.skippedInvalid}.
          </p>)}
    </div>
  );
}
