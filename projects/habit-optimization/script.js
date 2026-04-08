document.addEventListener('DOMContentLoaded', () => {

    /* --- DOM Elements --- */
    const authView = document.getElementById('auth-view');
    const appView = document.getElementById('app-view');
    const passcodeInput = document.getElementById('passcode-input');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const logoutBtnNav = document.getElementById('logout-btn-nav');
    const loginError = document.getElementById('login-error');
    
    const gridContainer = document.getElementById('grid-container');
    const dayModal = document.getElementById('day-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const modalDate = document.getElementById('modal-date');
    const modalHabits = document.getElementById('modal-habits');
    const modalNote = document.getElementById('modal-note');

    const sleepInputsContainer = document.getElementById('sleep-inputs-container');
    const sleepStartInput = document.getElementById('sleep-start');
    const sleepEndInput = document.getElementById('sleep-end');
    const minSleepBtn = document.getElementById('min-sleep-btn');
    const minSleepDisplay = document.getElementById('min-sleep-display');
    const moodInputsContainer = document.getElementById('mood-inputs-container');
    const moodInput = document.getElementById('mood-input');
    const minMoodBtn = document.getElementById('min-mood-btn');
    const minMoodDisplay = document.getElementById('min-mood-display');
    const expandedMetricsRow = document.getElementById('expanded-metrics-row');
    const compactMetrics = document.getElementById('compact-metrics');

    /* --- Utils --- */
    const calculateSleepHours = (start, end) => {
        if (!start || !end) return null;
        let [h1, m1] = start.split(':').map(Number);
        let [h2, m2] = end.split(':').map(Number);
        let d1 = new Date(2000, 0, 1, h1, m1);
        let d2 = new Date(2000, 0, h1 > h2 || (h1 === h2 && m1 > m2) ? 2 : 1, h2, m2);
        let diff = (d2 - d1) / (1000 * 60 * 60);
        return Math.round(diff * 10) / 10 + ' hrs';
    };

    /* --- App State --- */
    let client = null;
    let passcode = localStorage.getItem('habit_passcode') || '';
    let config = { url: '', key: '', tableHabits: 'habits', tableLogs: 'habit_logs' };

    let habitsCache = [];
    let logsCache = {};
    let selectedDate = null;

    /* --- Helpers --- */
    const formatDate = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
    };

    const getHabitName = (name) => {
        if (localStorage.getItem('habit_stealth_mode') === 'true') {
            return name.replace(/weed/gi, 'phone usage');
        }
        return name;
    };

    const parseMonthString = (str) => {
        const [y, m] = str.split('-');
        return { year: parseInt(y), month: parseInt(m) - 1 };
    };

    /* --- Initialization --- */
    const init = () => {
        config.url = window.HABIT_SUPABASE_URL || '';
        config.key = window.HABIT_SUPABASE_ANON_KEY || '';
        
        if (!config.url || !config.key) {
            if(loginError) {
                loginError.textContent = "Supabase config missing";
                loginError.classList.remove('hidden');
            }
            return;
        }
        
        client = window.supabase.createClient(config.url, config.key);
        
        if (passcode) {
            attemptLogin(passcode);
        } else {
            showLogin();
        }
    };

    /* --- Auth Flow --- */
    const showLogin = () => {
        authView.classList.remove('hidden');
        appView.classList.add('hidden');
        localStorage.removeItem('habit_passcode');
        passcode = '';
    };

    const attemptLogin = async (code) => {
        if (!code) return;
        loginError.classList.add('hidden');
        try {
            const { data, error } = await client
                .from(config.tableHabits)
                .select('id')
                .eq('passcode_key', code)
                .limit(1);

            if (error) throw error;

            passcode = code;
            localStorage.setItem('habit_passcode', code);
            
            authView.classList.add('hidden');
            appView.classList.remove('hidden');
            
            await loadData();

            // Realtime Sync setup
            client.channel('public:habit_logs')
                .on('postgres_changes', { event: '*', schema: 'public', table: config.tableLogs }, payload => {
                    // Only auto-refresh if the day modal is NOT currently open and actively being edited
                    if (dayModal.classList.contains('hidden')) {
                        loadData();
                    }
                })
                .subscribe();

        } catch (e) {
            console.error('Login Failed', e);
            loginError.textContent = "Incorrect passcode.";
            loginError.classList.remove('hidden');
            showLogin();
        }
    };

    if(loginBtn) loginBtn.addEventListener('click', () => attemptLogin(passcodeInput.value.trim()));
    if(passcodeInput) passcodeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            attemptLogin(passcodeInput.value.trim());
        }
    });

    const handleLogout = () => showLogin();
    if(logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if(logoutBtnNav) logoutBtnNav.addEventListener('click', handleLogout);

    /* --- Core Data Loading --- */
    const loadData = async () => {
        try {
            const startRangeStr = localStorage.getItem('habit_grid_start') || '2026-04';
            const s = parseMonthString(startRangeStr);
            const activeRangeStart = formatDate(new Date(s.year, s.month, 1));

            const { data: habitsData, error: hError } = await client
                .from(config.tableHabits)
                .select('*')
                .eq('passcode_key', passcode)
                .eq('archived', false)
                .order('sort_order', { ascending: true });
            
            if (hError) throw hError;
            habitsCache = habitsData || [];

            const { data: logsData, error: lError } = await client
                .from(config.tableLogs)
                .select('*')
                .eq('passcode_key', passcode)
                .gte('log_date', activeRangeStart);

            if (lError) throw lError;
            
            logsCache = {};
            (logsData || []).forEach(log => {
                if (!logsCache[log.log_date]) logsCache[log.log_date] = [];
                logsCache[log.log_date].push(log);
            });

            renderGrid();
        } catch (e) {
            console.error('Load Data Error:', e);
            alert('Failed to load dashboard data:\n' + (e.message || JSON.stringify(e)));
        }
    };

    /* --- Rendering --- */
    const renderGrid = () => {
        gridContainer.innerHTML = '';          const todayStr = formatDate(new Date());
        const startRangeStr = localStorage.getItem('habit_grid_start') || '2026-04';
        const endRangeStr = localStorage.getItem('habit_grid_end') || '2027-03';
        
        const s = parseMonthString(startRangeStr);
        const e = parseMonthString(endRangeStr);
        
        const activeRangeStart = formatDate(new Date(s.year, s.month, 1));
        
        let months = [];
        let currY = s.year;
        let currM = s.month;
        
        while (currY < e.year || (currY === e.year && currM <= e.month)) {
            months.push({ year: currY, month: currM });
            currM++;
            if (currM > 11) {
                currM = 0;
                currY++;
            }
        }

        months.forEach(m => {
            const monthWrapper = document.createElement('div');
            monthWrapper.className = 'w-full';

            const monthTitle = document.createElement('h3');
            const monthName = new Date(m.year, m.month, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
            monthTitle.className = 'text-gray-400 font-light tracking-widest uppercase text-sm mb-4 ml-1';
            monthTitle.textContent = monthName;
            monthWrapper.appendChild(monthTitle);

            const grid = document.createElement('div');
            grid.className = 'month-grid';

            const dayNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
            dayNames.forEach(day => {
                const header = document.createElement('div');
                header.className = 'text-center text-xs text-gray-500 font-bold pb-2';
                header.textContent = day;
                grid.appendChild(header);
            });

            const firstDayOffset = (new Date(m.year, m.month, 1).getDay() + 6) % 7; 
            const daysInMonth = new Date(m.year, m.month + 1, 0).getDate();

            for (let i = 0; i < firstDayOffset; i++) {
                const empty = document.createElement('div');
                grid.appendChild(empty);
            }

            for (let d = 1; d <= daysInMonth; d++) {
                const cellDate = new Date(m.year, m.month, d, 12, 0, 0);
                const dateKey = formatDate(cellDate);
                
                const cell = document.createElement('div');
                
                // Past start date, not in future
                if (dateKey < activeRangeStart || dateKey > todayStr) {
                    cell.className = 'day-cell inactive';
                    cell.title = new Date(dateKey + 'T12:00:00').toLocaleDateString();
                } else {
                    const dayLogs = logsCache[dateKey] || [];
                    const progressLogs = dayLogs.filter(l => l.event_type === 'progress');
                    const noteLog = dayLogs.find(l => l.event_type === 'note' && !l.habit_id);
                    const sleepLog = dayLogs.find(l => l.event_type === 'sleep' && !l.habit_id);
                    const moodLog = dayLogs.find(l => l.event_type === 'mood' && !l.habit_id);

                    let activeHabits = habitsCache.filter(h => h.created_at && h.created_at.substring(0, 10) <= dateKey);

                    let score = 0;
                    let isShiny = false;
                    const dayHasLogs = progressLogs.length > 0 || sleepLog || noteLog || moodLog;

                    if (activeHabits.length > 0) {
                        let successes = 0;
                        
                        activeHabits.forEach(h => {
                            const l = progressLogs.find(x => x.habit_id === h.id);
                            const amount = l ? l.current_amount : 0;
                            
                            // Good Habit (target 1) -> Success if amount >= 1
                            if (h.target_amount == 1) {
                                if (amount >= 1) successes++;
                            }
                            // Shiny target (-2) -> Success if checked     
                            else if (h.target_amount == -2) {
                                if (amount >= 1) {
                                    successes++;
                                    isShiny = true;
                                }
                            }
                        });
                        
                        if (successes === activeHabits.length && activeHabits.length > 0) {
                            isShiny = true;
                        }
                        
                        const percentage = successes / activeHabits.length;
                        if (percentage > 0) score = 1;
                        if (percentage > 0.3) score = 2;
                        if (percentage > 0.6) score = 3;
                        if (percentage >= 0.9) score = 4;
                    } else if (progressLogs.length > 0) {
                        score = 2; // Legacy fallback
                    }

                    let classes = 'day-cell active level-' + score;
                    if (isShiny) classes += ' shiny-day';
                    cell.className = classes;
                    
                    // Setup Glanceable Grid Tooltip
                    const displayDate = new Date(dateKey + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                    
                    cell.addEventListener('mouseenter', (e) => {
                        // Disable tooltip on mobile / touch devices
                        if (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768) return;

                        const tooltip = document.getElementById('grid-tooltip');
                        if (!tooltip) return;
                        
                        document.getElementById('tooltip-date').innerText = displayDate;
                        
                        const noteDiv = document.getElementById('tooltip-note');
                        if (noteLog && noteLog.metadata && noteLog.metadata.text) {
                            noteDiv.innerText = '"' + noteLog.metadata.text + '"';
                            noteDiv.classList.remove('hidden');
                        } else {
                            noteDiv.classList.add('hidden');
                        }

                        const metricsDiv = document.getElementById('tooltip-metrics');
                        metricsDiv.innerHTML = '';
                        
                        if (moodLog && moodLog.metadata && moodLog.metadata.level) {
                            metricsDiv.innerHTML += `<span>🎭 ${moodLog.metadata.level}/10</span>`;
                        }
                        if (sleepLog && sleepLog.metadata && sleepLog.metadata.start && sleepLog.metadata.end) {
                            const hours = calculateSleepHours(sleepLog.metadata.start, sleepLog.metadata.end);
                            metricsDiv.innerHTML += `<span>💤 ${hours}</span>`;
                        }
                        
                        if (metricsDiv.innerHTML === '') {
                            metricsDiv.innerHTML = '<span class="opacity-50 italic">No extra metrics logged</span>';
                        }
                        
                        tooltip.classList.remove('hidden');
                        
                        // Positioning
                        const rect = cell.getBoundingClientRect();
                        
                        let top = rect.top - tooltip.offsetHeight - 10;
                        let left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2);
                        
                        // Prevent spilling off screen
                        if (left < 10) left = 10;
                        if (top < 10) top = rect.bottom + 10; // Show below if no room above
                        
                        tooltip.style.top = top + 'px';
                        tooltip.style.left = left + 'px';
                    });
                    
                    cell.addEventListener('mouseleave', () => {
                        const tooltip = document.getElementById('grid-tooltip');
                        if (tooltip) tooltip.classList.add('hidden');
                    });

                    cell.addEventListener('click', () => openDayModal(dateKey));

                    // Add dots inside cell if missing
                    if (!sleepLog) {
                        const sleepDot = document.createElement('span');
                        sleepDot.className = 'indicator-missing-sleep';
                        sleepDot.title = 'Missing Sleep Log';
                        cell.appendChild(sleepDot);
                    } else if (sleepLog.metadata && sleepLog.metadata.start && sleepLog.metadata.end) {
                        const [sh, sm] = sleepLog.metadata.start.split(':').map(Number);
                        const [eh, em] = sleepLog.metadata.end.split(':').map(Number);

                        let sDec = sh + (sm / 60);
                        let eDec = eh + (em / 60);

                        let dur = eDec - sDec;
                        if (dur < 0) dur += 24;

                        if (sDec < 12) sDec += 24; 
                        let shiftEnd = sDec + dur;

                        let durScore = 40 - (Math.abs(8 - dur) * 10);
                        if (durScore < 0) durScore = 0;

                        let bedScore = 30;
                        if (sDec > 24) bedScore -= (sDec - 24) * 10;
                        if (bedScore < 0) bedScore = 0;

                        let wakeScore = 30;
                        if (shiftEnd > 34) wakeScore -= (shiftEnd - 34) * 10;
                        if (wakeScore < 0) wakeScore = 0;

                        let totalSleepScore = Math.round(durScore + bedScore + wakeScore);
                        
                        const sleepScoreEl = document.createElement('div');
                        let colorCls = 'text-[#39d353]'; // Great
                        if (totalSleepScore < 80) colorCls = 'text-[#58a6ff]'; // Good
                        if (totalSleepScore < 60) colorCls = 'text-[#d2a8ff]'; // Okay
                        if (totalSleepScore < 40) colorCls = 'text-[#f78166]'; // Bad
                        
                        sleepScoreEl.className = `absolute top-[2px] right-[4px] text-[9px] md:text-[10px] font-bold ${colorCls} pointer-events-none drop-shadow-[0_1px_1px_rgba(0,0,0,1)] z-10 opacity-90`;
                        sleepScoreEl.textContent = totalSleepScore;
                        sleepScoreEl.title = 'Sleep Score: ' + totalSleepScore;
                        cell.appendChild(sleepScoreEl);
                    }
                    
                    if (moodLog && moodLog.metadata && moodLog.metadata.level) {
                        const moodEl = document.createElement('div');
                        moodEl.className = 'absolute top-[2px] left-[3px] text-[8px] md:text-[9px] font-bold text-yellow-400 pointer-events-none drop-shadow-[0_1px_1px_rgba(0,0,0,1)] z-10 opacity-90';
                        moodEl.textContent = moodLog.metadata.level;
                        moodEl.title = 'Mood: ' + moodLog.metadata.level;
                        cell.appendChild(moodEl);
                    }

                    if (!noteLog) {
                        const noteDot = document.createElement('span');
                        noteDot.className = 'indicator-missing-note';
                        noteDot.title = 'Missing Note Log';
                        cell.appendChild(noteDot);
                    }
                }
                
                grid.appendChild(cell);
            }

            monthWrapper.appendChild(grid);
            gridContainer.appendChild(monthWrapper);
        });
    };

    /* --- Mood Selection Logic --- */
    // Logic moved to input interactions

    /* --- Modal Management --- */
    const openDayModal = (dateKey) => {
        selectedDate = dateKey;
        const niceDateStr = new Date(dateKey + 'T12:00:00').toLocaleDateString(undefined, { 
            weekday: 'long', month: 'short', day: 'numeric', year: 'numeric'
        });
        modalDate.textContent = niceDateStr;

        const dayLogs = logsCache[dateKey] || [];
        const progressLogs = dayLogs.filter(l => l.event_type === 'progress');
        const noteLog = dayLogs.find(l => l.event_type === 'note' && !l.habit_id);
        const sleepLog = dayLogs.find(l => l.event_type === 'sleep' && !l.habit_id);
        const moodLog = dayLogs.find(l => l.event_type === 'mood' && !l.habit_id);
        
// Reset Mood
        moodInput.value = '';
        let hasMood = false;
        if (moodLog && moodLog.metadata && moodLog.metadata.level) {
            moodInput.value = moodLog.metadata.level;
            minMoodDisplay.innerText = moodLog.metadata.level + '/10';
            hasMood = true;
        }

        // Populate Note
        modalNote.value = noteLog && noteLog.metadata ? noteLog.metadata.text || '' : '';
        const notePreview = document.getElementById('note-preview');
        const noteEditorWrapper = document.getElementById('note-editor-wrapper');
        const noteChevron = document.getElementById('note-chevron');
        if (modalNote.value.trim().length > 0) {
            notePreview.classList.add('text-white');
            notePreview.classList.remove('text-gray-500');
            notePreview.innerText = modalNote.value.substring(0, 30) + (modalNote.value.length > 30 ? '...' : '');
        } else {
            notePreview.classList.add('text-gray-500');
            notePreview.classList.remove('text-white');
            notePreview.innerText = 'Add a journal note...';
        }
        noteEditorWrapper.classList.add('hidden');
        noteChevron.classList.remove('rotate-180');

        // Populate Sleep
        sleepStartInput.value = '';
        sleepEndInput.value = '';
        let hasSleep = false;
        if (sleepLog && sleepLog.metadata && sleepLog.metadata.start && sleepLog.metadata.end) {
            sleepStartInput.value = sleepLog.metadata.start;
            sleepEndInput.value = sleepLog.metadata.end;
            minSleepDisplay.innerText = calculateSleepHours(sleepLog.metadata.start, sleepLog.metadata.end);
            hasSleep = true;
        }

        if (hasSleep || hasMood) {
            expandedMetricsRow.classList.add('hidden');
            compactMetrics.classList.remove('hidden');
            minSleepBtn.classList.toggle('hidden', !hasSleep);
            minMoodBtn.classList.toggle('hidden', !hasMood);
        } else {
            expandedMetricsRow.classList.remove('hidden');
            compactMetrics.classList.add('hidden');
        }

        modalHabits.innerHTML = '';
        
        let activeHabits = habitsCache.filter(h => h.created_at && h.created_at.substring(0, 10) <= dateKey);

        if (activeHabits.length === 0) {
            modalHabits.innerHTML = '<p class="text-sm text-gray-600 italic">No active habits for this date.</p>'; 
        } else {
            activeHabits.forEach(habit => {
                const log = progressLogs.find(x => x.habit_id === habit.id);
                // "Checked" means amount > 0
                const isChecked = log ? log.current_amount > 0 : false;

                const label = document.createElement('label');

                let baseClass = 'relative flex items-center justify-between px-4 py-2.5 rounded-lg cursor-pointer transition-all border border-solid text-center min-h-[44px] select-none text-sm tracking-wide leading-tight group-active:scale-[0.98]';
                let unselectedClass = '';
                let selectedClass = '';

                if (habit.target_amount == 1) { // GOOD
                    unselectedClass = 'bg-[#161b22] border-[#30363d] text-gray-400 hover:border-green-500/50 hover:bg-[#21262d] border-l-2 border-l-green-500/30';
                    selectedClass = 'bg-green-500/20 border-green-500 text-green-300 shadow-[0_0_10px_rgba(34,197,94,0.2)] border-l-2 border-l-green-500';
                } else if (habit.target_amount == -2) { // SHINY
                    unselectedClass = 'bg-[#161b22] border-[#30363d] text-gray-400 hover:border-yellow-500/50 hover:bg-[#21262d] border-l-2 border-l-yellow-500/30';
                    selectedClass = 'bg-yellow-500/20 border-yellow-500 text-yellow-300 shadow-[0_0_10px_rgba(234,179,8,0.2)] border-l-2 border-l-yellow-500';
                }

                label.className = `group ${baseClass} ${isChecked ? selectedClass : unselectedClass}`;

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'sr-only peer';
                checkbox.dataset.id = habit.id;
                checkbox.checked = isChecked;

                const getStreak = (cChecked) => {
                    let pastStreak = 0;
                    let checkDate = new Date(selectedDate + 'T12:00:00');
                    checkDate.setDate(checkDate.getDate() - 1);
                    
                    let checkLimit = 0;
                    while(checkLimit < 365) {
                        checkLimit++;
                        const dKey = formatDate(checkDate);
                        const dLogs = logsCache[dKey] || [];
                        const prog = dLogs.find(l => l.event_type === 'progress' && l.habit_id === habit.id);
                        
                        if (!logsCache.hasOwnProperty(dKey) && checkLimit > 30) {
                            break;
                        }

                        const pAmt = prog ? prog.current_amount : 0;
                        
                        let success = false;
                        if (habit.target_amount == 1 && pAmt >= 1) success = true;
                        if (habit.target_amount == -2 && pAmt >= 1) success = true; // Checked means clean/shiny
                        
                        if (success) {
                            pastStreak++;
                            checkDate.setDate(checkDate.getDate() - 1);
                        } else {
                            break;
                        }
                    }
                    
                    let successToday = false;
                    let amt = cChecked ? 1 : 0;
                    if (habit.target_amount == 1 && amt >= 1) successToday = true;
                    if (habit.target_amount == -2 && amt >= 1) successToday = true;
                    
                    return successToday ? pastStreak + 1 : pastStreak;
                };

                const streakVal = getStreak(isChecked);

                label.appendChild(checkbox);

                const textSpan = document.createElement('div');
                textSpan.className = 'font-medium transition-transform flex-1 text-left';
                textSpan.innerHTML = getHabitName(habit.name);
                label.appendChild(textSpan);

                const streakSpan = document.createElement('div');
                streakSpan.className = 'text-xs font-bold opacity-70 tracking-widest ml-4 transition-transform flex items-center gap-1.5';
                streakSpan.innerHTML = `<span class="opacity-50">🔥</span> <span>${streakVal}</span>`;
                label.appendChild(streakSpan);

                const checkConfetti = () => {
                    const allCheckboxes = modalHabits.querySelectorAll('input[type="checkbox"]');
                    const allChecked = Array.from(allCheckboxes).every(cb => cb.checked);
                    if (allChecked && window.confetti) {
                        window.confetti({
                            particleCount: 80,
                            spread: 70,
                            origin: { y: 0.8 },
                            colors: ['#39d353', '#2ea043', '#58a6ff']
                        });
                    }
                };

                checkbox.addEventListener('change', (e) => {
                    label.className = `group ${baseClass} ${e.target.checked ? selectedClass : unselectedClass}`;
                    const newStreak = getStreak(e.target.checked);
                    streakSpan.innerHTML = `<span class="opacity-50">🔥</span> <span>${newStreak}</span>`;
                    
                    if (e.target.checked) checkConfetti();
                });
                modalHabits.appendChild(label);
            });
        }

        dayModal.classList.remove('hidden');
    };

    if(minSleepBtn) minSleepBtn.addEventListener('click', () => {
        compactMetrics.classList.add('hidden');
        expandedMetricsRow.classList.remove('hidden');
        sleepStartInput.focus();
    });

    if(minMoodBtn) minMoodBtn.addEventListener('click', () => {
        compactMetrics.classList.add('hidden');
        expandedMetricsRow.classList.remove('hidden');
        moodInput.focus();
    });

    const noteToggleBtn = document.getElementById('note-toggle-btn');
    if (noteToggleBtn) {
        noteToggleBtn.addEventListener('click', () => {
            const wrapper = document.getElementById('note-editor-wrapper');
            const chevron = document.getElementById('note-chevron');
            wrapper.classList.toggle('hidden');
            chevron.classList.toggle('rotate-180');
            if(!wrapper.classList.contains('hidden')) {
                modalNote.focus();
            }
        });
    }

/* --- Saving Data --- */
    const autoSaveDayData = async () => {
        if (!selectedDate) return;
        
        try {
            // OPTIMISTIC UI CACHE UPDATE
            const dayLogs = logsCache[selectedDate] || [];
            const checkboxes = modalHabits.querySelectorAll('input[type="checkbox"]');
            
            checkboxes.forEach(cb => {
                const habitId = cb.getAttribute('data-id');
                const isChecked = cb.checked;
                let log = dayLogs.find(l => l.habit_id === habitId && l.event_type === 'progress');
                if (log) {
                    log.current_amount = isChecked ? 1 : 0;
                } else {
                    dayLogs.push({ passcode_key: passcode, habit_id: habitId, log_date: selectedDate, event_type: 'progress', current_amount: isChecked ? 1 : 0, amount_delta: 0 });
                }
            });

            // Note Optimistic Update
            const noteText = modalNote.value.trim();
            const existingNoteIdx = dayLogs.findIndex(l => l.event_type === 'note' && !l.habit_id);
            if (noteText) {
                if (existingNoteIdx !== -1) {
                    dayLogs[existingNoteIdx].metadata = { text: noteText };
                } else {
                    dayLogs.push({ passcode_key: passcode, log_date: selectedDate, event_type: 'note', metadata: { text: noteText } });
                }
            } else if (existingNoteIdx !== -1) {
                dayLogs.splice(existingNoteIdx, 1);
            }

            // Sleep Optimistic Update
            const sStart = sleepStartInput.value;
            const sEnd = sleepEndInput.value;
            const existingSleepIdx = dayLogs.findIndex(l => l.event_type === 'sleep' && !l.habit_id);
            if (sStart && sEnd) {
                if (existingSleepIdx !== -1) {
                    dayLogs[existingSleepIdx].metadata = { start: sStart, end: sEnd };
                } else {
                    dayLogs.push({ passcode_key: passcode, log_date: selectedDate, event_type: 'sleep', metadata: { start: sStart, end: sEnd } });
                }
            } else if (existingSleepIdx !== -1) {
                dayLogs.splice(existingSleepIdx, 1);
            }

            logsCache[selectedDate] = dayLogs;
            renderGrid(); // Force an immediate repaint

            // Supabase network sync (Runs asynchronously in background)
            const syncOperations = [];
            
            for (const cb of checkboxes) {
                const habitId = cb.getAttribute('data-id');
                const isChecked = cb.checked;
                syncOperations.push(
                    client.from(config.tableLogs).upsert({
                        passcode_key: passcode, habit_id: habitId, log_date: selectedDate, event_type: 'progress', current_amount: isChecked ? 1 : 0, amount_delta: 0
                    }, { onConflict: 'passcode_key, habit_id, log_date, event_type' })
                );
            }

            // Sync Note
            const existingNote = dayLogs.find(l => l.event_type === 'note' && !l.habit_id);
            if (noteText) {
                const payload = { passcode_key: passcode, log_date: selectedDate, event_type: 'note', metadata: { text: noteText } };
                if (existingNote && existingNote.id) payload.id = existingNote.id;
                syncOperations.push(client.from(config.tableLogs).upsert(payload));
            } else if (existingNote && existingNote.id) {
                syncOperations.push(client.from(config.tableLogs).delete().eq('id', existingNote.id));
            }

            // Sync Sleep
            const existingSleep = dayLogs.find(l => l.event_type === 'sleep' && !l.habit_id);
            if (sStart && sEnd) {
                const payload = { passcode_key: passcode, log_date: selectedDate, event_type: 'sleep', metadata: { start: sStart, end: sEnd } };
                if (existingSleep && existingSleep.id) payload.id = existingSleep.id;
                syncOperations.push(client.from(config.tableLogs).upsert(payload));
            } else if (existingSleep && existingSleep.id) {
                syncOperations.push(client.from(config.tableLogs).delete().eq('id', existingSleep.id));
              }

              // Mood Optimistic Update & Sync
              const existingMood = dayLogs.find(l => l.event_type === 'mood' && !l.habit_id);
              const moodVal = moodInput.value ? parseInt(moodInput.value) : null;
              
              const existingMoodIdx = dayLogs.findIndex(l => l.event_type === 'mood' && !l.habit_id);
              if (moodVal >= 1 && moodVal <= 10) {
                  if (existingMoodIdx !== -1) {
                      dayLogs[existingMoodIdx].metadata = { level: moodVal };
                  } else {
                      dayLogs.push({ passcode_key: passcode, log_date: selectedDate, event_type: 'mood', metadata: { level: moodVal } });
                  }
                  const payload = { passcode_key: passcode, log_date: selectedDate, event_type: 'mood', metadata: { level: moodVal } };
                  if (existingMood && existingMood.id) payload.id = existingMood.id;
                  syncOperations.push(client.from(config.tableLogs).upsert(payload));
              } else {
                  if (existingMoodIdx !== -1) dayLogs.splice(existingMoodIdx, 1);
                  if (existingMood && existingMood.id) {
                      syncOperations.push(client.from(config.tableLogs).delete().eq('id', existingMood.id));
                  }
              }

              logsCache[selectedDate] = dayLogs;
              renderGrid(); // Immediate repaint

              // Await operations but do not block UI significantly
              await Promise.all(syncOperations);
              
              // Refresh data silently to get actual IDs
              loadData();

        } catch (e) {
            console.error('Save error', e);
        }
    };

    const handleModalClose = async () => {
        dayModal.classList.add('hidden');
        await autoSaveDayData();
    };

    if(closeModalBtn) closeModalBtn.addEventListener('click', handleModalClose);

    if(dayModal) dayModal.addEventListener('click', (e) => {
        if (e.target === dayModal) handleModalClose();
    });

    init();
});
