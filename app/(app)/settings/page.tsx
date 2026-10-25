import { requireRole } from '@/lib/auth';
import { logout } from '../../(auth)/login/actions';
import { ThresholdForm } from './ThresholdForm';

export default async function SettingsPage() {
  const { supabase } = await requireRole('owner');
  const { data } = await supabase.from('settings').select('low_stock_threshold').single();
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <ThresholdForm value={data?.low_stock_threshold ?? 10} />
      <form action={logout}>
        <button className="min-h-12 w-full rounded-lg border border-gray-400 px-4">Sign out</button>
      </form>
    </main>
  );
}
