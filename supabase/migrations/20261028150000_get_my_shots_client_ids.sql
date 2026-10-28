-- get_my_shots also returns the client_ids the server already knows, so the
-- phone can count each shot exactly once (server rows + queued shots the
-- server hasn't seen), with no double counting while a reserve is in flight.

drop function public.get_my_shots(uuid);

create function public.get_my_shots(p_event_id uuid)
returns table (used integer, max_shots integer, client_ids uuid[])
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::integer from public.photos p where p.participant_id = pa.id),
    e.max_shots,
    coalesce(
      (select array_agg(p.client_id) from public.photos p where p.participant_id = pa.id),
      '{}'
    )
  from public.participants pa
  join public.events e on e.id = pa.event_id
  where pa.event_id = p_event_id and pa.user_id = auth.uid();
$$;

revoke execute on function public.get_my_shots(uuid) from public, anon, authenticated;
grant execute on function public.get_my_shots(uuid) to authenticated;
