import { requireRole } from '@/lib/auth';
import { ImportClient } from './ImportClient';

export default async function ImportPage() {
  const { supabase } = await requireRole('owner');
  const { data: plans } = await supabase.from('plans').select('id, name').eq('active', true).order('sort_order').order('price_centavos');
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Import codes</h1>
      {plans?.length ? <ImportClient plans={plans} /> : <p>Create a plan first on the Plans page.</p>}
    </main>
  );
}
