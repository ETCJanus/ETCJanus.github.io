document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const wakeUpTimeInput = document.getElementById('wake-up-time');
    const phaseBar = document.getElementById('phase-bar');
    const phaseText = document.getElementById('phase-text');
    const phaseExplanation = document.getElementById('phase-explanation');
    const habitsContainer = document.getElementById('habits-container');
    const breakHabitsContainer = document.getElementById('break-habits-container');
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
    const pomodoroInlineTimerEl = document.getElementById('pomodoro-inline-timer');
    const pomodoroInlineStartBtn = document.getElementById('pomodoro-inline-start');
    const pomodoroInlinePauseBtn = document.getElementById('pomodoro-inline-pause');
    const pomodoroInlineResetBtn = document.getElementById('pomodoro-inline-reset');


    // --- State & Config ---
    let wakeUpTime = '07:00';
    let habits = [
        { id: 'cold-shower', name: 'Cold Shower', phase: 1, friction: 'high', completed: false },
        { id: 'study', name: 'Study Work (Deep Focus)', phase: 1, friction: 'high', completed: false, pomodoro: true },
        { id: 'running', name: 'Running', phase: 1, friction: 'low', completed: false, linchpin: true },
        { id: 'reading', name: 'Reading', phase: 2, friction: 'low', completed: false },
        { id: 'light-reading', name: 'Light Reading', phase: 2, friction: 'low', completed: false },
        { id: 'meditation', name: 'Meditation/NSDR', phase: 2, friction: 'low', completed: false },
    ];
    let habitsToBreak = [
        { id: 'smoking', name: 'Smoking/Weed', slipped: false }
    ];
    let challengeStartDate = '';
    let challengeDataByDate = {};
    let dailyHabitChecks = {};

    let pomodoroInterval;
    let pomodoroTime = 25 * 60;

    const REQUIRED_HABITS_PER_DAY = 4;

    // --- Local Storage ---
    const saveData = () => {
        const data = {
            wakeUpTime,
            habits,
            habitsToBreak,
            challengeStartDate,
            challengeDataByDate,
            dailyHabitChecks
        };
        localStorage.setItem('habitTrackerData', JSON.stringify(data));
    };

    const loadData = () => {
        const rawData = localStorage.getItem('habitTrackerData');
        if (!rawData) return;

        const data = JSON.parse(rawData);
        if (data) {
            wakeUpTime = data.wakeUpTime || '07:00';
            habits = data.habits || habits;
            habitsToBreak = data.habitsToBreak || habitsToBreak;
            challengeStartDate = data.challengeStartDate || challengeStartDate;
            challengeDataByDate = data.challengeDataByDate || {};
            dailyHabitChecks = data.dailyHabitChecks || {};
            wakeUpTimeInput.value = wakeUpTime;
        }
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
        const today = new Date();
        const dayDiff = diffInDays(startDate, today);

        return dayDiff >= 0 && dayDiff < 21 ? dayDiff : -1;
    };

    const ensureChallengeWindow = () => {
        if (!challengeStartDate) {
            challengeStartDate = getDateKey();
        }
    };

    const syncTodayHabitCompletion = () => {
        const todayKey = getDateKey();
        const todayChecks = dailyHabitChecks[todayKey] || {};

        habits.forEach((habit) => {
            habit.completed = Boolean(todayChecks[habit.id]);
        });
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

    const computeStreaks = () => {
        if (!challengeStartDate) {
            return { current: 0, best: 0 };
        }

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
            explanation = 'Peak norepinephrine and dopamine. Ideal for tackling high-friction habits that require motivation and focus.';
        } else if (hoursSinceWake > 8 && hoursSinceWake <= 14) {
            currentPhase = 2;
            phaseName = 'Phase 2: Creative';
            explanation = 'Higher serotonin levels. Good for learning, creativity, and lower-friction habits.';
        } else {
            currentPhase = 3;
            phaseName = 'Phase 3: Wind Down';
            explanation = 'Time for rest and recovery. No demanding habits. Prepare for sleep.';
        }
        
        const totalDayHours = 24;
        const progress = (hoursSinceWake / totalDayHours) * 100;

        phaseBar.style.width = `${Math.min(Math.max(progress, 0), 100)}%`;
        phaseText.textContent = phaseName;
        phaseExplanation.textContent = explanation;

        renderHabits(currentPhase);
    };

    // --- Render Functions ---
    const renderHabits = (currentPhase) => {
        habitsContainer.innerHTML = '';
        breakHabitsContainer.innerHTML = '';

        const phase1Habits = habits.filter(h => h.phase === 1);
        const phase2Habits = habits.filter(h => h.phase === 2);

        habitsContainer.appendChild(createHabitGroup('Phase 1 Habits', phase1Habits, currentPhase === 1));
        habitsContainer.appendChild(createHabitGroup('Phase 2 Habits', phase2Habits, currentPhase === 2));
        
        renderBreakHabits();
        updateDailyOverview(currentPhase);
        renderHabitManager();
    };

    const createHabitGroup = (title, habitList, isCurrentPhase) => {
        const group = document.createElement('div');
        group.className = 'habit-group';
        group.innerHTML = `<h2>${title}${isCurrentPhase ? ' <span class="phase-pill">Current</span>' : ''}</h2>`;
        
        const grid = document.createElement('div');
        grid.className = 'habits-grid';

        if (habitList.length === 0) {
            grid.innerHTML = `<p>No habits for this phase.</p>`;
        } else {
            habitList.forEach(habit => {
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
                grid.appendChild(card);
            });
        }
        group.appendChild(grid);
        return group;
    };

    const renderBreakHabits = () => {
        const group = document.createElement('div');
        group.className = 'habit-group break-group';
        group.innerHTML = `<h2>Habits to Break</h2>`;
        
        const grid = document.createElement('div');
        grid.className = 'habits-grid';

        habitsToBreak.forEach(habit => {
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
            grid.appendChild(card);
        });
        group.appendChild(grid);
        breakHabitsContainer.appendChild(group);
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

        if (habits.length === 0) {
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
        if (!completedCountEl || !challengeStatusEl || !phaseWindowEl) return;

        const completedHabits = habits.filter(h => h.completed).length;
        const totalHabits = habits.length;
        const todayKey = getDateKey();
        const todayStatus = challengeDataByDate[todayKey];
        const streaks = computeStreaks();

        completedCountEl.textContent = `${completedHabits} / ${totalHabits}`;
        challengeStatusEl.textContent = todayStatus?.successful ? 'Successful day' : 'Not complete';

        if (streakCountEl) {
            streakCountEl.textContent = `${streaks.current} ${streaks.current === 1 ? 'day' : 'days'}`;
        }

        if (bestStreakCountEl) {
            bestStreakCountEl.textContent = `${streaks.best} ${streaks.best === 1 ? 'day' : 'days'}`;
        }

        if (currentPhase === 1) {
            phaseWindowEl.textContent = 'Action window';
        } else if (currentPhase === 2) {
            phaseWindowEl.textContent = 'Creative window';
        } else {
            phaseWindowEl.textContent = 'Wind-down window';
        }
    };

    // --- Event Handlers ---
    wakeUpTimeInput.addEventListener('change', (e) => {
        wakeUpTime = e.target.value;
        saveData();
        updatePhase();
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

    habitsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('toggle-habit')) {
            const habitId = e.target.dataset.id;
            const habit = habits.find(h => h.id === habitId);
            if (habit) {
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
            }
        }
        if (e.target.classList.contains('start-pomodoro')) {
            pomodoroModal.style.display = 'block';
        }
    });

    breakHabitsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('slipped-btn')) {
            replacementModal.style.display = 'block';
        }
    });

    const updateChallengeProgress = () => {
        const todayIndex = getTodayIndexInChallenge();
        const completedHabits = habits.filter(h => h.completed).length;

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

    // --- Pomodoro Logic ---
    const updatePomodoroDisplay = () => {
        const minutes = Math.floor(pomodoroTime / 60).toString().padStart(2, '0');
        const seconds = (pomodoroTime % 60).toString().padStart(2, '0');
        const value = `${minutes}:${seconds}`;

        if (pomodoroTimerEl) pomodoroTimerEl.textContent = value;
        if (pomodoroInlineTimerEl) pomodoroInlineTimerEl.textContent = value;
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

    const pausePomodoro = () => {
        clearInterval(pomodoroInterval);
    };

    const resetPomodoro = () => {
        clearInterval(pomodoroInterval);
        pomodoroTime = 25 * 60;
        updatePomodoroDisplay();
    };

    startPomodoroBtn.addEventListener('click', startPomodoro);
    resetPomodoroBtn.addEventListener('click', resetPomodoro);
    pomodoroInlineStartBtn?.addEventListener('click', startPomodoro);
    pomodoroInlinePauseBtn?.addEventListener('click', pausePomodoro);
    pomodoroInlineResetBtn?.addEventListener('click', resetPomodoro);
    closeModalBtn.addEventListener('click', () => pomodoroModal.style.display = 'none');
    replacementDoneBtn.addEventListener('click', () => replacementModal.style.display = 'none');
    window.addEventListener('click', (e) => {
        if (e.target == pomodoroModal) pomodoroModal.style.display = 'none';
        if (e.target == replacementModal) replacementModal.style.display = 'none';
    });


    // --- Initialization ---
    const init = () => {
        loadData();
        ensureChallengeWindow();
        ensureHabitIds();
        syncTodayHabitCompletion();
        updateChallengeProgress();
        updatePhase();
        renderChallengeGrid();
        updatePomodoroDisplay();
        saveData();
        setInterval(updatePhase, 60000); // Update every minute
    };

    init();
});
