/* Admin portal — James Laser Hair Removal for Men
   Pages: dashboard · requests · appointments (+ invoices) · patients · reports · messages · services */
(function () {
  const C = window.APP_CONFIG;
  const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TZ = C.CLINIC.timezone;

  const STATUS = { new: "New", contacted: "Contacted", confirmed: "Confirmed", done: "Done", cancelled: "Cancelled", no_show: "No-show" };
  const OPEN = ["new", "contacted", "confirmed"];
  const APPT_SELECT = "id,status,area_codes,scheduled_at,notes,created_at,updated_at,client:clients(id,full_name,phone,preferred_lang),invoice:invoices(id,invoice_no,status,total)";

  let areas = [];
  const areaName = (code) => (areas.find((a) => a.code === code) || {}).name_en || code;
  const areaPrice = (code) => Number((areas.find((a) => a.code === code) || {}).price || 0);

  // ---------- helpers ----------
  const fmt = (ts, opts) => ts ? new Date(ts).toLocaleString("en-GB", Object.assign({ timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }, opts || {})) : "—";
  const fmtD = (ts) => ts ? new Date(ts).toLocaleDateString("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" }) : "—";
  const sar = (n) => `SAR ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const badge = (s, map = STATUS) => `<span class="badge ${s}">${map[s] || s}</span>`;
  const waLink = (phone, text) => `https://wa.me/${phone}${text ? "?text=" + encodeURIComponent(text) : ""}`;
  function toLocalInput(ts) {
    if (!ts) return "";
    const p = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ts));
    const g = (t) => p.find((x) => x.type === t).value;
    return `${g("year")}-${g("month")}-${g("day")}T${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}`;
  }
  const fromLocalInput = (v) => (v ? `${v}:00+03:00` : null);
  function riyadhDayBounds(dateStr) { return [`${dateStr}T00:00:00+03:00`, `${dateStr}T23:59:59+03:00`]; }
  function todayStr() { return new Date().toLocaleDateString("en-CA", { timeZone: TZ }); }
  function monthBounds(ym) { const [y, m] = ym.split("-").map(Number); const end = new Date(Date.UTC(y, m, 1)); return [`${ym}-01T00:00:00+03:00`, `${end.toISOString().slice(0, 10)}T00:00:00+03:00`]; }
  function toast(msg, ok) {
    const el = document.createElement("div");
    el.className = "alert " + (ok ? "ok" : "error");
    el.style.cssText = "position:fixed;bottom:1rem;left:50%;transform:translateX(-50%);z-index:60;max-width:90vw";
    el.textContent = msg; document.body.appendChild(el); setTimeout(() => el.remove(), 3500);
  }
  function fail(error) { toast(/permission|policy|row-level/i.test(error.message) ? "This account is not an admin." : error.message); }

  // ---------- modal ----------
  function openModal(html, wide) { const b = $("#modalbox"); b.className = "modal" + (wide ? " wide" : ""); b.innerHTML = html; $("#modal").classList.remove("hidden"); return b; }
  function closeModal() { $("#modal").classList.add("hidden"); }
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

  // ---------- auth ----------
  let booted = false;
  async function init() {
    const { data: { session } } = await sb.auth.getSession();
    session ? showApp(session) : showLogin();
    sb.auth.onAuthStateChange((_e, s) => (s ? showApp(s) : showLogin()));
  }
  function showLogin() { $("#login").classList.remove("hidden"); $("#app").classList.add("hidden"); $("#userbox").classList.add("hidden"); booted = false; }
  async function showApp(session) {
    $("#login").classList.add("hidden"); $("#app").classList.remove("hidden"); $("#userbox").classList.remove("hidden");
    $("#useremail").textContent = session.user.email;
    if (booted) return; booted = true;
    await loadAreas();
    route();
  }
  $("#loginform").addEventListener("submit", async (e) => {
    e.preventDefault();
    const m = $("#loginmsg"); m.classList.add("hidden");
    const { error } = await sb.auth.signInWithPassword({ email: $("#email").value.trim(), password: $("#password").value });
    if (error) { m.textContent = error.message; m.classList.remove("hidden"); }
  });
  $("#forgot").addEventListener("click", async (e) => {
    e.preventDefault();
    const email = $("#email").value.trim(); const m = $("#loginmsg");
    if (!email) { m.textContent = "Enter your email first."; m.classList.remove("hidden"); return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split("#")[0] });
    m.textContent = error ? error.message : "Password reset email sent."; m.className = "alert " + (error ? "error" : "ok");
  });
  $("#logout").addEventListener("click", () => sb.auth.signOut());
  $("#menubtn").addEventListener("click", () => $("#side").classList.toggle("open"));
  $("#side").addEventListener("click", (e) => { if (e.target.closest("a")) $("#side").classList.remove("open"); });

  // ---------- data ----------
  async function loadAreas() {
    const { data, error } = await sb.from("areas").select("code,name_en,name_ar,collection_en,collection_ar,active,sort_order,price,duration_min").order("sort_order");
    if (error) return fail(error);
    areas = data || [];
  }
  async function updateRequestCount() {
    const { count } = await sb.from("appointments").select("id", { count: "exact", head: true }).eq("status", "new");
    const n = $("#n_requests"); n.textContent = count || ""; n.classList.toggle("hidden", !count);
  }

  // ---------- routing ----------
  const PAGES = {};
  function route() {
    const hash = (location.hash || "#dashboard").slice(1);
    const [page, param] = hash.split("/");
    const fn = PAGES[page] || PAGES.dashboard;
    $$("#side a[data-page]").forEach((a) => a.classList.toggle("active", a.dataset.page === page));
    $("#content").innerHTML = `<p class="muted">Loading…</p>`;
    updateRequestCount();
    fn(param).catch((e) => { $("#content").innerHTML = `<div class="alert error">${esc(e.message || e)}</div>`; });
  }
  window.addEventListener("hashchange", route);
  const view = (html) => { $("#content").innerHTML = html; return $("#content"); };

  // ======================================================================
  // DASHBOARD
  // ======================================================================
  PAGES.dashboard = async () => {
    const today = todayStr(); const [d0, d1] = riyadhDayBounds(today); const [m0, m1] = monthBounds(today.slice(0, 7));
    const [{ data: statusRows }, { data: todayRows }, { data: recent }, { data: paid }, { data: newPatients }] = await Promise.all([
      sb.from("appointments").select("status"),
      sb.from("appointments").select(APPT_SELECT).gte("scheduled_at", d0).lte("scheduled_at", d1).in("status", OPEN).order("scheduled_at"),
      sb.from("appointments").select(APPT_SELECT).eq("status", "new").order("created_at", { ascending: false }).limit(5),
      sb.from("invoices").select("total,paid_at").eq("status", "paid").gte("paid_at", m0).lt("paid_at", m1),
      sb.from("clients").select("id", { count: "exact", head: true }).gte("created_at", m0).lt("created_at", m1)
    ]);
    const counts = {}; (statusRows || []).forEach((r) => (counts[r.status] = (counts[r.status] || 0) + 1));
    const revenue = (paid || []).reduce((s, r) => s + Number(r.total), 0);
    view(`
      <div class="page-head"><h1>Dashboard</h1><span class="muted">${fmtD(new Date())}</span></div>
      <div class="stats">
        <a class="stat" href="#requests" style="text-decoration:none"><b>${counts.new || 0}</b><span>New requests</span></a>
        <div class="stat"><b>${(todayRows || []).length}</b><span>Today's appointments</span></div>
        <div class="stat"><b>${counts.confirmed || 0}</b><span>Confirmed upcoming</span></div>
        <div class="stat"><b>${sar(revenue)}</b><span>Paid this month</span></div>
      </div>
      <div class="two" style="margin-top:1.25rem">
        <div class="card" style="margin-top:0"><h2>Today's schedule</h2>${scheduleList(todayRows)}</div>
        <div class="card" style="margin-top:0"><h2>Latest requests</h2>${scheduleList(recent, true)}<p style="margin-top:.75rem"><a href="#requests">All requests →</a></p></div>
      </div>`);
  };
  function scheduleList(rows, showCreated) {
    if (!rows || !rows.length) return `<p class="muted">Nothing here.</p>`;
    return `<table class="tbl">${rows.map((r) => `<tr class="click" onclick="location.hash='#appointments/${r.id}'">
      <td><strong>${esc(r.client?.full_name)}</strong><br><span class="muted">${(r.area_codes || []).map(areaName).map(esc).join(", ")}</span></td>
      <td>${showCreated ? fmt(r.created_at) : fmt(r.scheduled_at, { weekday: undefined })}<br>${badge(r.status)}</td></tr>`).join("")}</table>`;
  }

  // ======================================================================
  // REQUESTS  (status new / contacted)
  // ======================================================================
  PAGES.requests = async () => {
    const { data, error } = await sb.from("appointments").select(APPT_SELECT).in("status", ["new", "contacted"]).order("created_at", { ascending: false });
    if (error) return fail(error);
    const el = view(`
      <div class="page-head"><h1>Requests</h1><button class="btn teal sm" id="addreq">+ Add request / walk-in</button></div>
      <p class="muted">New booking requests from the website. Contact the patient, then confirm with a date and time.</p>
      <div class="list" id="list">${data.length ? data.map(apptCard).join("") : `<div class="card empty">No open requests.</div>`}</div>`);
    bindApptActions(el, data);
    $("#addreq").addEventListener("click", () => editAppointment(null));
  };

  function apptCard(r) {
    const c = r.client || {};
    const inv = Array.isArray(r.invoice) ? r.invoice[0] : r.invoice;
    return `<article class="appt" data-id="${r.id}">
      <div>
        <div class="who"><a href="#patients/${c.id}" style="color:inherit;text-decoration:none">${esc(c.full_name || "Unknown")}</a> ${badge(r.status)} ${inv ? badge(inv.status, { draft: "Invoice draft", issued: "Unpaid", paid: "Paid", void: "Cancelled" }) : ""}</div>
        <div class="meta">+${esc(c.phone || "")} · ${c.preferred_lang === "ar" ? "Arabic" : "English"} · requested ${fmt(r.created_at)}</div>
        <div class="meta"><strong>Scheduled:</strong> ${fmt(r.scheduled_at)}</div>
        <div class="areas-line">${(r.area_codes || []).map(areaName).map(esc).join(", ") || "<span class='muted'>no areas</span>"}</div>
      </div>
      <div class="actions">
        <a class="btn wa sm" href="${waLink(c.phone)}" target="_blank" rel="noopener">WhatsApp</a>
        ${r.status === "new" ? `<button class="btn ghost sm" data-act="contacted">Mark contacted</button>` : ""}
        ${["new", "contacted"].includes(r.status) ? `<button class="btn teal sm" data-act="confirm">Confirm…</button>` : ""}
        ${r.status === "confirmed" ? `<button class="btn sm" data-act="done">Mark done</button>` : ""}
        ${["confirmed", "done"].includes(r.status) ? `<button class="btn ghost sm" data-act="invoice">${inv ? "Invoice " + esc(inv.invoice_no) : "Record invoice"}</button>` : ""}
        <button class="btn ghost sm" data-act="edit">Edit</button>
      </div>
      ${r.notes ? `<div class="notes">${esc(r.notes)}</div>` : ""}
    </article>`;
  }
  function bindApptActions(el, rows) {
    el.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-act]"); if (!btn) return;
      const id = btn.closest(".appt").dataset.id; const row = rows.find((r) => r.id === id);
      const act = btn.dataset.act;
      if (act === "edit") return editAppointment(row);
      if (act === "confirm") return editAppointment(row, "confirmed");
      if (act === "invoice") return editInvoice(row);
      btn.disabled = true;
      const { error } = await sb.from("appointments").update({ status: act }).eq("id", id);
      if (error) fail(error); else route();
    });
  }

  // ---------- appointment editor ----------
  function areaChips(name, selected) {
    const sel = new Set(selected || []); const groups = new Map();
    areas.filter((a) => a.active || sel.has(a.code)).forEach((a) => { if (!groups.has(a.collection_en)) groups.set(a.collection_en, []); groups.get(a.collection_en).push(a); });
    return `<div class="areas">${[...groups].map(([g, list]) => `<div class="group"><h3>${esc(g)}</h3><div class="chips">${list.map((a) =>
      `<label class="chip" style="margin:0"><input type="checkbox" name="${name}" value="${esc(a.code)}" ${sel.has(a.code) ? "checked" : ""}><span>${esc(a.name_en)}</span></label>`).join("")}</div></div>`).join("")}</div>`;
  }
  function editAppointment(row, presetStatus) {
    const b = openModal(`<form id="f">
      <h2>${row ? "Edit appointment" : "New appointment"}</h2>
      ${row ? `<div class="muted">${esc(row.client?.full_name)} · +${esc(row.client?.phone)}</div>` : `
        <label>Patient name</label><input id="m_name" type="text" maxlength="120" required>
        <label>Mobile</label><input id="m_phone" type="tel" placeholder="05XXXXXXXX" required>`}
      <label>Status</label>
      <select id="m_status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${(presetStatus || (row ? row.status : "confirmed")) === k ? "selected" : ""}>${v}</option>`).join("")}</select>
      <label>Scheduled date &amp; time</label><input id="m_when" type="datetime-local" step="900" value="${row ? toLocalInput(row.scheduled_at) : ""}">
      <label>Treatment areas</label>${areaChips("m_area", row ? row.area_codes : [])}
      <label>Notes</label><textarea id="m_notes" maxlength="500">${esc(row ? row.notes : "")}</textarea>
      <div id="m_msg" class="alert error hidden"></div>
      <div class="btns"><button type="button" class="btn ghost" id="m_cancel">Cancel</button><button class="btn" id="m_save">Save</button></div>
    </form>`);
    $("#m_cancel", b).addEventListener("click", closeModal);
    $("#f", b).addEventListener("submit", async (e) => {
      e.preventDefault();
      const m = $("#m_msg", b); m.classList.add("hidden");
      const codes = $$('input[name="m_area"]:checked', b).map((i) => i.value);
      const patch = { status: $("#m_status", b).value, scheduled_at: fromLocalInput($("#m_when", b).value), area_codes: codes, notes: $("#m_notes", b).value.trim() || null };
      if (patch.status === "confirmed" && !patch.scheduled_at) { m.textContent = "A confirmed appointment needs a date and time."; m.classList.remove("hidden"); return; }
      $("#m_save", b).disabled = true;
      let error;
      if (row) ({ error } = await sb.from("appointments").update(patch).eq("id", row.id));
      else {
        const name = $("#m_name", b).value.trim(), phone = $("#m_phone", b).value.trim();
        if (!codes.length) error = { message: "Choose at least one treatment area." };
        else {
          const r = await sb.rpc("book_appointment", { p_full_name: name, p_phone: phone, p_lang: "ar", p_area_codes: codes, p_preferred_at: patch.scheduled_at, p_notes: patch.notes });
          error = r.error;
          if (!error && patch.status !== "new") ({ error } = await sb.from("appointments").update({ status: patch.status }).eq("id", r.data));
        }
      }
      $("#m_save", b).disabled = false;
      if (error) { const map = { invalid_phone: "Invalid mobile number.", invalid_name: "Invalid name.", too_many_requests: "This patient already has 3 open requests today." }; const k = Object.keys(map).find((k) => error.message.includes(k)); m.textContent = k ? map[k] : error.message; m.classList.remove("hidden"); return; }
      closeModal(); route();
    });
  }

  // ======================================================================
  // APPOINTMENTS & INVOICES
  // ======================================================================
  PAGES.appointments = async (focusId) => {
    const q = new URLSearchParams(sessionStorage.getItem("apptFilter") || "");
    const status = q.get("status") || "upcoming"; const search = q.get("q") || "";
    let qb = sb.from("appointments").select(APPT_SELECT).order("scheduled_at", { ascending: status === "upcoming", nullsFirst: false }).limit(400);
    if (status === "upcoming") qb = qb.eq("status", "confirmed");
    else if (status !== "all") qb = qb.eq("status", status);
    const { data, error } = await qb;
    if (error) return fail(error);
    const rows = (data || []).filter((r) => !search || (r.client?.full_name || "").toLowerCase().includes(search.toLowerCase()) || (r.client?.phone || "").includes(search.replace(/\D/g, "")));
    const el = view(`
      <div class="page-head"><h1>Appointments &amp; Invoices</h1><button class="btn teal sm" id="addappt">+ New appointment</button></div>
      <div class="toolbar" style="margin-top:.75rem">
        <select id="f_status">
          ${[["upcoming", "Confirmed (upcoming)"], ["done", "Done"], ["cancelled", "Cancelled"], ["no_show", "No-show"], ["new", "New"], ["contacted", "Contacted"], ["all", "All"]].map(([k, v]) => `<option value="${k}" ${status === k ? "selected" : ""}>${v}</option>`).join("")}
        </select>
        <input id="f_q" class="grow" type="text" placeholder="Search name or phone…" value="${esc(search)}">
      </div>
      <div class="list" id="list">${rows.length ? rows.map(apptCard).join("") : `<div class="card empty">No appointments match.</div>`}</div>`);
    bindApptActions(el, rows);
    $("#addappt").addEventListener("click", () => editAppointment(null));
    const saveFilter = () => { sessionStorage.setItem("apptFilter", new URLSearchParams({ status: $("#f_status").value, q: $("#f_q").value }).toString()); route(); };
    $("#f_status").addEventListener("change", saveFilter);
    let t; $("#f_q").addEventListener("input", () => { clearTimeout(t); t = setTimeout(saveFilter, 350); });
    if (focusId) {
      const card = $(`.appt[data-id="${focusId}"]`, el);
      if (card) { card.scrollIntoView({ block: "center" }); card.style.outline = "2px solid var(--teal)"; }
      else { const { data: one } = await sb.from("appointments").select(APPT_SELECT).eq("id", focusId).single(); if (one) editAppointment(one); }
    }
  };

  // ---------- invoice record (copied from the clinic's invoice) ----------
  async function editInvoice(appt) {
    const c = appt.client || {};
    let inv = Array.isArray(appt.invoice) ? appt.invoice[0] : appt.invoice;
    if (inv) { const { data } = await sb.from("invoices").select("*").eq("id", inv.id).single(); inv = data; }
    const b = openModal(`<form id="f">
      <h2>${inv ? "Clinic invoice" : "Record clinic invoice"}</h2>
      <div class="muted">${esc(c.full_name)} · +${esc(c.phone)} · ${fmt(appt.scheduled_at)}<br>${(appt.area_codes || []).map(areaName).map(esc).join(", ")}</div>
      <p class="muted" style="margin-top:.75rem;font-size:.85rem">Copy the details from the invoice issued by the clinic.</p>
      <div class="row">
        <div><label>Clinic invoice no.</label><input id="no" type="text" maxlength="40" value="${esc(inv ? inv.invoice_no : "")}" required placeholder="e.g. 10234"></div>
        <div><label>Invoice date</label><input id="date" type="date" value="${esc(inv && inv.issued_on ? inv.issued_on : todayStr())}" required></div>
      </div>
      <div class="row">
        <div><label>Total (SAR, as printed, incl. VAT)</label><input id="total" type="number" min="0" step="0.01" value="${inv ? inv.total : ""}" required></div>
        <div><label>Status</label><select id="status">${[["paid", "Paid"], ["issued", "Unpaid"], ["void", "Cancelled"]].map(([k, v]) => `<option value="${k}" ${(inv ? inv.status : "paid") === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      </div>
      <label>Payment method</label>
      <select id="pm"><option value="">—</option>${["cash", "card", "transfer", "other"].map((s) => `<option value="${s}" ${inv && inv.payment_method === s ? "selected" : ""}>${s[0].toUpperCase() + s.slice(1)}</option>`).join("")}</select>
      <label>Notes</label><textarea id="notes" maxlength="500">${esc(inv ? inv.notes : "")}</textarea>
      <div id="m_msg" class="alert error hidden"></div>
      <div class="btns"><button type="button" class="btn ghost" id="m_cancel">Cancel</button><button class="btn" id="m_save">Save</button></div>
    </form>`);
    $("#m_cancel", b).addEventListener("click", closeModal);
    $("#f", b).addEventListener("submit", async (e) => {
      e.preventDefault();
      const patch = { invoice_no: $("#no", b).value.trim(), issued_on: $("#date", b).value || null, total: Number($("#total", b).value) || 0, items: [], status: $("#status", b).value, payment_method: $("#pm", b).value || null, notes: $("#notes", b).value.trim() || null };
      $("#m_save", b).disabled = true;
      const r = inv ? await sb.from("invoices").update(patch).eq("id", inv.id).select().single()
                    : await sb.from("invoices").insert(Object.assign({ appointment_id: appt.id, client_id: c.id }, patch)).select().single();
      $("#m_save", b).disabled = false;
      if (r.error) { $("#m_msg", b).textContent = /unique/i.test(r.error.message) ? "That invoice number is already recorded." : r.error.message; $("#m_msg", b).classList.remove("hidden"); return; }
      closeModal(); toast(`Invoice ${r.data.invoice_no} recorded.`, true); route();
    });
  }

  // ======================================================================
  // PATIENTS
  // ======================================================================
  PAGES.patients = async (id) => {
    if (id) return patientDetail(id);
    const search = sessionStorage.getItem("patQ") || "";
    let qb = sb.from("clients").select("id,full_name,phone,preferred_lang,whatsapp_opt_in,created_at,appointments(count)").order("created_at", { ascending: false }).limit(500);
    if (search) qb = /^\d+$/.test(search) ? qb.ilike("phone", `%${search}%`) : qb.ilike("full_name", `%${search}%`);
    const { data, error } = await qb;
    if (error) return fail(error);
    view(`
      <div class="page-head"><h1>Patients</h1><span class="muted">${data.length} shown</span></div>
      <div class="toolbar" style="margin-top:.75rem"><input id="f_q" class="grow" type="text" placeholder="Search name or phone…" value="${esc(search)}"></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Mobile</th><th>Lang</th><th class="num">Visits</th><th>Since</th></tr></thead><tbody>
        ${data.length ? data.map((c) => `<tr class="click" onclick="location.hash='#patients/${c.id}'"><td><strong>${esc(c.full_name)}</strong></td><td>+${esc(c.phone)}</td><td>${c.preferred_lang.toUpperCase()}</td><td class="num">${c.appointments?.[0]?.count ?? 0}</td><td>${fmtD(c.created_at)}</td></tr>`).join("")
          : `<tr><td colspan="5" class="empty">No patients found.</td></tr>`}
      </tbody></table></div>`);
    let t; $("#f_q").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { sessionStorage.setItem("patQ", e.target.value.trim()); route(); }, 350); });
  };
  async function patientDetail(id) {
    const [{ data: c, error }, { data: appts }, { data: invs }, { data: msgs }] = await Promise.all([
      sb.from("clients").select("*").eq("id", id).single(),
      sb.from("appointments").select(APPT_SELECT).eq("client_id", id).order("created_at", { ascending: false }),
      sb.from("invoices").select("*").eq("client_id", id).order("created_at", { ascending: false }),
      sb.from("message_log").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(20)
    ]);
    if (error) return fail(error);
    const spent = (invs || []).filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.total), 0);
    const el = view(`
      <p><a href="#patients">← Patients</a></p>
      <div class="page-head"><h1>${esc(c.full_name)}</h1>
        <div style="display:flex;gap:.4rem"><a class="btn wa sm" href="${waLink(c.phone)}" target="_blank" rel="noopener">WhatsApp</a><a class="btn ghost sm" href="#messages/${c.id}">Send template</a><button class="btn ghost sm" id="editp">Edit</button></div></div>
      <div class="stats"><div class="stat"><b>${(appts || []).length}</b><span>Appointments</span></div><div class="stat"><b>${(appts || []).filter((a) => a.status === "done").length}</b><span>Sessions done</span></div><div class="stat"><b>${sar(spent)}</b><span>Paid total</span></div><div class="stat"><b>${c.whatsapp_opt_in && !c.opted_out_at ? "Yes" : "No"}</b><span>Marketing opt-in</span></div></div>
      <div class="card tight"><strong>+${esc(c.phone)}</strong> · ${c.preferred_lang === "ar" ? "Arabic" : "English"} · patient since ${fmtD(c.created_at)}${c.notes ? `<div class="details">${esc(c.notes)}</div>` : ""}</div>
      <div class="card"><h2>Appointments</h2><div class="list" id="list">${(appts || []).length ? appts.map(apptCard).join("") : `<p class="muted">None yet.</p>`}</div></div>
      <div class="card"><h2>Invoices</h2>${(invs || []).length ? `<table class="tbl"><thead><tr><th>Clinic inv. no.</th><th>Date</th><th>Status</th><th class="num">Total</th></tr></thead><tbody>${invs.map((i) => `<tr><td>${esc(i.invoice_no)}</td><td>${i.issued_on ? fmtD(i.issued_on + "T12:00:00+03:00") : fmtD(i.created_at)}</td><td>${badge(i.status, { draft: "Draft", issued: "Unpaid", paid: "Paid", void: "Cancelled" })}</td><td class="num">${sar(i.total)}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">No invoices.</p>`}</div>
      <div class="card"><h2>Messages sent</h2>${(msgs || []).length ? msgs.map((m) => `<div class="details"><span class="pill">${esc(m.kind)}</span> ${fmt(m.created_at)}<br><span class="muted">${esc(m.body).slice(0, 140)}</span></div>`).join("") : `<p class="muted">None logged.</p>`}</div>`);
    bindApptActions(el, appts || []);
    $("#editp").addEventListener("click", () => {
      const b = openModal(`<form id="f"><h2>Edit patient</h2>
        <label>Full name</label><input id="p_name" value="${esc(c.full_name)}" maxlength="120" required>
        <label>Mobile (digits, e.g. 9665XXXXXXXX)</label><input id="p_phone" value="${esc(c.phone)}" required>
        <label>Preferred language</label><select id="p_lang"><option value="ar" ${c.preferred_lang === "ar" ? "selected" : ""}>Arabic</option><option value="en" ${c.preferred_lang === "en" ? "selected" : ""}>English</option></select>
        <label>Marketing (WhatsApp) opt-in</label><select id="p_opt"><option value="0" ${!c.whatsapp_opt_in ? "selected" : ""}>No</option><option value="1" ${c.whatsapp_opt_in ? "selected" : ""}>Yes — consented in clinic</option></select>
        <label>Notes (clinical/admin, max 500)</label><textarea id="p_notes" maxlength="500">${esc(c.notes || "")}</textarea>
        <div id="m_msg" class="alert error hidden"></div>
        <div class="btns"><button type="button" class="btn ghost" id="m_cancel">Cancel</button><button class="btn">Save</button></div></form>`);
      $("#m_cancel", b).addEventListener("click", closeModal);
      $("#f", b).addEventListener("submit", async (e) => {
        e.preventDefault();
        const opt = $("#p_opt", b).value === "1";
        const patch = { full_name: $("#p_name", b).value.trim(), phone: $("#p_phone", b).value.replace(/\D/g, "").replace(/^0/, "966"), preferred_lang: $("#p_lang", b).value, notes: $("#p_notes", b).value.trim() || null, whatsapp_opt_in: opt };
        if (opt && !c.whatsapp_opt_in) { patch.opt_in_at = new Date().toISOString(); patch.opt_in_source = "in_clinic"; patch.opted_out_at = null; }
        if (!opt && c.whatsapp_opt_in) patch.opted_out_at = new Date().toISOString();
        const { error } = await sb.from("clients").update(patch).eq("id", id);
        if (error) { $("#m_msg", b).textContent = error.message; $("#m_msg", b).classList.remove("hidden"); return; }
        closeModal(); route();
      });
    });
  }

  // ======================================================================
  // REPORTS
  // ======================================================================
  PAGES.reports = async () => {
    const ym = sessionStorage.getItem("repMonth") || todayStr().slice(0, 7);
    const [m0, m1] = monthBounds(ym);
    const [{ data: appts }, { data: invs }, { count: newPatients }] = await Promise.all([
      sb.from("appointments").select("status,area_codes,scheduled_at,created_at").or(`and(scheduled_at.gte.${m0},scheduled_at.lt.${m1}),and(scheduled_at.is.null,created_at.gte.${m0},created_at.lt.${m1})`),
      sb.from("invoices").select("status,total,vat,subtotal,discount,payment_method,paid_at,created_at").gte("created_at", m0).lt("created_at", m1),
      sb.from("clients").select("id", { count: "exact", head: true }).gte("created_at", m0).lt("created_at", m1)
    ]);
    const byStatus = {}; (appts || []).forEach((a) => (byStatus[a.status] = (byStatus[a.status] || 0) + 1));
    const byArea = {}; (appts || []).filter((a) => ["confirmed", "done"].includes(a.status)).forEach((a) => (a.area_codes || []).forEach((c) => (byArea[c] = (byArea[c] || 0) + 1)));
    const paid = (invs || []).filter((i) => i.status === "paid");
    const rev = paid.reduce((s, i) => s + Number(i.total), 0), vat = paid.reduce((s, i) => s + Number(i.vat), 0), net = paid.reduce((s, i) => s + Number(i.subtotal) - Number(i.discount), 0);
    const outstanding = (invs || []).filter((i) => i.status === "issued").reduce((s, i) => s + Number(i.total), 0);
    const byPm = {}; paid.forEach((i) => (byPm[i.payment_method || "unspecified"] = (byPm[i.payment_method || "unspecified"] || 0) + Number(i.total)));
    const total = (appts || []).length, done = byStatus.done || 0, noShow = byStatus.no_show || 0;
    view(`
      <div class="page-head"><h1>Reports</h1><input type="month" id="month" value="${ym}" style="width:auto"></div>
      <div class="stats">
        <div class="stat"><b>${total}</b><span>Appointments</span></div>
        <div class="stat"><b>${done}</b><span>Sessions done</span></div>
        <div class="stat"><b>${total ? Math.round(noShow / total * 100) : 0}%</b><span>No-show rate</span></div>
        <div class="stat"><b>${newPatients || 0}</b><span>New patients</span></div>
      </div>
      <div class="stats" style="margin-top:.6rem">
        <div class="stat"><b>${sar(rev)}</b><span>Paid invoices (incl. VAT)</span></div>
        <div class="stat"><b>${sar(net)}</b><span>Net of VAT</span></div>
        <div class="stat"><b>${sar(vat)}</b><span>VAT (15% of paid)</span></div>
        <div class="stat"><b>${sar(outstanding)}</b><span>Unpaid</span></div>
      </div>
      <div class="two" style="margin-top:1.25rem">
        <div class="card" style="margin-top:0"><h2>By status</h2><table class="tbl">${Object.entries(STATUS).map(([k, v]) => `<tr><td>${badge(k)}</td><td class="num">${byStatus[k] || 0}</td></tr>`).join("")}</table></div>
        <div class="card" style="margin-top:0"><h2>Top services (confirmed + done)</h2><table class="tbl">${Object.entries(byArea).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([c, n]) => `<tr><td>${esc(areaName(c))}</td><td class="num">${n}</td></tr>`).join("") || `<tr><td class="muted">No data</td></tr>`}</table></div>
        <div class="card" style="margin-top:0"><h2>Payments by method</h2><table class="tbl">${Object.entries(byPm).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${sar(v)}</td></tr>`).join("") || `<tr><td class="muted">No paid invoices</td></tr>`}</table></div>
        <div class="card" style="margin-top:0"><h2>Invoices</h2><table class="tbl">${["paid", "issued", "void"].map((s) => `<tr><td>${badge(s, { draft: "Draft", issued: "Unpaid", paid: "Paid", void: "Cancelled" })}</td><td class="num">${(invs || []).filter((i) => i.status === s).length}</td></tr>`).join("")}</table></div>
      </div>`);
    $("#month").addEventListener("change", (e) => { sessionStorage.setItem("repMonth", e.target.value); route(); });
  };

  // ======================================================================
  // PATIENT MESSAGES  (templates + compose via WhatsApp, logged)
  // ======================================================================
  PAGES.messages = async (clientId) => {
    const [{ data: tpls, error }, { data: log }] = await Promise.all([
      sb.from("message_templates").select("*").order("kind"),
      sb.from("message_log").select("id,kind,lang,body,created_at,client:clients(full_name,phone)").order("created_at", { ascending: false }).limit(25)
    ]);
    if (error) return fail(error);
    let client = null;
    if (clientId) ({ data: client } = await sb.from("clients").select("*").eq("id", clientId).single());
    const el = view(`
      <div class="page-head"><h1>Patient Messages</h1></div>
      <p class="muted">Messages open in WhatsApp for you to send; each one is logged on the patient's record. Only approved templates can be used.</p>
      <div class="two">
        <div class="card" style="margin-top:0"><h2>Compose</h2>
          <label>Patient</label>
          <input id="c_q" type="text" placeholder="Search name or phone…" value="${client ? esc(client.full_name) : ""}" autocomplete="off">
          <div id="c_hits"></div>
          <input type="hidden" id="c_id" value="${client ? client.id : ""}">
          <label>Template</label>
          <select id="c_tpl">${tpls.map((t) => `<option value="${esc(t.code)}" ${!t.approved ? "disabled" : ""}>${esc(t.title)}${t.approved ? "" : " (not approved)"}</option>`).join("")}</select>
          <label>Language</label>
          <select id="c_lang"><option value="ar" ${client && client.preferred_lang === "ar" ? "selected" : ""}>Arabic</option><option value="en" ${client && client.preferred_lang === "en" ? "selected" : ""}>English</option></select>
          <label>Preview <span class="opt">(you can edit before sending)</span></label>
          <textarea id="c_body" style="min-height:140px"></textarea>
          <div id="c_msg" class="alert error hidden"></div>
          <button class="btn wa block" id="c_send">Open in WhatsApp &amp; log</button>
        </div>
        <div class="card" style="margin-top:0"><h2>Templates</h2>
          ${tpls.map((t) => `<div class="card tight" data-code="${esc(t.code)}"><div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem"><strong>${esc(t.title)}</strong>${t.approved ? `<span class="badge paid">Approved</span>` : `<span class="badge draft">Draft</span>`}</div>
            <div class="muted" style="font-size:.8rem">${esc(t.kind)} · placeholders: {{name}} {{clinic}} {{date}} {{time}} {{areas}}</div>
            <button class="btn ghost sm" data-edit="${esc(t.code)}" style="margin-top:.5rem">Edit</button></div>`).join("")}
        </div>
      </div>
      <div class="card"><h2>Recently sent</h2>${(log || []).length ? `<table class="tbl">${log.map((m) => `<tr><td><strong>${esc(m.client?.full_name)}</strong><br><span class="muted">${esc(m.body).slice(0, 90)}…</span></td><td><span class="pill">${esc(m.kind)}/${esc(m.lang)}</span><br>${fmt(m.created_at)}</td></tr>`).join("")}</table>` : `<p class="muted">Nothing sent yet.</p>`}</div>`);

    // patient search
    let t; let picked = client;
    $("#c_q", el).addEventListener("input", (e) => {
      clearTimeout(t); const q = e.target.value.trim(); picked = null; $("#c_id", el).value = "";
      if (q.length < 2) return ($("#c_hits", el).innerHTML = "");
      t = setTimeout(async () => {
        const qb = /^\d+$/.test(q) ? sb.from("clients").select("id,full_name,phone,preferred_lang").ilike("phone", `%${q}%`) : sb.from("clients").select("id,full_name,phone,preferred_lang").ilike("full_name", `%${q}%`);
        const { data } = await qb.limit(6);
        $("#c_hits", el).innerHTML = (data || []).map((c) => `<button type="button" class="btn ghost sm" data-pick="${c.id}" style="margin:.3rem .3rem 0 0">${esc(c.full_name)} · +${esc(c.phone)}</button>`).join("");
        $$("[data-pick]", el).forEach((b) => b.addEventListener("click", () => { picked = data.find((c) => c.id === b.dataset.pick); $("#c_q", el).value = picked.full_name; $("#c_id", el).value = picked.id; $("#c_lang", el).value = picked.preferred_lang; $("#c_hits", el).innerHTML = ""; render(); }));
      }, 300);
    });
    async function render() {
      const tpl = tpls.find((x) => x.code === $("#c_tpl", el).value); if (!tpl) return;
      const lang = $("#c_lang", el).value;
      let body = lang === "ar" ? tpl.body_ar : tpl.body_en;
      let next = null;
      if (picked) { const { data } = await sb.from("appointments").select("scheduled_at,area_codes").eq("client_id", picked.id).in("status", ["confirmed"]).gte("scheduled_at", new Date().toISOString()).order("scheduled_at").limit(1); next = data?.[0]; }
      const vars = { name: picked ? picked.full_name : "{{name}}", clinic: lang === "ar" ? C.CLINIC.name_ar : C.CLINIC.name_en,
        date: next ? fmtD(next.scheduled_at) : "{{date}}", time: next ? new Date(next.scheduled_at).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }) : "{{time}}",
        areas: next ? next.area_codes.map((c) => { const a = areas.find((x) => x.code === c); return a ? (lang === "ar" ? a.name_ar : a.name_en) : c; }).join(lang === "ar" ? "، " : ", ") : "{{areas}}" };
      $("#c_body", el).value = body.replace(/\{\{(\w+)\}\}/g, (m, k) => vars[k] ?? m);
    }
    $("#c_tpl", el).addEventListener("change", render); $("#c_lang", el).addEventListener("change", render); render();
    $("#c_send", el).addEventListener("click", async () => {
      const m = $("#c_msg", el); m.classList.add("hidden");
      const tpl = tpls.find((x) => x.code === $("#c_tpl", el).value);
      const body = $("#c_body", el).value.trim();
      if (!picked) { m.textContent = "Choose a patient first."; m.classList.remove("hidden"); return; }
      if (!tpl || !tpl.approved) { m.textContent = "Choose an approved template."; m.classList.remove("hidden"); return; }
      const { error } = await sb.from("message_log").insert({ client_id: picked.id, template_code: tpl.code, kind: tpl.kind, lang: $("#c_lang", el).value, body, status: "sent" });
      if (error) { m.textContent = error.message; m.classList.remove("hidden"); return; }
      window.open(waLink(picked.phone, body), "_blank");
      toast("Logged. WhatsApp opened.", true);
    });
    // template editor
    $$("[data-edit]", el).forEach((btn) => btn.addEventListener("click", () => {
      const tpl = tpls.find((x) => x.code === btn.dataset.edit);
      const b = openModal(`<form id="f"><h2>${esc(tpl.title)}</h2>
        <label>Title</label><input id="t_title" value="${esc(tpl.title)}" required>
        <label>English</label><textarea id="t_en" style="min-height:120px">${esc(tpl.body_en)}</textarea>
        <label>Arabic</label><textarea id="t_ar" dir="rtl" style="min-height:120px">${esc(tpl.body_ar)}</textarea>
        <label>Approved for sending</label><select id="t_ok"><option value="0" ${!tpl.approved ? "selected" : ""}>No — draft</option><option value="1" ${tpl.approved ? "selected" : ""}>Yes — approved</option></select>
        <p class="muted" style="font-size:.8rem">Placeholders: {{name}} {{clinic}} {{date}} {{time}} {{areas}}. Keep wording compliant with Saudi healthcare advertising rules.</p>
        <div id="m_msg" class="alert error hidden"></div>
        <div class="btns"><button type="button" class="btn ghost" id="m_cancel">Cancel</button><button class="btn">Save</button></div></form>`, true);
      $("#m_cancel", b).addEventListener("click", closeModal);
      $("#f", b).addEventListener("submit", async (e) => {
        e.preventDefault();
        const ok = $("#t_ok", b).value === "1";
        const { error } = await sb.from("message_templates").update({ title: $("#t_title", b).value.trim(), body_en: $("#t_en", b).value, body_ar: $("#t_ar", b).value, approved: ok, approved_at: ok ? (tpl.approved_at || new Date().toISOString()) : null }).eq("code", tpl.code);
        if (error) { $("#m_msg", b).textContent = error.message; $("#m_msg", b).classList.remove("hidden"); return; }
        closeModal(); route();
      });
    }));
  };

  // ======================================================================
  // MEDICAL SERVICES  (catalogue + appointments made per service)
  // ======================================================================
  PAGES.services = async (code) => {
    await loadAreas();
    const { data: appts, error } = await sb.from("appointments").select(APPT_SELECT).in("status", ["confirmed", "done"]).order("scheduled_at", { ascending: false }).limit(1000);
    if (error) return fail(error);
    const per = {}; (appts || []).forEach((a) => (a.area_codes || []).forEach((c) => (per[c] = per[c] || []).push(a)));
    const groups = new Map(); areas.forEach((a) => { if (!groups.has(a.collection_en)) groups.set(a.collection_en, []); groups.get(a.collection_en).push(a); });
    const el = view(`
      <div class="page-head"><h1>Medical Services</h1><span class="muted">Prices in SAR excl. VAT · click a service to see its appointments</span></div>
      ${[...groups].map(([g, list]) => `<div class="card"><h2>${esc(g)}</h2><div class="tbl-wrap" style="margin-top:0"><table class="tbl"><thead><tr><th>Service</th><th>Arabic</th><th class="num">Price</th><th class="num">Min</th><th>Active</th><th class="num">Booked</th><th></th></tr></thead><tbody>
        ${list.map((a) => `<tr data-code="${esc(a.code)}" class="${code === a.code ? "sel" : ""}">
          <td><strong>${esc(a.name_en)}</strong><br><span class="muted" style="font-size:.78rem">${esc(a.code)}</span></td>
          <td dir="rtl">${esc(a.name_ar)}</td>
          <td class="num"><input class="price" type="number" min="0" step="1" value="${a.price ?? ""}" placeholder="—" style="width:90px;text-align:right"></td>
          <td class="num"><input class="dur" type="number" min="5" step="5" value="${a.duration_min ?? ""}" placeholder="—" style="width:70px;text-align:right"></td>
          <td><button type="button" class="toggle ${a.active ? "on" : ""}" data-active="${a.active}" aria-label="Active"></button></td>
          <td class="num">${(per[a.code] || []).length}</td>
          <td><a href="#services/${esc(a.code)}" class="btn ghost sm">View</a></td></tr>`).join("")}
      </tbody></table></div></div>`).join("")}
      <div id="detail"></div>`);
    // inline edits
    el.addEventListener("change", async (e) => {
      const tr = e.target.closest("tr[data-code]"); if (!tr) return;
      const patch = {};
      if (e.target.classList.contains("price")) patch.price = e.target.value === "" ? null : Number(e.target.value);
      if (e.target.classList.contains("dur")) patch.duration_min = e.target.value === "" ? null : Number(e.target.value);
      if (!Object.keys(patch).length) return;
      const { error } = await sb.from("areas").update(patch).eq("code", tr.dataset.code);
      error ? fail(error) : toast("Saved.", true);
    });
    el.addEventListener("click", async (e) => {
      const t = e.target.closest(".toggle"); if (!t) return;
      const tr = t.closest("tr[data-code]"); const next = t.dataset.active !== "true";
      const { error } = await sb.from("areas").update({ active: next }).eq("code", tr.dataset.code);
      if (error) return fail(error);
      t.dataset.active = String(next); t.classList.toggle("on", next);
    });
    if (code) {
      const a = areas.find((x) => x.code === code); const rows = per[code] || [];
      const d = $("#detail", el);
      d.innerHTML = `<div class="card" id="svc"><h2>${esc(a ? a.name_en : code)} — appointments made (${rows.length})</h2>
        ${rows.length ? `<table class="tbl"><thead><tr><th>Patient</th><th>When</th><th>Status</th><th>Invoice</th></tr></thead><tbody>${rows.map((r) => { const inv = Array.isArray(r.invoice) ? r.invoice[0] : r.invoice; return `<tr class="click" onclick="location.hash='#appointments/${r.id}'"><td><strong>${esc(r.client?.full_name)}</strong><br><span class="muted">+${esc(r.client?.phone)}</span></td><td>${fmt(r.scheduled_at)}</td><td>${badge(r.status)}</td><td>${inv ? `${esc(inv.invoice_no)} ${badge(inv.status, { draft: "Draft", issued: "Unpaid", paid: "Paid", void: "Cancelled" })}` : "—"}</td></tr>`; }).join("")}</tbody></table>` : `<p class="muted">No confirmed or completed appointments for this service yet.</p>`}</div>`;
      d.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  init();
})();
