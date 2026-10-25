-- Stage 2: sign-in, sign-out, idle sign-out and CSV-export events. ADDITIVE; needs 0003 first.
-- Apply to the remote project only with the owner's approval (before deploying the app code that calls record_event).

alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check check (action in (
  'sale','void','import','plan_create','plan_update','plan_archive','plan_restore',
  'settings_update','staff_add','staff_deactivate','staff_reactivate','role_change',
  'login','logout','idle_signout','csv_export'));

-- Called by the app for the session events. Signed-in, active owner or staff only (never anon: no log flooding).
-- It never raises for a full quota (too many events in an hour are dropped), so a log problem can never block a sign-out.
create or replace function public.record_event(p_action text, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.has_role(array['owner','staff']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('login','logout','idle_signout','csv_export') then
    raise exception 'unknown event' using errcode = '22023';
  end if;
  if length(coalesce(p_detail, '{}'::jsonb)::text) > 300 then
    raise exception 'detail too large' using errcode = '22023';
  end if;
  if (select count(*) from public.audit_log l
       where l.actor = v_actor and l.at > now() - interval '1 hour'
         and l.action in ('login','logout','idle_signout','csv_export')) >= 60 then
    return;
  end if;
  perform public.audit_write(p_action, 'session', null, coalesce(p_detail, '{}'::jsonb));
end;
$$;
revoke execute on function public.record_event(text, jsonb) from public, anon;
grant  execute on function public.record_event(text, jsonb) to authenticated;
