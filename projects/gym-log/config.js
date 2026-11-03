// Gym Log instellingen.
// Zelfde Supabase-project als de habit tracker; eigen tabellen (zie SETUP.sql).
// Iedereen logt in met een eigen account (Supabase Auth) en ziet alleen zijn eigen data.
window.GYM_SUPABASE_URL = "https://yitwgfeyyngnoduufhfp.supabase.co";
window.GYM_SUPABASE_KEY = "sb_publishable_LVLbo3UZiJx2FUUjg48mWw_tfB7VjO9";

// Standaard weekdoel voor lichaamsgewicht (kg) voor iemand die er zelf nog geen heeft ingesteld.
// Ieder account kan zijn eigen doel kiezen onder Oefeningen > Account.
window.GYM_DOEL_PER_WEEK = 0;

// Labels die je als snelkeuze ziet bij "Nieuwe training" (eigen namen komen er vanzelf bij).
window.GYM_LABELS = ["Push", "Pull", "Legs", "Upper", "Lower", "Full body"];

// Oefeningen waarmee een nieuw account begint: [naam, spiergroep, min reps, max reps, stap in kg].
window.GYM_STANDAARD_OEFENINGEN = [
    ["Bench press", "borst", 6, 10, 2.5],
    ["Incline dumbbell press", "borst", 8, 12, 2],
    ["Overhead press", "schouders", 6, 10, 2.5],
    ["Lateral raise", "schouders", 12, 20, 1],
    ["Pull-up", "rug", 6, 12, 2.5],
    ["Barbell row", "rug", 6, 10, 2.5],
    ["Lat pulldown", "rug", 8, 12, 5],
    ["Squat", "benen", 5, 8, 2.5],
    ["Romanian deadlift", "benen", 6, 10, 5],
    ["Leg press", "benen", 8, 15, 10],
    ["Bicep curl", "armen", 8, 12, 1],
    ["Tricep pushdown", "armen", 10, 15, 2.5],
];
