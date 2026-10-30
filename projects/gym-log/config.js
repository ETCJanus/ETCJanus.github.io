// Gym Log instellingen.
// Zelfde Supabase-project als de habit tracker; eigen tabellen (zie SETUP.sql).
window.GYM_SUPABASE_URL = "https://yitwgfeyyngnoduufhfp.supabase.co";
window.GYM_SUPABASE_KEY = "sb_publishable_LVLbo3UZiJx2FUUjg48mWw_tfB7VjO9";

// Simpele drempel zodat niet elke bezoeker zomaar kan invullen (geen echte beveiliging).
// Zet op "" om uit te zetten. Wordt per apparaat onthouden.
window.GYM_WACHTWOORD = "Kato";

// Gewenste verandering in lichaamsgewicht per week (kg). Positief = bulk, negatief = cut.
// De weegschaal-tab vergelijkt je trend hiermee.
window.GYM_DOEL_PER_WEEK = 0.25;

// Labels die je als snelkeuze ziet bij "Nieuwe training".
window.GYM_LABELS = ["Push", "Pull", "Legs", "Upper", "Lower", "Full body"];
