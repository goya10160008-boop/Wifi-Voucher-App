import { requireRole } from '@/lib/auth';
import { formatPeso } from '@/lib/money';
import { createPlan, updatePlan, setPlanActive } from './actions';
import { PlanForm } from './PlanForm';

export default async function PlansPage() {
  const { supabase } = await requireRole('owner');
  const { data: plans } = await supabase.from('plans').select('*').order('active', { ascending: false }).order('sort_order').order('price_centavos');
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Plans</h1>
      <section className="rounded-xl border border-gray-300 p-4">
        <h2 className="mb-3 font-semibold">Add plan</h2>
        <PlanForm action={createPlan} submitLabel="Add plan" />
      </section>
      {plans?.map((p) => (
        <details key={p.id} className={`rounded-xl border border-gray-300 p-4 ${p.active ? '' : 'opacity-60'}`}>
          <summary className="flex min-h-12 cursor-pointer items-center justify-between">
            <span className="font-semibold">{p.name}{p.active ? '' : ' (archived)'}</span>
            <span>{formatPeso(p.price_centavos)} · {p.duration_minutes / 60}h</span>
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            <PlanForm action={updatePlan} plan={p} submitLabel="Save" />
            <form action={setPlanActive}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="active" value={String(!p.active)} />
              <button className="min-h-12 w-full rounded-lg border border-gray-400 px-4">
                {p.active ? 'Archive plan' : 'Restore plan'}
              </button>
            </form>
          </div>
        </details>
      ))}
    </main>
  );
}
