# Appointment System — James Laser Hair Removal for Men

Small, dependency-free web app (plain HTML/CSS/JS + Supabase) for taking and managing
appointment requests at Harmony Derma, Al Hamra, Riyadh.

| Page | Who | What |
|---|---|---|
| `index.html` | Clients | Bilingual (EN/AR) booking form: name, WhatsApp number, treatment areas, preferred date/time, notes. |
| `admin.html` | Nurse James | Sign in → see requests, filter/search, confirm/complete/cancel, edit schedule & areas, one-tap WhatsApp to the client, add walk-in bookings. |

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
