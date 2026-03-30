document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const wakeUpTimeInput = document.getElementById('wake-up-time');
    const replacementHabitInput = document.getElementById('replacement-habit-input');
    const replacementHabitSuggestion = document.getElementById('replacement-habit-suggestion');
    const syncIdInput = document.getElementById('sync-id');
    const syncStatusEl = document.getElementById('sync-status');
    const phaseBar = document.getElementById('phase-bar');
    const phaseText = document.getElementById('phase-text');
    const phaseExplanation = document.getElementById('phase-explanation');
    const phase1Section = document.getElementById('phase-1-section');
    const phase2Section = document.getElementById('phase-2-section');
    const phase3Section = document.getElementById('phase-3-section');
    const phase1HabitsGrid = document.getElementById('phase-1-habits');
    const phase2HabitsGrid = document.getElementById('phase-2-habits');
    const phase3HabitsGrid = document.getElementById('phase-3-habits');
    const breakHabitsContainer = document.getElementById('break-habits-container');
    const breakHabitsGrid = document.getElementById('break-habits-grid');
    const challengeGrid = document.getElementById('challenge-grid');
    const pomodoroModal = document.getElementById('pomodoro-modal');
    const pomodoroTimerEl = document.getElementById('pomodoro-timer');
    const startPomodoroBtn = document.getElementById('pomodoro-start');
    const resetPomodoroBtn = document.getElementById('pomodoro-reset');
    const closeModalBtn = document.querySelector('.close-button');
    const replacementModal = document.getElementById('replacement-habit-modal');
    const replacementDoneBtn = document.getElementById('replacement-habit-done');
    const completedCountEl = document.getElementById('completed-count');
    const challengeStatusEl = document.getElementById('challenge-status');
    const phaseWindowEl = document.getElementById('phase-window');
    const streakCountEl = document.getElementById('streak-count');
    const bestStreakCountEl = document.getElementById('best-streak-count');
    const habitEditorForm = document.getElementById('habit-editor-form');
    const habitNameInput = document.getElementById('habit-name');
    const habitPhaseInput = document.getElementById('habit-phase');
    const habitFrictionInput = document.getElementById('habit-friction');
    const habitLinchpinInput = document.getElementById('habit-linchpin');
    const habitPomodoroInput = document.getElementById('habit-pomodoro');
    const habitListManager = document.getElementById('habit-list-manager');

    // --- Constants ---
    const REQUIRED_HABITS_PER_DAY = 4;
    const CLOUD_TABLE = 'habit_tracker_states';
    const HABIT_PRESET_VERSION = 2;
    const CLOUD_POLL_INTERVAL_MS = 15000;

    const DEFAULT_HABITS = [
        { id: 'cold-shower', name: 'Cold Shower', phase: 1, friction: 'high', completed: false },
        { id: 'study-work', name: 'Study Work', phase: 1, friction: 'high', completed: false, pomodoro: true },
        { id: 'running', name: 'Running', phase: 1, friction: 'low', completed: false, linchpin: true },
        { id: 'reading-light-reading', name: 'Reading / Light Reading', phase: 2, friction: 'low', completed: false },
        { id: 'meditation-nsdr', name: 'Meditation / NSDR', phase: 2, friction: 'low', completed: false },
        { id: 'video-games', name: 'Video Games (Moderate Usage)', phase: 2, friction: 'medium', completed: false },
        { id: 'dim-lights-screens-off', name: 'Dim Lights & Screens Off', phase: 3, friction: 'medium', completed: false },
        { id: 'cool-down-bedroom', name: 'Cool Down Bedroom', phase: 3, friction: 'low', completed: false },
        { id: 'sleep-on-time', name: 'Sleep on Time (In bed by target time)', phase: 3, friction: 'high', completed: false }
    ];

    const DEFAULT_BREAK_HABITS = [
        { id: 'smoking', name: 'Smoking/Weed', slipped: false }
    ];

    // --- State ---
    let wakeUpTime = '07:00';
    let replacementHabit = '10 Pushups';
    let syncId = 'default-user';
    let habits = [...DEFAULT_HABITS];
    let habitsToBreak = [...DEFAULT_BREAK_HABITS];
    let habitPresetVersion = HABIT_PRESET_VERSION;
    let challengeStartDate = '';
    let challengeDataByDate = {};
    let dailyHabitChecks = {};
    let pomodoroInterval;
    let pomodoroTime = 25 * 60;

    // --- Supabase ---
    const hasSupabaseSDK = Boolean(window.supabase && typeof window.supabase.createClient === 'function');
    const supabaseUrl = (window.HABIT_SUPABASE_URL || '').trim();
    const supabaseAnonKey = (window.HABIT_SUPABASE_ANON_KEY || '').trim();
    const cloudSyncReady = hasSupabaseSDK && Boolean(supabaseUrl && supabaseAnonKey);
    const supabaseClient = cloudSyncReady ? window.supabase.createClient(supabaseUrl, supabaseAnonKey) : null;

    const setSyncStatus = (text, isError = false) => {
        if (!syncStatusEl) return;
        syncStatusEl.textContent = text;
        syncStatusEl.classList.toggle('error', isError);
    };

    const getSerializableData = () => ({
        wakeUpTime,
        replacementHabit,
        syncId,
        habitPresetVersion,
        habits,
        habitsToBreak,
        challengeStartDate,
        challengeDataByDate,
        dailyHabitChecks
    });

    const applyData = (data) => {
        wakeUpTime = data.wakeUpTime || '07:00';
        replacementHabit = data.replacementHabit || '10 Pushups';
        syncId = data.syncId || syncId;
        habitPresetVersion = data.habitPresetVersion || 1;
        habits = Array.isArray(data.habits) && data.habits.length ? data.habits : [...DEFAULT_HABITS];
        habitsToBreak = Array.isArray(data.habitsToBreak) && data.habitsToBreak.length ? data.habitsToBreak : [...DEFAULT_BREAK_HABITS];
        challengeStartDate = data.challengeStartDate || challengeStartDate;
        challengeDataByDate = data.challengeDataByDate || {};
        dailyHabitChecks = data.dailyHabitChecks || {};
    };

    const syncToCloud = async (payload) => {
        if (!cloudSyncReady || !syncId || !supabaseClient) return;

        const { error } = await supabaseClient
            .from(CLOUD_TABLE)
            .upsert({
                sync_id: syncId,
                payload,
                updated_at: new Date().toISOString()
            }, { onConflict: 'sync_id' });

        if (error) {
            setSyncStatus(`Cloud sync error: ${error.message}`, true);
            return;
        }

        setSyncStatus('Cloud synced');
    };

    const loadFromCloud = async (silent = false) => {
        if (!cloudSyncReady || !syncId || !supabaseClient) return null;

        const { data, error } = await supabaseClient
            .from(CLOUD_TABLE)
            .select('payload,updated_at')
            .eq('sync_id', syncId)
            .maybeSingle();

        if (error) {
            if (!silent) {
                setSyncStatus(`Cloud load error: ${error.message}`, true);
            }
            return null;
        }

        if (!data?.payload) {
            if (!silent) {
                setSyncStatus('No cloud data yet for this Sync ID');
            }
            return null;
        }

        return data;
    };

    const hydrateFromCloud = async (silent = false) => {
        const cloudData = await loadFromCloud(silent);
        if (!cloudData?.payload) {
            return false;
        }

        const localPayload = getSerializableData();
        const localSnapshot = JSON.stringify(localPayload);
        const cloudSnapshot = JSON.stringify(cloudData.payload);

        if (localSnapshot === cloudSnapshot) {
            if (!silent) {
                setSyncStatus('Already up to date');
            }
            return false;
        }

        applyData(cloudData.payload);
        ensureChallengeWindow();
        ensureHabitIds();
        syncTodayHabitCompletion();

        wakeUpTimeInput.value = wakeUpTime;
        replacementHabitInput.value = replacementHabit;
        syncIdInput.value = syncId;

        updateReplacementHabitSuggestion();
        updateChallengeProgress();
        updatePhase();

        if (!silent) {
            setSyncStatus('Cloud data loaded');
        }

        return true;
    };

    const saveData = () => {
        const data = getSerializableData();
        localStorage.setItem('habitTrackerData', JSON.stringify(data));
        void syncToCloud(data);
    };

    const loadData = async () => {
        const rawData = localStorage.getItem('habitTrackerData');
        if (rawData) {
            applyData(JSON.parse(rawData));
        }

        if (cloudSyncReady) {
            setSyncStatus('Cloud sync ready');
            await hydrateFromCloud(false);
        } else {
            setSyncStatus('Cloud sync inactive: add Supabase keys in supabase-config.js');
        }

        wakeUpTimeInput.value = wakeUpTime;
        replacementHabitInput.value = replacementHabit;
        syncIdInput.value = syncId;
    };

    // --- Date Helpers ---
    const getDateKey = (date = new Date()) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const dateKeyToDate = (dateKey) => {
        const [year, month, day] = dateKey.split('-').map(Number);
        return new Date(year, month - 1, day);
    };

    const addDays = (date, days) => {
        const next = new Date(date);
        next.setDate(next.getDate() + days);
        return next;
    };

    const diffInDays = (fromDate, toDate) => {
        const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
        const end = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
        return Math.floor((end - start) / (1000 * 60 * 60 * 24));
    };

    const getTodayIndexInChallenge = () => {
        if (!challengeStartDate) return -1;
        const startDate = dateKeyToDate(challengeStartDate);
        const dayDiff = diffInDays(startDate, new Date());
        return dayDiff >= 0 && dayDiff < 21 ? dayDiff : -1;
    };

    const ensureChallengeWindow = () => {
        if (!challengeStartDate) {
            challengeStartDate = getDateKey();
        }
    };

    const ensureHabitIds = () => {
        habits = habits.map((habit) => {
            if (habit.id) return habit;
            const normalized = (habit.name || 'habit')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');
            return { ...habit, id: `${normalized}-${Date.now()}` };
        });
    };

    const applyHabitPresetMigration = () => {
        if (habitPresetVersion >= HABIT_PRESET_VERSION) return;

        habits = [...DEFAULT_HABITS];

        Object.keys(dailyHabitChecks).forEach((dateKey) => {
            const checks = dailyHabitChecks[dateKey] || {};
            const nextChecks = {};

            habits.forEach((habit) => {
                if (checks[habit.id]) {
                    nextChecks[habit.id] = true;
                }
            });

            dailyHabitChecks[dateKey] = nextChecks;
        });

        habitPresetVersion = HABIT_PRESET_VERSION;
    };

    const syncTodayHabitCompletion = () => {
        const todayKey = getDateKey();
        const todayChecks = dailyHabitChecks[todayKey] || {};

        habits.forEach((habit) => {
            habit.completed = Boolean(todayChecks[habit.id]);
        });
    };

    const computeStreaks = () => {
        if (!challengeStartDate) return { current: 0, best: 0 };

        const startDate = dateKeyToDate(challengeStartDate);
        const today = new Date();
        const elapsedDays = Math.max(0, diffInDays(startDate, today));
        const maxIndex = Math.min(20, elapsedDays);

        let current = 0;
        for (let i = maxIndex; i >= 0; i--) {
            const dateKey = getDateKey(addDays(startDate, i));
            if (challengeDataByDate[dateKey]?.successful) {
                current++;
            } else {
                break;
            }
        }

        let best = 0;
        let running = 0;
        for (let i = 0; i <= maxIndex; i++) {
            const dateKey = getDateKey(addDays(startDate, i));
            if (challengeDataByDate[dateKey]?.successful) {
                running++;
                best = Math.max(best, running);
            } else {
                running = 0;
            }
        }

        return { current, best };
    };

    // --- Phase Logic ---
    const updatePhase = () => {
        const now = new Date();
        const [wakeHours, wakeMinutes] = wakeUpTime.split(':').map(Number);

        const wakeUpDate = new Date();
        wakeUpDate.setHours(wakeHours, wakeMinutes, 0, 0);

        const hoursSinceWake = (now - wakeUpDate) / (1000 * 60 * 60);

        let currentPhase = 0;
        let phaseName = '';
        let explanation = '';

        if (hoursSinceWake >= 0 && hoursSinceWake <= 8) {
            currentPhase = 1;
            phaseName = 'Phase 1: Action';
            explanation = '0-8 hours after waking. Best window for high-friction actions and effortful habits.';
        } else if (hoursSinceWake > 8 && hoursSinceWake < 16) {
            currentPhase = 2;
            phaseName = 'Phase 2: Creative';
            explanation = '9-14 hours after waking. Better for learning, creativity, and moderate friction habits.';
        } else {
            currentPhase = 3;
            phaseName = 'Phase 3: Wind Down';
            explanation = '16-24 hours after waking. Wind down, reduce stimulation, and prioritize sleep routines.';
        }

        const progress = (hoursSinceWake / 24) * 100;
        phaseBar.style.width = `${Math.min(Math.max(progress, 0), 100)}%`;
        phaseText.textContent = phaseName;
        phaseExplanation.textContent = explanation;

        renderHabits(currentPhase);
    };

    const setActivePhaseSection = (currentPhase) => {
        [phase1Section, phase2Section, phase3Section].forEach((section) => {
            section.classList.remove('active-phase');
        });

        if (currentPhase === 1) phase1Section.classList.add('active-phase');
        if (currentPhase === 2) phase2Section.classList.add('active-phase');
        if (currentPhase === 3) phase3Section.classList.add('active-phase');
    };

    // --- Render Functions ---
    const createHabitCard = (habit) => {
        const card = document.createElement('div');
        card.className = 'habit-card';
        if (habit.completed) card.classList.add('completed');
        if (habit.linchpin) card.classList.add('linchpin');

        card.innerHTML = `
            <div class="habit-info">
                <h3>${habit.name}</h3>
                <span class="friction-tag ${habit.friction}">${habit.friction} friction</span>
            </div>
            <div class="habit-actions">
                <button class="toggle-habit" data-id="${habit.id}">${habit.completed ? 'Undo' : 'Complete'}</button>
                ${habit.pomodoro ? `<button class="start-pomodoro" data-id="${habit.id}">Timer</button>` : ''}
            </div>
        `;

        return card;
    };

    const renderPhaseGrid = (gridEl, list) => {
        gridEl.innerHTML = '';
        if (!list.length) {
            gridEl.innerHTML = '<p>No habits in this phase yet.</p>';
            return;
        }

        list.forEach((habit) => gridEl.appendChild(createHabitCard(habit)));
    };

    const renderHabits = (currentPhase) => {
        const phase1Habits = habits.filter((h) => h.phase === 1);
        const phase2Habits = habits.filter((h) => h.phase === 2);
        const phase3Habits = habits.filter((h) => h.phase === 3);

        renderPhaseGrid(phase1HabitsGrid, phase1Habits);
        renderPhaseGrid(phase2HabitsGrid, phase2Habits);
        renderPhaseGrid(phase3HabitsGrid, phase3Habits);
        renderBreakHabits();
        renderHabitManager();
        setActivePhaseSection(currentPhase);
        updateDailyOverview(currentPhase);
    };

    const renderBreakHabits = () => {
        breakHabitsGrid.innerHTML = '';

        habitsToBreak.forEach((habit) => {
            const card = document.createElement('div');
            card.className = 'habit-card';
            card.innerHTML = `
                <div class="habit-info">
                    <h3>${habit.name}</h3>
                </div>
                <div class="habit-actions">
                    <button class="slipped-btn" data-id="${habit.id}">I Slipped</button>
                </div>
            `;
            breakHabitsGrid.appendChild(card);
        });
    };

    const renderChallengeGrid = () => {
        challengeGrid.innerHTML = '';
        const todayIndex = getTodayIndexInChallenge();
        const challengeStart = dateKeyToDate(challengeStartDate);

        Array.from({ length: 21 }).forEach((_, index) => {
            const dateKey = getDateKey(addDays(challengeStart, index));
            const day = challengeDataByDate[dateKey] || { successful: false, habitsDone: 0 };
            const cell = document.createElement('div');
            cell.className = 'day-cell';
            if (day.successful) cell.classList.add('successful');
            if (index === todayIndex) cell.classList.add('current-day');
            cell.innerHTML = `<span class="day-number">${index + 1}</span>`;
            challengeGrid.appendChild(cell);
        });
    };

    const renderHabitManager = () => {
        if (!habitListManager) return;

        habitListManager.innerHTML = '';

        if (!habits.length) {
            habitListManager.innerHTML = '<p>No habits yet. Add your first habit above.</p>';
            return;
        }

        habits.forEach((habit) => {
            const row = document.createElement('div');
            row.className = 'habit-manager-row';
            row.dataset.id = habit.id;

            row.innerHTML = `
                <input type="text" class="manage-name" value="${habit.name}">
                <select class="manage-phase">
                    <option value="1" ${habit.phase === 1 ? 'selected' : ''}>Phase 1</option>
                    <option value="2" ${habit.phase === 2 ? 'selected' : ''}>Phase 2</option>
                    <option value="3" ${habit.phase === 3 ? 'selected' : ''}>Phase 3</option>
                </select>
                <select class="manage-friction">
                    <option value="high" ${habit.friction === 'high' ? 'selected' : ''}>High</option>
                    <option value="medium" ${habit.friction === 'medium' ? 'selected' : ''}>Medium</option>
                    <option value="low" ${habit.friction === 'low' ? 'selected' : ''}>Low</option>
                </select>
                <label><input type="checkbox" class="manage-linchpin" ${habit.linchpin ? 'checked' : ''}> Linchpin</label>
                <label><input type="checkbox" class="manage-pomodoro" ${habit.pomodoro ? 'checked' : ''}> Pomodoro</label>
                <button class="save-habit" data-id="${habit.id}">Save</button>
                <button class="delete-habit" data-id="${habit.id}">Delete</button>
            `;

            habitListManager.appendChild(row);
        });
    };

    const updateDailyOverview = (currentPhase) => {
        const completedHabits = habits.filter((h) => h.completed).length;
        const totalHabits = habits.length;
        const todayKey = getDateKey();
        const todayStatus = challengeDataByDate[todayKey];
        const streaks = computeStreaks();

        completedCountEl.textContent = `${completedHabits} / ${totalHabits}`;
        challengeStatusEl.textContent = todayStatus?.successful ? 'Successful day' : 'Not complete';
        streakCountEl.textContent = `${streaks.current} ${streaks.current === 1 ? 'day' : 'days'}`;
        bestStreakCountEl.textContent = `${streaks.best} ${streaks.best === 1 ? 'day' : 'days'}`;

        if (currentPhase === 1) phaseWindowEl.textContent = 'Action window';
        if (currentPhase === 2) phaseWindowEl.textContent = 'Creative window';
        if (currentPhase === 3) phaseWindowEl.textContent = 'Wind-down window';
    };

    const updateChallengeProgress = () => {
        const todayIndex = getTodayIndexInChallenge();
        const completedHabits = habits.filter((h) => h.completed).length;

        if (todayIndex === -1) {
            renderChallengeGrid();
            return;
        }

        const challengeStart = dateKeyToDate(challengeStartDate);
        const todayDate = addDays(challengeStart, todayIndex);
        const todayKey = getDateKey(todayDate);

        challengeDataByDate[todayKey] = {
            successful: completedHabits >= REQUIRED_HABITS_PER_DAY,
            habitsDone: completedHabits
        };

        renderChallengeGrid();
    };

    const updateReplacementHabitSuggestion = () => {
        if (!replacementHabitSuggestion) return;
        replacementHabitSuggestion.textContent = replacementHabit || '10 Pushups';
    };

    // --- Event Handlers ---
    wakeUpTimeInput.addEventListener('change', (e) => {
        wakeUpTime = e.target.value;
        saveData();
        updatePhase();
    });

    replacementHabitInput.addEventListener('change', (e) => {
        replacementHabit = e.target.value.trim() || '10 Pushups';
        replacementHabitInput.value = replacementHabit;
        updateReplacementHabitSuggestion();
        saveData();
    });

    syncIdInput.addEventListener('change', async (e) => {
        syncId = e.target.value.trim() || 'default-user';
        syncIdInput.value = syncId;

        await hydrateFromCloud(false);

        updateReplacementHabitSuggestion();
        updateChallengeProgress();
        updatePhase();
        saveData();
    });

    habitEditorForm?.addEventListener('submit', (e) => {
        e.preventDefault();

        const name = habitNameInput.value.trim();
        if (!name) return;

        const idSafeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

        habits.push({
            id: `${idSafeName}-${Date.now()}`,
            name,
            phase: Number(habitPhaseInput.value),
            friction: habitFrictionInput.value,
            completed: false,
            linchpin: habitLinchpinInput.checked,
            pomodoro: habitPomodoroInput.checked
        });

        habitEditorForm.reset();
        habitPhaseInput.value = '1';
        habitFrictionInput.value = 'high';
        saveData();
        updateChallengeProgress();
        updatePhase();
    });

    habitListManager?.addEventListener('click', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;

        const habitId = target.dataset.id;
        if (!habitId) return;

        const row = target.closest('.habit-manager-row');
        if (!row) return;

        if (target.classList.contains('delete-habit')) {
            habits = habits.filter((habit) => habit.id !== habitId);

            Object.keys(dailyHabitChecks).forEach((dateKey) => {
                if (dailyHabitChecks[dateKey]?.[habitId]) {
                    delete dailyHabitChecks[dateKey][habitId];
                }
            });

            updateChallengeProgress();
            saveData();
            updatePhase();
            return;
        }

        if (target.classList.contains('save-habit')) {
            const nameInput = row.querySelector('.manage-name');
            const phaseInput = row.querySelector('.manage-phase');
            const frictionInput = row.querySelector('.manage-friction');
            const linchpinInput = row.querySelector('.manage-linchpin');
            const pomodoroInput = row.querySelector('.manage-pomodoro');

            if (!nameInput || !phaseInput || !frictionInput || !linchpinInput || !pomodoroInput) {
                return;
            }

            const habit = habits.find((entry) => entry.id === habitId);
            if (!habit) return;

            habit.name = nameInput.value.trim() || habit.name;
            habit.phase = Number(phaseInput.value);
            habit.friction = frictionInput.value;
            habit.linchpin = linchpinInput.checked;
            habit.pomodoro = pomodoroInput.checked;

            saveData();
            updatePhase();
        }
    });

    const handleHabitGridClick = (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;

        if (target.classList.contains('toggle-habit')) {
            const habitId = target.dataset.id;
            const habit = habits.find((h) => h.id === habitId);
            if (!habit) return;

            const todayKey = getDateKey();
            if (!dailyHabitChecks[todayKey]) {
                dailyHabitChecks[todayKey] = {};
            }

            habit.completed = !habit.completed;

            if (habit.completed) {
                dailyHabitChecks[todayKey][habit.id] = true;
            } else {
                delete dailyHabitChecks[todayKey][habit.id];
            }

            updateChallengeProgress();
            saveData();
            updatePhase();
            return;
        }

        if (target.classList.contains('start-pomodoro')) {
            pomodoroModal.style.display = 'block';
        }
    };

    phase1Section.addEventListener('click', handleHabitGridClick);
    phase2Section.addEventListener('click', handleHabitGridClick);
    phase3Section.addEventListener('click', handleHabitGridClick);

    breakHabitsContainer.addEventListener('click', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;

        if (target.classList.contains('slipped-btn')) {
            updateReplacementHabitSuggestion();
            replacementModal.style.display = 'block';
        }
    });

    // --- Pomodoro Logic ---
    const updatePomodoroDisplay = () => {
        const minutes = Math.floor(pomodoroTime / 60).toString().padStart(2, '0');
        const seconds = (pomodoroTime % 60).toString().padStart(2, '0');
        pomodoroTimerEl.textContent = `${minutes}:${seconds}`;
    };

    const startPomodoro = () => {
        if (pomodoroTime <= 0) {
            pomodoroTime = 25 * 60;
        }

        clearInterval(pomodoroInterval);
        pomodoroInterval = setInterval(() => {
            pomodoroTime--;
            updatePomodoroDisplay();

            if (pomodoroTime <= 0) {
                clearInterval(pomodoroInterval);
                alert('Pomodoro session finished!');
            }
        }, 1000);
    };

    const resetPomodoro = () => {
        clearInterval(pomodoroInterval);
        pomodoroTime = 25 * 60;
        updatePomodoroDisplay();
    };

    startPomodoroBtn.addEventListener('click', startPomodoro);
    resetPomodoroBtn.addEventListener('click', resetPomodoro);
    closeModalBtn.addEventListener('click', () => {
        pomodoroModal.style.display = 'none';
    });

    replacementDoneBtn.addEventListener('click', () => {
        replacementModal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === pomodoroModal) pomodoroModal.style.display = 'none';
        if (e.target === replacementModal) replacementModal.style.display = 'none';
    });

    window.addEventListener('focus', () => {
        void hydrateFromCloud(true);
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            void hydrateFromCloud(true);
        }
    });

    // --- Initialization ---
    const init = async () => {
        await loadData();
        applyHabitPresetMigration();
        ensureChallengeWindow();
        ensureHabitIds();
        syncTodayHabitCompletion();
        updateReplacementHabitSuggestion();
        updateChallengeProgress();
        updatePhase();
        renderChallengeGrid();
        updatePomodoroDisplay();
        saveData();
        setInterval(updatePhase, 60000);
        setInterval(() => {
            void hydrateFromCloud(true);
        }, CLOUD_POLL_INTERVAL_MS);
    };

    void init();
});
