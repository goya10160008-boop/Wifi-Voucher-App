import { formatPeso } from '@/lib/money';
import { setPlanActive, updatePlan } from './actions';
import { PlanForm } from './PlanForm';

type Plan = { id: string; name: string; price_centavos: number; duration_minutes: number; active: boolean } & Record<string, unknown>;

/** One line per plan (name, price, hours); tap a line to edit or archive it. */
export function PlanRows({ plans }: { plans: Plan[] }) {
  return (
    <div className="rows">
      {plans.map((p) => (
        <details key={p.id} className={`drow ${p.active ? '' : 'opacity-60'}`}>
          <summary>
            <span className="ell font-bold">{p.name}{p.active ? '' : ' (archived)'}</span>
            <span className="whitespace-nowrap">{formatPeso(p.price_centavos)} · {p.duration_minutes / 60}h</span>
          </summary>
          <div className="drow-body flex flex-col gap-3">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <PlanForm action={updatePlan} plan={p as any} submitLabel="Save" />
            <form action={setPlanActive}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="active" value={String(!p.active)} />
              <button className="btn btn-ghost w-full">{p.active ? 'Archive plan' : 'Restore plan'}</button>
            </form>
          </div>
        </details>
      ))}
    </div>
  );
}
