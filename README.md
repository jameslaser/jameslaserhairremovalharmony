# Appointment System — James Laser Hair Removal for Men

Small, dependency-free web app (plain HTML/CSS/JS + Supabase) for taking and managing
appointment requests at Harmony Derma, Al Hamra, Riyadh.

| Page | Who | What |
|---|---|---|
| `index.html` | Clients | Bilingual (EN/AR) booking form: name, WhatsApp number, treatment areas, preferred date/time, notes. |
| `admin.html` | Nurse James | Admin portal (single admin). Sidebar: **Dashboard** · **Appointments** → Requests, Appointments & Invoices, Patients, Reports, Patient Messages · **Medical Services** (price list, active toggle, and the appointments made per service). |

### Admin portal pages
- **Dashboard** — new requests, today's schedule, confirmed upcoming, paid this month.
- **Requests** — website requests (`new`/`contacted`); mark contacted, confirm with date/time, WhatsApp the patient, add walk-ins.
- **Appointments & Invoices** — **Booking board** (day view, 15-minute blocks, one column per laser machine: DEKA Again Pro Plus and Lutronic Clarity II; tap a slot to book, tap a block to edit) or list view; record the invoice issued by the clinic against each appointment (clinic invoice number, date, total, paid/unpaid, payment method).
- **Patients** — searchable list; patient record with history, invoices, messages, marketing opt-in.
- **Reports** — per month: appointments by status, no-show rate, new patients, revenue/VAT, top services, payments by method.
- **Patient Messages** — approved templates (EN/AR, placeholders `{{name}} {{clinic}} {{date}} {{time}} {{areas}}`) → opens WhatsApp and logs the message.
- **Medical Services** — service catalogue with price (SAR excl. VAT), duration, active toggle; click a service to see its booked appointments.

## How it works

- **Database**: the existing Supabase project (`xpkrtagvfwocnuecwukt`) — tables `areas`, `clients`, `appointments`
  shared with the WhatsApp Business system.
- **Public booking** calls one database function, `book_appointment()`, which validates the input,
  normalises the phone to `9665XXXXXXXX`, upserts the client and inserts an appointment with status `new`.
  Anonymous visitors can read active treatment areas and nothing else.
- **Admin** uses Supabase Auth (email + password). Row Level Security only allows accounts listed in
  `private.admin_users` to read or change data.
- Appointment statuses: `new → contacted → confirmed → done`, or `cancelled` / `no_show`.

The SQL that was applied is in `supabase/migrations/`.

## Hosting (GitHub Pages)

Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)`.
The site is then served at `https://jameslaser.github.io/jameslaserhairremovalharmony/`
(`…/admin.html` for the dashboard). A custom domain (e.g. `book.jameslaserformen.com`) can be added
in the same settings page.

## Local development

Any static server works, e.g. `python3 -m http.server 8080` then open `http://localhost:8080`.
All configuration is in `assets/config.js` (clinic hours, WhatsApp number, Supabase URL and publishable key —
the key is safe to publish; it only grants what RLS allows).

## Adding another admin

```sql
insert into private.admin_users (user_id)
select id from auth.users where email = 'person@example.com';
```
