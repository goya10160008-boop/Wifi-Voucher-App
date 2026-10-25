import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { logout } from '../../(auth)/login/actions';
import { ThresholdForm } from './ThresholdForm';

export default async function SettingsPage() {
  const { supabase } = await requireRole('owner');
  const { data } = await supabase.from('settings').select('low_stock_threshold').single();
  return (
    <main className="flex flex-col gap-5">
      <h1 className="h1">Settings</h1>
      <ThresholdForm value={data?.low_stock_threshold ?? 10} />
      <Link href="/staff" className="btn btn-ghost">Staff and PINs</Link>
      <form action={logout}>
        <button className="btn btn-ghost w-full">Sign out</button>
      </form>
    </main>
  );
}
