-- Shots: private storage bucket + reserve/confirm RPCs.
--
-- Upload flow (all steps idempotent, so the client can retry freely):
--   1. reserve_shot(event, client_id) → creates a `pending` photo row and
--      returns its storage path. Enforces the shot limit and event window.
--   2. Client uploads the JPEG to that exact path. The storage INSERT policy
--      only allows paths that belong to the caller's own pending photo.
--   3. confirm_shot(photo_id) → marks the photo `uploaded` once the file
--      exists in storage.
--
-- There is deliberately NO select policy on the bucket: nobody can download
-- or sign URLs for photos yet. Phase 4 adds a reveal-gated read policy.

-- ---------------------------------------------------------------------------
-- Bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg']);

-- ---------------------------------------------------------------------------
-- Storage policy
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER: `photos` has no client read policy, so the check has to
-- run with the function owner's rights.
create function public.can_upload_photo(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.photos p
    join public.participants pa on pa.id = p.participant_id
    where p.storage_path = p_object_name
      and p.status = 'pending'
      and pa.user_id = auth.uid()
  );
$$;

create policy "Participants upload their own reserved shots"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'photos'
  and public.can_upload_photo(name)
);

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- How many shots the current user has used in an event (pending + uploaded).
create function public.get_my_shots(p_event_id uuid)
returns table (used integer, max_shots integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::integer from public.photos p where p.participant_id = pa.id),
    e.max_shots
  from public.participants pa
  join public.events e on e.id = pa.event_id
  where pa.event_id = p_event_id and pa.user_id = auth.uid();
$$;

create function public.reserve_shot(
  p_event_id uuid,
  p_client_id uuid,
  p_has_light_leak boolean default false
)
returns table (photo_id uuid, storage_path text, shots_left integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_participant_id uuid;
  v_event public.events;
  v_existing public.photos;
  v_used integer;
  v_photo_id uuid := gen_random_uuid();
  v_path text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Lock the participant row: concurrent reserves from the same person
  -- (two tabs, fast retries) run one at a time, so the count below is exact.
  select pa.id into v_participant_id
  from public.participants pa
  where pa.event_id = p_event_id and pa.user_id = auth.uid()
  for update;

  if v_participant_id is null then
    raise exception 'not_a_participant' using errcode = '42501';
  end if;

  select * into v_event from public.events where id = p_event_id;

  -- Idempotency: a retry with the same client_id returns the same shot.
  select * into v_existing from public.photos where client_id = p_client_id;
  if found then
    if v_existing.participant_id <> v_participant_id then
      raise exception 'client_id_conflict' using errcode = '23505';
    end if;
    select count(*)::integer into v_used
    from public.photos where participant_id = v_participant_id;
    return query select v_existing.id, v_existing.storage_path, v_event.max_shots - v_used;
    return;
  end if;

  -- Shots taken offline may sync late, so uploads are accepted until the
  -- reveal (the UI only lets people shoot between starts_at and ends_at).
  if now() < v_event.starts_at or now() >= v_event.reveal_at then
    raise exception 'event_not_active' using errcode = '22023';
  end if;

  select count(*)::integer into v_used
  from public.photos where participant_id = v_participant_id;

  if v_used >= v_event.max_shots then
    raise exception 'no_shots_left' using errcode = '22023';
  end if;

  v_path := p_event_id || '/' || v_participant_id || '/' || v_photo_id || '.jpg';

  insert into public.photos (id, event_id, participant_id, client_id, storage_path, has_light_leak)
  values (v_photo_id, p_event_id, v_participant_id, p_client_id, v_path, coalesce(p_has_light_leak, false));

  return query select v_photo_id, v_path, v_event.max_shots - v_used - 1;
end;
$$;

create function public.confirm_shot(p_photo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo public.photos;
begin
  select p.* into v_photo
  from public.photos p
  join public.participants pa on pa.id = p.participant_id
  where p.id = p_photo_id and pa.user_id = auth.uid();

  if not found then
    raise exception 'photo_not_found' using errcode = 'P0002';
  end if;

  if v_photo.status = 'uploaded' then
    return;
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'photos' and o.name = v_photo.storage_path
  ) then
    raise exception 'file_missing' using errcode = 'P0002';
  end if;

  update public.photos
  set status = 'uploaded', uploaded_at = now()
  where id = p_photo_id;
end;
$$;

revoke execute on function
  public.can_upload_photo(text),
  public.get_my_shots(uuid),
  public.reserve_shot(uuid, uuid, boolean),
  public.confirm_shot(uuid)
from public, anon, authenticated;

grant execute on function
  public.can_upload_photo(text),
  public.get_my_shots(uuid),
  public.reserve_shot(uuid, uuid, boolean),
  public.confirm_shot(uuid)
to authenticated;
