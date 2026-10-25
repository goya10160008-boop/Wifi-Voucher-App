// Browser-side memory of PDFs already imported on this device, plus small text helpers for the Import page.
export type Store = Pick<Storage, 'getItem' | 'setItem'>;
type Entry = { name: string; size: number; at: string };

const KEY = 'imported-pdfs';
const MAX_ENTRIES = 50;

/** Long names are cut in the middle so the ending (and ".pdf") stays visible. */
export function shortName(name: string, max = 60) {
  if (name.length <= max) return name;
  const tail = name.slice(-Math.floor(max / 3));
  return `${name.slice(0, max - tail.length - 1)}…${tail}`;
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function importSummary(count: number, source: string, planName: string) {
  const what = `Importing ${count} ${count === 1 ? 'code' : 'codes'} from ${source}`;
  return planName ? `${what} into ${planName}` : `${what} (choose a plan)`;
}

function read(store: Store): Entry[] {
  try {
    const v = JSON.parse(store.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((e) => e && typeof e.name === 'string' && typeof e.size === 'number' && typeof e.at === 'string') : [];
  } catch {
    return []; // blocked storage or junk: behave as "never imported"
  }
}

export const previousImport = (store: Store, name: string, size: number) =>
  read(store).findLast((e) => e.name === name && e.size === size) ?? null;

export function recordImport(store: Store, name: string, size: number, at: string) {
  try {
    store.setItem(KEY, JSON.stringify([...read(store), { name, size, at }].slice(-MAX_ENTRIES)));
  } catch {} // best effort only: the database is the real guard against repeats
}
