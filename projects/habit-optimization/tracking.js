document.addEventListener('DOMContentLoaded', () => {
    const STORAGE_KEY = 'habitTrackerData';

    const currentStreakEl = document.getElementById('tracking-current-streak');
    const bestStreakEl = document.getElementById('tracking-best-streak');
    const totalSlipsEl = document.getElementById('tracking-total-slips');
    const successRateEl = document.getElementById('tracking-success-rate');
    const topTriggerEl = document.getElementById('tracking-top-trigger');
    const topImpactEl = document.getElementById('tracking-top-impact');
    const slipBody = document.getElementById('tracking-slip-body');
    const slipEmpty = document.getElementById('tracking-slip-empty');
    const habitBody = document.getElementById('tracking-habit-body');
    const habitEmpty = document.getElementById('tracking-habit-empty');

    const progressChartEl = document.getElementById('tracking-progress-chart');
    const triggerChartEl = document.getElementById('tracking-trigger-chart');
    const impactChartEl = document.getElementById('tracking-impact-chart');
    const slipHabitChartEl = document.getElementById('tracking-slip-habit-chart');

    const chartRegistry = {
        progress: null,
        trigger: null,
        impact: null,
        slipHabit: null
    };

    const theme = getComputedStyle(document.documentElement);
    const colorBrand = theme.getPropertyValue('--brand').trim() || '#0f766e';
    const colorBrandStrong = theme.getPropertyValue('--brand-strong').trim() || '#0a5b55';
    const colorAccent = theme.getPropertyValue('--accent').trim() || '#d97706';
    const colorDanger = theme.getPropertyValue('--danger').trim() || '#c4513f';
    const colorSuccess = theme.getPropertyValue('--success').trim() || '#1f9d66';
    const colorTextSoft = theme.getPropertyValue('--text-soft').trim() || '#5f6b78';
    const colorLine = theme.getPropertyValue('--line').trim() || '#ded6c7';

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

    const getDateKey = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const addDays = (date, days) => {
        const next = new Date(date);
        next.setDate(next.getDate() + days);
        return next;
    };

    const normalizeSlipEntry = (entry) => {
        if (typeof entry === 'number') {
            return { count: Number(entry) || 0, triggers: {} };
        }

        if (entry && typeof entry === 'object') {
            return {
                count: Number(entry.count) || 0,
                triggers: entry.triggers && typeof entry.triggers === 'object' ? { ...entry.triggers } : {}
            };
        }

        return { count: 0, triggers: {} };
    };

    const formatPercent = (value) => `${Math.round(value)}%`;
    const sortedDateKeys = Object.keys(dailyHabitChecks).sort();

    const triggerLabels = {
        stress: 'Stress',
        boredom: 'Boredom',
        social: 'Social context',
        'late-night': 'Late night',
        other: 'Other'
    };

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
            const key = getDateKey(addDays(startDate, i));
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
            const key = getDateKey(addDays(startDate, i));
            const success = Boolean(challengeDataByDate[key]?.successful);

            if (!success) break;
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
        const triggerTotals = {};
        let totalCount = 0;

        Object.values(slipEventsByDate).forEach((dayMap) => {
            Object.entries(dayMap || {}).forEach(([habitId, rawEntry]) => {
                const entry = normalizeSlipEntry(rawEntry);
                totals[habitId] = (totals[habitId] || 0) + entry.count;
                totalCount += entry.count;

                Object.entries(entry.triggers).forEach(([trigger, count]) => {
                    triggerTotals[trigger] = (triggerTotals[trigger] || 0) + Number(count || 0);
                });
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

        const topTriggerEntry = Object.entries(triggerTotals).sort((a, b) => b[1] - a[1])[0];
        const topTrigger = topTriggerEntry
            ? `${triggerLabels[topTriggerEntry[0]] || topTriggerEntry[0]} (${topTriggerEntry[1]})`
            : '-';

        return { rows, totalCount, topTrigger, triggerTotals };
    };

    const computeHabitStats = () => {
        const frictionWeight = {
            high: 1.35,
            medium: 1.05,
            low: 0.8
        };

        const rows = habits.map((habit) => {
            let totalMarkedDays = 0;
            let completedDays = 0;

            sortedDateKeys.forEach((dateKey) => {
                const dayChecks = dailyHabitChecks[dateKey] || {};
                const anyChecks = Object.keys(dayChecks).length > 0;
                if (!anyChecks) return;

                totalMarkedDays++;
                if (dayChecks[habit.id]) completedDays++;
            });

            let currentStreak = 0;
            let bestStreak = 0;
            let running = 0;

            sortedDateKeys.forEach((dateKey) => {
                const dayChecks = dailyHabitChecks[dateKey] || {};
                const anyChecks = Object.keys(dayChecks).length > 0;
                if (!anyChecks) return;

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
                if (!anyChecks) continue;

                if (dayChecks[habit.id]) currentStreak++;
                else break;
            }

            const completionRate = totalMarkedDays > 0 ? (completedDays / totalMarkedDays) * 100 : 0;
            const impactScore = completionRate * (frictionWeight[habit.friction] || 1) * (habit.linchpin ? 1.2 : 1);
            let status = 'Stable';
            if (completionRate < 40) status = 'Struggling';
            if (completionRate >= 75) status = 'Locked in';

            return {
                name: habit.name,
                currentStreak,
                bestStreak,
                completionRate,
                impactScore,
                status
            };
        });

        return rows.sort((a, b) => b.impactScore - a.impactScore);
    };

    const buildChallengeSeries = () => {
        if (!challengeStartDate) {
            return { labels: [], completions: [] };
        }

        const startDate = parseDateKey(challengeStartDate);
        const today = new Date();
        const elapsedDays = Math.max(1, Math.floor((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - startDate) / (1000 * 60 * 60 * 24)) + 1);
        const days = Math.min(21, elapsedDays);

        const labels = [];
        const completions = [];

        for (let i = 0; i < days; i++) {
            const dateKey = getDateKey(addDays(startDate, i));
            const dayChecks = dailyHabitChecks[dateKey] || {};
            const loggedCompletions = Object.values(dayChecks).filter(Boolean).length;
            const fallback = Number(challengeDataByDate[dateKey]?.habitsDone) || 0;

            labels.push(`D${i + 1}`);
            completions.push(Math.max(loggedCompletions, fallback));
        }

        return { labels, completions };
    };

    const destroyCharts = () => {
        Object.keys(chartRegistry).forEach((key) => {
            if (chartRegistry[key]) {
                chartRegistry[key].destroy();
                chartRegistry[key] = null;
            }
        });
    };

    const renderCharts = (slips, habitStats) => {
        if (!window.Chart) return;

        destroyCharts();

        const challengeSeries = buildChallengeSeries();
        const chartFont = 'Manrope, Avenir Next, Segoe UI, sans-serif';

        window.Chart.defaults.color = colorTextSoft;
        window.Chart.defaults.borderColor = colorLine;
        window.Chart.defaults.font.family = chartFont;

        if (progressChartEl && challengeSeries.labels.length) {
            chartRegistry.progress = new window.Chart(progressChartEl, {
                type: 'line',
                data: {
                    labels: challengeSeries.labels,
                    datasets: [
                        {
                            label: 'Habits completed',
                            data: challengeSeries.completions,
                            borderColor: colorBrand,
                            backgroundColor: 'rgba(15, 118, 110, 0.18)',
                            fill: true,
                            tension: 0.35,
                            pointRadius: 3,
                            pointHoverRadius: 4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { stepSize: 1, font: { family: chartFont } }
                        },
                        x: {
                            ticks: { font: { family: chartFont } }
                        }
                    }
                }
            });
        }

        const triggerEntries = Object.entries(slips.triggerTotals)
            .sort((a, b) => b[1] - a[1]);

        if (triggerChartEl && triggerEntries.length) {
            chartRegistry.trigger = new window.Chart(triggerChartEl, {
                type: 'doughnut',
                data: {
                    labels: triggerEntries.map(([key]) => triggerLabels[key] || key),
                    datasets: [
                        {
                            data: triggerEntries.map(([, value]) => value),
                            backgroundColor: [colorBrand, colorAccent, '#2f6f99', colorDanger, colorSuccess]
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { font: { family: chartFont } }
                        }
                    }
                }
            });
        }

        if (impactChartEl && habitStats.length) {
            const top = habitStats.slice(0, 7);
            chartRegistry.impact = new window.Chart(impactChartEl, {
                type: 'bar',
                data: {
                    labels: top.map((row) => row.name),
                    datasets: [
                        {
                            label: 'Impact score',
                            data: top.map((row) => Math.round(row.impactScore)),
                            backgroundColor: colorBrandStrong
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y',
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            ticks: { font: { family: chartFont } }
                        },
                        x: {
                            beginAtZero: true,
                            ticks: { font: { family: chartFont } }
                        }
                    }
                }
            });
        }

        if (slipHabitChartEl && slips.rows.length) {
            const topSlips = slips.rows.slice(0, 7);
            chartRegistry.slipHabit = new window.Chart(slipHabitChartEl, {
                type: 'bar',
                data: {
                    labels: topSlips.map((row) => row.name),
                    datasets: [
                        {
                            label: 'Slip count',
                            data: topSlips.map((row) => row.count),
                            backgroundColor: colorDanger
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { stepSize: 1, font: { family: chartFont } }
                        },
                        x: {
                            ticks: { font: { family: chartFont } }
                        }
                    }
                }
            });
        }
    };

    const renderEmptyState = () => {
        currentStreakEl.textContent = '0';
        bestStreakEl.textContent = '0';
        totalSlipsEl.textContent = '0';
        successRateEl.textContent = '0%';
        if (topTriggerEl) topTriggerEl.textContent = '-';
        if (topImpactEl) topImpactEl.textContent = '-';

        slipBody.innerHTML = '';
        habitBody.innerHTML = '';
        slipEmpty.hidden = false;
        habitEmpty.hidden = false;
        destroyCharts();
    };

    const render = () => {
        const streaks = computeStreaks();
        const slips = computeSlipTotals();
        const habitStats = computeHabitStats();

        currentStreakEl.textContent = String(streaks.current);
        bestStreakEl.textContent = String(streaks.best);
        totalSlipsEl.textContent = String(slips.totalCount);
        successRateEl.textContent = formatPercent(streaks.successRate);
        if (topTriggerEl) topTriggerEl.textContent = slips.topTrigger;
        if (topImpactEl) topImpactEl.textContent = habitStats.length ? habitStats[0].name : '-';

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
                    <td>${Math.round(row.impactScore)}</td>
                    <td>${row.status}</td>
                `;
                habitBody.appendChild(tr);
            });
        }

        renderCharts(slips, habitStats);
    };

    render();
});
