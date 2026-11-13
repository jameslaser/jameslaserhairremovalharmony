-- Applied 2026-11-13. Service prices/durations on areas + invoices table (auto-numbered, 15% VAT computed by trigger).
alter table public.areas add column if not exists price numeric(10,2) check (price is null or price >= 0);
alter table public.areas add column if not exists duration_min integer check (duration_min is null or duration_min > 0);

create sequence if not exists private.invoice_seq;
create or replace function private.next_invoice_no()
returns text language sql volatile set search_path to '' as $$
  select 'INV-' || to_char(now() at time zone 'Asia/Riyadh', 'YYYY') || '-' || lpad(nextval('private.invoice_seq')::text, 5, '0')
$$;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique default private.next_invoice_no(),
  appointment_id uuid not null unique references public.appointments(id) on delete cascade,
  client_id uuid not null references public.clients(id),
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0 check (discount >= 0),
  vat_rate numeric(5,4) not null default 0.15,
  vat numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','issued','paid','void')),
  payment_method text check (payment_method is null or payment_method in ('cash','card','transfer','other')),
  paid_at timestamptz,
  notes text check (notes is null or length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists invoices_client_idx on public.invoices (client_id);
create index if not exists invoices_status_idx on public.invoices (status, created_at desc);
alter table public.invoices enable row level security;
create policy "admins only" on public.invoices for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
grant select, insert, update, delete on public.invoices to authenticated;
create trigger invoices_touch before update on public.invoices for each row execute function private.touch_updated_at();

create or replace function private.compute_invoice_totals()
returns trigger language plpgsql set search_path to '' as $$
declare s numeric := 0;
begin
  select coalesce(sum((i->>'qty')::numeric * (i->>'unit_price')::numeric), 0) into s
    from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) i;
  new.subtotal := round(s, 2);
  if new.discount > new.subtotal then new.discount := new.subtotal; end if;
  new.vat := round((new.subtotal - new.discount) * new.vat_rate, 2);
  new.total := round(new.subtotal - new.discount + new.vat, 2);
  if new.status = 'paid' and new.paid_at is null then new.paid_at := now(); end if;
  return new;
end $$;
create trigger invoices_totals before insert or update on public.invoices for each row execute function private.compute_invoice_totals();

-- 2026-11-13 (later): invoices are copies of the clinic's own invoice, not generated here.
alter table public.invoices add column if not exists issued_on date;
alter table public.invoices alter column invoice_no drop default;
-- compute_invoice_totals() now: with items → compute; without items → total as printed (VAT incl.), VAT back-calculated.

-- 2026-11-13: booking board — machine + duration per appointment
alter table public.appointments
  add column if not exists device text check (device is null or device in ('deka_again_pro_plus','clarity_ii')),
  add column if not exists duration_min integer not null default 30 check (duration_min between 15 and 480);
create index if not exists appointments_scheduled_idx on public.appointments (scheduled_at);
