import { requireRole } from '@/lib/auth';
import { SellForm } from './SellForm';

export default async function SellPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { supabase } = await requireRole('owner', 'staff');
  const { plan } = await searchParams;
  const { data: plans } = await supabase.rpc('plan_stock');
  return (
    <main className="flex flex-col gap-4">
      <h1 className="h1">Sell voucher</h1>
      {plans?.length
        ? <SellForm plans={plans.map((p) => ({ ...p, available: Number(p.available) }))} initialPlan={plan} />
        : <p className="text-mute">No plans yet.</p>}
    </main>
  );
}
