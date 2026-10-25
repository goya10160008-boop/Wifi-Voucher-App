import { requireRole } from '@/lib/auth';
import { formatPeso } from '@/lib/money';
import { createPlan, updatePlan, setPlanActive } from './actions';
import { PlanForm } from './PlanForm';

export default async function PlansPage() {
  const { supabase } = await requireRole('owner');
  const { data: plans } = await supabase.from('plans').select('*').order('active', { ascending: false }).order('sort_order').order('price_centavos');
  return (
    <main className="flex flex-col gap-5">
      <h1 className="h1">Plans</h1>
      <section className="card">
        <h2 className="mb-3 font-bold">Add plan</h2>
        <PlanForm action={createPlan} submitLabel="Add plan" />
      </section>
      {plans?.map((p) => (
        <details key={p.id} className={`card ${p.active ? '' : 'opacity-60'}`}>
          <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-2">
            <span className="font-bold">{p.name}{p.active ? '' : ' (archived)'}</span>
            <span>{formatPeso(p.price_centavos)} · {p.duration_minutes / 60}h</span>
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            <PlanForm action={updatePlan} plan={p} submitLabel="Save" />
            <form action={setPlanActive}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="active" value={String(!p.active)} />
              <button className="btn btn-ghost w-full">{p.active ? 'Archive plan' : 'Restore plan'}</button>
            </form>
          </div>
        </details>
      ))}
    </main>
  );
}
