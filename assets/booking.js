(function () {
  const C = window.APP_CONFIG;
  const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);
  const $ = (s) => document.querySelector(s);

  const I18N = {
    en: {
      brand: C.CLINIC.name_en,
      brand_sub: "Nurse-led · Harmony Derma, Al Hamra, Riyadh",
      eyebrow: "Appointment request",
      title: "Book your session",
      intro: "Choose the areas you'd like treated and a time that suits you. Nurse James will confirm your appointment on WhatsApp.",
      l_name: "Full name", l_phone: "Mobile (WhatsApp)", l_lang: "Preferred language",
      l_areas: "Treatment areas", l_date: "Preferred date ", l_time: "Preferred time ", l_notes: "Notes ",
      optional: "(optional)", loading: "Loading…",
      ph_notes: "Anything we should know — skin type, medications, previous laser sessions…",
      submit: "Request appointment", sending: "Sending…",
      consent: "By submitting you agree to be contacted on WhatsApp about this appointment.",
      done_title: "Request received",
      done_text: "Thank you. Nurse James will message you on WhatsApp to confirm the date and time.",
      wa_btn: "Message us on WhatsApp", again: "Make another request",
      practitioner: "James Flores — Nurse | Specialist",
      hours: C.CLINIC.hours_en, loc: C.CLINIC.location_en,
      wa_text: (name) => `Hello, this is ${name}. I just sent an appointment request through the website.`,
      err: {
        invalid_name: "Please enter your name.",
        invalid_phone: "Please enter a valid Saudi mobile number (05XXXXXXXX).",
        no_areas: "Please choose at least one treatment area.",
        invalid_area: "One of the selected areas is no longer available. Please reload the page.",
        past_time: "The chosen time is in the past.",
        notes_too_long: "Notes must be 500 characters or fewer.",
        too_many_requests: "You already have open requests. Please wait for our confirmation or message us on WhatsApp.",
        generic: "Something went wrong. Please try again or message us on WhatsApp."
      }
    },
    ar: {
      brand: C.CLINIC.name_ar,
      brand_sub: "بإشراف ممرض مختص · هارموني ديرما، الحمراء، الرياض",
      eyebrow: "طلب موعد",
      title: "احجز جلستك",
      intro: "اختر المناطق التي تريد علاجها والوقت الذي يناسبك، وسيقوم الممرض جيمس بتأكيد الموعد عبر واتساب.",
      l_name: "الاسم الكامل", l_phone: "رقم الجوال (واتساب)", l_lang: "اللغة المفضلة",
      l_areas: "مناطق العلاج", l_date: "التاريخ المفضل ", l_time: "الوقت المفضل ", l_notes: "ملاحظات ",
      optional: "(اختياري)", loading: "جارٍ التحميل…",
      ph_notes: "أي معلومات مهمة — نوع البشرة، الأدوية، جلسات ليزر سابقة…",
      submit: "إرسال طلب الموعد", sending: "جارٍ الإرسال…",
      consent: "بإرسال الطلب فإنك توافق على التواصل معك عبر واتساب بخصوص هذا الموعد.",
      done_title: "تم استلام طلبك",
      done_text: "شكراً لك. سيتواصل معك الممرض جيمس عبر واتساب لتأكيد التاريخ والوقت.",
      wa_btn: "راسلنا على واتساب", again: "إرسال طلب آخر",
      practitioner: "جيمس فلوريس — ممرض | أخصائي",
      hours: C.CLINIC.hours_ar, loc: C.CLINIC.location_ar,
      wa_text: (name) => `مرحباً، أنا ${name}. أرسلت طلب موعد عبر الموقع.`,
      err: {
        invalid_name: "يرجى إدخال الاسم.",
        invalid_phone: "يرجى إدخال رقم جوال سعودي صحيح (05XXXXXXXX).",
        no_areas: "يرجى اختيار منطقة علاج واحدة على الأقل.",
        invalid_area: "إحدى المناطق المختارة غير متاحة الآن. يرجى تحديث الصفحة.",
        past_time: "الوقت المختار قد مضى.",
        notes_too_long: "يجب ألا تتجاوز الملاحظات ٥٠٠ حرف.",
        too_many_requests: "لديك طلبات مفتوحة بالفعل. يرجى انتظار التأكيد أو مراسلتنا على واتساب.",
        generic: "حدث خطأ. يرجى المحاولة مرة أخرى أو مراسلتنا على واتساب."
      }
    }
  };

  let lang = localStorage.getItem("lang") || ((navigator.language || "").startsWith("ar") ? "ar" : "en");
  if (!I18N[lang]) lang = "en";
  let areas = [];

  function t(k) { return I18N[lang][k]; }

  function applyLang() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      const opt = el.querySelector(".opt");
      if (opt) { el.firstChild.textContent = t(key); opt.textContent = t("optional"); }
      else el.textContent = t(key);
    });
    document.querySelectorAll("[data-i18n-ph]").forEach((el) => el.placeholder = t(el.dataset.i18nPh));
    document.querySelectorAll(".lang-toggle button").forEach((b) => b.classList.toggle("active", b.dataset.lang === lang));
    $("#hours").textContent = t("hours");
    $("#f_hours").textContent = t("hours");
    $("#f_loc").textContent = t("loc");
    $("#lang").value = lang;
    renderAreas();
  }

  function renderAreas() {
    const box = $("#areas");
    if (!areas.length) return;
    const checked = new Set([...box.querySelectorAll("input:checked")].map((i) => i.value));
    const groups = new Map();
    areas.forEach((a) => {
      const g = lang === "ar" ? a.collection_ar : a.collection_en;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(a);
    });
    box.innerHTML = "";
    groups.forEach((list, g) => {
      const div = document.createElement("div");
      div.className = "group";
      div.innerHTML = `<h3>${esc(g)}</h3><div class="chips"></div>`;
      const chips = div.querySelector(".chips");
      list.forEach((a) => {
        const lab = document.createElement("label");
        lab.className = "chip";
        lab.style.margin = 0;
        lab.innerHTML = `<input type="checkbox" name="area" value="${esc(a.code)}" ${checked.has(a.code) ? "checked" : ""}><span>${esc(lang === "ar" ? a.name_ar : a.name_en)}</span>`;
        chips.appendChild(lab);
      });
      box.appendChild(div);
    });
  }

  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  function fillTimes() {
    const sel = $("#time");
    const { open_hour, close_hour, slot_minutes } = C.CLINIC;
    for (let m = open_hour * 60; m < close_hour * 60; m += slot_minutes) {
      const h = Math.floor(m / 60), mm = m % 60;
      const v = `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      const h12 = ((h + 11) % 12) + 1, ap = h >= 12 ? "PM" : "AM";
      const o = document.createElement("option");
      o.value = v; o.textContent = `${h12}:${String(mm).padStart(2, "0")} ${ap}`;
      sel.appendChild(o);
    }
  }

  function setupDate() {
    const d = $("#date");
    const today = new Date();
    d.min = today.toISOString().slice(0, 10);
    const max = new Date(today); max.setDate(max.getDate() + 60);
    d.max = max.toISOString().slice(0, 10);
    d.addEventListener("change", () => {
      if (!d.value) return;
      const day = new Date(d.value + "T12:00:00").getDay();
      if (day === C.CLINIC.closed_weekday) {
        showMsg(lang === "ar" ? "العيادة مغلقة يوم الجمعة. يرجى اختيار يوم آخر." : "The clinic is closed on Friday. Please choose another day.");
        d.value = "";
      } else hideMsg();
    });
  }

  function showMsg(text) { const m = $("#msg"); m.textContent = text; m.classList.remove("hidden"); m.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  function hideMsg() { $("#msg").classList.add("hidden"); }

  async function loadAreas() {
    const { data, error } = await sb.from("areas").select("code,name_en,name_ar,collection_en,collection_ar,sort_order").eq("active", true).order("sort_order");
    if (error) { $("#areas").innerHTML = `<p class="muted">${esc(t("err").generic)}</p>`; return; }
    areas = data || [];
    renderAreas();
  }

  // Build an ISO timestamp for the chosen date/time in Riyadh time (UTC+3, no DST).
  function preferredAt() {
    const d = $("#date").value, tm = $("#time").value;
    if (!d) return null;
    return `${d}T${tm || "13:00"}:00+03:00`;
  }

  async function submit(e) {
    e.preventDefault();
    hideMsg();
    const name = $("#name").value.trim();
    const phone = $("#phone").value.trim();
    const codes = [...document.querySelectorAll('input[name="area"]:checked')].map((i) => i.value);
    const E = t("err");
    if (!name) return showMsg(E.invalid_name);
    if (!/^(\+?966|0)?5\d{8}$/.test(phone.replace(/[\s-]/g, ""))) return showMsg(E.invalid_phone);
    if (!codes.length) return showMsg(E.no_areas);

    const btn = $("#submit");
    btn.disabled = true; btn.textContent = t("sending");
    const { error } = await sb.rpc("book_appointment", {
      p_full_name: name,
      p_phone: phone,
      p_lang: $("#lang").value,
      p_area_codes: codes,
      p_preferred_at: preferredAt(),
      p_notes: $("#notes").value.trim() || null
    });
    btn.disabled = false; btn.textContent = t("submit");
    if (error) {
      const key = Object.keys(E).find((k) => (error.message || "").includes(k));
      return showMsg(E[key] || E.generic);
    }
    $("#booking").classList.add("hidden");
    $("#done").classList.remove("hidden");
    $("#wa").href = `https://wa.me/${C.CLINIC.whatsapp}?text=${encodeURIComponent(t("wa_text")(name))}`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.querySelectorAll(".lang-toggle button").forEach((b) =>
    b.addEventListener("click", () => { lang = b.dataset.lang; localStorage.setItem("lang", lang); applyLang(); }));
  $("#booking").addEventListener("submit", submit);
  $("#again").addEventListener("click", (e) => {
    e.preventDefault();
    $("#booking").reset(); document.querySelectorAll('input[name="area"]').forEach((i) => i.checked = false);
    $("#done").classList.add("hidden"); $("#booking").classList.remove("hidden");
  });

  fillTimes();
  setupDate();
  applyLang();
  loadAreas();
})();
