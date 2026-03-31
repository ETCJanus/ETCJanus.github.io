document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const wakeUpTimeInput = document.getElementById('wake-up-time');
    const replacementHabitInput = document.getElementById('replacement-habit-input');
    const replacementHabitSuggestion = document.getElementById('replacement-habit-suggestion');
    const replacementTriggerNote = document.getElementById('replacement-trigger-note');
    const slipTriggerInput = document.getElementById('slip-trigger');
    const syncIdInput = document.getElementById('sync-id');
    const syncStatusEl = document.getElementById('sync-status');
    const phaseHand = document.getElementById('phase-hand');
    const phaseText = document.getElementById('phase-text');
    const phaseHoursSince = document.getElementById('phase-hours-since');
    const phaseWindowLabel = document.getElementById('phase-window');
    const phaseExplanation = document.getElementById('phase-explanation');
    const legendPhase1 = document.getElementById('legend-phase-1');
    const legendPhase2 = document.getElementById('legend-phase-2');
    const legendPhase3 = document.getElementById('legend-phase-3');
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
    const pomodoroDurationInput = document.getElementById('pomodoro-duration');
    const startPomodoroBtn = document.getElementById('pomodoro-start');
    const resetPomodoroBtn = document.getElementById('pomodoro-reset');
    const closeModalBtn = document.querySelector('.close-button');
    const replacementModal = document.getElementById('replacement-habit-modal');
    const replacementDoneBtn = document.getElementById('replacement-habit-done');
    const completedCountEl = document.getElementById('completed-count');
    const challengeStatusEl = document.getElementById('challenge-status');
    const phaseWindowSummaryEl = document.getElementById('phase-window-summary');
    const streakCountEl = document.getElementById('streak-count');
    const bestStreakCountEl = document.getElementById('best-streak-count');
    const momentumRingProgressEl = document.getElementById('momentum-ring-progress');
    const todayProgressCaptionEl = document.getElementById('today-progress-caption');
    const todayProgressTextEl = document.getElementById('today-progress-text');
    const rhythmSparklinePolylineEl = document.getElementById('rhythm-sparkline-polyline');
    const rhythmSparklineLabelsEl = document.getElementById('rhythm-sparkline-labels');
    const habitEditorForm = document.getElementById('habit-editor-form');
    const habitNameInput = document.getElementById('habit-name');
    const habitPhaseInput = document.getElementById('habit-phase');
    const habitFrictionInput = document.getElementById('habit-friction');
    const habitLinchpinInput = document.getElementById('habit-linchpin');
    const habitPomodoroInput = document.getElementById('habit-pomodoro');
    const habitListManager = document.getElementById('habit-list-manager');
    const hideCompletedMobileInput = document.getElementById('hide-completed-mobile');
    const resetTodayBtn = document.getElementById('reset-today-btn');
    const dailyCommitmentsForm = document.getElementById('daily-commitments-form');
    const commitmentMustInput = document.getElementById('commitment-must');
    const commitmentMaintenanceInput = document.getElementById('commitment-maintenance');
    const commitmentAdminInput = document.getElementById('commitment-admin');
    const dailyCommitmentsList = document.getElementById('daily-commitments-list');
    const recoveryPanel = document.getElementById('recovery-panel');
    const recoveryContextEl = document.getElementById('recovery-context');
    const recoveryStepsEl = document.getElementById('recovery-steps');
    const recoveryCompleteBtn = document.getElementById('recovery-complete-btn');
    const weeklyResetForm = document.getElementById('weekly-reset-form');
    const weeklyWinsInput = document.getElementById('weekly-wins');
    const weeklySlipsInput = document.getElementById('weekly-slips');
    const weeklySimplifyInput = document.getElementById('weekly-simplify');
    const weeklyPriority1Input = document.getElementById('weekly-priority-1');
    const weeklyPriority2Input = document.getElementById('weekly-priority-2');
    const weeklyPriority3Input = document.getElementById('weekly-priority-3');
    const weeklySuccessfulDaysEl = document.getElementById('weekly-successful-days');
    const weeklySlipEventsEl = document.getElementById('weekly-slip-events');
    const weeklyCompletionRateEl = document.getElementById('weekly-completion-rate');

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
    let slipEventsByDate = {};
    let dailyCommitmentsByDate = {};
    let weeklyResetByWeek = {};
    let recoveryPlanByDate = {};
    let hideCompletedMobile = false;
    let pomodoroDurationMinutes = 25;
    let pomodoroEndAt = null;
    let activeDateKey = '';
    let pendingSlipHabitId = null;
    let pomodoroInterval;
    let pomodoroTime = pomodoroDurationMinutes * 60;

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
        dailyHabitChecks,
        slipEventsByDate,
        dailyCommitmentsByDate,
        weeklyResetByWeek,
        recoveryPlanByDate,
        hideCompletedMobile,
        pomodoroDurationMinutes,
        pomodoroEndAt,
        pomodoroTime
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
        slipEventsByDate = data.slipEventsByDate || {};
        dailyCommitmentsByDate = data.dailyCommitmentsByDate || {};
        weeklyResetByWeek = data.weeklyResetByWeek || {};
        recoveryPlanByDate = data.recoveryPlanByDate || {};
        hideCompletedMobile = Boolean(data.hideCompletedMobile);
        pomodoroDurationMinutes = Math.min(120, Math.max(5, Number(data.pomodoroDurationMinutes) || 25));
        pomodoroEndAt = Number(data.pomodoroEndAt) || null;
        pomodoroTime = Number(data.pomodoroTime) || pomodoroDurationMinutes * 60;
    };

    const normalizeSlipEntry = (entry) => {
        if (typeof entry === 'number') {
            return { count: entry, triggers: {} };
        }

        if (entry && typeof entry === 'object') {
            return {
                count: Number(entry.count) || 0,
                triggers: entry.triggers && typeof entry.triggers === 'object' ? { ...entry.triggers } : {}
            };
        }

        return { count: 0, triggers: {} };
    };

    const ensureSlipModel = () => {
        Object.keys(slipEventsByDate).forEach((dateKey) => {
            const dayMap = slipEventsByDate[dateKey] || {};
            const normalizedDayMap = {};

            Object.entries(dayMap).forEach(([habitId, entry]) => {
                normalizedDayMap[habitId] = normalizeSlipEntry(entry);
            });

            slipEventsByDate[dateKey] = normalizedDayMap;
        });
    };

    const getWeekKey = (date = new Date()) => {
        const reference = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const day = reference.getDay();
        const mondayOffset = day === 0 ? -6 : 1 - day;
        reference.setDate(reference.getDate() + mondayOffset);
        return getDateKey(reference);
    };

    const ensureDailyCommitmentsRecord = (dateKey) => {
        if (!dailyCommitmentsByDate[dateKey]) {
            dailyCommitmentsByDate[dateKey] = {
                mustDo: '',
                maintenance: '',
                admin: '',
                checks: {
                    mustDo: false,
                    maintenance: false,
                    admin: false
                }
            };
        }
        return dailyCommitmentsByDate[dateKey];
    };

    const ensureRecoveryRecord = (dateKey) => {
        if (!recoveryPlanByDate[dateKey]) {
            recoveryPlanByDate[dateKey] = {
                steps: {
                    minimum: false,
                    environment: false,
                    rebound: false
                },
                completedAt: ''
            };
        }
        return recoveryPlanByDate[dateKey];
    };

    const ensureWeeklyResetRecord = (weekKey) => {
        if (!weeklyResetByWeek[weekKey]) {
            weeklyResetByWeek[weekKey] = {
                wins: '',
                slips: '',
                simplify: '',
                priorities: ['', '', ''],
                updatedAt: ''
            };
        }
        return weeklyResetByWeek[weekKey];
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
        if (hideCompletedMobileInput) hideCompletedMobileInput.checked = hideCompletedMobile;
        if (pomodoroDurationInput) pomodoroDurationInput.value = String(pomodoroDurationMinutes);

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
        if (hideCompletedMobileInput) hideCompletedMobileInput.checked = hideCompletedMobile;
        if (pomodoroDurationInput) pomodoroDurationInput.value = String(pomodoroDurationMinutes);
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

    const formatClockTime = (date) => {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    };

    const getPhaseWindowTimeRange = (wakeDate, phaseNumber) => {
        let startOffset = 0;
        let endOffset = 8;

        if (phaseNumber === 2) {
            startOffset = 8;
            endOffset = 16;
        }

        if (phaseNumber === 3) {
            startOffset = 16;
            endOffset = 24;
        }

        const start = addDays(wakeDate, 0);
        start.setHours(wakeDate.getHours(), wakeDate.getMinutes(), 0, 0);
        start.setTime(start.getTime() + startOffset * 60 * 60 * 1000);

        const end = addDays(wakeDate, 0);
        end.setHours(wakeDate.getHours(), wakeDate.getMinutes(), 0, 0);
        end.setTime(end.getTime() + endOffset * 60 * 60 * 1000);

        return `${formatClockTime(start)} to ${formatClockTime(end)}`;
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

    const computeDayStatus = (dateKey) => {
        const dayChecks = dailyHabitChecks[dateKey] || {};
        const habitsDone = Object.values(dayChecks).filter(Boolean).length;
        const hasLogs = Object.keys(dayChecks).length > 0;
        const todayKey = getDateKey();

        if (!hasLogs) {
            return {
                status: dateKey === todayKey ? 'pending' : 'missed',
                successful: false,
                habitsDone: 0,
                hasLogs: false
            };
        }

        const successful = habitsDone >= REQUIRED_HABITS_PER_DAY;
        return {
            status: successful ? 'successful' : 'incomplete',
            successful,
            habitsDone,
            hasLogs: true
        };
    };

    const reconcileChallengeData = () => {
        if (!challengeStartDate) return;

        const startDate = dateKeyToDate(challengeStartDate);
        const today = new Date();
        const elapsedDays = Math.max(0, diffInDays(startDate, today));
        const maxIndex = Math.min(20, elapsedDays);

        for (let i = 0; i <= maxIndex; i++) {
            const dateKey = getDateKey(addDays(startDate, i));
            const daySnapshot = computeDayStatus(dateKey);

            challengeDataByDate[dateKey] = {
                successful: daySnapshot.successful,
                habitsDone: daySnapshot.habitsDone,
                status: daySnapshot.status
            };
        }
    };

    const ensureDailyStateCurrent = () => {
        const todayKey = getDateKey();
        if (activeDateKey === todayKey) return;

        activeDateKey = todayKey;
        syncTodayHabitCompletion();
        reconcileChallengeData();
    };

    // --- Phase Logic ---
    const triggerSuggestionByKey = {
        stress: 'Take 6 slow breaths, then do your replacement habit.',
        boredom: 'Do a 2-minute walk, then start the replacement habit.',
        social: 'Step away for one minute and execute your replacement habit.',
        'late-night': 'Drink water, dim lights, then do your replacement habit.',
        other: 'Interrupt the loop immediately with your replacement habit.'
    };

    const updateReplacementHabitSuggestion = () => {
        if (!replacementHabitSuggestion) return;

        const triggerKey = slipTriggerInput?.value || 'other';
        const triggerPrompt = triggerSuggestionByKey[triggerKey] || triggerSuggestionByKey.other;
        replacementHabitSuggestion.textContent = replacementHabit || '10 Pushups';

        if (replacementTriggerNote) {
            replacementTriggerNote.textContent = triggerPrompt;
        }
    };

    const recordSlipEvent = (habitId, triggerKey) => {
        if (!habitId) return;

        const todayKey = getDateKey();
        if (!slipEventsByDate[todayKey]) {
            slipEventsByDate[todayKey] = {};
        }

        const normalized = normalizeSlipEntry(slipEventsByDate[todayKey][habitId]);
        normalized.count += 1;
        normalized.triggers[triggerKey] = (normalized.triggers[triggerKey] || 0) + 1;
        slipEventsByDate[todayKey][habitId] = normalized;
    };

    const syncPomodoroFromState = () => {
        if (!pomodoroEndAt) {
            pomodoroTime = Math.max(0, Number(pomodoroTime) || pomodoroDurationMinutes * 60);
            return;
        }

        const remaining = Math.max(0, Math.ceil((pomodoroEndAt - Date.now()) / 1000));
        pomodoroTime = remaining;

        if (remaining === 0) {
            pomodoroEndAt = null;
        }
    };

    const shouldHideCompletedInGrid = () => (
        hideCompletedMobile
        && window.matchMedia('(max-width: 760px)').matches
    );

    const renderDailyCommitments = () => {
        const todayKey = getDateKey();
        const record = ensureDailyCommitmentsRecord(todayKey);

        if (commitmentMustInput) commitmentMustInput.value = record.mustDo || '';
        if (commitmentMaintenanceInput) commitmentMaintenanceInput.value = record.maintenance || '';
        if (commitmentAdminInput) commitmentAdminInput.value = record.admin || '';

        if (!dailyCommitmentsList) return;

        const items = [
            { key: 'mustDo', label: 'Must-do', value: record.mustDo },
            { key: 'maintenance', label: 'Maintenance', value: record.maintenance },
            { key: 'admin', label: 'Life admin', value: record.admin }
        ].filter((item) => item.value && item.value.trim());

        if (!items.length) {
            dailyCommitmentsList.innerHTML = '<p class="system-empty">No commitments saved yet. Set your daily 3 above.</p>';
            return;
        }

        dailyCommitmentsList.innerHTML = items.map((item) => `
            <label class="commitment-item">
                <input type="checkbox" class="commitment-check" data-key="${item.key}" ${record.checks?.[item.key] ? 'checked' : ''}>
                <span class="commitment-pill">${item.label}</span>
                <span>${item.value}</span>
            </label>
        `).join('');
    };

    const renderRecoveryCard = () => {
        if (!recoveryPanel || !recoveryStepsEl) return;

        const todayKey = getDateKey();
        const yesterdayKey = getDateKey(addDays(new Date(), -1));
        const todayStatus = computeDayStatus(todayKey);
        const yesterdayStatus = computeDayStatus(yesterdayKey);
        const needsRecovery = ['missed', 'incomplete'].includes(yesterdayStatus.status)
            || (todayStatus.status === 'incomplete' && todayStatus.habitsDone < REQUIRED_HABITS_PER_DAY);

        recoveryPanel.hidden = !needsRecovery;
        if (!needsRecovery) return;

        const record = ensureRecoveryRecord(todayKey);
        const completedCount = Object.values(record.steps || {}).filter(Boolean).length;

        if (recoveryContextEl) {
            recoveryContextEl.textContent = `Yesterday was ${yesterdayStatus.status}. Run a small reset today and protect the streak.`;
        }

        recoveryStepsEl.innerHTML = `
            <label class="recovery-item">
                <input type="checkbox" class="recovery-check" data-step="minimum" ${record.steps.minimum ? 'checked' : ''}>
                <span>Do one minimum version habit (2-5 minutes)</span>
            </label>
            <label class="recovery-item">
                <input type="checkbox" class="recovery-check" data-step="environment" ${record.steps.environment ? 'checked' : ''}>
                <span>Reset your environment for the next action block</span>
            </label>
            <label class="recovery-item">
                <input type="checkbox" class="recovery-check" data-step="rebound" ${record.steps.rebound ? 'checked' : ''}>
                <span>Complete one rebound commitment from your Daily 3</span>
            </label>
        `;

        if (recoveryCompleteBtn) {
            recoveryCompleteBtn.textContent = completedCount === 3
                ? 'Recovery complete'
                : 'Mark recovery complete';
        }
    };

    const computeWeeklySummary = () => {
        let successfulDays = 0;
        let slipEvents = 0;
        let completedChecks = 0;

        for (let i = 0; i < 7; i++) {
            const date = addDays(new Date(), -i);
            const dateKey = getDateKey(date);
            const dayStatus = computeDayStatus(dateKey);
            if (dayStatus.successful) successfulDays++;

            const daySlips = slipEventsByDate[dateKey] || {};
            Object.values(daySlips).forEach((entry) => {
                if (typeof entry === 'number') {
                    slipEvents += Number(entry) || 0;
                } else {
                    slipEvents += Number(entry?.count) || 0;
                }
            });

            const checks = dailyHabitChecks[dateKey] || {};
            completedChecks += Object.values(checks).filter(Boolean).length;
        }

        const possibleChecks = Math.max(1, habits.length * 7);
        const completionRate = Math.round((completedChecks / possibleChecks) * 100);

        return { successfulDays, slipEvents, completionRate };
    };

    const renderWeeklyReset = () => {
        const weekKey = getWeekKey();
        const record = ensureWeeklyResetRecord(weekKey);
        const summary = computeWeeklySummary();

        if (weeklySuccessfulDaysEl) weeklySuccessfulDaysEl.textContent = String(summary.successfulDays);
        if (weeklySlipEventsEl) weeklySlipEventsEl.textContent = String(summary.slipEvents);
        if (weeklyCompletionRateEl) weeklyCompletionRateEl.textContent = `${summary.completionRate}%`;

        if (weeklyWinsInput) weeklyWinsInput.value = record.wins || '';
        if (weeklySlipsInput) weeklySlipsInput.value = record.slips || '';
        if (weeklySimplifyInput) weeklySimplifyInput.value = record.simplify || '';
        if (weeklyPriority1Input) weeklyPriority1Input.value = record.priorities?.[0] || '';
        if (weeklyPriority2Input) weeklyPriority2Input.value = record.priorities?.[1] || '';
        if (weeklyPriority3Input) weeklyPriority3Input.value = record.priorities?.[2] || '';
    };

    const updateBehaviorSystems = () => {
        renderDailyCommitments();
        renderRecoveryCard();
        renderWeeklyReset();
    };

    const renderDailyMomentum = () => {
        const totalHabits = habits.length;
        const completedHabits = habits.filter((habit) => habit.completed).length;
        const ratio = totalHabits ? completedHabits / totalHabits : 0;
        const percent = Math.round(ratio * 100);
        const circumference = 2 * Math.PI * 49;
        const offset = circumference * (1 - ratio);

        if (momentumRingProgressEl) {
            momentumRingProgressEl.style.strokeDasharray = `${circumference.toFixed(2)}`;
            momentumRingProgressEl.style.strokeDashoffset = `${offset.toFixed(2)}`;
        }

        if (todayProgressCaptionEl) {
            todayProgressCaptionEl.textContent = `${percent}%`;
        }

        if (todayProgressTextEl) {
            if (percent >= 80) {
                todayProgressTextEl.textContent = 'Strong day. Keep this cadence into the next phase.';
            } else if (percent >= 40) {
                todayProgressTextEl.textContent = 'Momentum is building. One more focused block can flip the day.';
            } else {
                todayProgressTextEl.textContent = 'Start with a low-friction win to create momentum quickly.';
            }
        }
    };

    const renderWeeklyRhythm = () => {
        const today = new Date();
        const points = [];
        const labels = [];

        for (let i = 6; i >= 0; i--) {
            const dayDate = addDays(today, -i);
            const dayKey = getDateKey(dayDate);
            const dayChecks = dailyHabitChecks[dayKey] || {};
            const completed = Object.values(dayChecks).filter(Boolean).length;
            const ratio = habits.length ? Math.min(1, completed / habits.length) : 0;
            points.push(ratio);
            labels.push(dayDate.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1));
        }

        const width = 240;
        const height = 90;
        const stepX = width / 6;

        const polylinePoints = points
            .map((value, index) => {
                const x = index * stepX;
                const y = height - (value * (height - 8)) - 4;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(' ');

        if (rhythmSparklinePolylineEl) {
            rhythmSparklinePolylineEl.setAttribute('points', polylinePoints);
        }

        if (rhythmSparklineLabelsEl) {
            rhythmSparklineLabelsEl.innerHTML = labels.map((label) => `<span>${label}</span>`).join('');
        }
    };

    const updateDashboardInsights = () => {
        renderDailyMomentum();
        renderWeeklyRhythm();
        updateBehaviorSystems();
    };

    const updatePhase = () => {
        ensureDailyStateCurrent();

        const now = new Date();
        const [wakeHours, wakeMinutes] = wakeUpTime.split(':').map(Number);

        const wakeUpDate = new Date();
        wakeUpDate.setHours(wakeHours, wakeMinutes, 0, 0);

        const hoursSinceWakeRaw = (now - wakeUpDate) / (1000 * 60 * 60);
        const hoursSinceWake = ((hoursSinceWakeRaw % 24) + 24) % 24;

        let currentPhase = 0;
        let phaseName = '';
        let explanation = '';

        if (hoursSinceWake >= 0 && hoursSinceWake < 8) {
            currentPhase = 1;
            phaseName = 'Phase 1: Action';
            explanation = '0-8 hours after waking. Best window for high-friction actions and effortful habits.';
        } else if (hoursSinceWake >= 8 && hoursSinceWake < 16) {
            currentPhase = 2;
            phaseName = 'Phase 2: Creative';
            explanation = '8-16 hours after waking. Better for learning, creativity, and moderate friction habits.';
        } else {
            currentPhase = 3;
            phaseName = 'Phase 3: Wind Down';
            explanation = '16-24 hours after waking. Wind down, reduce stimulation, and prioritize sleep routines.';
        }

        const dialRotation = (hoursSinceWake / 24) * 360;
        const phaseRange = getPhaseWindowTimeRange(wakeUpDate, currentPhase);

        phaseHand.style.transform = `rotate(${dialRotation}deg)`;
        phaseText.textContent = phaseName;
        phaseHoursSince.textContent = `${hoursSinceWake.toFixed(1)}h since wake (${wakeUpTime})`;
        phaseWindowLabel.textContent = `Window: ${phaseRange}`;
        phaseExplanation.textContent = explanation;

        [legendPhase1, legendPhase2, legendPhase3].forEach((chip) => chip?.classList.remove('active'));
        if (currentPhase === 1) legendPhase1?.classList.add('active');
        if (currentPhase === 2) legendPhase2?.classList.add('active');
        if (currentPhase === 3) legendPhase3?.classList.add('active');

        renderHabits(currentPhase);
        updateDashboardInsights();
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
        const visibleHabits = shouldHideCompletedInGrid()
            ? list.filter((habit) => !habit.completed)
            : list;

        if (!visibleHabits.length) {
            gridEl.innerHTML = shouldHideCompletedInGrid()
                ? '<p>All habits completed in this phase.</p>'
                : '<p>No habits in this phase yet.</p>';
            return;
        }

        visibleHabits.forEach((habit) => gridEl.appendChild(createHabitCard(habit)));
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
            const day = challengeDataByDate[dateKey] || { successful: false, habitsDone: 0, status: 'pending' };
            const cell = document.createElement('div');
            cell.className = 'day-cell';
            if (index > todayIndex && todayIndex !== -1) {
                cell.classList.add('future');
            } else {
                cell.classList.add(day.status || (day.successful ? 'successful' : 'incomplete'));
            }
            if (index === todayIndex) cell.classList.add('current-day');
            const title = day.status ? `${day.status} (${day.habitsDone || 0}/${REQUIRED_HABITS_PER_DAY})` : 'No data';
            cell.title = `Day ${index + 1}: ${title}`;
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
        const todayStatus = computeDayStatus(todayKey);
        const streaks = computeStreaks();

        completedCountEl.textContent = `${completedHabits} / ${totalHabits}`;
        if (todayStatus.status === 'successful') {
            challengeStatusEl.textContent = 'Successful day';
        } else if (todayStatus.status === 'incomplete') {
            challengeStatusEl.textContent = `Logged ${todayStatus.habitsDone}/${REQUIRED_HABITS_PER_DAY}`;
        } else if (todayStatus.status === 'pending') {
            challengeStatusEl.textContent = 'No logs yet';
        } else {
            challengeStatusEl.textContent = 'Missed logging';
        }
        streakCountEl.textContent = `${streaks.current} ${streaks.current === 1 ? 'day' : 'days'}`;
        bestStreakCountEl.textContent = `${streaks.best} ${streaks.best === 1 ? 'day' : 'days'}`;

        if (currentPhase === 1) phaseWindowSummaryEl.textContent = 'Action window';
        if (currentPhase === 2) phaseWindowSummaryEl.textContent = 'Creative window';
        if (currentPhase === 3) phaseWindowSummaryEl.textContent = 'Wind-down window';
    };

    const updateChallengeProgress = () => {
        reconcileChallengeData();
        const todayIndex = getTodayIndexInChallenge();
        const completedHabits = habits.filter((h) => h.completed).length;

        if (todayIndex === -1) {
            renderChallengeGrid();
            return;
        }

        const challengeStart = dateKeyToDate(challengeStartDate);
        const todayDate = addDays(challengeStart, todayIndex);
        const todayKey = getDateKey(todayDate);

        const dayStatus = completedHabits >= REQUIRED_HABITS_PER_DAY ? 'successful' : (completedHabits > 0 ? 'incomplete' : 'pending');

        challengeDataByDate[todayKey] = {
            successful: completedHabits >= REQUIRED_HABITS_PER_DAY,
            habitsDone: completedHabits,
            status: dayStatus
        };

        renderChallengeGrid();
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

    slipTriggerInput?.addEventListener('change', () => {
        updateReplacementHabitSuggestion();
    });

    hideCompletedMobileInput?.addEventListener('change', (e) => {
        hideCompletedMobile = Boolean(e.target.checked);
        saveData();
        updatePhase();
    });

    resetTodayBtn?.addEventListener('click', () => {
        const todayKey = getDateKey();
        dailyHabitChecks[todayKey] = {};
        habits.forEach((habit) => {
            habit.completed = false;
        });
        updateChallengeProgress();
        saveData();
        updatePhase();
    });

    dailyCommitmentsForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const todayKey = getDateKey();
        const record = ensureDailyCommitmentsRecord(todayKey);

        record.mustDo = (commitmentMustInput?.value || '').trim();
        record.maintenance = (commitmentMaintenanceInput?.value || '').trim();
        record.admin = (commitmentAdminInput?.value || '').trim();
        record.checks = record.checks || { mustDo: false, maintenance: false, admin: false };

        saveData();
        updateBehaviorSystems();
    });

    dailyCommitmentsList?.addEventListener('change', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (!target.classList.contains('commitment-check')) return;

        const key = target.dataset.key;
        if (!key) return;

        const record = ensureDailyCommitmentsRecord(getDateKey());
        record.checks = record.checks || { mustDo: false, maintenance: false, admin: false };
        record.checks[key] = target.checked;
        saveData();
    });

    recoveryStepsEl?.addEventListener('change', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (!target.classList.contains('recovery-check')) return;

        const step = target.dataset.step;
        if (!step) return;

        const record = ensureRecoveryRecord(getDateKey());
        record.steps[step] = target.checked;
        saveData();
        renderRecoveryCard();
    });

    recoveryCompleteBtn?.addEventListener('click', () => {
        const record = ensureRecoveryRecord(getDateKey());
        record.completedAt = new Date().toISOString();
        saveData();
        renderRecoveryCard();
    });

    weeklyResetForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const weekKey = getWeekKey();
        const record = ensureWeeklyResetRecord(weekKey);

        record.wins = (weeklyWinsInput?.value || '').trim();
        record.slips = (weeklySlipsInput?.value || '').trim();
        record.simplify = (weeklySimplifyInput?.value || '').trim();
        record.priorities = [
            (weeklyPriority1Input?.value || '').trim(),
            (weeklyPriority2Input?.value || '').trim(),
            (weeklyPriority3Input?.value || '').trim()
        ];
        record.updatedAt = new Date().toISOString();

        saveData();
        renderWeeklyReset();
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
            const habitId = target.dataset.id;
            pendingSlipHabitId = habitId || null;
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

    const stopPomodoroTicker = () => {
        clearInterval(pomodoroInterval);
        pomodoroInterval = null;
    };

    const tickPomodoro = () => {
        syncPomodoroFromState();
        updatePomodoroDisplay();

        if (pomodoroTime <= 0) {
            stopPomodoroTicker();
            pomodoroEndAt = null;
            saveData();
            alert('Pomodoro session finished!');
        }
    };

    const startPomodoro = () => {
        if (pomodoroTime <= 0) {
            pomodoroTime = pomodoroDurationMinutes * 60;
        }

        pomodoroEndAt = Date.now() + pomodoroTime * 1000;
        stopPomodoroTicker();
        pomodoroInterval = setInterval(tickPomodoro, 1000);
        tickPomodoro();
        saveData();
    };

    const resetPomodoro = () => {
        stopPomodoroTicker();
        pomodoroEndAt = null;
        pomodoroTime = pomodoroDurationMinutes * 60;
        updatePomodoroDisplay();
        saveData();
    };

    pomodoroDurationInput?.addEventListener('change', (e) => {
        const parsed = Math.min(120, Math.max(5, Number(e.target.value) || 25));
        pomodoroDurationMinutes = parsed;
        pomodoroDurationInput.value = String(parsed);
        resetPomodoro();
    });

    startPomodoroBtn.addEventListener('click', startPomodoro);
    resetPomodoroBtn.addEventListener('click', resetPomodoro);
    closeModalBtn.addEventListener('click', () => {
        pomodoroModal.style.display = 'none';
    });

    replacementDoneBtn.addEventListener('click', () => {
        const triggerKey = slipTriggerInput?.value || 'other';
        recordSlipEvent(pendingSlipHabitId, triggerKey);
        pendingSlipHabitId = null;
        saveData();
        replacementModal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === pomodoroModal) pomodoroModal.style.display = 'none';
        if (e.target === replacementModal) replacementModal.style.display = 'none';
    });

    window.addEventListener('focus', () => {
        tickPomodoro();
        void hydrateFromCloud(true);
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            tickPomodoro();
            void hydrateFromCloud(true);
        }
    });

    window.addEventListener('resize', () => {
        updatePhase();
    });

    // --- Initialization ---
    const init = async () => {
        await loadData();
        applyHabitPresetMigration();
        ensureSlipModel();
        ensureChallengeWindow();
        ensureHabitIds();
        syncTodayHabitCompletion();
        syncPomodoroFromState();
        activeDateKey = getDateKey();
        updateReplacementHabitSuggestion();
        updateChallengeProgress();
        updatePhase();
        renderChallengeGrid();
        updatePomodoroDisplay();

        if (pomodoroEndAt) {
            stopPomodoroTicker();
            pomodoroInterval = setInterval(tickPomodoro, 1000);
        }

        saveData();
        setInterval(() => {
            tickPomodoro();
            updatePhase();
        }, 60000);
        setInterval(() => {
            void hydrateFromCloud(true);
        }, CLOUD_POLL_INTERVAL_MS);
    };

    void init();
});
