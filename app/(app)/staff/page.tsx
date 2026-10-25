import { requireRole } from '@/lib/auth';
import { PinForm } from './PinForm';
import { setStaffActive, unlockStaffPin } from './actions';

export default async function StaffPage() {
  const { supabase } = await requireRole('owner');
  const { data, error } = await supabase.rpc('user_pin_status');
  if (error) throw new Error('Could not load staff.');
  return (
    <main className="flex flex-col gap-5">
      <h1 className="h1">Staff</h1>
      <p className="text-mute">Staff sign in with a username and a 6-digit PIN. Add the person in the Supabase dashboard first, then set their PIN here.</p>
      {data.length === 0 && <p className="card text-mute">No staff yet.</p>}
      {data.map((s) => {
        const state = !s.active ? 'Deactivated' : s.hard_locked ? 'Locked until you unlock' : s.locked ? 'Locked for 15 minutes' : s.username ? 'PIN set' : 'No PIN yet';
        return (
          <details key={s.user_id} className={`card ${s.active ? '' : 'opacity-60'}`}>
            <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-2">
              <span className="font-bold">{s.display_name ?? 'Unnamed'}</span>
              <span className={s.locked ? 'text-bad' : 'text-mute'}>{state}</span>
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              {s.active && <PinForm user={s.user_id} username={s.username} hasPin={!!s.username} />}
              {s.locked && (
                <form action={unlockStaffPin}>
                  <input type="hidden" name="user" value={s.user_id} />
                  <button className="btn btn-ghost w-full">Unlock PIN</button>
                </form>
              )}
              <form action={setStaffActive}>
                <input type="hidden" name="user" value={s.user_id} />
                <input type="hidden" name="active" value={String(!s.active)} />
                <button className="btn btn-ghost w-full">{s.active ? 'Deactivate' : 'Reactivate'}</button>
              </form>
            </div>
          </details>
        );
      })}
    </main>
  );
}
