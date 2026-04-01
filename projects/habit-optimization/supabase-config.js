// Fill these values from your Supabase project settings.
window.HABIT_SUPABASE_URL = "https://yitwgfeyyngnoduufhfp.supabase.co";
window.HABIT_SUPABASE_ANON_KEY = "sb_publishable_LVLbo3UZiJx2FUUjg48mWw_tfB7VjO9";

// Simple wall passcode (not secure auth). Keep the same value on all your devices.
window.HABIT_WALL_PASSWORD = "Kato";

console.log('✓ supabase-config.js loaded');
console.log('  Password:', window.HABIT_WALL_PASSWORD);
console.log('  URL:', window.HABIT_SUPABASE_URL.substring(0, 30) + '...');

// How long to remember successful unlock in a cookie.
window.HABIT_WALL_COOKIE_DAYS = 30;

// Shared state table for this lightweight mode.
window.HABIT_PUBLIC_STATE_TABLE = "focus_dashboard_public";

// Optional table overrides.
window.HABIT_TABLE_HABITS = "habits";
window.HABIT_TABLE_LOGS = "habit_logs";
window.HABIT_TABLE_SLEEP_LOGS = "sleep_logs";
window.HABIT_TABLE_DAILY_METRICS = "daily_metrics";
window.HABIT_TABLE_NOTES = "quick_notes";
window.HABIT_TABLE_SESSIONS = "focus_sessions";

// Scheduling configuration for array-based habits.time_of_day values.
window.HABIT_TIME_BLOCKS = ["morning", "afternoon", "evening", "night", "anytime"];
window.HABIT_DEFAULT_TIME_BLOCKS = ["anytime"];
