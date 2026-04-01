(function () {
    const COOKIE_NAME = 'focus_wall_ok';
    const POLL_MS = 12000;
    const TIME_BLOCKS = ['morning', 'afternoon', 'evening', 'night', 'anytime'];
    const PROGRESS_EVENT = 'progress';
    const STREAK_RESET_EVENT = 'vice_streak_reset';

    const readConfig = () => {
        const supabaseUrl = String(window.HABIT_SUPABASE_URL || '').trim();
        const supabaseAnonKey = String(window.HABIT_SUPABASE_ANON_KEY || '').trim();
        const wallPassword = String(window.HABIT_WALL_PASSWORD || 'Kato').trim();
        const cookieDays = Math.max(1, Number(window.HABIT_WALL_COOKIE_DAYS) || 30);

        return {
            supabaseUrl,
            supabaseAnonKey,
            wallPassword,
            cookieDays,
            tables: {
                habits: String(window.HABIT_TABLE_HABITS || 'habits').trim(),
                logs: String(window.HABIT_TABLE_LOGS || 'habit_logs').trim(),
                notes: String(window.HABIT_TABLE_NOTES || 'quick_notes').trim(),
                sleepLogs: String(window.HABIT_TABLE_SLEEP_LOGS || 'sleep_logs').trim(),
                dailyMetrics: String(window.HABIT_TABLE_DAILY_METRICS || 'daily_metrics').trim()
            }
        };
    };

    const hasSupabase = () => Boolean(window.supabase && typeof window.supabase.createClient === 'function');

    const createClient = (config) => {
        if (!hasSupabase()) return null;
        if (!config.supabaseUrl || !config.supabaseAnonKey) return null;
        return window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    };

    const setCookie = (name, value, days) => {
        const expires = new Date(Date.now() + days * 86400000).toUTCString();
        document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
    };

    const getCookie = (name) => {
        const prefix = `${name}=`;
        const cookie = document.cookie
            .split(';')
            .map((part) => part.trim())
            .find((part) => part.startsWith(prefix));

        if (!cookie) return '';
        return decodeURIComponent(cookie.slice(prefix.length));
    };

    const clearCookie = (name) => {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
    };

    const formatDateKey = (date) => {
        const safeDate = date instanceof Date ? date : new Date();
        return safeDate.toISOString().slice(0, 10);
    };

    const getTodayKey = () => formatDateKey(new Date());

    const getDateFromOffset = (offsetDays) => {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() + Number(offsetDays || 0));
        return formatDateKey(date);
    };

    const normalizeTimeBlock = (value) => {
        const normalized = String(value || '').trim().toLowerCase();
        return TIME_BLOCKS.includes(normalized) ? normalized : 'anytime';
    };

    const normalizeTimeBlocks = (value) => {
        const source = Array.isArray(value) ? value : [value];
        const cleaned = source
            .map((entry) => normalizeTimeBlock(entry))
            .filter((entry, index, array) => array.indexOf(entry) === index);

        if (!cleaned.length) return ['anytime'];
        if (cleaned.includes('anytime')) return ['anytime'];
        return cleaned;
    };

    const toDbHabitType = (value) => (value === 'duration' ? 'duration' : 'boolean');
    const fromDbHabitType = (value) => (value === 'duration' ? 'duration' : 'count');

    const sanitizeUnit = (value, fallback = 'times') => {
        const cleaned = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_ -]/g, '');
        if (!cleaned) return fallback;
        return cleaned.slice(0, 20);
    };

    const sanitizeSource = (value) => {
        const source = String(value || '').trim().toLowerCase();
        if (source === 'dashboard' || source === 'insights' || source === 'other') return source;
        return 'other';
    };

    const toNonNegativeNumber = (value, fallback = 0) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.max(0, parsed);
    };

    const parseTimeToMinutes = (value) => {
        if (!value || !String(value).includes(':')) return null;
        const [hourPart, minutePart] = String(value).split(':');
        const hour = Number(hourPart);
        const minute = Number(minutePart);
        if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
        return hour * 60 + minute;
    };

    const getSleepDurationMinutes = (sleptAt, wokeAt) => {
        const start = parseTimeToMinutes(sleptAt);
        const end = parseTimeToMinutes(wokeAt);
        if (start == null || end == null) return null;

        let duration = end - start;
        if (duration <= 0) duration += 24 * 60;
        return duration;
    };

    const getCurrentTimeBlock = (now = new Date()) => {
        const hour = now.getHours();
        if (hour >= 5 && hour < 12) return 'morning';
        if (hour >= 12 && hour < 17) return 'afternoon';
        if (hour >= 17 && hour < 21) return 'evening';
        return 'night';
    };

    const isHabitActiveNow = (habit, block) => {
        const blocks = normalizeTimeBlocks(habit.time_of_day || habit.timeOfDayBlocks || 'anytime');
        return blocks.includes('anytime') || blocks.includes(block);
    };

    const parseHabit = (row) => ({
        id: row.id,
        passcode_key: row.passcode_key,
        name: row.name,
        category: row.category || 'focus',
        habit_type: fromDbHabitType(row.habit_type),
        target_amount: Math.max(1, Number(row.target_amount) || 1),
        time_of_day: normalizeTimeBlocks(row.time_of_day),
        unit: row.unit || (fromDbHabitType(row.habit_type) === 'duration' ? 'minutes' : 'times'),
        tracking_method: row.tracking_method || null,
        initial_limit: row.initial_limit == null ? null : Number(row.initial_limit),
        current_limit: row.current_limit == null ? null : Number(row.current_limit),
        goal_limit: row.goal_limit == null ? null : Number(row.goal_limit),
        taper_rate: row.taper_rate == null ? null : Number(row.taper_rate),
        taper_step_amount: row.taper_step_amount == null ? null : Number(row.taper_step_amount),
        taper_interval_days: row.taper_interval_days == null ? null : Number(row.taper_interval_days),
        taper_started_at: row.taper_started_at || null,
        taper_last_applied_at: row.taper_last_applied_at || null,
        sort_order: Number(row.sort_order) || 0,
        archived: Boolean(row.archived),
        created_at: row.created_at || null,
        updated_at: row.updated_at || null
    });

    const sortHabits = (habits) => habits.slice().sort((a, b) => {
        const orderDiff = (a.sort_order || 0) - (b.sort_order || 0);
        if (orderDiff !== 0) return orderDiff;
        return String(a.name || '').localeCompare(String(b.name || ''));
    });

    const loadHabits = async (client, config, options = {}) => {
        const query = client
            .from(config.tables.habits)
            .select('id,passcode_key,name,category,habit_type,target_amount,time_of_day,unit,tracking_method,initial_limit,current_limit,goal_limit,taper_rate,taper_step_amount,taper_interval_days,taper_started_at,taper_last_applied_at,sort_order,archived,created_at,updated_at')
            .eq('passcode_key', config.wallPassword)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true });

        if (!options.includeArchived) query.eq('archived', false);

        const { data, error } = await query;

        if (error) throw error;
        return sortHabits((data || []).map(parseHabit));
    };

    const loadProgressLogs = async (client, config, sinceDateKey) => {
        const query = client
            .from(config.tables.logs)
            .select('habit_id,log_date,current_amount,event_type')
            .eq('passcode_key', config.wallPassword)
            .eq('event_type', PROGRESS_EVENT);

        if (sinceDateKey) query.gte('log_date', sinceDateKey);
        const { data, error } = await query;

        if (error) throw error;

        const byDate = {};
        (data || []).forEach((row) => {
            if (!byDate[row.log_date]) byDate[row.log_date] = {};
            byDate[row.log_date][row.habit_id] = toNonNegativeNumber(row.current_amount, 0);
        });

        return byDate;
    };

    const loadProgressForDate = async (client, config, dateKey) => {
        const { data, error } = await client
            .from(config.tables.logs)
            .select('habit_id,current_amount')
            .eq('passcode_key', config.wallPassword)
            .eq('event_type', PROGRESS_EVENT)
            .eq('log_date', dateKey);

        if (error) throw error;

        const byHabit = {};
        (data || []).forEach((row) => {
            byHabit[row.habit_id] = Math.max(0, Number(row.current_amount) || 0);
        });

        return byHabit;
    };

    const loadStreakResetEvents = async (client, config, sinceDateKey) => {
        const query = client
            .from(config.tables.logs)
            .select('habit_id,log_date')
            .eq('passcode_key', config.wallPassword)
            .eq('event_type', STREAK_RESET_EVENT)
            .order('log_date', { ascending: false });

        if (sinceDateKey) query.gte('log_date', sinceDateKey);
        const { data, error } = await query;
        if (error) throw error;

        const latestByHabit = {};
        const allByHabit = {};

        (data || []).forEach((row) => {
            if (!row.habit_id || !row.log_date) return;
            if (!latestByHabit[row.habit_id]) latestByHabit[row.habit_id] = row.log_date;
            if (!allByHabit[row.habit_id]) allByHabit[row.habit_id] = [];
            allByHabit[row.habit_id].push(row.log_date);
        });

        return {
            latestByHabit,
            allByHabit
        };
    };

    const loadSleepLogs = async (client, config, sinceDateKey) => {
        const query = client
            .from(config.tables.sleepLogs)
            .select('log_date,slept_at,woke_at,duration_minutes,updated_at')
            .eq('passcode_key', config.wallPassword)
            .order('log_date', { ascending: false });

        if (sinceDateKey) query.gte('log_date', sinceDateKey);
        const { data, error } = await query;
        if (error) throw error;

        const byDate = {};
        (data || []).forEach((row) => {
            const computed = getSleepDurationMinutes(row.slept_at, row.woke_at);
            byDate[row.log_date] = {
                logDate: row.log_date,
                sleptAt: row.slept_at,
                wokeAt: row.woke_at,
                durationMinutes: toNonNegativeNumber(row.duration_minutes, computed == null ? 0 : computed),
                updatedAt: row.updated_at || null
            };
        });

        return byDate;
    };

    const upsertSleepLog = async (client, config, payload) => {
        const duration = getSleepDurationMinutes(payload.sleptAt, payload.wokeAt);
        if (duration == null) throw new Error('Invalid sleep or wake time');

        const { error } = await client
            .from(config.tables.sleepLogs)
            .upsert({
                passcode_key: config.wallPassword,
                log_date: payload.logDate,
                slept_at: payload.sleptAt,
                woke_at: payload.wokeAt,
                duration_minutes: duration,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'passcode_key,log_date'
            });

        if (error) throw error;
    };

    const upsertProgress = async (client, config, payload) => {
        const { error } = await client
            .from(config.tables.logs)
            .upsert({
                passcode_key: config.wallPassword,
                habit_id: payload.habitId,
                log_date: payload.dateKey,
                event_type: PROGRESS_EVENT,
                current_amount: payload.currentAmount,
                amount_delta: Number(payload.deltaAmount) || 0,
                metadata: payload.metadata || null,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'passcode_key,habit_id,log_date,event_type'
            });

        if (error) throw error;
    };

    const insertEvent = async (client, config, payload) => {
        const { error } = await client
            .from(config.tables.logs)
            .upsert({
                passcode_key: config.wallPassword,
                habit_id: payload.habitId,
                log_date: payload.dateKey || getTodayKey(),
                event_type: payload.eventType,
                amount_delta: Number(payload.amountDelta) || 0,
                current_amount: Number(payload.currentAmount) || 0,
                metadata: payload.metadata || null,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'passcode_key,habit_id,log_date,event_type'
            });

        if (error) throw error;
    };

    const loadNotes = async (client, config, options = {}) => {
        const limit = Math.max(1, Number(options.limit) || 50);
        const query = client
            .from(config.tables.notes)
            .select('id,note_text,source,created_at')
            .eq('passcode_key', config.wallPassword)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (options.source) query.eq('source', sanitizeSource(options.source));
        const { data, error } = await query;
        if (error) throw error;

        return (data || []).map((row) => ({
            id: row.id,
            noteText: String(row.note_text || ''),
            source: sanitizeSource(row.source),
            createdAt: row.created_at || null
        }));
    };

    const createNote = async (client, config, payload) => {
        const noteText = String(payload.noteText || '').trim();
        if (!noteText) throw new Error('Note text cannot be empty');

        const { error } = await client
            .from(config.tables.notes)
            .insert({
                passcode_key: config.wallPassword,
                note_text: noteText,
                source: sanitizeSource(payload.source)
            });

        if (error) throw error;
    };

    const deleteNote = async (client, config, noteId) => {
        const { error } = await client
            .from(config.tables.notes)
            .delete()
            .eq('id', noteId)
            .eq('passcode_key', config.wallPassword);

        if (error) throw error;
    };

    const createHabit = async (client, config, payload) => {
        const habitPayload = {
            passcode_key: config.wallPassword,
            name: payload.name,
            category: payload.category || 'focus',
            habit_type: toDbHabitType(payload.habit_type),
            target_amount: Math.max(1, Number(payload.target_amount) || 1),
            time_of_day: normalizeTimeBlocks(payload.time_of_day),
            unit: sanitizeUnit(payload.unit, payload.habit_type === 'duration' ? 'minutes' : 'times'),
            tracking_method: payload.tracking_method || null,
            initial_limit: payload.initial_limit ?? null,
            current_limit: payload.current_limit ?? null,
            goal_limit: payload.goal_limit ?? null,
            taper_rate: payload.taper_rate ?? null,
            taper_step_amount: payload.taper_step_amount ?? null,
            taper_interval_days: payload.taper_interval_days ?? null,
            taper_started_at: payload.taper_started_at ?? null,
            taper_last_applied_at: payload.taper_last_applied_at ?? null,
            sort_order: Number(payload.sort_order) || 0,
            archived: false,
            updated_at: new Date().toISOString()
        };

        const { error } = await client
            .from(config.tables.habits)
            .insert(habitPayload);

        if (error) throw error;
    };

    const updateHabit = async (client, config, habitId, payload) => {
        const updates = {};

        if (Object.prototype.hasOwnProperty.call(payload, 'name')) updates.name = payload.name;
        if (Object.prototype.hasOwnProperty.call(payload, 'category')) updates.category = payload.category;
        if (Object.prototype.hasOwnProperty.call(payload, 'habit_type')) updates.habit_type = toDbHabitType(payload.habit_type);
        if (Object.prototype.hasOwnProperty.call(payload, 'target_amount')) updates.target_amount = Math.max(1, Number(payload.target_amount) || 1);
        if (Object.prototype.hasOwnProperty.call(payload, 'time_of_day')) updates.time_of_day = normalizeTimeBlocks(payload.time_of_day);
        if (Object.prototype.hasOwnProperty.call(payload, 'unit')) updates.unit = sanitizeUnit(payload.unit, 'times');
        if (Object.prototype.hasOwnProperty.call(payload, 'tracking_method')) updates.tracking_method = payload.tracking_method;
        if (Object.prototype.hasOwnProperty.call(payload, 'initial_limit')) updates.initial_limit = payload.initial_limit;
        if (Object.prototype.hasOwnProperty.call(payload, 'current_limit')) updates.current_limit = payload.current_limit;
        if (Object.prototype.hasOwnProperty.call(payload, 'goal_limit')) updates.goal_limit = payload.goal_limit;
        if (Object.prototype.hasOwnProperty.call(payload, 'taper_rate')) updates.taper_rate = payload.taper_rate;
        if (Object.prototype.hasOwnProperty.call(payload, 'taper_step_amount')) updates.taper_step_amount = payload.taper_step_amount;
        if (Object.prototype.hasOwnProperty.call(payload, 'taper_interval_days')) updates.taper_interval_days = payload.taper_interval_days;
        if (Object.prototype.hasOwnProperty.call(payload, 'taper_started_at')) updates.taper_started_at = payload.taper_started_at;
        if (Object.prototype.hasOwnProperty.call(payload, 'taper_last_applied_at')) updates.taper_last_applied_at = payload.taper_last_applied_at;
        if (Object.prototype.hasOwnProperty.call(payload, 'sort_order')) updates.sort_order = Number(payload.sort_order) || 0;
        if (Object.prototype.hasOwnProperty.call(payload, 'archived')) updates.archived = Boolean(payload.archived);

        updates.updated_at = new Date().toISOString();

        const { error } = await client
            .from(config.tables.habits)
            .update(updates)
            .eq('id', habitId)
            .eq('passcode_key', config.wallPassword);

        if (error) throw error;
    };

    const archiveHabit = async (client, config, habitId) => {
        await updateHabit(client, config, habitId, {
            archived: true
        });
    };

    const reorderHabits = async (client, config, habitIds) => {
        for (let index = 0; index < habitIds.length; index += 1) {
            await updateHabit(client, config, habitIds[index], {
                sort_order: index
            });
        }
    };

    const applyBudgetTapering = async (client, config, habits) => {
        const today = new Date(getTodayKey());
        const updates = [];

        habits.forEach((habit) => {
            if (habit.category !== 'vice') return;
            if (habit.tracking_method !== 'budget') return;
            if (habit.initial_limit == null || habit.goal_limit == null) return;
            if (habit.taper_step_amount == null || habit.taper_interval_days == null) return;

            const startDateKey = String(habit.taper_started_at || habit.created_at || getTodayKey()).slice(0, 10);
            const startDate = new Date(`${startDateKey}T00:00:00`);
            const elapsedDays = Math.max(0, Math.floor((today - startDate) / 86400000));
            const intervals = Math.floor(elapsedDays / Math.max(1, Number(habit.taper_interval_days) || 1));

            const proposed = Math.max(
                Number(habit.goal_limit),
                Number(habit.initial_limit) - intervals * Number(habit.taper_step_amount)
            );

            const currentLimit = habit.current_limit == null ? Number(habit.initial_limit) : Number(habit.current_limit);
            if (Math.round(currentLimit * 100) !== Math.round(proposed * 100)) {
                updates.push({
                    id: habit.id,
                    current_limit: proposed,
                    taper_last_applied_at: new Date().toISOString()
                });
            }
        });

        for (const update of updates) {
            await updateHabit(client, config, update.id, {
                current_limit: update.current_limit,
                taper_last_applied_at: update.taper_last_applied_at
            });
        }

        return updates.length;
    };

    window.HabitAppCore = {
        COOKIE_NAME,
        POLL_MS,
        TIME_BLOCKS,
        readConfig,
        hasSupabase,
        createClient,
        setCookie,
        getCookie,
        clearCookie,
        formatDateKey,
        getTodayKey,
        getDateFromOffset,
        normalizeTimeBlocks,
        sanitizeUnit,
        sanitizeSource,
        getCurrentTimeBlock,
        isHabitActiveNow,
        getSleepDurationMinutes,
        loadHabits,
        loadProgressLogs,
        loadProgressForDate,
        loadStreakResetEvents,
        loadSleepLogs,
        upsertSleepLog,
        upsertProgress,
        insertEvent,
        loadNotes,
        createNote,
        deleteNote,
        createHabit,
        updateHabit,
        archiveHabit,
        reorderHabits,
        applyBudgetTapering,
        PROGRESS_EVENT,
        STREAK_RESET_EVENT
    };
})();
