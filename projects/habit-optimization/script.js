function appInit() {

    /* --- DOM Elements --- */
    const logoutBtn = document.getElementById('logout-btn');
    const logoutBtnNav = document.getElementById('logout-btn-nav');
    const gridContainer = document.getElementById('grid-container');
    if (!gridContainer) return;
    const dayModal = document.getElementById('day-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const modalDate = document.getElementById('modal-date');
    const modalHabits = document.getElementById('modal-habits');
    const modalNote = document.getElementById('modal-note');

    const sleepInputsContainer = document.getElementById('sleep-inputs-container');
    const sleepStartInput = document.getElementById('sleep-start');
    const sleepEndInput = document.getElementById('sleep-end');
    const minMetricsBtn = document.getElementById('min-metrics-btn');
    const minSleepWrap = document.getElementById('min-sleep-wrap');
    const minSleepDisplay = document.getElementById('min-sleep-display');
    const moodInputsContainer = document.getElementById('mood-inputs-container');
    const moodInput = document.getElementById('mood-input');
    const minMoodWrap = document.getElementById('min-mood-wrap');
    const minMoodDisplay = document.getElementById('min-mood-display');
    const minNoteWrap = document.getElementById('min-note-wrap');
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
    let config = { url: '', key: '', tableHabits: 'habits', tableLogs: 'habit_logs', tableTasks: 'tasks' };

    let audioCtx = null;
    const playSound = (type) => {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            const now = audioCtx.currentTime;
            
            if (type === 'tick') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, now);
                osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05);
                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(0.05, now + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(now); osc.stop(now + 0.1);
            } else if (type === 'untick') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(600, now);
                osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);
                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(0.05, now + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(now); osc.stop(now + 0.1);
            } else if (type === 'success') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.setValueAtTime(554.37, now + 0.1);
                osc.frequency.setValueAtTime(659.25, now + 0.2);
                osc.frequency.setValueAtTime(880, now + 0.3);
                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(0.075, now + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
                osc.start(now); osc.stop(now + 0.5);
            } else if (type === 'shiny') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(523.25, now);
                osc.frequency.setValueAtTime(659.25, now + 0.1);
                osc.frequency.setValueAtTime(783.99, now + 0.2);
                osc.frequency.setValueAtTime(1046.50, now + 0.3);
                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(0.05, now + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
                osc.start(now); osc.stop(now + 0.8);
            } else if (type === 'perfect') {
                osc.type = 'square';
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.setValueAtTime(554.37, now + 0.1);
                osc.frequency.setValueAtTime(659.25, now + 0.15);
                osc.frequency.setValueAtTime(880, now + 0.2);
                osc.frequency.setValueAtTime(1108.73, now + 0.3);
                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(0.06, now + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
                osc.start(now); osc.stop(now + 1.0);
            }
        } catch (e) {}
    };

    let habitsCache = [];
    let tasksCache = [];
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
            console.error("Supabase config missing");
            return;
        }
        
        client = window.supabase.createClient(config.url, config.key);
        
        if (!passcode) {
            window.location.href = 'login.html';
            return;
        }
        
        document.body.classList.remove('justify-center');
        
        // Setup Realtime Sync
        client.channel('public:habit_logs')
            .on('postgres_changes', { event: '*', schema: 'public', table: config.tableLogs }, payload => {
                if (dayModal && dayModal.classList.contains('hidden')) {
                    loadData();
                }
            })
            .subscribe();

        loadData();
    };
    /* --- Auth Flow --- */
    const handleLogout = () => {
        localStorage.removeItem('habit_passcode');
        window.location.href = 'login.html';
    };
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

            try {
                const { data: tData, error: tErr } = await client
                    .from(config.tableTasks)
                    .select('*')
                    .eq('passcode_key', passcode)
                    .order('created_at', { ascending: true });
                if (!tErr) tasksCache = tData || [];
            } catch (te) {
                console.warn('Tasks table might not exist yet.', te);
            }

            renderGrid();
        } catch (e) {
            console.error('Load Data Error:', e);
            alert('Failed to load dashboard data:\n' + (e.message || JSON.stringify(e)));
        }
    };

    /* --- Rendering --- */
    let currentRenderedMonths = 0;
    let observer = null;

    const renderGrid = (append = false) => {
        let batchSize = append ? 2 : 1;

        let existingBtn = document.getElementById('load-more-months-btn');
        if (existingBtn) existingBtn.remove();


        // If not appending, reset the grid and state
        if (!append) {
            gridContainer.innerHTML = '';
            if (observer) {
                observer.disconnect();
                observer = null;
            }
            batchSize = Math.max(1, currentRenderedMonths); // Re-render what we already had
            currentRenderedMonths = 0;
        }
        
        const todayStr = formatDate(new Date());
        let startRangeStr = localStorage.getItem('habit_grid_start') || formatDate(new Date()).substring(0, 7);
        
        const s = parseMonthString(startRangeStr);
        const activeRangeStart = formatDate(new Date(s.year, s.month, 1));
        
        let monthsToRender = [];
        let currY = s.year;
        let currM = s.month;
        
        // Calculate the starting point for this render batch
        for (let i = 0; i < currentRenderedMonths; i++) {
            currM++;
            if (currM > 11) {
                currM = 0;
                currY++;
            }
        }
        
        // Add next batch of months
        for (let i = 0; i < batchSize; i++) {
            monthsToRender.push({ year: currY, month: currM });
            currM++;
            if (currM > 11) {
                currM = 0;
                currY++;
            }
        }
        
        currentRenderedMonths += batchSize;

        monthsToRender.forEach((m, index) => {
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
                    let isPerfect = false;
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
                            isPerfect = true;
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
                    if (isPerfect) classes += ' perfect-day';
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
                        
                        const dayTasks = tasksCache.filter(t => t.completed && (t.completed_date === dateKey || (t.target_date === dateKey && !t.completed_date)));
                        if (dayTasks.length > 0) {
                            metricsDiv.innerHTML += `<span>📋 ${dayTasks.length} Tasks</span>`;
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
                        
                        sleepScoreEl.className = `absolute top-[2px] right-[4px] text-[10px] md:text-[11px] font-extrabold ${colorCls} pointer-events-none drop-shadow-[0_2px_2px_rgba(0,0,0,1)] z-10 opacity-100`;
                        sleepScoreEl.textContent = totalSleepScore;
                        sleepScoreEl.title = 'Sleep Score: ' + totalSleepScore;
                        cell.appendChild(sleepScoreEl);
                    }
                    
                    if (moodLog && moodLog.metadata && moodLog.metadata.level) {
                        const moodEl = document.createElement('div');
                        moodEl.className = 'absolute top-[2px] left-[4px] text-[10px] md:text-[11px] font-extrabold text-yellow-400 pointer-events-none drop-shadow-[0_2px_2px_rgba(0,0,0,1)] z-10 opacity-100';
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

        // Ensure button is appended after the grid loops
        existingBtn = document.getElementById('load-more-months-btn');
        if (existingBtn) existingBtn.remove();
        
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.id = 'load-more-months-btn';
        loadMoreBtn.className = 'w-full py-4 mt-4 border border-[#30363d] bg-transparent rounded-xl text-gray-500 font-semibold tracking-widest uppercase text-xs hover:bg-[#161b22] hover:text-white hover:border-gray-500 transition-all';
        loadMoreBtn.textContent = 'Load More Months';
        loadMoreBtn.addEventListener('click', () => {
            loadMoreBtn.textContent = 'Loading...';
            loadMoreBtn.style.opacity = '0.5';
            setTimeout(() => renderGrid(true), 50);
        });
        gridContainer.appendChild(loadMoreBtn);
    };

    /* --- Mood Selection Logic --- */
    // Logic moved to input interactions

    /* --- Modal Management --- */
    const openDayModal = (dateKey) => {
        selectedDate = dateKey;
        const niceDateStr = new Date(dateKey + 'T12:00:00').toLocaleDateString(undefined, { 
            weekday: 'short', month: 'short', day: 'numeric'
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
        
        let hasNote = modalNote.value.trim().length > 0;

        const openMemoryLogBtnTop = document.getElementById('open-memory-log-btn');

        if (hasSleep || hasMood || hasNote) {
            if (minMetricsBtn) {
                minMetricsBtn.classList.remove('hidden');
                minMetricsBtn.classList.add('flex');
            }
            if (openMemoryLogBtnTop) {
                openMemoryLogBtnTop.classList.add('hidden');
                openMemoryLogBtnTop.classList.remove('flex');
            }
            if (minSleepWrap) {
                minSleepWrap.classList.toggle('hidden', !hasSleep);
                minSleepWrap.classList.toggle('flex', hasSleep);
            }
            if (minMoodWrap) {
                minMoodWrap.classList.toggle('hidden', !hasMood);
                minMoodWrap.classList.toggle('flex', hasMood);
            }
            if (minNoteWrap) {
                minNoteWrap.classList.toggle('hidden', !hasNote);
                minNoteWrap.classList.toggle('flex', hasNote);
            }

            const activeMet = [hasSleep, hasMood, hasNote].filter(Boolean).length;
            const divider1 = document.getElementById('metrics-divider-1');
            const divider2 = document.getElementById('metrics-divider-2');
            
            if (divider1) divider1.classList.add('hidden');
            if (divider2) divider2.classList.add('hidden');

            if (activeMet > 1) {
               if (hasSleep && hasMood && hasNote) {
                   if (divider1) divider1.classList.remove('hidden');
                   if (divider2) divider2.classList.remove('hidden');
               } else if (hasSleep && hasMood) {
                   if (divider1) divider1.classList.remove('hidden');
               } else if (hasSleep && hasNote) {
                   if (divider1) divider1.classList.remove('hidden');
               } else if (hasMood && hasNote) {
                   if (divider2) divider2.classList.remove('hidden');
               }
            }

        } else {
            if (minMetricsBtn) {
                minMetricsBtn.classList.add('hidden');
                minMetricsBtn.classList.remove('flex');
            }
            if (openMemoryLogBtnTop) {
                openMemoryLogBtnTop.classList.remove('hidden');
                openMemoryLogBtnTop.classList.add('flex');
            }
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

                let baseClass = 'relative flex flex-col items-center justify-center p-2 rounded-lg border text-center min-h-[44px] sm:min-h-[50px] select-none text-[11px] sm:text-[12px] font-medium tracking-wide leading-tight group-active:scale-[0.96] transition-all shadow-sm w-full';
                let unselectedClass = '';
                let selectedClass = '';

                if (habit.target_amount == 1) { // GOOD
                    unselectedClass = 'bg-[#161b22] border-[#30363d] text-gray-400 hover:border-green-500/50 hover:bg-[#21262d] border-b-2 border-b-green-500/30';
                    selectedClass = 'bg-green-500/20 border-green-500 text-green-400 shadow-[0_0_8px_rgba(34,197,94,0.15)] border-b-2 border-b-green-500';
                } else if (habit.target_amount == -2) { // SHINY
                    unselectedClass = 'bg-[#161b22] border-[#30363d] text-gray-400 hover:border-yellow-500/50 hover:bg-[#21262d] border-b-2 border-b-yellow-500/30';
                    selectedClass = 'bg-yellow-500/20 border-yellow-500 text-yellow-400 shadow-[0_0_8px_rgba(234,179,8,0.15)] border-b-2 border-b-yellow-500';
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
                textSpan.className = 'font-semibold transition-transform w-[95%] break-words line-clamp-2 leading-tight';
                textSpan.innerHTML = getHabitName(habit.name);
                label.appendChild(textSpan);

                const streakSpan = document.createElement('div');
                streakSpan.className = 'absolute -top-1.5 -right-1.5 bg-[#0d1117] border border-[#30363d] rounded-full px-1.5 py-[2px] text-[9px] font-bold flex items-center justify-center gap-[2px] shadow-sm z-10 transition-colors group-hover:border-[#58a6ff]/50';
                streakSpan.innerHTML = `<span class="opacity-70 text-[9px]">🔥</span> <span class="text-gray-300 leading-none">${streakVal}</span>`;
                if (streakVal === 0) {
                    streakSpan.classList.add('hidden');
                }
                label.appendChild(streakSpan);

                const checkConfetti = () => {
                    const allCheckboxes = modalHabits.querySelectorAll('input[type="checkbox"]');
                    const allChecked = Array.from(allCheckboxes).every(cb => cb.checked);
                    if (allChecked) {
                        playSound('perfect'); // Play perfect day success sound
                        if (window.confetti) {
                            window.confetti({
                                particleCount: 80,
                                spread: 70,
                                origin: { y: 0.8 },
                                colors: ['#39d353', '#2ea043', '#58a6ff']
                            });
                        }
                    }
                };

                checkbox.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        playSound(habit.target_amount == -2 ? 'shiny' : 'success');
                    } else {
                        playSound('untick');
                    }
                    label.className = `group ${baseClass} ${e.target.checked ? selectedClass : unselectedClass}`;
                    const newStreak = getStreak(e.target.checked);
                    streakSpan.innerHTML = `<span class="opacity-70 text-[9px]">🔥</span> <span class="text-gray-200 leading-none">${newStreak}</span>`;
                    if (newStreak === 0) {
                        streakSpan.classList.add('hidden');
                    } else {
                        streakSpan.classList.remove('hidden');
                    }
                    if (e.target.checked) checkConfetti();
                });
                modalHabits.appendChild(label);
            });
        }

        // Render Tasks
        const modalChecklist = document.getElementById('modal-checklist');
        if (modalChecklist) {
            modalChecklist.innerHTML = '';
            const dayTasks = tasksCache.filter(t => {
                if (t.completed) {
                    return t.completed_date === dateKey || (t.target_date === dateKey && !t.completed_date);
                } else {
                    if (!t.target_date) return true; 
                    return t.target_date <= dateKey; 
                }
            }).sort((a, b) => {
                if (a.completed !== b.completed) return a.completed ? 1 : -1;
                const aPlanned = !!a.target_date;
                const bPlanned = !!b.target_date;
                if (aPlanned && !bPlanned) return -1;
                if (!aPlanned && bPlanned) return 1;
                return 0;
            });

            if (dayTasks.length === 0) {
                modalChecklist.innerHTML = '<p class="text-xs text-gray-600 italic px-1">Checklist clear.</p>';
            } else {
                let isExpandedTask = false;
                const maxVisibleTasks = 3;

                const renderTasks = () => {
                    modalChecklist.innerHTML = '';
                    const visibleTasks = isExpandedTask ? dayTasks : dayTasks.slice(0, maxVisibleTasks);

                    visibleTasks.forEach(task => {
                        const taskRow = document.createElement('div');
                        taskRow.className = 'flex items-start gap-2.5 p-2 md:p-3 bg-[#161b22] border border-[#30363d] rounded-lg transition-colors group cursor-pointer hover:border-[#58a6ff]/50';
                        if (task.completed) taskRow.classList.add('opacity-50');

                        const btn = document.createElement('button');
                        btn.className = `w-4 h-4 mt-0.5 rounded flex-shrink-0 flex items-center justify-center border transition-colors ${task.completed ? 'bg-green-500 border-green-500 text-black' : 'bg-transparent border-gray-500 hover:border-white'}`;
                        btn.innerHTML = task.completed ? '✓' : '';
                        btn.style.fontSize = '10px';

                        const textDiv = document.createElement('div');
                        textDiv.className = `text-[12px] md:text-[13px] text-gray-300 leading-snug flex-grow select-none ${task.completed ? 'line-through text-gray-500' : ''}`;
                        textDiv.textContent = task.text;

                        taskRow.addEventListener('click', async () => {
                            const newStatus = !task.completed;
                            task.completed = newStatus;
                            task.completed_date = newStatus ? dateKey : null;

                            btn.innerHTML = newStatus ? '✓' : '';
                            btn.className = `w-4 h-4 mt-0.5 rounded flex-shrink-0 flex items-center justify-center border transition-colors ${newStatus ? 'bg-green-500 border-green-500 text-black' : 'bg-transparent border-gray-500 hover:border-white'}`;
                            
                            if (newStatus) {
                                playSound('tick');
                                textDiv.classList.add('line-through', 'text-gray-500');
                                taskRow.classList.add('opacity-50');
                                if (window.confetti) window.confetti({ particleCount: 40, spread: 50, colors: ['#58a6ff']});
                            } else {
                                playSound('untick');
                                textDiv.classList.remove('line-through', 'text-gray-500');
                                taskRow.classList.remove('opacity-50');
                            }

                            // Background sync
                            await client.from(config.tableTasks).update({ completed: newStatus, completed_date: task.completed_date }).eq('id', task.id);
                        });

                        taskRow.appendChild(btn);
                        taskRow.appendChild(textDiv);
                        modalChecklist.appendChild(taskRow);
                    });

                    if (dayTasks.length > maxVisibleTasks) {
                        const toggleBtn = document.createElement('button');
                        toggleBtn.className = 'w-full text-[10px] uppercase tracking-widest font-semibold text-gray-600 hover:text-[#58a6ff] hover:bg-[#161b22] border border-transparent hover:border-[#30363d] rounded-md mt-1 mb-1 py-1.5 transition-all text-center flex items-center justify-center gap-1.5';
                        toggleBtn.innerHTML = isExpandedTask ? '<span class="text-[8px]">▲</span> Show Less' : `<span class="text-[8px]">▼</span> +${dayTasks.length - maxVisibleTasks} More Tasks`;
                        toggleBtn.onclick = () => {
                            isExpandedTask = !isExpandedTask;
                            renderTasks();
                        };
                        modalChecklist.appendChild(toggleBtn);
                    }
                };

                renderTasks();
            }
        }

        dayModal.classList.remove('hidden');
    };

    const addTaskQuickBtn = document.getElementById('add-task-quick-btn');
    const quickTaskForm = document.getElementById('quick-task-form');
    const quickTaskInput = document.getElementById('quick-task-input');
    const saveQuickTaskBtn = document.getElementById('save-quick-task-btn');

    if (addTaskQuickBtn) addTaskQuickBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (quickTaskForm.classList.contains('hidden')) {
            quickTaskForm.classList.remove('hidden');
            quickTaskForm.classList.add('flex');
            quickTaskInput.focus();
        } else {
            quickTaskForm.classList.add('hidden');
            quickTaskForm.classList.remove('flex');
            quickTaskInput.value = '';
            saveQuickTaskBtn.classList.add('hidden', 'opacity-0');
        }
    });

    if (quickTaskInput) quickTaskInput.addEventListener('input', () => {
        if (quickTaskInput.value.trim().length > 0) {
            saveQuickTaskBtn.classList.remove('hidden', 'opacity-0');
        } else {
            saveQuickTaskBtn.classList.add('hidden', 'opacity-0');
        }
    });

    const finishQuickTaskAdd = async () => {
        const text = quickTaskInput.value.trim();
        if (!text) return;
        quickTaskForm.classList.add('hidden');
        quickTaskForm.classList.remove('flex');
        quickTaskInput.value = '';
        saveQuickTaskBtn.classList.add('hidden', 'opacity-0');

        const tempId = crypto.randomUUID();
        const newTask = {
            id: tempId,
            passcode_key: passcode,
            text,
            target_date: selectedDate,
            completed: false,
            completed_date: null
        };
        tasksCache.push(newTask);
        openDayModal(selectedDate); // Re-render modal list

        try {
            const { error: err, data } = await client.from(config.tableTasks).insert(newTask).select().single();
            if(!err && data) {
                const idx = tasksCache.findIndex(t => t.id === tempId);
                if (idx !== -1) tasksCache[idx].id = data.id;
            }
        } catch(e) {}
    };

    if (saveQuickTaskBtn) saveQuickTaskBtn.addEventListener('click', finishQuickTaskAdd);
    if (quickTaskInput) quickTaskInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            finishQuickTaskAdd();
        }
    });

    const memoryLogOverlay = document.getElementById('memory-log-overlay');
    const openMemoryLogBtn = document.getElementById('open-memory-log-btn');
    const closeMemoryLogBtn = document.getElementById('close-memory-log-btn');
    const saveMemoryLogBtn = document.getElementById('save-memory-log-btn');

    if (minMetricsBtn) minMetricsBtn.addEventListener('click', () => {
        memoryLogOverlay.classList.remove('hidden');
        sleepStartInput.focus();
    });

    if (openMemoryLogBtn) openMemoryLogBtn.addEventListener('click', () => {
        memoryLogOverlay.classList.remove('hidden');
        modalNote.focus();
    });

    const closeOverlay = async () => {
        memoryLogOverlay.classList.add('hidden');
        await autoSaveDayData();
        // Re-render the day modal so that the metrics button updates
        openDayModal(selectedDate);
    };

    if (closeMemoryLogBtn) closeMemoryLogBtn.addEventListener('click', closeOverlay);
    if (saveMemoryLogBtn) {
        saveMemoryLogBtn.addEventListener('click', closeOverlay);
        
        let saveTimeout;
        const autoTriggerSaveUI = () => {
            saveMemoryLogBtn.classList.remove('invisible');
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                saveMemoryLogBtn.classList.add('invisible');
            }, 1500);
        };
        modalNote.addEventListener('input', autoTriggerSaveUI);
        sleepStartInput.addEventListener('change', autoTriggerSaveUI);
        sleepEndInput.addEventListener('change', autoTriggerSaveUI);
        moodInput.addEventListener('input', autoTriggerSaveUI);
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
}

document.addEventListener('turbo:load', appInit);


