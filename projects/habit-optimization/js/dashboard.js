document.addEventListener('DOMContentLoaded', () => {
    const core = window.HabitAppCore;
    const config = core.readConfig();
    const client = core.createClient(config);

    const setupNotice = document.getElementById('setup-notice');
    const dashboardRoot = document.getElementById('dashboard-root');
    const authScreen = document.getElementById('auth-screen');
    const authForm = document.getElementById('auth-form');
    const authPassword = document.getElementById('auth-password');
    const authStatus = document.getElementById('auth-status');
    const signOutBtn = document.getElementById('sign-out-btn');

    const nowBlockLabel = document.getElementById('now-block-label');
    const habitList = document.getElementById('habit-list');
    const habitEmpty = document.getElementById('habit-empty');
    const addHabitBtn = document.getElementById('add-habit-btn');

    const checklistForm = document.getElementById('checklist-form');
    const checklistInput = document.getElementById('checklist-input');
    const checklistList = document.getElementById('checklist-list');
    const checklistEmpty = document.getElementById('checklist-empty');

    const scratchInput = document.getElementById('scratch-input');
    const scratchStatus = document.getElementById('scratch-status');

    const progressValue = document.getElementById('progress-value');
    const progressRing = document.getElementById('progress-ring');
    const progressMeta = document.getElementById('progress-meta');

    const clockTime = document.getElementById('clock-time');
    const clockDate = document.getElementById('clock-date');
    const weatherSummary = document.getElementById('weather-summary');
    const weatherMeta = document.getElementById('weather-meta');

    const modeEventsBtn = document.getElementById('mode-events-btn');
    const modeSleepBtn = document.getElementById('mode-sleep-btn');
    const dynamicStatus = document.getElementById('dynamic-status');
    const dynamicEventsPanel = document.getElementById('dynamic-events-panel');
    const dynamicSleepPanel = document.getElementById('dynamic-sleep-panel');
    const dynamicSleepForm = document.getElementById('dynamic-sleep-form');
    const quickSleepDate = document.getElementById('quick-sleep-date');
    const quickSleepTime = document.getElementById('quick-sleep-time');
    const quickWakeTime = document.getElementById('quick-wake-time');

    const calendarList = document.getElementById('calendar-list');

    const habitModal = document.getElementById('habit-modal');
    const habitForm = document.getElementById('habit-form');
    const habitModalTitle = document.getElementById('habit-modal-title');
    const habitNameInput = document.getElementById('habit-name');
    const habitTypeInput = document.getElementById('habit-type');
    const habitTargetInput = document.getElementById('habit-target');
    const habitStatus = document.getElementById('habit-status');
    const habitSaveBtn = document.getElementById('habit-save-btn');
    const habitCancelBtn = document.getElementById('habit-cancel-btn');
    const timeBlockCheckboxes = Array.from(document.querySelectorAll('input[name="habit-time-block"]'));

    const CHECKLIST_STORAGE_KEY = 'habit_dash_checklist';
    const SCRATCH_STORAGE_KEY = 'habit_dash_scratch';

    const state = {
        unlocked: false,
        habits: [],
        todayProgress: {},
        streakResetByHabit: {},
        sleepByDate: {},
        checklist: readStoredChecklist(),
        editHabitId: null,
        pollId: null,
        dynamicMode: 'auto'
    };

    const isConfigured = Boolean(client && config.wallPassword);
    if (!isConfigured) {
        setupNotice.hidden = false;
        dashboardRoot.hidden = true;
        authScreen.hidden = true;
        return;
    }

    renderChecklist();
    renderCalendarShell();
    hydrateDynamicDefaults();
    hydrateScratch();
    bindCoreEvents();
    bootAuth();
    startClock();
    void loadWeather();

    function bindCoreEvents() {
        signOutBtn.addEventListener('click', lockDashboard);

        authForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const entered = String(authPassword.value || '').trim();
            if (entered !== config.wallPassword) {
                setAuthStatus('Wrong password.', true);
                return;
            }

            setAuthStatus('Unlocking...', false);
            authPassword.value = '';
            await unlockDashboard();
        });

        addHabitBtn.addEventListener('click', () => openHabitModal(null));
        habitCancelBtn.addEventListener('click', closeHabitModal);

        habitForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            habitSaveBtn.disabled = true;
            const payload = collectHabitPayload();

            if (!payload.name) {
                setHabitStatus('Habit name is required.', true);
                habitSaveBtn.disabled = false;
                return;
            }

            try {
                if (state.editHabitId) {
                    await core.updateHabit(client, config, state.editHabitId, payload);
                    setHabitStatus('Habit updated.', false);
                } else {
                    payload.category = 'focus';
                    payload.sort_order = state.habits.length + 1;
                    await core.createHabit(client, config, payload);
                    setHabitStatus('Habit created.', false);
                }

                await refreshDashboardData();
                closeHabitModal();
            } catch (error) {
                setHabitStatus(`Could not save habit: ${error.message}`, true);
            } finally {
                habitSaveBtn.disabled = false;
            }
        });

        timeBlockCheckboxes.forEach((checkbox) => {
            checkbox.addEventListener('change', () => applyAnytimeRule(checkbox));
        });

        habitList.addEventListener('click', async (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button) return;

            const habitId = button.dataset.habitId;
            const action = button.dataset.action;
            const habit = state.habits.find((entry) => entry.id === habitId);
            if (!habit) return;

            if (action === 'edit') {
                openHabitModal(habit);
                return;
            }

            const todayKey = core.getTodayKey();

            if (action === 'streak-slip') {
                button.disabled = true;
                try {
                    await core.insertEvent(client, config, {
                        habitId,
                        eventType: core.STREAK_RESET_EVENT,
                        dateKey: todayKey,
                        amountDelta: 0,
                        currentAmount: 0,
                        metadata: { source: 'dashboard_quick_entry' }
                    });
                    state.streakResetByHabit[habitId] = todayKey;
                    renderHabits();
                } catch (error) {
                    setAuthStatus(`Could not log streak slip: ${error.message}`, true);
                } finally {
                    button.disabled = false;
                }
                return;
            }

            let delta = null;
            if (action === 'increment') delta = 1;
            if (action === 'decrement') delta = -1;
            if (action === 'quick-add') delta = Math.max(1, Number(button.dataset.delta) || 1);
            if (action === 'custom-add') {
                const row = button.closest('.habit-row');
                const input = row?.querySelector('input[data-action-input="minutes"]');
                if (input instanceof HTMLInputElement) {
                    delta = Math.max(1, Number(input.value) || 1);
                }
            }
            if (delta == null) return;

            const currentAmount = Math.max(0, Number(state.todayProgress[habitId]) || 0);
            const nextAmount = Math.max(0, currentAmount + delta);

            button.disabled = true;
            try {
                await core.upsertProgress(client, config, {
                    habitId,
                    dateKey: todayKey,
                    currentAmount: nextAmount,
                    deltaAmount: delta,
                    note: action === 'increment' ? 'dashboard plus' : 'dashboard minus'
                });

                state.todayProgress[habitId] = nextAmount;
                renderHabits();
                renderProgress();
            } catch (error) {
                setAuthStatus(`Progress update failed: ${error.message}`, true);
            } finally {
                button.disabled = false;
            }
        });

        checklistForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const text = String(checklistInput.value || '').trim();
            if (!text) return;

            state.checklist.unshift({
                id: crypto.randomUUID(),
                text,
                done: false
            });

            if (state.checklist.length > 8) {
                state.checklist = state.checklist.slice(0, 8);
            }

            checklistInput.value = '';
            persistChecklist();
            renderChecklist();
        });

        checklistList.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button) return;

            const itemId = button.dataset.itemId;
            const action = button.dataset.action;

            if (action === 'toggle') {
                state.checklist = state.checklist.map((item) => {
                    if (item.id !== itemId) return item;
                    return { ...item, done: !item.done };
                });
            }

            if (action === 'delete') {
                state.checklist = state.checklist.filter((item) => item.id !== itemId);
            }

            persistChecklist();
            renderChecklist();
        });

        modeEventsBtn.addEventListener('click', () => {
            state.dynamicMode = 'events';
            renderDynamicPanel();
        });

        modeSleepBtn.addEventListener('click', () => {
            state.dynamicMode = 'sleep';
            renderDynamicPanel();
        });

        dynamicSleepForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!state.unlocked) return;

            const logDate = quickSleepDate.value || core.getTodayKey();
            const sleptAt = quickSleepTime.value;
            const wokeAt = quickWakeTime.value;

            if (!sleptAt || !wokeAt) {
                dynamicStatus.textContent = 'Please enter both sleep and wake times.';
                return;
            }

            dynamicStatus.textContent = 'Saving sleep...';
            try {
                await core.upsertSleepLog(client, config, {
                    logDate,
                    sleptAt,
                    wokeAt
                });
                state.dynamicMode = 'events';
                await refreshDashboardData();
                dynamicStatus.textContent = 'Sleep saved.';
            } catch (error) {
                dynamicStatus.textContent = `Could not save sleep: ${error.message}`;
            }
        });

        scratchInput.addEventListener('input', () => {
            localStorage.setItem(SCRATCH_STORAGE_KEY, scratchInput.value);
            scratchStatus.textContent = 'Saved locally.';
        });

        document.addEventListener('visibilitychange', () => {
            if (!state.unlocked) return;
            if (document.hidden) {
                stopPolling();
                return;
            }
            startPolling();
            void refreshDashboardData();
        });

        window.addEventListener('beforeunload', stopPolling);
    }

    function bootAuth() {
        if (core.getCookie(core.COOKIE_NAME) === '1') {
            void unlockDashboard();
            return;
        }

        authScreen.hidden = false;
        dashboardRoot.hidden = true;
        setAuthStatus('Not signed in.', false);
    }

    async function unlockDashboard() {
        state.unlocked = true;
        state.dynamicMode = 'auto';
        core.setCookie(core.COOKIE_NAME, '1', config.cookieDays);
        authScreen.hidden = true;
        dashboardRoot.hidden = false;
        setAuthStatus('Unlocked.', false);
        await refreshDashboardData();
        startPolling();
    }

    function lockDashboard() {
        state.unlocked = false;
        core.clearCookie(core.COOKIE_NAME);
        stopPolling();
        authScreen.hidden = false;
        dashboardRoot.hidden = true;
        setAuthStatus('Locked.', false);
    }

    function setAuthStatus(text, isError) {
        authStatus.textContent = text;
        authStatus.style.color = isError ? '#ff8b8b' : '';
    }

    function setHabitStatus(text, isError) {
        habitStatus.textContent = text;
        habitStatus.style.color = isError ? '#ff8b8b' : '';
    }

    async function refreshDashboardData() {
        const todayKey = core.getTodayKey();
        const [habits, progress, sleepByDate, streakResets] = await Promise.all([
            core.loadHabits(client, config),
            core.loadProgressForDate(client, config, todayKey),
            core.loadSleepLogs(client, config, core.getDateFromOffset(-10)),
            core.loadStreakResetEvents(client, config, core.getDateFromOffset(-365))
        ]);

        state.habits = habits.filter((habit) => !habit.archived);
        state.todayProgress = progress;
        state.sleepByDate = sleepByDate;
        state.streakResetByHabit = streakResets.latestByHabit || {};

        renderHabits();
        renderProgress();
        renderDynamicPanel();
    }

    function renderHabits() {
        const block = core.getCurrentTimeBlock();
        nowBlockLabel.textContent = block.charAt(0).toUpperCase() + block.slice(1);

        const focusHabits = state.habits.filter((habit) => habit.category === 'focus');
        const viceHabits = state.habits.filter((habit) => habit.category === 'vice');
        const orderedHabits = [...focusHabits, ...viceHabits];

        habitList.innerHTML = '';
        if (!orderedHabits.length) {
            habitEmpty.hidden = false;
            return;
        }

        habitEmpty.hidden = true;

        orderedHabits.forEach((habit) => {
            const current = Number(state.todayProgress[habit.id]) || 0;
            const blocks = core.normalizeTimeBlocks(habit.time_of_day);
            const isNow = core.isHabitActiveNow(habit, block);
            const isVice = habit.category === 'vice';
            const isDuration = habit.habit_type === 'duration';
            const isStreakVice = isVice && habit.tracking_method === 'streak';
            const unit = habit.unit || (isDuration ? 'minutes' : 'times');

            let target = Number(habit.target_amount) || 1;
            if (isVice && habit.tracking_method === 'budget') {
                target = Number(habit.current_limit ?? habit.initial_limit ?? habit.target_amount) || 1;
            }

            const todayKey = core.getTodayKey();
            const resetDate = state.streakResetByHabit[habit.id] || String(habit.created_at || '').slice(0, 10) || todayKey;
            const streakDays = Math.max(0, Math.floor((new Date(`${todayKey}T00:00:00`) - new Date(`${resetDate}T00:00:00`)) / 86400000));

            let metaText = `${blocks.join(', ')} · ${current}/${target} ${unit}`;
            if (isVice && habit.tracking_method === 'budget') {
                metaText = `Vice budget · ${current}/${target} ${unit}`;
            }
            if (isStreakVice) {
                metaText = `Vice streak · ${streakDays} clean day${streakDays === 1 ? '' : 's'}`;
            }

            const quickSuffix = unit.startsWith('min') ? 'm' : '';

            const row = document.createElement('article');
            row.className = `habit-row${isNow ? ' now' : ''}`;
            let rowActions = `
                <button class="icon-btn" type="button" data-action="decrement" data-habit-id="${habit.id}" title="Decrease">-</button>
                <button class="icon-btn" type="button" data-action="increment" data-habit-id="${habit.id}" title="Increase">+</button>
                <button class="icon-btn" type="button" data-action="edit" data-habit-id="${habit.id}" title="Edit">E</button>
            `;

            if (isDuration || (isVice && habit.tracking_method === 'budget')) {
                rowActions = `
                    <button class="icon-btn" type="button" data-action="edit" data-habit-id="${habit.id}" title="Edit">E</button>
                `;
            }

            if (isStreakVice) {
                rowActions = `
                    <button class="ghost-btn" type="button" data-action="streak-slip" data-habit-id="${habit.id}" title="Log slip">Slip</button>
                    <button class="icon-btn" type="button" data-action="edit" data-habit-id="${habit.id}" title="Edit">E</button>
                `;
            }

            let entryControls = '';
            if (isDuration || (isVice && habit.tracking_method === 'budget')) {
                entryControls = `
                    <div class="row-entry">
                        <button class="compact-btn" type="button" data-action="quick-add" data-habit-id="${habit.id}" data-delta="5">+5${quickSuffix}</button>
                        <button class="compact-btn" type="button" data-action="quick-add" data-habit-id="${habit.id}" data-delta="15">+15${quickSuffix}</button>
                        <button class="compact-btn" type="button" data-action="quick-add" data-habit-id="${habit.id}" data-delta="30">+30${quickSuffix}</button>
                        <input class="minute-input" type="number" min="1" max="999" step="1" value="15" data-action-input="minutes" data-habit-id="${habit.id}">
                        <button class="compact-btn" type="button" data-action="custom-add" data-habit-id="${habit.id}">Add</button>
                    </div>
                `;
            }

            row.innerHTML = `
                <div class="habit-main">
                    <p class="habit-name">${escapeHtml(habit.name)}</p>
                    <p class="habit-meta">${escapeHtml(metaText)}</p>
                </div>
                <div class="row-actions">
                    ${rowActions}
                </div>
                ${entryControls}
            `;

            habitList.appendChild(row);
        });
    }

    function renderProgress() {
        const focusHabits = state.habits.filter((habit) => habit.category === 'focus');
        const total = focusHabits.length;
        const completed = focusHabits.filter((habit) => {
            const amount = Number(state.todayProgress[habit.id]) || 0;
            return amount >= Math.max(1, Number(habit.target_amount) || 1);
        }).length;

        const percent = total ? Math.round((completed / total) * 100) : 0;

        progressValue.textContent = `${percent}%`;
        progressMeta.textContent = `${completed}/${total}`;
        progressMeta.title = `${completed} of ${total} habits complete`;
        progressRing.style.setProperty('--value', `${percent}%`);
    }

    function formatMinutes(value) {
        const total = Math.max(0, Math.floor(Number(value) || 0));
        const hours = Math.floor(total / 60);
        const mins = total % 60;
        if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
        if (hours > 0) return `${hours}h`;
        return `${mins}m`;
    }

    function readStoredChecklist() {
        try {
            const raw = localStorage.getItem(CHECKLIST_STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];

            return parsed
                .map((item) => ({
                    id: String(item.id || crypto.randomUUID()),
                    text: String(item.text || '').trim(),
                    done: Boolean(item.done)
                }))
                .filter((item) => item.text);
        } catch (error) {
            return [];
        }
    }

    function persistChecklist() {
        localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(state.checklist));
    }

    function renderChecklist() {
        checklistList.innerHTML = '';

        if (!state.checklist.length) {
            checklistEmpty.hidden = false;
            return;
        }

        checklistEmpty.hidden = true;

        state.checklist.forEach((item) => {
            const row = document.createElement('article');
            row.className = 'check-row';
            row.innerHTML = `
                <div class="habit-main">
                    <p class="habit-name" style="text-decoration:${item.done ? 'line-through' : 'none'};opacity:${item.done ? '0.65' : '1'};">${escapeHtml(item.text)}</p>
                    <p class="habit-meta">${item.done ? 'Done' : 'Pending'}</p>
                </div>
                <div class="row-actions">
                    <button class="icon-btn" type="button" data-action="toggle" data-item-id="${item.id}" title="Toggle">${item.done ? 'U' : 'D'}</button>
                    <button class="icon-btn" type="button" data-action="delete" data-item-id="${item.id}" title="Delete">X</button>
                </div>
            `;
            checklistList.appendChild(row);
        });
    }

    function hydrateScratch() {
        scratchInput.value = localStorage.getItem(SCRATCH_STORAGE_KEY) || '';
    }

    function startClock() {
        renderClock();
        setInterval(renderClock, 1000);
    }

    function renderClock() {
        const now = new Date();
        clockTime.textContent = now.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });

        clockDate.textContent = now.toLocaleDateString([], {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        });
    }

    async function loadWeather() {
        if (!navigator.geolocation) {
            weatherSummary.textContent = 'Weather unavailable';
            weatherMeta.textContent = 'No location';
            return;
        }

        weatherSummary.textContent = 'Loading weather...';
        weatherMeta.textContent = 'Fetching current conditions.';

        navigator.geolocation.getCurrentPosition(async (position) => {
            try {
                const lat = position.coords.latitude.toFixed(4);
                const lon = position.coords.longitude.toFixed(4);
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`;
                const response = await fetch(url);
                if (!response.ok) throw new Error('weather service unavailable');
                const payload = await response.json();
                const current = payload.current || {};
                const temp = Number(current.temperature_2m);
                const code = Number(current.weather_code);
                weatherSummary.textContent = Number.isFinite(temp) ? `${Math.round(temp)}C` : 'No temperature';
                weatherMeta.textContent = Number.isFinite(code) ? `Code ${code}` : 'Local';
            } catch (error) {
                weatherSummary.textContent = 'Weather fallback';
                weatherMeta.textContent = 'Local';
            }
        }, () => {
            weatherSummary.textContent = 'Weather blocked';
            weatherMeta.textContent = 'Location off';
        }, {
            enableHighAccuracy: false,
            timeout: 7000
        });
    }

    function renderCalendarShell() {
        const stubEvents = [
            { title: 'Deep Work Block', meta: '09:00 - 10:30 · Focus' },
            { title: 'Admin and Planning', meta: '13:00 - 13:30 · Personal' },
            { title: 'Training Session', meta: '18:00 - 19:00 · Health' }
        ];

        calendarList.innerHTML = '';
        stubEvents.forEach((event) => {
            const row = document.createElement('article');
            row.className = 'calendar-row';
            row.innerHTML = `
                <div>
                    <p class="calendar-title">${escapeHtml(event.title)}</p>
                    <p class="calendar-meta">${escapeHtml(event.meta)}</p>
                </div>
                <span class="pill">Read only</span>
            `;
            calendarList.appendChild(row);
        });
    }

    function hydrateDynamicDefaults() {
        quickSleepDate.value = core.getTodayKey();
    }

    function getSuggestedDynamicMode() {
        const nowBlock = core.getCurrentTimeBlock();
        const hasTodaySleep = Boolean(state.sleepByDate[core.getTodayKey()]);
        if (nowBlock === 'morning' && !hasTodaySleep) return 'sleep';
        return 'events';
    }

    function updateModeButtons(mode) {
        const eventsActive = mode === 'events';
        const sleepActive = mode === 'sleep';

        modeEventsBtn.classList.toggle('active', eventsActive);
        modeSleepBtn.classList.toggle('active', sleepActive);
        modeEventsBtn.setAttribute('aria-selected', String(eventsActive));
        modeSleepBtn.setAttribute('aria-selected', String(sleepActive));
    }

    function renderDynamicPanel() {
        const mode = state.dynamicMode === 'auto' ? getSuggestedDynamicMode() : state.dynamicMode;
        const todaySleep = state.sleepByDate[core.getTodayKey()];

        dynamicEventsPanel.hidden = mode !== 'events';
        dynamicSleepPanel.hidden = mode !== 'sleep';
        updateModeButtons(mode);

        if (mode === 'sleep') {
            if (todaySleep) {
                quickSleepDate.value = core.getTodayKey();
                quickSleepTime.value = todaySleep.sleptAt || '';
                quickWakeTime.value = todaySleep.wokeAt || '';
                dynamicStatus.textContent = `Sleep logged: ${formatMinutes(todaySleep.durationMinutes)}.`;
            } else {
                dynamicStatus.textContent = 'Mode: Sleep quick add';
            }
            return;
        }
        dynamicStatus.textContent = 'Mode: Events';
    }

    function collectHabitPayload() {
        const selectedBlocks = timeBlockCheckboxes
            .filter((box) => box.checked)
            .map((box) => box.value);

        const normalizedBlocks = core.normalizeTimeBlocks(selectedBlocks);
        const habitType = habitTypeInput.value === 'duration' ? 'duration' : 'count';

        return {
            name: String(habitNameInput.value || '').trim(),
            habit_type: habitType,
            target_amount: Math.max(1, Number(habitTargetInput.value) || 1),
            time_of_day: normalizedBlocks,
            unit: habitType === 'duration' ? 'minutes' : 'times',
            tracking_method: null
        };
    }

    function applyAnytimeRule(changedInput) {
        if (changedInput.value === 'anytime' && changedInput.checked) {
            timeBlockCheckboxes
                .filter((box) => box.value !== 'anytime')
                .forEach((box) => {
                    box.checked = false;
                });
            return;
        }

        if (changedInput.value !== 'anytime' && changedInput.checked) {
            const anytime = timeBlockCheckboxes.find((box) => box.value === 'anytime');
            if (anytime) anytime.checked = false;
        }

        const hasChecked = timeBlockCheckboxes.some((box) => box.checked);
        if (!hasChecked) {
            const anytime = timeBlockCheckboxes.find((box) => box.value === 'anytime');
            if (anytime) anytime.checked = true;
        }
    }

    function openHabitModal(habit) {
        setHabitStatus('', false);
        state.editHabitId = habit ? habit.id : null;

        if (habit) {
            habitModalTitle.textContent = 'Edit Habit';
            habitNameInput.value = habit.name;
            habitTypeInput.value = habit.habit_type;
            habitTargetInput.value = String(habit.target_amount || 1);
            setTimeBlockSelection(habit.time_of_day || ['anytime']);
        } else {
            habitModalTitle.textContent = 'Create Habit';
            habitForm.reset();
            habitTypeInput.value = 'count';
            habitTargetInput.value = '1';
            setTimeBlockSelection(['anytime']);
        }

        habitModal.hidden = false;
    }

    function closeHabitModal() {
        state.editHabitId = null;
        habitModal.hidden = true;
    }

    function setTimeBlockSelection(blocks) {
        const normalized = core.normalizeTimeBlocks(blocks);
        timeBlockCheckboxes.forEach((box) => {
            box.checked = normalized.includes(box.value);
        });
    }

    function startPolling() {
        if (state.pollId) return;
        state.pollId = setInterval(() => {
            void refreshDashboardData();
        }, core.POLL_MS);
    }

    function stopPolling() {
        if (!state.pollId) return;
        clearInterval(state.pollId);
        state.pollId = null;
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
});
