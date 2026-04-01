document.addEventListener('DOMContentLoaded', () => {
    const supabaseUrl = (window.HABIT_SUPABASE_URL || '').trim();
    const supabaseAnonKey = (window.HABIT_SUPABASE_ANON_KEY || '').trim();
    const wallPassword = (window.HABIT_WALL_PASSWORD || 'Kato').trim();
    const cookieDays = Math.max(1, Number(window.HABIT_WALL_COOKIE_DAYS) || 30);

    const tableHabits = (window.HABIT_TABLE_HABITS || 'habits').trim();
    const tableLogs = (window.HABIT_TABLE_LOGS || 'habit_logs').trim();

    const hasSupabase = Boolean(window.supabase && typeof window.supabase.createClient === 'function');
    const isConfigured = Boolean(hasSupabase && supabaseUrl && supabaseAnonKey && wallPassword);

    const setupMessage = document.getElementById('setup-message');
    const authPanel = document.getElementById('auth-panel');
    const dashboard = document.getElementById('dashboard');

    const authForm = document.getElementById('auth-form');
    const authPasswordInput = document.getElementById('auth-password');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const authStatus = document.getElementById('auth-status');
    const lockBtn = document.getElementById('sign-out-btn');
    const editModeToggle = document.getElementById('edit-mode-toggle');

    const tabFocusBtn = document.getElementById('tab-focus');
    const tabViceBtn = document.getElementById('tab-vice');
    const focusView = document.getElementById('focus-view');
    const viceView = document.getElementById('vice-view');

    const todayDateEl = document.getElementById('today-date');
    const focusHabitListEl = document.getElementById('focus-habit-list');
    const focusHabitEmptyEl = document.getElementById('focus-habit-empty');
    const dailyProgressTextEl = document.getElementById('daily-progress-text');
    const dailyProgressPercentEl = document.getElementById('daily-progress-percent');
    const dailyProgressBarEl = document.getElementById('daily-progress-bar');

    const timerModeEl = document.getElementById('timer-mode');
    const timerDisplayEl = document.getElementById('timer-display');
    const timerStatusEl = document.getElementById('timer-status');
    const focusMinutesInput = document.getElementById('focus-minutes');
    const breakMinutesInput = document.getElementById('break-minutes');
    const timerHabitSelect = document.getElementById('timer-habit-select');
    const timerStartPauseBtn = document.getElementById('timer-start-pause');
    const timerResetBtn = document.getElementById('timer-reset');
    const timerSkipBtn = document.getElementById('timer-skip');

    const currentStreakEl = document.getElementById('current-streak');
    const bestStreakEl = document.getElementById('best-streak');
    const heatmapEl = document.getElementById('heatmap');

    const focusHabitForm = document.getElementById('focus-habit-form');
    const focusHabitNameInput = document.getElementById('focus-habit-name');
    const focusHabitTypeInput = document.getElementById('focus-habit-type');
    const focusHabitTargetInput = document.getElementById('focus-habit-target');
    const focusDurationTargetWrap = document.getElementById('focus-duration-target-wrap');
    const focusTargetHoursInput = document.getElementById('focus-target-hours');
    const focusTargetMinutesInput = document.getElementById('focus-target-minutes');
    const focusManagerListEl = document.getElementById('focus-manager-list');

    const viceListEl = document.getElementById('vice-list');
    const viceEmptyEl = document.getElementById('vice-empty');
    const viceForm = document.getElementById('vice-form');
    const viceNameInput = document.getElementById('vice-name');
    const viceMethodInput = document.getElementById('vice-method');
    const viceBudgetFields = document.getElementById('vice-budget-fields');
    const viceInitialLimitInput = document.getElementById('vice-initial-limit');
    const viceGoalLimitInput = document.getElementById('vice-goal-limit');
    const viceTaperStepInput = document.getElementById('vice-taper-step');
    const viceTaperIntervalInput = document.getElementById('vice-taper-interval');
    const viceBudgetUnitInput = document.getElementById('vice-budget-unit');
    const viceManagerListEl = document.getElementById('vice-manager-list');

    const cravingViceSelect = document.getElementById('craving-vice-select');
    const cravingTimerEl = document.getElementById('craving-timer');
    const cravingStartBtn = document.getElementById('craving-start');
    const cravingStatusEl = document.getElementById('craving-status');
    const cravingSuccessEl = document.getElementById('craving-success');

    if (!isConfigured) {
        setupMessage.hidden = false;
        authPanel.hidden = true;
        dashboard.hidden = true;
        return;
    }

    const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

    const state = {
        unlocked: false,
        activeTab: 'focus',
        editMode: false,
        habits: [],
        progressByDate: {},
        streakResetByHabit: {},
        timer: {
            mode: 'focus',
            isRunning: false,
            remainingSec: 25 * 60,
            intervalId: null
        },
        craving: {
            isRunning: false,
            remainingSec: 10 * 60,
            intervalId: null
        }
    };

    const COOKIE_NAME = 'focus_wall_ok';
    const POLL_MS = 12000;
    let pollId = null;

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

    const clearCookie = (name) => {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
    };

    const getTodayKey = () => new Date().toISOString().slice(0, 10);

    const getDateFromOffset = (offsetDays) => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + offsetDays);
        return d.toISOString().slice(0, 10);
    };

    const normalizeNumber = (value, min, max, fallback) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.max(min, Math.min(max, parsed));
    };

    const toClock = (sec) => {
        const value = Math.max(0, Math.floor(sec));
        const min = String(Math.floor(value / 60)).padStart(2, '0');
        const rem = String(value % 60).padStart(2, '0');
        return `${min}:${rem}`;
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

    const formatUsage = (value, unit) => {
        const amount = Number(value) || 0;
        const rounded = Number.isInteger(amount) ? String(amount) : String(Math.round(amount * 100) / 100);
        return `${rounded} ${unit}`;
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
        goalLimit: row.goal_limit == null ? null : Number(row.goal_limit),
        taperRate: row.taper_rate || null,
        taperStepAmount: row.taper_step_amount == null ? null : Number(row.taper_step_amount),
        taperIntervalDays: row.taper_interval_days == null ? null : Number(row.taper_interval_days),
        taperStartedAt: row.taper_started_at || row.created_at || null,
        taperLastAppliedAt: row.taper_last_applied_at || null,
        sortOrder: Number(row.sort_order) || 0,
        archived: Boolean(row.archived),
        createdAt: row.created_at || null
    });

    const getHabit = (habitId) => state.habits.find((h) => h.id === habitId && !h.archived);

    const getAmountForDate = (habitId, dateKey) => {
        const amount = state.progressByDate[dateKey]?.[habitId];
        return Math.max(0, Number(amount) || 0);
    };

    const isHabitCompleted = (habit, dateKey) => getAmountForDate(habit.id, dateKey) >= habit.targetAmount;

    const getFocusHabits = () => state.habits.filter((h) => !h.archived && h.category === 'focus');
    const getViceHabits = () => state.habits.filter((h) => !h.archived && h.category === 'vice');

    const getCompletionRatioForDate = (dateKey) => {
        const habits = getFocusHabits();
        if (!habits.length) return 0;
        const completed = habits.filter((habit) => isHabitCompleted(habit, dateKey)).length;
        return completed / habits.length;
    };

    const setActiveTab = (tab) => {
        state.activeTab = tab;
        const isFocus = tab === 'focus';
        tabFocusBtn.classList.toggle('active', isFocus);
        tabViceBtn.classList.toggle('active', !isFocus);
        tabFocusBtn.setAttribute('aria-selected', String(isFocus));
        tabViceBtn.setAttribute('aria-selected', String(!isFocus));
        focusView.classList.toggle('active', isFocus);
        viceView.classList.toggle('active', !isFocus);
    };

    const setEditMode = (enabled) => {
        state.editMode = enabled;
        document.body.classList.toggle('edit-mode', enabled);
        editModeToggle.textContent = `Edit Mode: ${enabled ? 'On' : 'Off'}`;
    };

    const renderTimerMeta = () => {
        timerModeEl.textContent = state.timer.mode === 'focus' ? 'Focus' : 'Break';
        timerDisplayEl.textContent = toClock(state.timer.remainingSec);
        timerStartPauseBtn.textContent = state.timer.isRunning ? 'Pause' : 'Start';
    };

    const applyTimerSettings = () => {
        const focusMin = normalizeNumber(focusMinutesInput.value, 5, 120, 25);
        const breakMin = normalizeNumber(breakMinutesInput.value, 1, 60, 5);
        focusMinutesInput.value = String(focusMin);
        breakMinutesInput.value = String(breakMin);

        if (!state.timer.isRunning) {
            const base = state.timer.mode === 'focus' ? focusMin * 60 : breakMin * 60;
            state.timer.remainingSec = base;
        }
        renderTimerMeta();
    };

    const stopTimer = () => {
        if (state.timer.intervalId) {
            clearInterval(state.timer.intervalId);
            state.timer.intervalId = null;
        }
        state.timer.isRunning = false;
        renderTimerMeta();
    };

    const switchTimerMode = () => {
        state.timer.mode = state.timer.mode === 'focus' ? 'break' : 'focus';
        applyTimerSettings();
    };

    const renderHeatmap = () => {
        heatmapEl.innerHTML = '';
        for (let i = 89; i >= 0; i--) {
            const dateKey = getDateFromOffset(-i);
            const ratio = getCompletionRatioForDate(dateKey);
            let level = 0;
            if (ratio >= 0.99) level = 3;
            else if (ratio >= 0.5) level = 2;
            else if (ratio > 0) level = 1;

            const cell = document.createElement('div');
            cell.className = `heat-cell level-${level}`;
            cell.title = `${dateKey} - ${Math.round(ratio * 100)}%`;
            heatmapEl.appendChild(cell);
        }
    };

    const renderFocusStreak = () => {
        let best = 0;
        let running = 0;
        for (let i = 89; i >= 0; i--) {
            const ratio = getCompletionRatioForDate(getDateFromOffset(-i));
            if (ratio >= 0.99) {
                running += 1;
                best = Math.max(best, running);
            } else {
                running = 0;
            }
        }

        let current = 0;
        for (let i = 0; i < 90; i++) {
            const ratio = getCompletionRatioForDate(getDateFromOffset(-i));
            if (ratio >= 0.99) current += 1;
            else break;
        }

        currentStreakEl.textContent = String(current);
        bestStreakEl.textContent = String(best);
    };

    const renderTimerHabitOptions = () => {
        const previous = timerHabitSelect.value;
        timerHabitSelect.innerHTML = '<option value="">No duration habit selected</option>';

        getFocusHabits().filter((h) => h.habitType === 'duration').forEach((habit) => {
            const option = document.createElement('option');
            option.value = habit.id;
            option.textContent = `${habit.name} (${formatMinutes(habit.targetAmount)})`;
            timerHabitSelect.appendChild(option);
        });

        if (previous && getHabit(previous)) timerHabitSelect.value = previous;
    };

    const renderCravingViceOptions = () => {
        const previous = cravingViceSelect.value;
        cravingViceSelect.innerHTML = '<option value="">Select vice</option>';

        getViceHabits().forEach((vice) => {
            const option = document.createElement('option');
            option.value = vice.id;
            option.textContent = vice.name;
            cravingViceSelect.appendChild(option);
        });

        if (previous && getHabit(previous)) cravingViceSelect.value = previous;
    };

    const renderFocusList = () => {
        const todayKey = getTodayKey();
        const habits = getFocusHabits();
        focusHabitListEl.innerHTML = '';
        focusHabitEmptyEl.hidden = habits.length > 0;

        habits.forEach((habit) => {
            const amount = getAmountForDate(habit.id, todayKey);
            const card = document.createElement('article');
            card.className = 'habit-item';

            if (habit.habitType === 'count') {
                const done = amount >= habit.targetAmount;
                card.innerHTML = `
                    <div class="habit-top-row">
                        <div class="habit-main">
                            <span class="habit-name">${habit.name}</span>
                            <span class="habit-target">${amount} / ${habit.targetAmount} times</span>
                        </div>
                        <div class="habit-counter">
                            <button type="button" class="ghost-btn counter-btn" data-action="focus-dec" data-habit-id="${habit.id}">-</button>
                            <span class="counter-value ${done ? 'done' : ''}">${amount}/${habit.targetAmount}</span>
                            <button type="button" class="counter-btn" data-action="focus-inc" data-habit-id="${habit.id}">+</button>
                        </div>
                    </div>
                `;
            } else {
                const percent = Math.round(Math.min(1, amount / habit.targetAmount) * 100);
                card.innerHTML = `
                    <div class="habit-top-row">
                        <div class="habit-main">
                            <span class="habit-name">${habit.name}</span>
                            <span class="habit-target">${formatMinutes(amount)} / ${formatMinutes(habit.targetAmount)}</span>
                        </div>
                        <span class="section-meta">${percent}%</span>
                    </div>
                    <div class="habit-duration-track"><div class="habit-duration-bar" style="width:${percent}%"></div></div>
                    <div class="habit-duration-controls">
                        <input type="number" min="1" max="1440" value="15" data-action="focus-duration-input" data-habit-id="${habit.id}">
                        <button type="button" data-action="focus-duration-add" data-habit-id="${habit.id}">Add minutes</button>
                    </div>
                `;
            }
            focusHabitListEl.appendChild(card);
        });
    };

    const getLatestResetDateForVice = (viceId) => {
        const key = state.streakResetByHabit[viceId];
        return key || null;
    };

    const daysSince = (dateKey) => {
        if (!dateKey) return 0;
        const start = new Date(`${dateKey}T00:00:00`);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return Math.max(0, Math.floor((today - start) / 86400000));
    };

    const renderViceList = () => {
        const todayKey = getTodayKey();
        const vices = getViceHabits();
        viceListEl.innerHTML = '';
        viceEmptyEl.hidden = vices.length > 0;

        vices.forEach((vice) => {
            const card = document.createElement('article');
            card.className = 'vice-card';

            if (vice.trackingMethod === 'streak') {
                const resetDate = getLatestResetDateForVice(vice.id) || vice.createdAt?.slice(0, 10) || todayKey;
                const streakDays = daysSince(resetDate);
                card.innerHTML = `
                    <div class="vice-row">
                        <div class="vice-main">
                            <span class="vice-name">${vice.name}</span>
                            <span class="vice-meta">Clean streak</span>
                        </div>
                        <div class="vice-streak-value">${streakDays}</div>
                    </div>
                    <div class="vice-row">
                        <span class="section-meta">Days since last reset</span>
                        <button type="button" data-action="vice-reset-streak" data-vice-id="${vice.id}">Reset streak</button>
                    </div>
                `;
            } else {
                const spent = getAmountForDate(vice.id, todayKey);
                const limit = Math.max(0, Number(vice.currentLimit ?? vice.initialLimit ?? vice.targetAmount ?? 0));
                const percentRaw = limit > 0 ? Math.round((spent / limit) * 100) : 0;
                const percent = Math.max(0, Math.min(100, percentRaw));
                const over = spent > limit;
                const unit = sanitizeUnit(vice.unit, 'min');
                const reducedBy = Math.max(0, Number(vice.initialLimit || 0) - Number(limit || 0));
                const taperText = reducedBy > 0
                    ? `(Down ${formatUsage(reducedBy, unit)} so far)`
                    : '(No taper reduction yet)';

                card.innerHTML = `
                    <div class="vice-row">
                        <div class="vice-main">
                            <span class="vice-name">${vice.name}</span>
                            <span class="vice-budget-caption">Today's budget: ${formatUsage(limit, unit)} ${taperText}</span>
                        </div>
                        <span class="vice-meta">${formatUsage(spent, unit)} / ${formatUsage(limit, unit)}</span>
                    </div>
                    <div class="vice-budget-track"><div class="vice-budget-bar ${over ? 'warn' : ''}" style="width:${percent}%"></div></div>
                    <div class="vice-budget-controls">
                        <input type="number" min="0.1" max="100000" step="0.1" value="${unit === 'min' || unit === 'minutes' ? '15' : '1'}" data-action="vice-budget-input" data-vice-id="${vice.id}">
                        <button type="button" data-action="vice-budget-add" data-vice-id="${vice.id}">Log usage</button>
                    </div>
                `;
            }

            viceListEl.appendChild(card);
        });
    };

    const renderFocusManager = () => {
        focusManagerListEl.innerHTML = '';
        getFocusHabits().forEach((habit) => {
            const row = document.createElement('div');
            row.className = 'manager-item';
            row.innerHTML = `
                <input type="text" data-field="name" data-id="${habit.id}" value="${habit.name}">
                <select data-field="type" data-id="${habit.id}">
                    <option value="count" ${habit.habitType === 'count' ? 'selected' : ''}>Count</option>
                    <option value="duration" ${habit.habitType === 'duration' ? 'selected' : ''}>Duration</option>
                </select>
                <input type="number" data-field="target" data-id="${habit.id}" min="1" max="1440" value="${habit.targetAmount}">
                <span class="manager-unit-pill">${habit.unit}</span>
                <button type="button" class="ghost-btn compact-action" data-action="focus-save" data-id="${habit.id}">Save</button>
                <button type="button" class="ghost-btn compact-action" data-action="focus-archive" data-id="${habit.id}">Archive</button>
            `;
            focusManagerListEl.appendChild(row);
        });
    };

    const renderViceManager = () => {
        viceManagerListEl.innerHTML = '';
        getViceHabits().forEach((vice) => {
            const mode = vice.trackingMethod || 'streak';
            const limit = mode === 'budget' ? Math.round(Number(vice.currentLimit ?? vice.initialLimit ?? 0)) : '-';
            const unitLabel = mode === 'budget' ? sanitizeUnit(vice.unit, 'min') : 'streak';
            const row = document.createElement('div');
            row.className = 'manager-item';
            row.innerHTML = `
                <input type="text" data-field="name" data-id="${vice.id}" value="${vice.name}">
                <select data-field="method" data-id="${vice.id}">
                    <option value="streak" ${mode === 'streak' ? 'selected' : ''}>Streak</option>
                    <option value="budget" ${mode === 'budget' ? 'selected' : ''}>Budget</option>
                </select>
                <input type="number" data-field="target" data-id="${vice.id}" min="0" max="100000" value="${limit}">
                <span class="manager-unit-pill">${unitLabel}</span>
                <button type="button" class="ghost-btn compact-action" data-action="vice-save" data-id="${vice.id}">Save</button>
                <button type="button" class="ghost-btn compact-action" data-action="vice-archive" data-id="${vice.id}">Archive</button>
            `;
            viceManagerListEl.appendChild(row);
        });
    };

    const renderOverview = () => {
        const today = new Date();
        const todayKey = getTodayKey();
        todayDateEl.textContent = today.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });

        const habits = getFocusHabits();
        const completed = habits.filter((habit) => isHabitCompleted(habit, todayKey)).length;
        const total = habits.length;
        const ratio = total ? completed / total : 0;
        const percent = Math.round(ratio * 100);

        dailyProgressTextEl.textContent = `${completed} of ${total} completed`;
        dailyProgressPercentEl.textContent = `${percent}%`;
        dailyProgressBarEl.style.width = `${percent}%`;
    };

    const refreshAll = () => {
        renderOverview();
        renderTimerHabitOptions();
        renderFocusList();
        renderViceList();
        renderFocusManager();
        renderViceManager();
        renderHeatmap();
        renderFocusStreak();
        renderCravingViceOptions();
    };

    const loadHabits = async () => {
        const { data, error } = await supabaseClient
            .from(tableHabits)
            .select('id,passcode_key,name,category,habit_type,target_amount,unit,tracking_method,initial_limit,current_limit,goal_limit,taper_rate,taper_step_amount,taper_interval_days,taper_started_at,taper_last_applied_at,sort_order,archived,created_at,updated_at')
            .eq('passcode_key', wallPassword)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true });
        if (error) throw error;
        state.habits = (data || []).map(parseHabit);
    };

    const loadProgressLogs = async () => {
        const since = getDateFromOffset(-89);
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
            .select('habit_id,log_date,event_type')
            .eq('passcode_key', wallPassword)
            .eq('event_type', 'vice_streak_reset')
            .order('log_date', { ascending: false });
        if (error) throw error;

        state.streakResetByHabit = {};
        (data || []).forEach((row) => {
            if (!row.habit_id) return;
            if (!state.streakResetByHabit[row.habit_id]) {
                state.streakResetByHabit[row.habit_id] = row.log_date;
            }
        });
    };

    const upsertProgressAmount = async (habitId, dateKey, currentAmount, amountDelta = 0, metadata = null) => {
        const safeAmount = Math.max(0, Number(currentAmount) || 0);
        const { error } = await supabaseClient
            .from(tableLogs)
            .upsert({
                passcode_key: wallPassword,
                habit_id: habitId,
                log_date: dateKey,
                event_type: 'progress',
                amount_delta: Number(amountDelta) || 0,
                current_amount: safeAmount,
                metadata,
                updated_at: new Date().toISOString()
            }, { onConflict: 'passcode_key,habit_id,log_date,event_type' });
        if (error) throw error;

        if (!state.progressByDate[dateKey]) state.progressByDate[dateKey] = {};
        state.progressByDate[dateKey][habitId] = safeAmount;
    };

    const insertEventLog = async (habitId, eventType, amountDelta = 0, metadata = null) => {
        const todayKey = getTodayKey();
        const { error } = await supabaseClient
            .from(tableLogs)
            .upsert({
                passcode_key: wallPassword,
                habit_id: habitId,
                log_date: todayKey,
                event_type: eventType,
                amount_delta: amountDelta,
                current_amount: 0,
                metadata,
                updated_at: new Date().toISOString()
            }, { onConflict: 'passcode_key,habit_id,log_date,event_type' });
        if (error) throw error;
    };

    const updateHabit = async (habitId, updates) => {
        const { error } = await supabaseClient
            .from(tableHabits)
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', habitId)
            .eq('passcode_key', wallPassword);
        if (error) throw error;
    };

    const createHabit = async (habit) => {
        const sortOrder = state.habits.length;
        const { error } = await supabaseClient
            .from(tableHabits)
            .insert({
                passcode_key: wallPassword,
                name: habit.name,
                category: habit.category,
                habit_type: habit.habitType === 'duration' ? 'duration' : 'boolean',
                target_amount: habit.targetAmount,
                unit: habit.unit,
                tracking_method: habit.trackingMethod,
                initial_limit: habit.initialLimit,
                current_limit: habit.currentLimit,
                goal_limit: habit.goalLimit,
                taper_rate: habit.taperRate,
                taper_step_amount: habit.taperStepAmount,
                taper_interval_days: habit.taperIntervalDays,
                taper_started_at: habit.taperStartedAt,
                taper_last_applied_at: habit.taperLastAppliedAt,
                sort_order: sortOrder,
                archived: false,
                updated_at: new Date().toISOString()
            });
        if (error) throw error;
    };

    const applyBudgetTapering = async () => {
        const today = new Date(getTodayKey());
        const updates = [];

        getViceHabits().forEach((vice) => {
            if (vice.trackingMethod !== 'budget') return;
            if (!vice.taperStepAmount || !vice.taperIntervalDays) return;
            if (vice.initialLimit == null || vice.goalLimit == null) return;

            const startDateKey = (vice.taperStartedAt || vice.createdAt || getTodayKey()).slice(0, 10);
            const start = new Date(`${startDateKey}T00:00:00`);
            const elapsedDays = Math.max(0, Math.floor((today - start) / 86400000));
            const intervals = Math.floor(elapsedDays / vice.taperIntervalDays);

            const proposed = Math.max(
                vice.goalLimit,
                vice.initialLimit - intervals * vice.taperStepAmount
            );

            const current = vice.currentLimit == null ? vice.initialLimit : vice.currentLimit;
            if (Math.round(current) !== Math.round(proposed)) {
                updates.push({ id: vice.id, current_limit: proposed, taper_last_applied_at: new Date().toISOString() });
            }
        });

        for (const update of updates) {
            await updateHabit(update.id, {
                current_limit: update.current_limit,
                taper_last_applied_at: update.taper_last_applied_at
            });
        }
    };

    const addAmountToHabit = async (habitId, delta, metadata = null) => {
        const habit = getHabit(habitId);
        if (!habit) return;
        const todayKey = getTodayKey();
        const current = getAmountForDate(habitId, todayKey);

        let next = current + delta;
        if (habit.habitType === 'count') {
            next = Math.max(0, Math.min(habit.targetAmount, next));
        } else {
            next = Math.max(0, next);
        }

        await upsertProgressAmount(habitId, todayKey, next, delta, metadata);
    };

    const refreshFromCloud = async () => {
        await loadHabits();
        await applyBudgetTapering();
        await loadHabits();
        await Promise.all([loadProgressLogs(), loadStreakResetEvents()]);
        refreshAll();
    };

    const startPolling = () => {
        if (pollId) return;
        pollId = setInterval(async () => {
            if (!state.unlocked) return;
            try {
                await Promise.all([loadProgressLogs(), loadStreakResetEvents(), loadHabits()]);
                refreshAll();
            } catch (error) {
                timerStatusEl.textContent = `Sync failed: ${error.message}`;
            }
        }, POLL_MS);
    };

    const unlock = async () => {
        state.unlocked = true;
        authPanel.hidden = true;
        dashboard.hidden = false;
        lockBtn.hidden = false;
        editModeToggle.hidden = false;
        setCookie(COOKIE_NAME, '1', cookieDays);
        setStatus('Unlocked');

        await refreshFromCloud();
        startPolling();
    };

    const lock = () => {
        state.unlocked = false;
        stopTimer();
        stopCravingTimer();
        dashboard.hidden = true;
        authPanel.hidden = false;
        lockBtn.hidden = true;
        editModeToggle.hidden = true;
        clearCookie(COOKIE_NAME);
        setStatus('Locked');
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

    lockBtn.addEventListener('click', lock);
    editModeToggle.addEventListener('click', () => setEditMode(!state.editMode));

    tabFocusBtn.addEventListener('click', () => setActiveTab('focus'));
    tabViceBtn.addEventListener('click', () => setActiveTab('vice'));

    focusHabitTypeInput.addEventListener('change', () => {
        if (focusHabitTypeInput.value === 'count') {
            focusHabitTargetInput.value = '1';
            focusDurationTargetWrap.hidden = true;
        } else {
            focusDurationTargetWrap.hidden = false;
            if (!focusTargetHoursInput.value) focusTargetHoursInput.value = '1';
            if (!focusTargetMinutesInput.value) focusTargetMinutesInput.value = '0';
        }
    });

    viceMethodInput.addEventListener('change', () => {
        viceBudgetFields.hidden = viceMethodInput.value !== 'budget';
    });

    focusHabitForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = (focusHabitNameInput.value || '').trim();
        if (!name) return;

        const type = focusHabitTypeInput.value === 'duration' ? 'duration' : 'count';
        const target = type === 'count'
            ? normalizeNumber(focusHabitTargetInput.value, 1, 20, 1)
            : Math.max(1,
                normalizeNumber(focusTargetHoursInput.value, 0, 24, 1) * 60 +
                normalizeNumber(focusTargetMinutesInput.value, 0, 59, 0)
            );

        try {
            await createHabit({
                name,
                category: 'focus',
                habitType: type,
                targetAmount: target,
                unit: type === 'duration' ? 'minutes' : 'times',
                trackingMethod: null,
                initialLimit: null,
                currentLimit: null,
                goalLimit: null,
                taperRate: null,
                taperStepAmount: null,
                taperIntervalDays: null,
                taperStartedAt: null,
                taperLastAppliedAt: null
            });
            focusHabitForm.reset();
            focusHabitTypeInput.value = 'count';
            focusHabitTargetInput.value = '1';
            focusDurationTargetWrap.hidden = true;
            await refreshFromCloud();
        } catch (error) {
            timerStatusEl.textContent = `Could not add focus habit: ${error.message}`;
        }
    });

    viceForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = (viceNameInput.value || '').trim();
        if (!name) return;

        const method = viceMethodInput.value === 'budget' ? 'budget' : 'streak';
        const budgetUnit = sanitizeUnit(viceBudgetUnitInput?.value, 'min');

        const initialLimit = method === 'budget' ? normalizeNumber(viceInitialLimitInput.value, 1, 100000, 120) : null;
        const goalLimit = method === 'budget' ? normalizeNumber(viceGoalLimitInput.value, 0, 100000, 0) : null;
        const taperStep = method === 'budget' ? normalizeNumber(viceTaperStepInput.value, 0.1, 100000, 15) : null;
        const taperInterval = method === 'budget' ? normalizeNumber(viceTaperIntervalInput.value, 1, 30, 7) : null;

        try {
            await createHabit({
                name,
                category: 'vice',
                habitType: method === 'budget' ? 'duration' : 'count',
                targetAmount: method === 'budget' ? initialLimit : 1,
                unit: method === 'budget' ? budgetUnit : 'times',
                trackingMethod: method,
                initialLimit,
                currentLimit: initialLimit,
                goalLimit,
                taperRate: method === 'budget' ? `reduce by ${taperStep} ${budgetUnit} every ${taperInterval} days` : null,
                taperStepAmount: taperStep,
                taperIntervalDays: taperInterval,
                taperStartedAt: method === 'budget' ? new Date().toISOString() : null,
                taperLastAppliedAt: method === 'budget' ? new Date().toISOString() : null
            });

            viceForm.reset();
            viceMethodInput.value = 'streak';
            viceBudgetFields.hidden = true;
            viceInitialLimitInput.value = '120';
            viceGoalLimitInput.value = '0';
            viceTaperStepInput.value = '15';
            viceTaperIntervalInput.value = '7';
            if (viceBudgetUnitInput instanceof HTMLInputElement) viceBudgetUnitInput.value = 'min';
            await refreshFromCloud();
        } catch (error) {
            cravingStatusEl.textContent = `Could not add vice: ${error.message}`;
        }
    });

    focusHabitListEl.addEventListener('click', async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;

        const btn = target.closest('button');
        if (!(btn instanceof HTMLButtonElement)) return;

        const action = btn.dataset.action;
        const habitId = btn.dataset.habitId;
        if (!action || !habitId) return;

        try {
            if (action === 'focus-inc') await addAmountToHabit(habitId, 1);
            if (action === 'focus-dec') await addAmountToHabit(habitId, -1);

            if (action === 'focus-duration-add') {
                const controls = btn.closest('.habit-duration-controls');
                const input = controls?.querySelector('input[data-action="focus-duration-input"]');
                if (input instanceof HTMLInputElement) {
                    const delta = normalizeNumber(input.value, 1, 1440, 1);
                    await addAmountToHabit(habitId, delta);
                }
            }

            refreshAll();
        } catch (error) {
            timerStatusEl.textContent = `Update failed: ${error.message}`;
        }
    });

    viceListEl.addEventListener('click', async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const btn = target.closest('button');
        if (!(btn instanceof HTMLButtonElement)) return;

        const action = btn.dataset.action;
        const viceId = btn.dataset.viceId;
        if (!action || !viceId) return;

        try {
            if (action === 'vice-reset-streak') {
                await insertEventLog(viceId, 'vice_streak_reset', 0, { reason: 'manual_reset' });
                state.streakResetByHabit[viceId] = getTodayKey();
            }

            if (action === 'vice-budget-add') {
                const controls = btn.closest('.vice-budget-controls');
                const input = controls?.querySelector('input[data-action="vice-budget-input"]');
                if (input instanceof HTMLInputElement) {
                    const delta = normalizeNumber(input.value, 0.1, 100000, 1);
                    await addAmountToHabit(viceId, delta, { source: 'vice_budget_manual' });
                }
            }

            refreshAll();
        } catch (error) {
            cravingStatusEl.textContent = `Vice update failed: ${error.message}`;
        }
    });

    focusManagerListEl.addEventListener('click', async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLButtonElement)) return;

        const action = target.dataset.action;
        const habitId = target.dataset.id;
        if (!action || !habitId) return;
        const row = target.closest('.manager-item');
        if (!row) return;

        const nameInput = row.querySelector('input[data-field="name"]');
        const typeInput = row.querySelector('select[data-field="type"]');
        const targetInput = row.querySelector('input[data-field="target"]');
        if (!(nameInput instanceof HTMLInputElement)) return;
        if (!(typeInput instanceof HTMLSelectElement)) return;
        if (!(targetInput instanceof HTMLInputElement)) return;

        try {
            if (action === 'focus-save') {
                const type = typeInput.value === 'duration' ? 'duration' : 'count';
                await updateHabit(habitId, {
                    name: nameInput.value.trim() || 'Untitled habit',
                    habit_type: type === 'duration' ? 'duration' : 'boolean',
                    target_amount: normalizeNumber(targetInput.value, 1, 1440, 1),
                    unit: type === 'duration' ? 'minutes' : 'times'
                });
            }
            if (action === 'focus-archive') {
                await updateHabit(habitId, { archived: true });
            }
            await refreshFromCloud();
        } catch (error) {
            timerStatusEl.textContent = `Save failed: ${error.message}`;
        }
    });

    viceManagerListEl.addEventListener('click', async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLButtonElement)) return;

        const action = target.dataset.action;
        const viceId = target.dataset.id;
        if (!action || !viceId) return;
        const row = target.closest('.manager-item');
        if (!row) return;

        const nameInput = row.querySelector('input[data-field="name"]');
        const methodInput = row.querySelector('select[data-field="method"]');
        const targetInput = row.querySelector('input[data-field="target"]');
        if (!(nameInput instanceof HTMLInputElement)) return;
        if (!(methodInput instanceof HTMLSelectElement)) return;
        if (!(targetInput instanceof HTMLInputElement)) return;

        try {
            if (action === 'vice-save') {
                const method = methodInput.value === 'budget' ? 'budget' : 'streak';
                const limit = normalizeNumber(targetInput.value, 0, 100000, 0);
                const vice = getHabit(viceId);
                const currentUnit = sanitizeUnit(vice?.unit, 'min');

                await updateHabit(viceId, {
                    name: nameInput.value.trim() || 'Untitled vice',
                    tracking_method: method,
                    habit_type: method === 'budget' ? 'duration' : 'boolean',
                    target_amount: method === 'budget' ? Math.max(1, limit) : 1,
                    unit: method === 'budget' ? currentUnit : 'times',
                    initial_limit: method === 'budget' ? Math.max(1, limit) : null,
                    current_limit: method === 'budget' ? Math.max(1, limit) : null,
                    goal_limit: method === 'budget' ? 0 : null,
                    taper_step_amount: method === 'budget' ? 15 : null,
                    taper_interval_days: method === 'budget' ? 7 : null,
                    taper_rate: method === 'budget' ? `reduce by 15 ${currentUnit} every 7 days` : null,
                    taper_started_at: method === 'budget' ? new Date().toISOString() : null,
                    taper_last_applied_at: method === 'budget' ? new Date().toISOString() : null
                });
            }
            if (action === 'vice-archive') {
                await updateHabit(viceId, { archived: true });
            }
            await refreshFromCloud();
        } catch (error) {
            cravingStatusEl.textContent = `Vice save failed: ${error.message}`;
        }
    });

    const autoLogTimerToHabit = async (mode) => {
        if (mode !== 'focus') return;
        const habitId = timerHabitSelect.value;
        if (!habitId) return;

        const habit = getHabit(habitId);
        if (!habit || habit.habitType !== 'duration' || habit.category !== 'focus') return;

        const focusMin = normalizeNumber(focusMinutesInput.value, 5, 120, 25);
        await addAmountToHabit(habitId, focusMin, { source: 'focus_timer_auto' });
        timerStatusEl.textContent = `Focus session complete. Added ${focusMin} mins to ${habit.name}.`;
    };

    const startFocusTimer = () => {
        if (state.timer.isRunning) return;
        state.timer.isRunning = true;
        renderTimerMeta();
        timerStatusEl.textContent = state.timer.mode === 'focus' ? 'Deep work in progress.' : 'Recover and reset.';

        state.timer.intervalId = setInterval(async () => {
            state.timer.remainingSec -= 1;
            renderTimerMeta();

            if (state.timer.remainingSec <= 0) {
                const mode = state.timer.mode;
                stopTimer();
                try {
                    await autoLogTimerToHabit(mode);
                    refreshAll();
                } catch (error) {
                    timerStatusEl.textContent = `Timer log failed: ${error.message}`;
                }
                if (mode === 'break') timerStatusEl.textContent = 'Break complete. Ready for next focus block.';
                switchTimerMode();
            }
        }, 1000);
    };

    timerStartPauseBtn.addEventListener('click', () => {
        if (state.timer.isRunning) {
            stopTimer();
            timerStatusEl.textContent = 'Timer paused.';
            return;
        }
        startFocusTimer();
    });

    timerResetBtn.addEventListener('click', () => {
        stopTimer();
        applyTimerSettings();
        timerStatusEl.textContent = 'Timer reset.';
    });

    timerSkipBtn.addEventListener('click', () => {
        stopTimer();
        switchTimerMode();
        timerStatusEl.textContent = `Switched to ${state.timer.mode}.`;
    });

    focusMinutesInput.addEventListener('change', applyTimerSettings);
    breakMinutesInput.addEventListener('change', applyTimerSettings);

    const renderCravingTimer = () => {
        cravingTimerEl.textContent = toClock(state.craving.remainingSec);
    };

    const stopCravingTimer = () => {
        if (state.craving.intervalId) {
            clearInterval(state.craving.intervalId);
            state.craving.intervalId = null;
        }
        state.craving.isRunning = false;
        cravingStartBtn.disabled = false;
    };

    const startCravingTimer = () => {
        if (state.craving.isRunning) return;
        const viceId = cravingViceSelect.value;
        if (!viceId) {
            cravingStatusEl.textContent = 'Select a vice before starting SOS timer.';
            return;
        }

        state.craving.isRunning = true;
        state.craving.remainingSec = 10 * 60;
        cravingStartBtn.disabled = true;
        cravingStatusEl.textContent = 'Urge surfing in progress. Stay with it.';
        cravingSuccessEl.hidden = true;
        renderCravingTimer();

        state.craving.intervalId = setInterval(async () => {
            state.craving.remainingSec -= 1;
            renderCravingTimer();

            if (state.craving.remainingSec <= 0) {
                stopCravingTimer();
                cravingStatusEl.textContent = 'Craving timer finished.';
                cravingSuccessEl.hidden = false;
                setTimeout(() => {
                    cravingSuccessEl.hidden = true;
                }, 3200);

                try {
                    await insertEventLog(viceId, 'craving_defeated', 1, { duration_seconds: 600 });
                } catch (error) {
                    cravingStatusEl.textContent = `Could not save craving event: ${error.message}`;
                }

                state.craving.remainingSec = 10 * 60;
                renderCravingTimer();
            }
        }, 1000);
    };

    cravingStartBtn.addEventListener('click', startCravingTimer);

    applyTimerSettings();
    renderTimerMeta();
    renderCravingTimer();
    focusDurationTargetWrap.hidden = true;
    viceBudgetFields.hidden = true;
    setEditMode(false);
    setActiveTab('focus');

    if (getCookie(COOKIE_NAME) === '1') {
        void unlock();
    }
});
