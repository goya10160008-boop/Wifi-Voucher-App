import { requireRole } from '@/lib/auth';
import { createPlan } from './actions';
import { PlanForm } from './PlanForm';
import { PlanRows } from './PlanRows';

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
      <PlanRows plans={plans ?? []} />
    </main>
  );
}
