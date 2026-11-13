-- Applied to Supabase project xpkrtagvfwocnuecwukt on 2026-11-13.
-- Kept here for reference / re-creating the backend on a new project.
-- Depends on the existing tables: public.areas, public.clients, public.appointments
-- and private.is_admin() (admin RLS) created by the WhatsApp Business project.

grant usage on schema public to anon;
grant select on public.areas to anon;

create policy "public read active areas" on public.areas
  for select to anon
  using (active);

create or replace function public.book_appointment(
  p_full_name   text,
  p_phone       text,
  p_lang        text default 'ar',
  p_area_codes  text[] default '{}',
  p_preferred_at timestamptz default null,
  p_notes       text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_phone text;
  v_name  text := btrim(coalesce(p_full_name, ''));
  v_lang  text := case when p_lang in ('ar','en') then p_lang else 'ar' end;
  v_codes text[] := coalesce(p_area_codes, '{}');
  v_client uuid;
  v_appt   uuid;
  v_recent int;
begin
  if length(v_name) < 1 or length(v_name) > 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  -- phone: digits only; accept 05XXXXXXXX / 5XXXXXXXX / 9665XXXXXXXX / +966...
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if v_phone ~ '^05[0-9]{8}$' then v_phone := '966' || substr(v_phone, 2);
  elsif v_phone ~ '^5[0-9]{8}$' then v_phone := '966' || v_phone;
  elsif v_phone ~ '^00' then v_phone := substr(v_phone, 3);
  end if;
  if v_phone !~ '^[1-9][0-9]{7,14}$' then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;

  if array_length(v_codes, 1) is null then
    raise exception 'no_areas' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_codes) c where not exists
             (select 1 from public.areas a where a.code = c and a.active)) then
    raise exception 'invalid_area' using errcode = '22023';
  end if;

  if p_preferred_at is not null and p_preferred_at < now() - interval '1 hour' then
    raise exception 'past_time' using errcode = '22023';
  end if;
  if p_notes is not null and length(p_notes) > 500 then
    raise exception 'notes_too_long' using errcode = '22023';
  end if;

  insert into public.clients (full_name, phone, preferred_lang)
  values (v_name, v_phone, v_lang)
  on conflict (phone) do update
    set full_name = excluded.full_name,
        preferred_lang = excluded.preferred_lang
  returning id into v_client;

  select count(*) into v_recent from public.appointments
   where client_id = v_client and status = 'new' and created_at > now() - interval '24 hours';
  if v_recent >= 3 then
    raise exception 'too_many_requests' using errcode = '22023';
  end if;

  insert into public.appointments (client_id, area_codes, status, scheduled_at, notes)
  values (v_client, v_codes, 'new', p_preferred_at, nullif(btrim(p_notes), ''))
  returning id into v_appt;

  return v_appt;
end $$;

revoke all on function public.book_appointment(text, text, text, text[], timestamptz, text) from public;
grant execute on function public.book_appointment(text, text, text, text[], timestamptz, text) to anon, authenticated;

create index if not exists appointments_status_created_idx on public.appointments (status, created_at desc);
