-- Expose `date_stamp` to the join/camera screen, so the phone knows whether
-- to burn the orange date into each photo.

drop function public.get_event_by_slug(text);

create function public.get_event_by_slug(p_slug text)
returns table (
  id uuid,
  name text,
  starts_at timestamptz,
  ends_at timestamptz,
  reveal_at timestamptz,
  max_shots integer,
  date_stamp boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.name, e.starts_at, e.ends_at, e.reveal_at, e.max_shots, e.date_stamp
  from public.events e
  where e.slug = p_slug;
$$;

revoke execute on function public.get_event_by_slug(text) from public, anon, authenticated;
grant execute on function public.get_event_by_slug(text) to anon, authenticated;
