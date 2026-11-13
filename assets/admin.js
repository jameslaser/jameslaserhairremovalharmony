(function () {
  const C = window.APP_CONFIG;
  const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let areas = [];           // active + inactive, for labels
  let rows = [];            // appointments currently loaded
  let editing = null;       // appointment being edited (null = new)

  const STATUS_LABEL = { new: "New", contacted: "Contacted", confirmed: "Confirmed", done: "Done", cancelled: "Cancelled", no_show: "No-show" };
  const OPEN = ["new", "contacted", "confirmed"];

  // ---------- auth ----------
  async function init() {
    const { data: { session } } = await sb.auth.getSession();
    session ? showApp(session) : showLogin();
    sb.auth.onAuthStateChange((_e, s) => (s ? showApp(s) : showLogin()));
  }

  function showLogin() {
    $("#login").classList.remove("hidden");
    $("#app").classList.add("hidden");
    $("#userbox").classList.add("hidden");
  }

  let booted = false;
  async function showApp(session) {
    $("#login").classList.add("hidden");
    $("#app").classList.remove("hidden");
    $("#userbox").classList.remove("hidden");
    $("#useremail").textContent = session.user.email;
    if (!booted) { booted = true; await loadAreas(); }
    await load();
  }

  $("#loginform").addEventListener("submit", async (e) => {
    e.preventDefault();
    const m = $("#loginmsg"); m.classList.add("hidden");
    const { error } = await sb.auth.signInWithPassword({ email: $("#email").value.trim(), password: $("#password").value });
    if (error) { m.textContent = error.message; m.classList.remove("hidden"); }
  });
  $("#forgot").addEventListener("click", async (e) => {
    e.preventDefault();
    const email = $("#email").value.trim();
    const m = $("#loginmsg");
    if (!email) { m.textContent = "Enter your email first."; m.classList.remove("hidden"); return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href });
    m.textContent = error ? error.message : "Password reset email sent.";
    m.className = "alert " + (error ? "error" : "ok");
  });
  $("#logout").addEventListener("click", () => sb.auth.signOut());

  // ---------- data ----------
  async function loadAreas() {
    const { data } = await sb.from("areas").select("code,name_en,name_ar,collection_en,active,sort_order").order("sort_order");
    areas = data || [];
  }
  const areaName = (code) => { const a = areas.find((x) => x.code === code); return a ? a.name_en : code; };

  async function load() {
    const msg = $("#msg"); msg.classList.add("hidden");
    const f = $("#f_status").value;
    let q = sb.from("appointments")
      .select("id,status,area_codes,scheduled_at,notes,created_at,updated_at,client:clients(id,full_name,phone,preferred_lang)")
      .order("created_at", { ascending: false })
      .limit(300);
    if (f === "open") q = q.in("status", OPEN);
    else if (f !== "all") q = q.eq("status", f);
    const { data, error } = await q;
    if (error) {
      msg.textContent = /permission|policy|row-level/i.test(error.message)
        ? "This account is not an admin. Ask the owner to grant access."
        : error.message;
      msg.classList.remove("hidden");
      rows = [];
    } else rows = data || [];
    renderStats();
    render();
  }

  async function renderStats() {
    const { data } = await sb.from("appointments").select("status");
    const counts = {};
    (data || []).forEach((r) => (counts[r.status] = (counts[r.status] || 0) + 1));
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayRows = rows.filter((r) => r.scheduled_at && new Date(r.scheduled_at) >= todayStart && new Date(r.scheduled_at) < new Date(todayStart.getTime() + 864e5) && OPEN.includes(r.status));
    $("#stats").innerHTML = [
      ["New requests", counts.new || 0],
      ["Confirmed", counts.confirmed || 0],
      ["Today", todayRows.length],
      ["Done (all time)", counts.done || 0]
    ].map(([l, v]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("");
  }

  function fmt(ts) {
    if (!ts) return "—";
    return new Date(ts).toLocaleString("en-GB", { timeZone: C.CLINIC.timezone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
  }

  function render() {
    const q = $("#f_q").value.trim().toLowerCase();
    const list = $("#list");
    const shown = rows.filter((r) => !q || (r.client?.full_name || "").toLowerCase().includes(q) || (r.client?.phone || "").includes(q.replace(/\D/g, "")));
    if (!shown.length) { list.innerHTML = `<div class="card empty">No appointments match.</div>`; return; }
    list.innerHTML = shown.map((r) => {
      const c = r.client || {};
      const wa = `https://wa.me/${c.phone}`;
      return `<article class="appt" data-id="${r.id}">
        <div>
          <div class="who">${esc(c.full_name || "Unknown")} <span class="badge ${r.status}">${STATUS_LABEL[r.status] || r.status}</span></div>
          <div class="meta">+${esc(c.phone || "")} · ${c.preferred_lang === "ar" ? "Arabic" : "English"} · requested ${fmt(r.created_at)}</div>
          <div class="meta"><strong>Scheduled:</strong> ${fmt(r.scheduled_at)}</div>
          <div class="areas-line">${(r.area_codes || []).map(areaName).map(esc).join(", ") || "<span class='muted'>no areas</span>"}</div>
        </div>
        <div class="actions">
          <a class="btn wa sm" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>
          ${r.status === "new" ? `<button class="btn ghost sm" data-act="contacted">Mark contacted</button>` : ""}
          ${OPEN.includes(r.status) && r.status !== "confirmed" ? `<button class="btn teal sm" data-act="confirmed">Confirm</button>` : ""}
          ${r.status === "confirmed" ? `<button class="btn sm" data-act="done">Done</button>` : ""}
          <button class="btn ghost sm" data-act="edit">Edit</button>
        </div>
        ${r.notes ? `<div class="notes">${esc(r.notes)}</div>` : ""}
      </article>`;
    }).join("");
  }

  $("#list").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const id = btn.closest(".appt").dataset.id;
    const row = rows.find((r) => r.id === id);
    if (btn.dataset.act === "edit") return openModal(row);
    btn.disabled = true;
    const { error } = await sb.from("appointments").update({ status: btn.dataset.act }).eq("id", id);
    if (error) alert(error.message);
    await load();
  });

  $("#f_status").addEventListener("change", load);
  $("#f_q").addEventListener("input", render);
  $("#refresh").addEventListener("click", load);
  $("#newappt").addEventListener("click", () => openModal(null));

  // ---------- modal ----------
  function toLocalInput(ts) {
    if (!ts) return "";
    // Convert to Riyadh wall-clock for the datetime-local input
    const d = new Date(ts);
    const p = new Intl.DateTimeFormat("en-GB", { timeZone: C.CLINIC.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
    const g = (t) => p.find((x) => x.type === t).value;
    return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
  }
  const fromLocalInput = (v) => (v ? `${v}:00+03:00` : null);

  function openModal(row) {
    editing = row;
    $("#m_title").textContent = row ? "Edit appointment" : "New appointment";
    $("#m_newclient").classList.toggle("hidden", !!row);
    $("#m_client").textContent = row ? `${row.client?.full_name || ""} · +${row.client?.phone || ""}` : "";
    $("#m_name").value = ""; $("#m_phone").value = "";
    $("#m_status").value = row ? row.status : "confirmed";
    $("#m_when").value = row ? toLocalInput(row.scheduled_at) : "";
    $("#m_notes").value = row ? row.notes || "" : "";
    const sel = new Set(row ? row.area_codes || [] : []);
    const groups = new Map();
    areas.filter((a) => a.active || sel.has(a.code)).forEach((a) => {
      if (!groups.has(a.collection_en)) groups.set(a.collection_en, []);
      groups.get(a.collection_en).push(a);
    });
    $("#m_areas").innerHTML = [...groups].map(([g, list]) => `<div class="group"><h3>${esc(g)}</h3><div class="chips">${
      list.map((a) => `<label class="chip" style="margin:0"><input type="checkbox" name="m_area" value="${esc(a.code)}" ${sel.has(a.code) ? "checked" : ""}><span>${esc(a.name_en)}</span></label>`).join("")
    }</div></div>`).join("");
    $("#m_msg").classList.add("hidden");
    $("#modal").classList.remove("hidden");
  }
  const closeModal = () => $("#modal").classList.add("hidden");
  $("#m_cancel").addEventListener("click", closeModal);
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

  $("#editform").addEventListener("submit", async (e) => {
    e.preventDefault();
    const m = $("#m_msg"); m.classList.add("hidden");
    const codes = [...document.querySelectorAll('input[name="m_area"]:checked')].map((i) => i.value);
    const patch = {
      status: $("#m_status").value,
      scheduled_at: fromLocalInput($("#m_when").value),
      area_codes: codes,
      notes: $("#m_notes").value.trim() || null
    };
    const save = $("#m_save"); save.disabled = true;
    let error;
    if (editing) {
      ({ error } = await sb.from("appointments").update(patch).eq("id", editing.id));
    } else {
      // New walk-in / phone booking: reuse the public RPC to create client + request, then apply the patch.
      const name = $("#m_name").value.trim(), phone = $("#m_phone").value.trim();
      if (!name || !phone) { error = { message: "Client name and mobile are required." }; }
      else if (!codes.length) { error = { message: "Choose at least one treatment area." }; }
      else {
        const r = await sb.rpc("book_appointment", { p_full_name: name, p_phone: phone, p_lang: "ar", p_area_codes: codes, p_preferred_at: patch.scheduled_at, p_notes: patch.notes });
        error = r.error;
        if (!error) ({ error } = await sb.from("appointments").update({ status: patch.status }).eq("id", r.data));
      }
    }
    save.disabled = false;
    if (error) {
      const map = { invalid_phone: "Invalid mobile number.", invalid_name: "Invalid name.", too_many_requests: "This client already has 3 open requests today." };
      const k = Object.keys(map).find((k) => error.message.includes(k));
      m.textContent = k ? map[k] : error.message; m.classList.remove("hidden"); return;
    }
    closeModal();
    await load();
  });

  init();
})();
