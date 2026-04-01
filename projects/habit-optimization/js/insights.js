document.addEventListener('DOMContentLoaded', () => {
    const core = window.HabitAppCore;
    const config = core.readConfig();
    const client = core.createClient(config);

    const statusEl = document.getElementById('insights-status');
    const lastUpdatedEl = document.getElementById('insights-last-updated');
    const refreshBtn = document.getElementById('insights-refresh-btn');

    const sleepAverageEl = document.getElementById('sleep-average');
    const sleepEntriesEl = document.getElementById('sleep-entries');
    const sleepChartEl = document.getElementById('sleep-chart');
    const sleepForm = document.getElementById('insights-sleep-form');
    const sleepDateInput = document.getElementById('insights-sleep-date');
    const sleepTimeInput = document.getElementById('insights-sleep-time');
    const wakeTimeInput = document.getElementById('insights-wake-time');
    const sleepHistoryListEl = document.getElementById('sleep-history-list');

    const focusHealthListEl = document.getElementById('focus-health-list');
    const focusHealthEmptyEl = document.getElementById('focus-health-empty');
    const viceHealthListEl = document.getElementById('vice-health-list');
    const viceHealthEmptyEl = document.getElementById('vice-health-empty');

    const state = {
        unlocked: false,
        pollId: null,
        habits: [],
        progressByDate: {},
        streakResetByHabit: {},
        sleepByDate: {}
    };

    const setStatus = (message, isError) => {
        statusEl.textContent = message;
        statusEl.style.color = isError ? '#ff8b8b' : '';
    };

    const updateTimestamp = () => {
        lastUpdatedEl.textContent = new Date().toLocaleString();
    };

    const formatMinutes = (value) => {
        const total = Math.max(0, Math.floor(Number(value) || 0));
        const hours = Math.floor(total / 60);
        const mins = total % 60;
        if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
        if (hours > 0) return `${hours}h`;
        return `${mins}m`;
    };

    const formatTimeForDisplay = (value) => {
        if (!value || !String(value).includes(':')) return '-';
        const [hourPart, minutePart] = String(value).split(':');
        const hour = Number(hourPart);
        const minute = Number(minutePart);
        if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
        return new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const sanitizeUnit = (value, fallback = 'min') => core.sanitizeUnit(value, fallback);

    const sortedHabits = (habits) => habits.slice().sort((a, b) => {
        const orderDiff = (a.sort_order || 0) - (b.sort_order || 0);
        if (orderDiff !== 0) return orderDiff;
        return String(a.name || '').localeCompare(String(b.name || ''));
    });

    const getFocusHabits = () => sortedHabits(state.habits.filter((habit) => habit.category === 'focus' && !habit.archived));
    const getViceHabits = () => sortedHabits(state.habits.filter((habit) => habit.category === 'vice' && !habit.archived));

    const getAmountForDate = (habitId, dateKey) => {
        const amount = state.progressByDate[dateKey]?.[habitId];
        return Math.max(0, Number(amount) || 0);
    };

    const getCompletionRate = (habit, days) => {
        let completed = 0;
        for (let i = 0; i < days; i += 1) {
            const dateKey = core.getDateFromOffset(-i);
            const amount = getAmountForDate(habit.id, dateKey);
            if (amount >= Math.max(1, Number(habit.target_amount) || 1)) completed += 1;
        }
        return completed / Math.max(1, days);
    };

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
            const dateKey = core.getDateFromOffset(-i);
            const entry = state.sleepByDate[dateKey];
            points.push({
                dateKey,
                mins: entry ? Number(entry.durationMinutes) || 0 : 0
            });
        }

        const logged = points.filter((point) => point.mins > 0);
        const avg = logged.length ? Math.round(logged.reduce((sum, point) => sum + point.mins, 0) / logged.length) : 0;
        sleepAverageEl.textContent = logged.length ? formatMinutes(avg) : '-';
        sleepEntriesEl.textContent = String(logged.length);

        if (!logged.length) {
            sleepChartEl.innerHTML = '<p class="empty-state">No sleep entries yet.</p>';
            return;
        }

        const maxMins = Math.max(480, ...logged.map((point) => point.mins));
        const width = 720;
        const height = 220;
        const padX = 22;
        const padY = 20;

        const graphPoints = points.map((point, index) => {
            const x = padX + (index / (points.length - 1)) * (width - padX * 2);
            const y = point.mins > 0
                ? height - padY - (point.mins / maxMins) * (height - padY * 2)
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

    const renderSleepHistory = () => {
        const entries = Object.entries(state.sleepByDate)
            .map(([dateKey, value]) => ({ dateKey, ...value }))
            .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
            .slice(0, 14);

        sleepHistoryListEl.innerHTML = '';
        if (!entries.length) {
            sleepHistoryListEl.innerHTML = '<p class="empty-state">No sleep entries yet.</p>';
            return;
        }

        entries.forEach((entry) => {
            const row = document.createElement('article');
            row.className = 'compact-item';
            row.innerHTML = `
                <div>
                    <p class="habit-name">${entry.dateKey}</p>
                    <p class="habit-meta">${formatTimeForDisplay(entry.sleptAt)} -> ${formatTimeForDisplay(entry.wokeAt)} · ${formatMinutes(entry.durationMinutes)}</p>
                </div>
                <div class="row-actions">
                    <button class="ghost-btn" type="button" data-action="sleep-edit" data-date="${entry.dateKey}">Edit</button>
                </div>
            `;
            sleepHistoryListEl.appendChild(row);
        });
    };

    const renderFocusHealth = () => {
        const habits = getFocusHabits();
        focusHealthListEl.innerHTML = '';
        focusHealthEmptyEl.hidden = habits.length > 0;

        habits.forEach((habit) => {
            const percent = Math.round(getCompletionRate(habit, 30) * 100);
            const row = document.createElement('article');
            row.className = 'compact-item stack';
            row.innerHTML = `
                <div class="split-row">
                    <p class="habit-name">${escapeHtml(habit.name)}</p>
                    <span class="pill">${percent}%</span>
                </div>
                <div class="meter-track"><div class="meter-fill" style="width:${percent}%"></div></div>
            `;
            focusHealthListEl.appendChild(row);
        });
    };

    const renderViceHealth = () => {
        const todayKey = core.getTodayKey();
        const vices = getViceHabits();
        viceHealthListEl.innerHTML = '';
        viceHealthEmptyEl.hidden = vices.length > 0;

        vices.forEach((vice) => {
            const row = document.createElement('article');
            row.className = 'compact-item stack';

            if (vice.tracking_method === 'streak') {
                const resetDate = state.streakResetByHabit[vice.id] || (vice.created_at || '').slice(0, 10) || todayKey;
                const streakDays = daysSince(resetDate);
                row.innerHTML = `
                    <div class="split-row">
                        <p class="habit-name">${escapeHtml(vice.name)}</p>
                        <span class="pill">${streakDays} days</span>
                    </div>
                    <p class="habit-meta">Days since last reset</p>
                `;
            } else {
                const spent = getAmountForDate(vice.id, todayKey);
                const limit = Math.max(0, Number(vice.current_limit ?? vice.initial_limit ?? vice.target_amount ?? 0));
                const unit = sanitizeUnit(vice.unit, 'min');
                const percent = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
                row.innerHTML = `
                    <div class="split-row">
                        <p class="habit-name">${escapeHtml(vice.name)}</p>
                        <span class="pill">${spent}/${limit} ${escapeHtml(unit)}</span>
                    </div>
                    <div class="meter-track"><div class="meter-fill${spent > limit ? ' warn' : ''}" style="width:${percent}%"></div></div>
                `;
            }

            viceHealthListEl.appendChild(row);
        });
    };

    const renderAll = () => {
        renderSleepTrend();
        renderSleepHistory();
        renderFocusHealth();
        renderViceHealth();
        updateTimestamp();
    };

    const refreshFromCloud = async () => {
        const sinceDateKey = core.getDateFromOffset(-120);
        const [habits, progressByDate, resets, sleepByDate] = await Promise.all([
            core.loadHabits(client, config),
            core.loadProgressLogs(client, config, sinceDateKey),
            core.loadStreakResetEvents(client, config, sinceDateKey),
            core.loadSleepLogs(client, config, sinceDateKey)
        ]);

        state.habits = habits;
        state.progressByDate = progressByDate;
        state.streakResetByHabit = resets.latestByHabit;
        state.sleepByDate = sleepByDate;
        renderAll();
    };

    const startPolling = () => {
        if (state.pollId) return;
        state.pollId = setInterval(async () => {
            if (!state.unlocked) return;
            try {
                await refreshFromCloud();
            } catch (error) {
                setStatus(`Sync failed: ${error.message}`, true);
            }
        }, core.POLL_MS);
    };

    const stopPolling = () => {
        if (!state.pollId) return;
        clearInterval(state.pollId);
        state.pollId = null;
    };

    const unlock = async () => {
        if (!client) {
            setStatus('Supabase is not configured.', true);
            return;
        }

        state.unlocked = true;
        setStatus('Loading insights...', false);

        try {
            await refreshFromCloud();
            setStatus('Insights synced.', false);
            startPolling();
        } catch (error) {
            setStatus(`Load failed: ${error.message}`, true);
        }
    };

    const lock = () => {
        state.unlocked = false;
        stopPolling();
        setStatus('Locked.', false);
    };

    refreshBtn.addEventListener('click', async () => {
        if (!state.unlocked) return;
        setStatus('Refreshing...', false);
        try {
            await refreshFromCloud();
            setStatus('Refreshed.', false);
        } catch (error) {
            setStatus(`Refresh failed: ${error.message}`, true);
        }
    });

    sleepHistoryListEl.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-action="sleep-edit"]');
        if (!button) return;

        const dateKey = button.dataset.date;
        const entry = state.sleepByDate[dateKey];
        sleepDateInput.value = dateKey || core.getTodayKey();
        sleepTimeInput.value = entry?.sleptAt || '';
        wakeTimeInput.value = entry?.wokeAt || '';
    });

    sleepForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!state.unlocked) return;

        const logDate = sleepDateInput.value || core.getTodayKey();
        const sleptAt = sleepTimeInput.value;
        const wokeAt = wakeTimeInput.value;

        if (!sleptAt || !wokeAt) {
            setStatus('Please fill both sleep and wake time.', true);
            return;
        }

        setStatus('Saving sleep...', false);
        try {
            await core.upsertSleepLog(client, config, {
                logDate,
                sleptAt,
                wokeAt
            });

            await refreshFromCloud();
            setStatus('Sleep entry saved.', false);
        } catch (error) {
            setStatus(`Could not save sleep: ${error.message}`, true);
        }
    });

    document.addEventListener('habit-shell:unlocked', () => {
        void unlock();
    });

    document.addEventListener('habit-shell:locked', () => {
        lock();
    });

    document.addEventListener('visibilitychange', () => {
        if (!state.unlocked) return;
        if (document.hidden) {
            stopPolling();
            return;
        }
        startPolling();
        void refreshFromCloud();
    });

    window.addEventListener('beforeunload', stopPolling);

    sleepDateInput.value = core.getTodayKey();
    updateTimestamp();

    if (core.getCookie(core.COOKIE_NAME) === '1') {
        void unlock();
    }
});

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
