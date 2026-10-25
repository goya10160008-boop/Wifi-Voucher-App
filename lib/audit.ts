// Pure helpers for the owner's activity log (the rows are written by database triggers, see 0003).
import { durationLabel } from '@/lib/duration';
import { formatPeso } from '@/lib/money';
import { sellerLabel, type NameMap } from '@/lib/seller';
import type { Json } from '@/lib/supabase/database.types';

export type AuditRow = {
  id: number; at: string; actor: string | null; actor_name: string | null;
  action: string; target_type: string | null; target_id: string | null; detail: Json;
};

export const ACTION_GROUPS = [
  { key: 'sale', label: 'Sales', actions: ['sale'] },
  { key: 'void', label: 'Voids', actions: ['void'] },
  { key: 'import', label: 'Imports', actions: ['import'] },
  { key: 'plans', label: 'Plans', actions: ['plan_create', 'plan_update', 'plan_archive', 'plan_restore'] },
  { key: 'settings', label: 'Settings', actions: ['settings_update'] },
  { key: 'staff', label: 'Staff', actions: ['staff_add', 'staff_deactivate', 'staff_reactivate', 'role_change'] },
  { key: 'access', label: 'Sign-ins', actions: ['login', 'logout', 'idle_signout', 'csv_export'] },
] as const;

/** Actions for a filter key; undefined (= no filter) for empty or unknown keys, so junk never reaches the query. */
export const actionsFor = (key: string | undefined): string[] | undefined => {
  const g = ACTION_GROUPS.find((x) => x.key === key);
  return g ? [...g.actions] : undefined;
};

type D = Record<string, unknown>;
const obj = (v: unknown): D => (v && typeof v === 'object' && !Array.isArray(v) ? (v as D) : {});
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Database admin" when the change came from the SQL editor (no signed-in actor). */
const who = (r: AuditRow) => {
  const n = r.actor_name?.trim();
  if (n) return n[0].toUpperCase() + n.slice(1);
  return r.actor ? 'Someone' : 'Database admin';
};

const change = (key: string, c: unknown) => {
  const { from, to } = obj(c);
  if (key === 'name') return `name ${String(from)} → ${String(to)}`;
  if (key === 'minutes') return `length ${durationLabel(Number(from))} → ${durationLabel(Number(to))}`;
  if (key === 'price_centavos') return `price ${formatPeso(Number(from))} → ${formatPeso(Number(to))}`;
  return null;
};

/** One plain sentence for a log row (no time: the page shows that separately). */
export function describeEvent(r: AuditRow): string {
  const a = who(r);
  const d = obj(r.detail);
  const name = str(d.name);
  switch (r.action) {
    case 'sale': {
      const count = num(d.count);
      if (count === undefined) return `${a} sold some vouchers`;
      const total = num(d.total_centavos);
      return `${a} sold ${plural(count, 'voucher', 'vouchers')}${total === undefined ? '' : ` · ${formatPeso(total)}`}`;
    }
    case 'void': {
      const code = str(d.code);
      const reason = str(d.reason);
      return `${a} voided ${code ? `sale ${code}` : 'a sale'}${reason ? `: ${reason}` : ''}`;
    }
    case 'import': {
      const count = num(d.count);
      const plan = str(d.plan);
      if (count === undefined) return `${a} imported codes`;
      return `${a} imported ${plural(count, 'code', 'codes')}${plan ? ` into ${plan}` : ''}`;
    }
    case 'plan_create': {
      const minutes = num(d.minutes);
      const price = num(d.price_centavos);
      const facts = [minutes === undefined ? null : durationLabel(minutes), price === undefined ? null : formatPeso(price)].filter(Boolean);
      return `${a} created plan ${name ?? ''}${facts.length ? ` (${facts.join(' · ')})` : ''}`.replace(/ +$/, '');
    }
    case 'plan_update': {
      const c = obj(d.changes);
      const parts = ['name', 'minutes', 'price_centavos'].filter((k) => k in c).map((k) => change(k, c[k])).filter(Boolean);
      return parts.length ? `${a} changed plan ${name ?? ''} ${parts.join(', ')}` : `${a} updated plan ${name ?? ''}`.trimEnd();
    }
    case 'plan_archive': return `${a} archived plan ${name ?? ''}`.trimEnd();
    case 'plan_restore': return `${a} restored plan ${name ?? ''}`.trimEnd();
    case 'settings_update': return `${a} changed the low-stock threshold ${String(d.from)} → ${String(d.to)}`;
    case 'staff_add': return `${a} added ${str(d.role) ?? 'staff'}${name ? ` ${name}` : ''}`;
    case 'staff_deactivate': return `${a} deactivated ${str(d.role) ?? 'staff'}${name ? ` ${name}` : ''}`;
    case 'staff_reactivate': return `${a} reactivated ${str(d.role) ?? 'staff'}${name ? ` ${name}` : ''}`;
    case 'role_change': return name ? `${a} changed ${name} from ${String(d.from)} to ${String(d.to)}` : `${a} changed a role`;
    case 'login': return `${a} signed in`;
    case 'logout': return `${a} signed out`;
    case 'idle_signout': return `${a} was signed out after being idle`;
    case 'csv_export': {
      const [from, to] = [str(d.from), str(d.to)];
      return `${a} downloaded the sales backup${from && to ? ` (${from} to ${to})` : ''}`;
    }
    default: return `${a}: ${r.action}`;
  }
}

/** Optional second line under the sentence. */
export function eventSub(r: AuditRow): string | null {
  const d = obj(r.detail);
  if (r.action === 'sale' && Array.isArray(d.plans) && d.plans.length) {
    return d.plans.map((p) => `${num(obj(p).qty) ?? '?'} × ${str(obj(p).plan) ?? 'plan'}`).join(', ');
  }
  if (r.action === 'void') {
    const plan = str(d.plan);
    const price = num(d.price_centavos);
    if (plan && price !== undefined) return `${plan} · ${formatPeso(price)}`;
  }
  return null;
}

/** Today by person: completed vouchers and pesos per seller, biggest total first. */
export function summarizeByPerson(rows: { sold_by: string; price_centavos: number; status: string }[], names: NameMap) {
  const by = new Map<string, { id: string; name: string; vouchers: number; total: number }>();
  for (const s of rows) {
    if (s.status !== 'completed') continue;
    const e = by.get(s.sold_by) ?? { id: s.sold_by, name: sellerLabel(names, s.sold_by), vouchers: 0, total: 0 };
    e.vouchers += 1;
    e.total += s.price_centavos;
    by.set(s.sold_by, e);
  }
  return [...by.values()].sort((x, y) => y.total - x.total || y.vouchers - x.vouchers);
}
