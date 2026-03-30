document.addEventListener('DOMContentLoaded', () => {
    const STORAGE_KEY = 'habitTrackerData';

    const currentStreakEl = document.getElementById('tracking-current-streak');
    const bestStreakEl = document.getElementById('tracking-best-streak');
    const totalSlipsEl = document.getElementById('tracking-total-slips');
    const successRateEl = document.getElementById('tracking-success-rate');
    const slipBody = document.getElementById('tracking-slip-body');
    const slipEmpty = document.getElementById('tracking-slip-empty');
    const habitBody = document.getElementById('tracking-habit-body');
    const habitEmpty = document.getElementById('tracking-habit-empty');

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
        renderEmptyState();
        return;
    }

    const data = JSON.parse(raw);
    const habits = Array.isArray(data.habits) ? data.habits : [];
    const habitsToBreak = Array.isArray(data.habitsToBreak) ? data.habitsToBreak : [];
    const dailyHabitChecks = data.dailyHabitChecks || {};
    const challengeDataByDate = data.challengeDataByDate || {};
    const challengeStartDate = data.challengeStartDate;
    const slipEventsByDate = data.slipEventsByDate || {};

    const parseDateKey = (dateKey) => {
        const [year, month, day] = dateKey.split('-').map(Number);
        return new Date(year, month - 1, day);
    };

    const formatPercent = (value) => `${Math.round(value)}%`;

    const sortedDateKeys = Object.keys(dailyHabitChecks).sort();

    const computeStreaks = () => {
        if (!challengeStartDate) {
            return { current: 0, best: 0, successRate: 0 };
        }

        const startDate = parseDateKey(challengeStartDate);
        const today = new Date();
        const elapsedDays = Math.max(1, Math.floor((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - startDate) / (1000 * 60 * 60 * 24)) + 1);

        let current = 0;
        let best = 0;
        let running = 0;
        let successfulDays = 0;

        for (let i = 0; i < elapsedDays; i++) {
            const d = new Date(startDate);
            d.setDate(startDate.getDate() + i);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const success = Boolean(challengeDataByDate[key]?.successful);

            if (success) {
                successfulDays++;
                running++;
                best = Math.max(best, running);
            } else {
                running = 0;
            }
        }

        for (let i = elapsedDays - 1; i >= 0; i--) {
            const d = new Date(startDate);
            d.setDate(startDate.getDate() + i);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const success = Boolean(challengeDataByDate[key]?.successful);

            if (!success) {
                break;
            }

            current++;
        }

        return {
            current,
            best,
            successRate: (successfulDays / elapsedDays) * 100
        };
    };

    const computeSlipTotals = () => {
        const totals = {};
        let totalCount = 0;

        Object.values(slipEventsByDate).forEach((dayMap) => {
            Object.entries(dayMap || {}).forEach(([habitId, count]) => {
                totals[habitId] = (totals[habitId] || 0) + Number(count || 0);
                totalCount += Number(count || 0);
            });
        });

        const labelById = {};
        habitsToBreak.forEach((habit) => {
            labelById[habit.id] = habit.name;
        });

        const rows = Object.entries(totals)
            .map(([habitId, count]) => ({
                habitId,
                name: labelById[habitId] || habitId,
                count
            }))
            .sort((a, b) => b.count - a.count);

        return { rows, totalCount };
    };

    const computeHabitStats = () => {
        const rows = habits.map((habit) => {
            let totalMarkedDays = 0;
            let completedDays = 0;

            sortedDateKeys.forEach((dateKey) => {
                const dayChecks = dailyHabitChecks[dateKey] || {};
                const anyChecks = Object.keys(dayChecks).length > 0;
                if (!anyChecks) {
                    return;
                }

                totalMarkedDays++;
                if (dayChecks[habit.id]) {
                    completedDays++;
                }
            });

            let currentStreak = 0;
            let bestStreak = 0;
            let running = 0;

            sortedDateKeys.forEach((dateKey) => {
                const dayChecks = dailyHabitChecks[dateKey] || {};
                const anyChecks = Object.keys(dayChecks).length > 0;
                if (!anyChecks) {
                    return;
                }

                const completed = Boolean(dayChecks[habit.id]);
                if (completed) {
                    running++;
                    bestStreak = Math.max(bestStreak, running);
                } else {
                    running = 0;
                }
            });

            for (let i = sortedDateKeys.length - 1; i >= 0; i--) {
                const key = sortedDateKeys[i];
                const dayChecks = dailyHabitChecks[key] || {};
                const anyChecks = Object.keys(dayChecks).length > 0;
                if (!anyChecks) {
                    continue;
                }

                if (dayChecks[habit.id]) {
                    currentStreak++;
                } else {
                    break;
                }
            }

            const completionRate = totalMarkedDays > 0 ? (completedDays / totalMarkedDays) * 100 : 0;
            let status = 'Stable';
            if (completionRate < 40) status = 'Struggling';
            if (completionRate >= 75) status = 'Locked in';

            return {
                name: habit.name,
                currentStreak,
                bestStreak,
                completionRate,
                status
            };
        });

        return rows.sort((a, b) => a.completionRate - b.completionRate);
    };

    const renderEmptyState = () => {
        currentStreakEl.textContent = '0';
        bestStreakEl.textContent = '0';
        totalSlipsEl.textContent = '0';
        successRateEl.textContent = '0%';

        slipBody.innerHTML = '';
        habitBody.innerHTML = '';
        slipEmpty.hidden = false;
        habitEmpty.hidden = false;
    };

    const render = () => {
        const streaks = computeStreaks();
        const slips = computeSlipTotals();
        const habitStats = computeHabitStats();

        currentStreakEl.textContent = String(streaks.current);
        bestStreakEl.textContent = String(streaks.best);
        totalSlipsEl.textContent = String(slips.totalCount);
        successRateEl.textContent = formatPercent(streaks.successRate);

        slipBody.innerHTML = '';
        if (!slips.rows.length) {
            slipEmpty.hidden = false;
        } else {
            slipEmpty.hidden = true;
            slips.rows.forEach((row) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${row.name}</td><td>${row.count}</td>`;
                slipBody.appendChild(tr);
            });
        }

        habitBody.innerHTML = '';
        if (!habitStats.length) {
            habitEmpty.hidden = false;
        } else {
            habitEmpty.hidden = true;
            habitStats.forEach((row) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${row.name}</td>
                    <td>${row.currentStreak}</td>
                    <td>${row.bestStreak}</td>
                    <td>${formatPercent(row.completionRate)}</td>
                    <td>${row.status}</td>
                `;
                habitBody.appendChild(tr);
            });
        }
    };

    render();
});
