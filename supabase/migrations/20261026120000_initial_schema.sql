-- Initial schema: events, participants, photos.
--
-- Security model:
-- - Clients never read `events` by listing: the slug (from the QR) is the key,
--   resolved through `get_event_by_slug`.
-- - Participants join only through `join_event` (validates input, records consent).
-- - `photos` has RLS on and no policies yet: nothing is readable or writable
--   from the client until phase 2 adds the upload RPCs and phase 4 the
--   reveal-gated read policy.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]{10,32}$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Filled by trigger when omitted: ends_at + 2 hours.
  reveal_at timestamptz not null,
  max_shots integer not null default 12 check (max_shots between 1 and 100),
  date_stamp boolean not null default false,
  organizer_id uuid references auth.users (id) on delete set null,
  -- Always derived by trigger: ends_at + 90 days (GDPR retention).
  purge_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint events_ends_after_start check (ends_at > starts_at),
  constraint events_reveal_after_start check (reveal_at >= starts_at)
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 30),
  privacy_accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index participants_user_id_idx on public.participants (user_id);

create type public.photo_status as enum ('pending', 'uploaded');

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  -- Generated on the phone; makes retried uploads idempotent.
  client_id uuid not null unique,
  storage_path text not null unique,
  status public.photo_status not null default 'pending',
  hidden boolean not null default false,
  has_light_leak boolean not null default false,
  taken_at timestamptz not null default now(),
  uploaded_at timestamptz
);

create index photos_event_id_idx on public.photos (event_id);
create index photos_participant_id_idx on public.photos (participant_id);

-- ---------------------------------------------------------------------------
-- Derived event dates
-- ---------------------------------------------------------------------------

create function public.set_event_derived_dates()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.reveal_at is null then
    new.reveal_at := new.ends_at + interval '2 hours';
  end if;
  new.purge_at := new.ends_at + interval '90 days';
  return new;
end;
$$;

create trigger events_set_derived_dates
before insert or update of ends_at, reveal_at on public.events
for each row execute function public.set_event_derived_dates();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.events enable row level security;
alter table public.participants enable row level security;
alter table public.photos enable row level security;

-- Helper used by policies. SECURITY DEFINER so it can read `participants`
-- without re-triggering that table's own RLS (avoids policy recursion).
create function public.is_event_participant(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.participants
    where event_id = p_event_id and user_id = auth.uid()
  );
$$;

create policy "Participants can read events they joined"
on public.events for select
to authenticated
using (public.is_event_participant(id));

create policy "Users can read their own participations"
on public.participants for select
to authenticated
using (user_id = auth.uid());

-- Table privileges: explicit, so we don't depend on Supabase's defaults.
-- RLS still decides which rows are visible. All writes go through RPCs.
revoke all on public.events, public.participants, public.photos from anon, authenticated;
grant select on public.events, public.participants, public.photos to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Public lookup by slug (the QR is the key). Returns only what the join
-- screen needs; works before the visitor has a session.
create function public.get_event_by_slug(p_slug text)
returns table (
  id uuid,
  name text,
  starts_at timestamptz,
  ends_at timestamptz,
  reveal_at timestamptz,
  max_shots integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.name, e.starts_at, e.ends_at, e.reveal_at, e.max_shots
  from public.events e
  where e.slug = p_slug;
$$;

-- Joins the current user to an event (or updates their nickname if they
-- already joined). Calling it means the privacy notice was accepted; the
-- first acceptance time is kept.
create function public.join_event(p_slug text, p_display_name text)
returns public.participants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_name text := btrim(coalesce(p_display_name, ''));
  v_participant public.participants;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if char_length(v_name) not between 1 and 30 then
    raise exception 'invalid_display_name' using errcode = '22023';
  end if;

  select e.id into v_event_id from public.events e where e.slug = p_slug;
  if v_event_id is null then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;

  insert into public.participants (event_id, user_id, display_name)
  values (v_event_id, auth.uid(), v_name)
  on conflict (event_id, user_id)
    do update set display_name = excluded.display_name
  returning * into v_participant;

  return v_participant;
end;
$$;

-- Functions are executable by PUBLIC by default; lock them down.
revoke execute on function
  public.get_event_by_slug(text),
  public.join_event(text, text),
  public.is_event_participant(uuid),
  public.set_event_derived_dates()
from public, anon, authenticated;

grant execute on function public.get_event_by_slug(text) to anon, authenticated;
grant execute on function public.join_event(text, text) to authenticated;
grant execute on function public.is_event_participant(uuid) to authenticated;
