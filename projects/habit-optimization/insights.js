document.addEventListener('DOMContentLoaded', () => {
    const supabaseUrl = (window.HABIT_SUPABASE_URL || '').trim();
    const supabaseAnonKey = (window.HABIT_SUPABASE_ANON_KEY || '').trim();
    const wallPassword = (window.HABIT_WALL_PASSWORD || 'Kato').trim();
    const cookieDays = Math.max(1, Number(window.HABIT_WALL_COOKIE_DAYS) || 30);

    const tableHabits = (window.HABIT_TABLE_HABITS || 'habits').trim();
    const tableLogs = (window.HABIT_TABLE_LOGS || 'habit_logs').trim();
    const tableSleepLogs = (window.HABIT_TABLE_SLEEP_LOGS || 'sleep_logs').trim();

    const setupMessage = document.getElementById('insights-setup-message');
    const authPanel = document.getElementById('insights-auth-panel');
    const dashboard = document.getElementById('insights-dashboard');

    const authForm = document.getElementById('insights-auth-form');
    const authPasswordInput = document.getElementById('insights-auth-password');
    const authSubmitBtn = document.getElementById('insights-auth-submit-btn');
    const authStatus = document.getElementById('insights-auth-status');

    const sleepChartEl = document.getElementById('sleep-chart');
    const sleepAverageEl = document.getElementById('sleep-average');
    const sleepEntriesEl = document.getElementById('sleep-entries');
    const focusHealthListEl = document.getElementById('focus-health-list');
    const focusHealthEmptyEl = document.getElementById('focus-health-empty');
    const viceHealthListEl = document.getElementById('vice-health-list');
    const viceHealthEmptyEl = document.getElementById('vice-health-empty');

    const hasSupabase = Boolean(window.supabase && typeof window.supabase.createClient === 'function');
    const isConfigured = Boolean(hasSupabase && supabaseUrl && supabaseAnonKey && wallPassword);

    if (!isConfigured) {
        setupMessage.hidden = false;
        authPanel.hidden = true;
        dashboard.hidden = true;
        return;
    }

    const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
    const COOKIE_NAME = 'focus_wall_ok';

    const state = {
        habits: [],
        progressByDate: {},
        streakResetByHabit: {},
        sleepByDate: {}
    };

    const setStatus = (text, isError = false) => {
        authStatus.textContent = text;
        authStatus.style.color = isError ? 'var(--danger)' : 'var(--text-soft)';
    };

    const setCookie = (name, value, days) => {
        const expires = new Date(Date.now() + days * 86400000).toUTCString();
        document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
    };

    const getCookie = (name) => {
        const key = `${name}=`;
        const parts = document.cookie.split(';').map((part) => part.trim());
        const found = parts.find((part) => part.startsWith(key));
        return found ? decodeURIComponent(found.slice(key.length)) : '';
    };

    const getTodayKey = () => new Date().toISOString().slice(0, 10);

    const getDateFromOffset = (offsetDays) => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + offsetDays);
        return d.toISOString().slice(0, 10);
    };

    const formatMinutes = (value) => {
        const total = Math.max(0, Math.floor(Number(value) || 0));
        const hours = Math.floor(total / 60);
        const mins = total % 60;
        if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
        if (hours > 0) return `${hours}h`;
        return `${mins}m`;
    };

    const sanitizeUnit = (value, fallback = 'min') => {
        const cleaned = (value || '').toString().trim().toLowerCase().replace(/[^a-z0-9_ -]/g, '');
        if (!cleaned) return fallback;
        return cleaned.slice(0, 20);
    };

    const parseHabit = (row) => ({
        id: row.id,
        name: row.name,
        category: row.category || 'focus',
        habitType: row.habit_type === 'duration' ? 'duration' : 'count',
        targetAmount: Math.max(1, Number(row.target_amount) || 1),
        unit: row.unit || (row.habit_type === 'duration' ? 'minutes' : 'times'),
        trackingMethod: row.tracking_method || null,
        initialLimit: row.initial_limit == null ? null : Number(row.initial_limit),
        currentLimit: row.current_limit == null ? null : Number(row.current_limit),
        sortOrder: Number(row.sort_order) || 0,
        archived: Boolean(row.archived),
        createdAt: row.created_at || null
    });

    const sortedHabits = (habits) => habits.slice().sort((a, b) => {
        const orderDiff = (a.sortOrder || 0) - (b.sortOrder || 0);
        if (orderDiff !== 0) return orderDiff;
        return (a.name || '').localeCompare(b.name || '');
    });

    const getFocusHabits = () => sortedHabits(state.habits.filter((h) => !h.archived && h.category === 'focus'));
    const getViceHabits = () => sortedHabits(state.habits.filter((h) => !h.archived && h.category === 'vice'));

    const getAmountForDate = (habitId, dateKey) => {
        const amount = state.progressByDate[dateKey]?.[habitId];
        return Math.max(0, Number(amount) || 0);
    };

    const getCompletionRate = (habit, days = 30) => {
        let completed = 0;
        for (let i = 0; i < days; i += 1) {
            const dateKey = getDateFromOffset(-i);
            const amount = getAmountForDate(habit.id, dateKey);
            if (amount >= habit.targetAmount) completed += 1;
        }
        return completed / days;
    };

    const getLatestResetDateForVice = (viceId) => state.streakResetByHabit[viceId] || null;

    const daysSince = (dateKey) => {
        if (!dateKey) return 0;
        const start = new Date(`${dateKey}T00:00:00`);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return Math.max(0, Math.floor((today - start) / 86400000));
    };

    const renderSleepTrend = () => {
        const points = [];
        for (let i = 29; i >= 0; i -= 1) {
            const dateKey = getDateFromOffset(-i);
            const sleep = state.sleepByDate[dateKey];
            points.push({ dateKey, mins: sleep ? Number(sleep.durationMinutes) || 0 : 0 });
        }

        const logged = points.filter((p) => p.mins > 0);
        const avg = logged.length
            ? Math.round(logged.reduce((sum, p) => sum + p.mins, 0) / logged.length)
            : 0;

        sleepAverageEl.textContent = logged.length ? formatMinutes(avg) : '-';
        sleepEntriesEl.textContent = String(logged.length);

        if (!logged.length) {
            sleepChartEl.innerHTML = '<p class="empty-state">No sleep entries yet.</p>';
            return;
        }

        const maxMins = Math.max(480, ...logged.map((p) => p.mins));
        const width = 640;
        const height = 200;
        const padX = 18;
        const padY = 18;

        const graphPoints = points.map((p, idx) => {
            const x = padX + (idx / (points.length - 1)) * (width - padX * 2);
            const y = p.mins > 0
                ? height - padY - (p.mins / maxMins) * (height - padY * 2)
                : height - padY;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');

        sleepChartEl.innerHTML = `
            <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Sleep duration trend">
                <line x1="${padX}" y1="${height - padY}" x2="${width - padX}" y2="${height - padY}" class="chart-axis"></line>
                <line x1="${padX}" y1="${padY}" x2="${padX}" y2="${height - padY}" class="chart-axis"></line>
                <polyline points="${graphPoints}" class="chart-line"></polyline>
            </svg>
        `;
    };

    const renderFocusHealth = () => {
        const habits = getFocusHabits();
        focusHealthListEl.innerHTML = '';
        focusHealthEmptyEl.hidden = habits.length > 0;

        habits.forEach((habit) => {
            const rate = getCompletionRate(habit, 30);
            const percent = Math.round(rate * 100);
            const row = document.createElement('article');
            row.className = 'insight-item';
            row.innerHTML = `
                <div class="insight-row">
                    <strong>${habit.name}</strong>
                    <span class="section-meta">${percent}%</span>
                </div>
                <div class="progress-track"><div class="progress-bar" style="width:${percent}%"></div></div>
            `;
            focusHealthListEl.appendChild(row);
        });
    };

    const renderViceHealth = () => {
        const todayKey = getTodayKey();
        const vices = getViceHabits();
        viceHealthListEl.innerHTML = '';
        viceHealthEmptyEl.hidden = vices.length > 0;

        vices.forEach((vice) => {
            const row = document.createElement('article');
            row.className = 'insight-item';

            if (vice.trackingMethod === 'streak') {
                const resetDate = getLatestResetDateForVice(vice.id) || vice.createdAt?.slice(0, 10) || todayKey;
                const streakDays = daysSince(resetDate);
                row.innerHTML = `
                    <div class="insight-row">
                        <strong>${vice.name}</strong>
                        <span class="section-meta">${streakDays} clean days</span>
                    </div>
                `;
            } else {
                const spent = getAmountForDate(vice.id, todayKey);
                const limit = Math.max(0, Number(vice.currentLimit ?? vice.initialLimit ?? vice.targetAmount ?? 0));
                const percent = limit > 0 ? Math.max(0, Math.min(100, Math.round((spent / limit) * 100))) : 0;
                const unit = sanitizeUnit(vice.unit, 'min');
                row.innerHTML = `
                    <div class="insight-row">
                        <strong>${vice.name}</strong>
                        <span class="section-meta">${spent} / ${limit} ${unit}</span>
                    </div>
                    <div class="progress-track"><div class="vice-budget-bar ${spent > limit ? 'warn' : ''}" style="width:${percent}%"></div></div>
                `;
            }

            viceHealthListEl.appendChild(row);
        });
    };

    const refreshInsights = () => {
        renderSleepTrend();
        renderFocusHealth();
        renderViceHealth();
    };

    const loadHabits = async () => {
        const { data, error } = await supabaseClient
            .from(tableHabits)
            .select('id,name,category,habit_type,target_amount,unit,tracking_method,initial_limit,current_limit,sort_order,archived,created_at')
            .eq('passcode_key', wallPassword)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true });
        if (error) throw error;
        state.habits = (data || []).map(parseHabit);
    };

    const loadProgressLogs = async () => {
        const since = getDateFromOffset(-120);
        const { data, error } = await supabaseClient
            .from(tableLogs)
            .select('habit_id,log_date,current_amount,event_type')
            .eq('passcode_key', wallPassword)
            .eq('event_type', 'progress')
            .gte('log_date', since);
        if (error) throw error;

        state.progressByDate = {};
        (data || []).forEach((row) => {
            if (!state.progressByDate[row.log_date]) state.progressByDate[row.log_date] = {};
            state.progressByDate[row.log_date][row.habit_id] = Math.max(0, Number(row.current_amount) || 0);
        });
    };

    const loadStreakResetEvents = async () => {
        const { data, error } = await supabaseClient
            .from(tableLogs)
            .select('habit_id,log_date')
            .eq('passcode_key', wallPassword)
            .eq('event_type', 'vice_streak_reset')
            .order('log_date', { ascending: false });
        if (error) throw error;

        state.streakResetByHabit = {};
        (data || []).forEach((row) => {
            if (!row.habit_id) return;
            if (!state.streakResetByHabit[row.habit_id]) state.streakResetByHabit[row.habit_id] = row.log_date;
        });
    };

    const loadSleepLogs = async () => {
        const since = getDateFromOffset(-120);
        const { data, error } = await supabaseClient
            .from(tableSleepLogs)
            .select('log_date,duration_minutes')
            .eq('passcode_key', wallPassword)
            .gte('log_date', since)
            .order('log_date', { ascending: false });
        if (error) throw error;

        state.sleepByDate = {};
        (data || []).forEach((row) => {
            state.sleepByDate[row.log_date] = {
                durationMinutes: Number(row.duration_minutes) || 0
            };
        });
    };

    const unlock = async () => {
        authPanel.hidden = true;
        dashboard.hidden = false;
        setCookie(COOKIE_NAME, '1', cookieDays);
        setStatus('Unlocked');

        await Promise.all([loadHabits(), loadProgressLogs(), loadStreakResetEvents(), loadSleepLogs()]);
        refreshInsights();
    };

    authForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const entered = (authPasswordInput.value || '').trim();
        if (!entered) return;

        if (entered !== wallPassword) {
            setStatus('Wrong password.', true);
            return;
        }

        authSubmitBtn.disabled = true;
        setStatus('Unlocking...');
        try {
            await unlock();
            authPasswordInput.value = '';
        } catch (error) {
            setStatus(`Unlock failed: ${error.message}`, true);
        } finally {
            authSubmitBtn.disabled = false;
        }
    });

    if (getCookie(COOKIE_NAME) === '1') {
        void unlock();
    }
});
