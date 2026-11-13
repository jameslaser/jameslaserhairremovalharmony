// Public configuration — safe to commit. The publishable key only allows what
// Row Level Security permits (reading active treatment areas and calling the
// book_appointment() function). Admin data requires a signed-in admin account.
window.APP_CONFIG = {
  SUPABASE_URL: "https://xpkrtagvfwocnuecwukt.supabase.co",
  SUPABASE_KEY: "sb_publishable_1z08BxPCq1V5bnH35_DJKw_wBVuFXaq",
  CLINIC: {
    name_en: "James Laser Hair Removal for Men",
    name_ar: "جيمس لإزالة الشعر بالليزر للرجال",
    practitioner: "James Flores — Nurse | Specialist",
    location_en: "Harmony Derma, Khalid bn Walid St, Al Hamra, Riyadh",
    location_ar: "هارموني ديرما، شارع خالد بن الوليد، الحمراء، الرياض",
    whatsapp: "966557401562",
    phone_display: "+966 55 740 1562",
    hours_en: "Daily 1:00 PM – 10:00 PM · Closed Friday",
    hours_ar: "يومياً ١:٠٠ م – ١٠:٠٠ م · الجمعة مغلق",
    // Booking slots offered on the public form (24h). Friday is excluded.
    open_hour: 13,
    close_hour: 22,
    slot_minutes: 30,
    closed_weekday: 5, // 0=Sun ... 5=Fri
    timezone: "Asia/Riyadh"
  }
};
