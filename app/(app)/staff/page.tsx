import { requireRole } from '@/lib/auth';
import { StaffRows } from './StaffRows';

export default async function StaffPage() {
  const { supabase } = await requireRole('owner');
  const { data, error } = await supabase.rpc('user_pin_status');
  if (error) throw new Error('Could not load staff.');
  return (
    <main className="flex flex-col gap-5">
      <h1 className="h1">Staff</h1>
      <p className="text-mute">Staff sign in with a username and a 6-digit PIN. Add the person in the Supabase dashboard first, then set their PIN here.</p>
      {data.length === 0 && <p className="card text-mute">No staff yet.</p>}
      <StaffRows rows={data} />
    </main>
  );
}
