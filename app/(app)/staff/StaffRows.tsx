import { PinForm } from './PinForm';
import { setStaffActive, unlockStaffPin } from './actions';

export type StaffRow = { user_id: string; display_name: string | null; active: boolean; username: string | null; locked: boolean; hard_locked: boolean };

/** One line per staff member (name and PIN state); tap a line to set the PIN, unlock or deactivate. */
export function StaffRows({ rows }: { rows: StaffRow[] }) {
  return (
    <div className="rows">
      {rows.map((s) => {
        const state = !s.active ? 'Deactivated' : s.hard_locked ? 'Locked until you unlock' : s.locked ? 'Locked for 15 minutes' : s.username ? 'PIN set' : 'No PIN yet';
        return (
          <details key={s.user_id} className={`drow ${s.active ? '' : 'opacity-60'}`}>
            <summary>
              <span className="ell font-bold">{s.display_name ?? 'Unnamed'}</span>
              <span className={`whitespace-nowrap ${s.locked ? 'text-bad' : 'text-mute'}`}>{state}</span>
            </summary>
            <div className="drow-body flex flex-col gap-3">
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
    </div>
  );
}
