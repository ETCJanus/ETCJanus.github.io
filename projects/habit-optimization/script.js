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

    const todayDateEl = document.getElementById('today-date');
    const habitListEl = document.getElementById('habit-list');
    const habitEmptyEl = document.getElementById('habit-empty');
    const dailyProgressTextEl = document.getElementById('daily-progress-text');
    const dailyProgressPercentEl = document.getElementById('daily-progress-percent');
    const dailyProgressBarEl = document.getElementById('daily-progress-bar');

    const habitForm = document.getElementById('habit-form');
    const habitNameInput = document.getElementById('habit-name');
    const habitTypeInput = document.getElementById('habit-type');
    const habitTargetInput = document.getElementById('habit-target');
    const durationTargetWrap = document.getElementById('duration-target-wrap');
    const habitTargetHoursInput = document.getElementById('habit-target-hours');
    const habitTargetMinutesInput = document.getElementById('habit-target-minutes');
    const habitManagerListEl = document.getElementById('habit-manager-list');

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

    if (!isConfigured) {
        setupMessage.hidden = false;
        authPanel.hidden = true;
        dashboard.hidden = true;
        return;
    }

    const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

    const state = {
        unlocked: false,
        habits: [],
        logsByDate: {},
        updatedAt: null,
        pollId: null,
        timer: {
            mode: 'focus',
            isRunning: false,
            remainingSec: 25 * 60,
            intervalId: null
        }
    };

    const COOKIE_NAME = 'focus_wall_ok';
    const SYNC_INTERVAL_MS = 12000;

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

    const toClock = (totalSec) => {
        const clamped = Math.max(0, Math.floor(totalSec));
        const min = String(Math.floor(clamped / 60)).padStart(2, '0');
        const sec = String(clamped % 60).padStart(2, '0');
        return `${min}:${sec}`;
    };

    const parseHabit = (habit) => ({
        id: habit.id,
        name: habit.name,
        habitType: habit.habit_type === 'duration' ? 'duration' : 'boolean',
        targetAmount: normalizeNumber(habit.target_amount, 1, 100000, 1),
        unit: (habit.unit || (habit.habit_type === 'duration' ? 'minutes' : 'times')).trim(),
        sortOrder: Number(habit.sort_order) || 0,
        archived: Boolean(habit.archived)
    });

    const getHabitById = (habitId) => state.habits.find((h) => h.id === habitId && !h.archived);

    const getAmountForHabitDate = (habitId, dateKey) => {
        const amount = state.logsByDate[dateKey]?.[habitId];
        return Math.max(0, Number(amount) || 0);
    };

    const isHabitCompleted = (habit, dateKey) => {
        const amount = getAmountForHabitDate(habit.id, dateKey);
        return amount >= habit.targetAmount;
    };

    const getCompletionRatioForDate = (dateKey) => {
        const activeHabits = state.habits.filter((h) => !h.archived);
        if (!activeHabits.length) return 0;

        const completed = activeHabits.filter((habit) => isHabitCompleted(habit, dateKey)).length;
        return completed / activeHabits.length;
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
            const defaultSec = state.timer.mode === 'focus' ? focusMin * 60 : breakMin * 60;
            state.timer.remainingSec = defaultSec;
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

    const buildHeatmap = () => {
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

    const computeStreaks = () => {
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

        state.habits
            .filter((h) => !h.archived && h.habitType === 'duration')
            .forEach((habit) => {
                const option = document.createElement('option');
                option.value = habit.id;
                option.textContent = `${habit.name} (${habit.targetAmount} ${habit.unit})`;
                timerHabitSelect.appendChild(option);
            });

        if (previous && state.habits.some((h) => h.id === previous && !h.archived && h.habitType === 'duration')) {
            timerHabitSelect.value = previous;
        }
    };

    const renderChecklist = () => {
        const todayKey = getTodayKey();
        const activeHabits = state.habits.filter((h) => !h.archived);

        habitListEl.innerHTML = '';
        habitEmptyEl.hidden = activeHabits.length > 0;

        activeHabits.forEach((habit) => {
            const amount = getAmountForHabitDate(habit.id, todayKey);
            const item = document.createElement('article');
            item.className = 'habit-item';

            if (habit.habitType === 'boolean') {
                const isDone = amount >= habit.targetAmount;
                item.innerHTML = `
                    <div class="habit-top-row">
                        <div class="habit-main">
                            <span class="habit-name">${habit.name}</span>
                            <span class="habit-target">${amount} / ${habit.targetAmount} times</span>
                        </div>
                        <div class="habit-counter" aria-label="Count habit controls">
                            <button type="button" class="ghost-btn counter-btn" data-action="dec-count" data-habit-id="${habit.id}">-</button>
                            <span class="counter-value ${isDone ? 'done' : ''}">${amount}/${habit.targetAmount}</span>
                            <button type="button" class="counter-btn" data-action="inc-count" data-habit-id="${habit.id}">+</button>
                        </div>
                    </div>
                `;
            } else {
                const progressRatio = Math.min(1, amount / habit.targetAmount);
                const percent = Math.round(progressRatio * 100);
                item.innerHTML = `
                    <div class="habit-top-row">
                        <div class="habit-main">
                            <span class="habit-name">${habit.name}</span>
                            <span class="habit-target">${amount} / ${habit.targetAmount} ${habit.unit}</span>
                        </div>
                        <span class="habit-duration-meta">${percent}%</span>
                    </div>
                    <div class="habit-duration-wrap">
                        <div class="habit-duration-track">
                            <div class="habit-duration-bar" style="width:${percent}%"></div>
                        </div>
                        <div class="habit-duration-controls">
                            <input type="number" min="1" max="1440" value="15" data-action="duration-input" data-habit-id="${habit.id}" aria-label="Amount to add">
                            <button type="button" data-action="add-duration" data-habit-id="${habit.id}">Add ${habit.unit}</button>
                        </div>
                    </div>
                `;
            }

            habitListEl.appendChild(item);
        });
    };

    const renderManager = () => {
        habitManagerListEl.innerHTML = '';

        state.habits
            .filter((h) => !h.archived)
            .forEach((habit) => {
                const row = document.createElement('div');
                row.className = 'manager-item';
                row.innerHTML = `
                    <input type="text" value="${habit.name}" data-field="name" data-id="${habit.id}" maxlength="80">
                    <select data-field="type" data-id="${habit.id}">
                        <option value="boolean" ${habit.habitType === 'boolean' ? 'selected' : ''}>Count</option>
                        <option value="duration" ${habit.habitType === 'duration' ? 'selected' : ''}>Duration</option>
                    </select>
                    <input type="number" min="1" max="1440" value="${habit.targetAmount}" data-field="target" data-id="${habit.id}">
                    <span class="manager-unit-pill">${habit.unit}</span>
                    <button type="button" class="ghost-btn compact-action" data-action="save" data-id="${habit.id}">Save</button>
                    <button type="button" class="ghost-btn compact-action" data-action="archive" data-id="${habit.id}">Archive</button>
                `;
                habitManagerListEl.appendChild(row);
            });
    };

    const renderOverview = () => {
        const today = new Date();
        todayDateEl.textContent = today.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });

        const todayKey = getTodayKey();
        const activeHabits = state.habits.filter((h) => !h.archived);
        const completed = activeHabits.filter((habit) => isHabitCompleted(habit, todayKey)).length;
        const total = activeHabits.length;
        const ratio = total ? completed / total : 0;
        const percent = Math.round(ratio * 100);

        dailyProgressTextEl.textContent = `${completed} of ${total} completed`;
        dailyProgressPercentEl.textContent = `${percent}%`;
        dailyProgressBarEl.style.width = `${percent}%`;
    };

    const refreshUI = () => {
        renderChecklist();
        renderManager();
        renderOverview();
        renderTimerHabitOptions();
        buildHeatmap();
        computeStreaks();
    };

    const loadHabits = async () => {
        const { data, error } = await supabaseClient
            .from(tableHabits)
            .select('id,name,habit_type,target_amount,unit,sort_order,archived')
            .eq('passcode_key', wallPassword)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true });

        if (error) throw error;
        state.habits = (data || []).map(parseHabit);
    };

    const loadLogs = async () => {
        const since = getDateFromOffset(-89);
        const { data, error } = await supabaseClient
            .from(tableLogs)
            .select('habit_id,log_date,current_amount,updated_at')
            .eq('passcode_key', wallPassword)
            .gte('log_date', since);

        if (error) throw error;

        state.logsByDate = {};
        state.updatedAt = null;

        (data || []).forEach((row) => {
            if (!state.logsByDate[row.log_date]) state.logsByDate[row.log_date] = {};
            state.logsByDate[row.log_date][row.habit_id] = Math.max(0, Number(row.current_amount) || 0);

            const rowTime = new Date(row.updated_at || 0).getTime();
            const stateTime = new Date(state.updatedAt || 0).getTime();
            if (rowTime > stateTime) state.updatedAt = row.updated_at;
        });
    };

    const loadAllData = async () => {
        await Promise.all([loadHabits(), loadLogs()]);
        refreshUI();
    };

    const upsertHabitAmount = async (habitId, dateKey, amount) => {
        const safeAmount = Math.max(0, Number(amount) || 0);
        const { error } = await supabaseClient
            .from(tableLogs)
            .upsert({
                passcode_key: wallPassword,
                habit_id: habitId,
                log_date: dateKey,
                current_amount: safeAmount,
                updated_at: new Date().toISOString()
            }, { onConflict: 'passcode_key,habit_id,log_date' });

        if (error) throw error;

        if (!state.logsByDate[dateKey]) state.logsByDate[dateKey] = {};
        state.logsByDate[dateKey][habitId] = safeAmount;
        state.updatedAt = new Date().toISOString();
    };

    const addToHabitAmount = async (habitId, delta) => {
        const habit = getHabitById(habitId);
        if (!habit) return;

        const todayKey = getTodayKey();
        const current = getAmountForHabitDate(habitId, todayKey);

        let nextAmount = current + delta;
        if (habit.habitType === 'boolean') {
            nextAmount = nextAmount > 0 ? 1 : 0;
        }

        await upsertHabitAmount(habitId, todayKey, nextAmount);
    };

    const saveNewHabit = async (habit) => {
        const sortOrder = state.habits.length;
        const { error } = await supabaseClient.from(tableHabits).insert({
            passcode_key: wallPassword,
            name: habit.name,
            habit_type: habit.habitType,
            target_amount: habit.targetAmount,
            unit: habit.unit,
            sort_order: sortOrder,
            archived: false,
            updated_at: new Date().toISOString()
        });

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

    const startPolling = () => {
        if (state.pollId) return;
        state.pollId = setInterval(async () => {
            if (!state.unlocked) return;
            try {
                const previous = state.updatedAt;
                await loadLogs();
                if (state.updatedAt !== previous) {
                    refreshUI();
                }
            } catch (error) {
                timerStatusEl.textContent = `Sync poll failed: ${error.message}`;
            }
        }, SYNC_INTERVAL_MS);
    };

    const unlock = async () => {
        state.unlocked = true;
        authPanel.hidden = true;
        dashboard.hidden = false;
        lockBtn.hidden = false;
        setCookie(COOKIE_NAME, '1', cookieDays);
        setStatus('Unlocked');

        await loadAllData();
        startPolling();
    };

    const lock = () => {
        state.unlocked = false;
        stopTimer();
        dashboard.hidden = true;
        authPanel.hidden = false;
        lockBtn.hidden = true;
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

    lockBtn.addEventListener('click', () => {
        lock();
    });

    habitTypeInput.addEventListener('change', () => {
        if (habitTypeInput.value === 'boolean') {
            habitTargetInput.min = '1';
            habitTargetInput.max = '20';
            if (!habitTargetInput.value || Number(habitTargetInput.value) < 1) {
                habitTargetInput.value = '1';
            }
            durationTargetWrap.hidden = true;
        } else {
            habitTargetInput.value = '';
            durationTargetWrap.hidden = false;
            if (!habitTargetHoursInput.value) habitTargetHoursInput.value = '1';
            if (!habitTargetMinutesInput.value) habitTargetMinutesInput.value = '0';
        }
    });

    habitForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const habitType = habitTypeInput.value === 'duration' ? 'duration' : 'boolean';
        const name = (habitNameInput.value || '').trim();
        const targetAmount = habitType === 'boolean'
            ? normalizeNumber(habitTargetInput.value, 1, 20, 1)
            : Math.max(
                1,
                normalizeNumber(habitTargetHoursInput.value, 0, 24, 1) * 60
                + normalizeNumber(habitTargetMinutesInput.value, 0, 59, 0)
            );
        const unit = habitType === 'duration' ? 'minutes' : 'times';

        if (!name) return;

        try {
            await saveNewHabit({ name, habitType, targetAmount, unit });
            habitForm.reset();
            habitTypeInput.value = 'boolean';
            habitTargetInput.value = '1';
            habitTargetInput.min = '1';
            habitTargetInput.max = '20';
            durationTargetWrap.hidden = true;
            habitTargetHoursInput.value = '1';
            habitTargetMinutesInput.value = '0';
            await loadHabits();
            refreshUI();
        } catch (error) {
            const message = String(error.message || 'Unknown error');
            if (message.includes('relation') || message.includes('column')) {
                timerStatusEl.textContent = 'Could not add habit: database schema is outdated. Run SUPABASE_SCHEMA.sql first.';
            } else {
                timerStatusEl.textContent = `Could not add habit: ${message}`;
            }
        }
    });

    habitListEl.addEventListener('click', async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLButtonElement)) return;
        const action = target.dataset.action;

        if (action === 'inc-count' || action === 'dec-count') {
            const habitId = target.dataset.habitId;
            if (!habitId) return;

            const habit = getHabitById(habitId);
            if (!habit || habit.habitType !== 'boolean') return;

            const todayKey = getTodayKey();
            const current = getAmountForHabitDate(habitId, todayKey);
            const next = action === 'inc-count'
                ? Math.min(habit.targetAmount, current + 1)
                : Math.max(0, current - 1);

            try {
                await upsertHabitAmount(habitId, todayKey, next);
                refreshUI();
            } catch (error) {
                timerStatusEl.textContent = `Update failed: ${error.message}`;
            }
            return;
        }

        if (action !== 'add-duration') return;

        const habitId = target.dataset.habitId;
        if (!habitId) return;

        const row = target.closest('.habit-duration-controls');
        if (!row) return;
        const amountInput = row.querySelector('input[data-action="duration-input"]');
        if (!(amountInput instanceof HTMLInputElement)) return;

        const delta = normalizeNumber(amountInput.value, 1, 1440, 1);

        try {
            await addToHabitAmount(habitId, delta);
            refreshUI();
        } catch (error) {
            timerStatusEl.textContent = `Could not add progress: ${error.message}`;
        }
    });

    habitManagerListEl.addEventListener('click', async (event) => {
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
            if (action === 'save') {
                const nextType = typeInput.value === 'duration' ? 'duration' : 'boolean';
                const nextTarget = nextType === 'boolean'
                    ? normalizeNumber(targetInput.value, 1, 20, 1)
                    : normalizeNumber(targetInput.value, 1, 1440, 1);
                const nextUnit = nextType === 'duration' ? 'minutes' : 'times';

                await updateHabit(habitId, {
                    name: nameInput.value.trim() || 'Untitled habit',
                    habit_type: nextType,
                    target_amount: nextTarget,
                    unit: nextUnit
                });
            }

            if (action === 'archive') {
                await updateHabit(habitId, { archived: true });
            }

            await loadHabits();
            refreshUI();
        } catch (error) {
            timerStatusEl.textContent = `Update failed: ${error.message}`;
        }
    });

    const autoLogTimerToHabit = async (finishedMode) => {
        if (finishedMode !== 'focus') return;

        const habitId = timerHabitSelect.value;
        if (!habitId) return;

        const habit = getHabitById(habitId);
        if (!habit || habit.habitType !== 'duration') return;

        const focusMin = normalizeNumber(focusMinutesInput.value, 5, 120, 25);
        await addToHabitAmount(habitId, focusMin);
        timerStatusEl.textContent = `Focus session done. Added ${focusMin} ${habit.unit} to ${habit.name}.`;
        refreshUI();
    };

    const startTimer = () => {
        if (state.timer.isRunning) return;

        state.timer.isRunning = true;
        renderTimerMeta();
        timerStatusEl.textContent = state.timer.mode === 'focus' ? 'Deep work in progress.' : 'Recover and reset.';

        state.timer.intervalId = setInterval(async () => {
            state.timer.remainingSec -= 1;
            renderTimerMeta();

            if (state.timer.remainingSec <= 0) {
                const finishedMode = state.timer.mode;
                stopTimer();

                try {
                    await autoLogTimerToHabit(finishedMode);
                } catch (error) {
                    timerStatusEl.textContent = `Timer log failed: ${error.message}`;
                }

                if (finishedMode === 'focus') {
                    timerStatusEl.textContent = timerStatusEl.textContent.includes('Added')
                        ? timerStatusEl.textContent
                        : 'Focus session complete. Switch to break.';
                } else {
                    timerStatusEl.textContent = 'Break complete. Ready for next focus block.';
                }

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
        startTimer();
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

    applyTimerSettings();
    renderTimerMeta();
    durationTargetWrap.hidden = true;

    if (getCookie(COOKIE_NAME) === '1') {
        void unlock();
    }
});
