document.addEventListener('DOMContentLoaded', () => {
    const core = window.HabitAppCore;
    const config = core.readConfig();
    const client = core.createClient(config);

    const statusEl = document.getElementById('settings-info');
    const refreshBtn = document.getElementById('settings-refresh-btn');

    const focusCreateForm = document.getElementById('focus-create-form');
    const focusNameInput = document.getElementById('focus-name');
    const focusTypeInput = document.getElementById('focus-type');
    const focusTargetInput = document.getElementById('focus-target');
    const focusTimeCheckboxes = Array.from(document.querySelectorAll('input[name="focus-time-block"]'));

    const viceCreateForm = document.getElementById('vice-create-form');
    const viceNameInput = document.getElementById('vice-name');
    const viceMethodInput = document.getElementById('vice-method');
    const viceUnitInput = document.getElementById('vice-unit');
    const viceBudgetFields = document.getElementById('vice-budget-fields');
    const viceInitialInput = document.getElementById('vice-initial');
    const viceGoalInput = document.getElementById('vice-goal');
    const viceStepInput = document.getElementById('vice-step');
    const viceIntervalInput = document.getElementById('vice-interval');

    const focusListEl = document.getElementById('focus-manager-list');
    const viceListEl = document.getElementById('vice-manager-list');
    const focusEmptyEl = document.getElementById('focus-manager-empty');
    const viceEmptyEl = document.getElementById('vice-manager-empty');

    const modal = document.getElementById('habit-edit-modal');
    const modalTitleEl = document.getElementById('habit-edit-title');
    const modalForm = document.getElementById('habit-edit-form');
    const modalCancelBtn = document.getElementById('habit-edit-cancel');
    const modalStatusEl = document.getElementById('habit-edit-status');

    const editNameInput = document.getElementById('edit-name');
    const editTypeInput = document.getElementById('edit-type');
    const editTargetInput = document.getElementById('edit-target');
    const editTimeWrap = document.getElementById('edit-time-wrap');
    const editTimeCheckboxes = Array.from(document.querySelectorAll('input[name="edit-time-block"]'));

    const editViceWrap = document.getElementById('edit-vice-wrap');
    const editMethodInput = document.getElementById('edit-method');
    const editUnitInput = document.getElementById('edit-unit');
    const editBudgetFields = document.getElementById('edit-budget-fields');
    const editInitialInput = document.getElementById('edit-initial');
    const editCurrentInput = document.getElementById('edit-current');
    const editGoalInput = document.getElementById('edit-goal');
    const editStepInput = document.getElementById('edit-step');
    const editIntervalInput = document.getElementById('edit-interval');

    const state = {
        unlocked: false,
        habits: [],
        editingHabitId: null
    };

    const setStatus = (message, isError) => {
        statusEl.textContent = message;
        statusEl.style.color = isError ? '#ff8b8b' : '';
    };

    const setModalStatus = (message, isError) => {
        modalStatusEl.textContent = message;
        modalStatusEl.style.color = isError ? '#ff8b8b' : '';
    };

    const getFocusHabits = () => state.habits.filter((habit) => habit.category === 'focus' && !habit.archived);
    const getViceHabits = () => state.habits.filter((habit) => habit.category === 'vice' && !habit.archived);

    const applyAnytimeRule = (checkboxes, changedInput) => {
        if (changedInput.value === 'anytime' && changedInput.checked) {
            checkboxes.filter((box) => box.value !== 'anytime').forEach((box) => {
                box.checked = false;
            });
            return;
        }

        if (changedInput.value !== 'anytime' && changedInput.checked) {
            const anytime = checkboxes.find((box) => box.value === 'anytime');
            if (anytime) anytime.checked = false;
        }

        const anySelected = checkboxes.some((box) => box.checked);
        if (!anySelected) {
            const anytime = checkboxes.find((box) => box.value === 'anytime');
            if (anytime) anytime.checked = true;
        }
    };

    const setTimeSelection = (checkboxes, values) => {
        const normalized = core.normalizeTimeBlocks(values);
        checkboxes.forEach((box) => {
            box.checked = normalized.includes(box.value);
        });
    };

    const collectTimeSelection = (checkboxes) => core.normalizeTimeBlocks(
        checkboxes
            .filter((box) => box.checked)
            .map((box) => box.value)
    );

    const refreshFromCloud = async () => {
        if (!client) {
            setStatus('Supabase is not configured.', true);
            return;
        }

        const habits = await core.loadHabits(client, config);
        await core.applyBudgetTapering(client, config, habits);
        state.habits = await core.loadHabits(client, config);
        renderAll();
    };

    const renderAll = () => {
        renderFocusManager();
        renderViceManager();
    };

    const renderFocusManager = () => {
        const focusHabits = getFocusHabits();
        focusListEl.innerHTML = '';
        focusEmptyEl.hidden = focusHabits.length > 0;

        focusHabits.forEach((habit, index) => {
            const row = document.createElement('article');
            row.className = 'manager-row';
            row.innerHTML = `
                <div class="manager-main">
                    <p class="manager-title">${escapeHtml(habit.name)}</p>
                    <p class="manager-meta">${habit.habit_type} · ${habit.target_amount} ${escapeHtml(habit.unit)} · ${escapeHtml(habit.time_of_day.join(', '))}</p>
                </div>
                <div class="manager-actions">
                    <button class="icon-btn" type="button" data-action="move-up" data-category="focus" data-index="${index}" title="Move up">U</button>
                    <button class="icon-btn" type="button" data-action="move-down" data-category="focus" data-index="${index}" title="Move down">D</button>
                    <button class="ghost-btn" type="button" data-action="edit" data-id="${habit.id}">Edit</button>
                    <button class="ghost-btn" type="button" data-action="archive" data-id="${habit.id}">Archive</button>
                </div>
            `;
            focusListEl.appendChild(row);
        });
    };

    const renderViceManager = () => {
        const viceHabits = getViceHabits();
        viceListEl.innerHTML = '';
        viceEmptyEl.hidden = viceHabits.length > 0;

        viceHabits.forEach((habit, index) => {
            const method = habit.tracking_method || 'streak';
            const limitLabel = method === 'budget'
                ? `${Number(habit.current_limit ?? habit.initial_limit ?? 0)} ${escapeHtml(habit.unit)}`
                : 'streak mode';

            const row = document.createElement('article');
            row.className = 'manager-row';
            row.innerHTML = `
                <div class="manager-main">
                    <p class="manager-title">${escapeHtml(habit.name)}</p>
                    <p class="manager-meta">${method} · ${limitLabel}</p>
                </div>
                <div class="manager-actions">
                    <button class="icon-btn" type="button" data-action="move-up" data-category="vice" data-index="${index}" title="Move up">U</button>
                    <button class="icon-btn" type="button" data-action="move-down" data-category="vice" data-index="${index}" title="Move down">D</button>
                    <button class="ghost-btn" type="button" data-action="edit" data-id="${habit.id}">Edit</button>
                    <button class="ghost-btn" type="button" data-action="archive" data-id="${habit.id}">Archive</button>
                </div>
            `;
            viceListEl.appendChild(row);
        });
    };

    const moveCategoryHabit = async (category, index, direction) => {
        const habits = (category === 'focus' ? getFocusHabits() : getViceHabits()).slice();
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= habits.length) return;

        const reordered = habits.map((habit) => habit.id);
        const [item] = reordered.splice(index, 1);
        reordered.splice(targetIndex, 0, item);

        setStatus('Saving order...', false);
        try {
            await core.reorderHabits(client, config, reordered);
            await refreshFromCloud();
            setStatus('Order updated.', false);
        } catch (error) {
            setStatus(`Could not reorder habits: ${error.message}`, true);
        }
    };

    const openEditModal = (habit) => {
        state.editingHabitId = habit.id;
        setModalStatus('', false);

        modalTitleEl.textContent = `Edit ${habit.category === 'focus' ? 'Focus' : 'Vice'} Habit`;
        editNameInput.value = habit.name;
        editTypeInput.value = habit.habit_type;
        editTargetInput.value = String(Math.max(1, Number(habit.target_amount) || 1));

        editTimeWrap.hidden = habit.category !== 'focus';
        setTimeSelection(editTimeCheckboxes, habit.time_of_day || ['anytime']);

        editViceWrap.hidden = habit.category !== 'vice';
        if (habit.category === 'vice') {
            editMethodInput.value = habit.tracking_method || 'streak';
            editUnitInput.value = habit.unit || 'min';
            editInitialInput.value = String(habit.initial_limit ?? '');
            editCurrentInput.value = String(habit.current_limit ?? '');
            editGoalInput.value = String(habit.goal_limit ?? '');
            editStepInput.value = String(habit.taper_step_amount ?? '');
            editIntervalInput.value = String(habit.taper_interval_days ?? '');
            editBudgetFields.hidden = editMethodInput.value !== 'budget';
        }

        modal.hidden = false;
    };

    const closeEditModal = () => {
        state.editingHabitId = null;
        modal.hidden = true;
    };

    const buildFocusPayload = () => ({
        name: String(focusNameInput.value || '').trim(),
        category: 'focus',
        habit_type: focusTypeInput.value === 'duration' ? 'duration' : 'count',
        target_amount: Math.max(1, Number(focusTargetInput.value) || 1),
        time_of_day: collectTimeSelection(focusTimeCheckboxes),
        unit: focusTypeInput.value === 'duration' ? 'minutes' : 'times',
        tracking_method: null
    });

    const buildVicePayload = () => {
        const method = viceMethodInput.value === 'budget' ? 'budget' : 'streak';
        const base = {
            name: String(viceNameInput.value || '').trim(),
            category: 'vice',
            habit_type: method === 'budget' ? 'duration' : 'count',
            target_amount: method === 'budget' ? Math.max(1, Number(viceInitialInput.value) || 1) : 1,
            time_of_day: ['anytime'],
            unit: method === 'budget' ? core.sanitizeUnit(viceUnitInput.value, 'min') : 'times',
            tracking_method: method
        };

        if (method === 'budget') {
            base.initial_limit = Math.max(1, Number(viceInitialInput.value) || 1);
            base.current_limit = Math.max(1, Number(viceInitialInput.value) || 1);
            base.goal_limit = Math.max(0, Number(viceGoalInput.value) || 0);
            base.taper_step_amount = Math.max(0.1, Number(viceStepInput.value) || 15);
            base.taper_interval_days = Math.max(1, Number(viceIntervalInput.value) || 7);
            base.taper_rate = `reduce by ${base.taper_step_amount} ${base.unit} every ${base.taper_interval_days} days`;
            base.taper_started_at = new Date().toISOString();
            base.taper_last_applied_at = new Date().toISOString();
        }

        return base;
    };

    const unlock = async () => {
        state.unlocked = true;
        setStatus('Loading settings...', false);
        try {
            await refreshFromCloud();
            setStatus('Settings synced.', false);
        } catch (error) {
            setStatus(`Load failed: ${error.message}`, true);
        }
    };

    const lock = () => {
        state.unlocked = false;
        state.habits = [];
        renderAll();
        closeEditModal();
        setStatus('Locked.', false);
    };

    focusTimeCheckboxes.forEach((checkbox) => {
        checkbox.addEventListener('change', () => applyAnytimeRule(focusTimeCheckboxes, checkbox));
    });

    editTimeCheckboxes.forEach((checkbox) => {
        checkbox.addEventListener('change', () => applyAnytimeRule(editTimeCheckboxes, checkbox));
    });

    viceMethodInput.addEventListener('change', () => {
        viceBudgetFields.hidden = viceMethodInput.value !== 'budget';
    });

    editMethodInput.addEventListener('change', () => {
        editBudgetFields.hidden = editMethodInput.value !== 'budget';
    });

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

    focusCreateForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!state.unlocked) return;

        const payload = buildFocusPayload();
        if (!payload.name) {
            setStatus('Focus habit name is required.', true);
            return;
        }

        setStatus('Creating focus habit...', false);
        try {
            payload.sort_order = getFocusHabits().length;
            await core.createHabit(client, config, payload);
            focusCreateForm.reset();
            focusTypeInput.value = 'count';
            focusTargetInput.value = '1';
            setTimeSelection(focusTimeCheckboxes, ['anytime']);
            await refreshFromCloud();
            setStatus('Focus habit created.', false);
        } catch (error) {
            setStatus(`Could not create focus habit: ${error.message}`, true);
        }
    });

    viceCreateForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!state.unlocked) return;

        const payload = buildVicePayload();
        if (!payload.name) {
            setStatus('Vice name is required.', true);
            return;
        }

        setStatus('Creating vice habit...', false);
        try {
            payload.sort_order = getViceHabits().length;
            await core.createHabit(client, config, payload);
            viceCreateForm.reset();
            viceMethodInput.value = 'streak';
            viceUnitInput.value = 'min';
            viceInitialInput.value = '120';
            viceGoalInput.value = '0';
            viceStepInput.value = '15';
            viceIntervalInput.value = '7';
            viceBudgetFields.hidden = true;
            await refreshFromCloud();
            setStatus('Vice habit created.', false);
        } catch (error) {
            setStatus(`Could not create vice habit: ${error.message}`, true);
        }
    });

    focusListEl.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button || !state.unlocked) return;

        const action = button.dataset.action;
        if (action === 'move-up' || action === 'move-down') {
            const index = Number(button.dataset.index);
            const category = button.dataset.category;
            if (!Number.isFinite(index) || !category) return;
            await moveCategoryHabit(category, index, action === 'move-up' ? 'up' : 'down');
            return;
        }

        const habitId = button.dataset.id;
        if (!habitId) return;
        const habit = state.habits.find((entry) => entry.id === habitId);
        if (!habit) return;

        if (action === 'edit') {
            openEditModal(habit);
            return;
        }

        if (action === 'archive') {
            setStatus('Archiving habit...', false);
            try {
                await core.archiveHabit(client, config, habitId);
                await refreshFromCloud();
                setStatus('Habit archived.', false);
            } catch (error) {
                setStatus(`Could not archive habit: ${error.message}`, true);
            }
        }
    });

    viceListEl.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button || !state.unlocked) return;

        const action = button.dataset.action;
        if (action === 'move-up' || action === 'move-down') {
            const index = Number(button.dataset.index);
            const category = button.dataset.category;
            if (!Number.isFinite(index) || !category) return;
            await moveCategoryHabit(category, index, action === 'move-up' ? 'up' : 'down');
            return;
        }

        const habitId = button.dataset.id;
        if (!habitId) return;
        const habit = state.habits.find((entry) => entry.id === habitId);
        if (!habit) return;

        if (action === 'edit') {
            openEditModal(habit);
            return;
        }

        if (action === 'archive') {
            setStatus('Archiving vice...', false);
            try {
                await core.archiveHabit(client, config, habitId);
                await refreshFromCloud();
                setStatus('Vice archived.', false);
            } catch (error) {
                setStatus(`Could not archive vice: ${error.message}`, true);
            }
        }
    });

    modalCancelBtn.addEventListener('click', closeEditModal);

    modalForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!state.unlocked || !state.editingHabitId) return;

        const habit = state.habits.find((entry) => entry.id === state.editingHabitId);
        if (!habit) return;

        const updates = {
            name: String(editNameInput.value || '').trim(),
            habit_type: editTypeInput.value === 'duration' ? 'duration' : 'count',
            target_amount: Math.max(1, Number(editTargetInput.value) || 1)
        };

        if (!updates.name) {
            setModalStatus('Name is required.', true);
            return;
        }

        if (habit.category === 'focus') {
            updates.time_of_day = collectTimeSelection(editTimeCheckboxes);
            updates.unit = updates.habit_type === 'duration' ? 'minutes' : 'times';
            updates.tracking_method = null;
        }

        if (habit.category === 'vice') {
            const method = editMethodInput.value === 'budget' ? 'budget' : 'streak';
            updates.tracking_method = method;
            updates.habit_type = method === 'budget' ? 'duration' : 'count';
            updates.unit = method === 'budget' ? core.sanitizeUnit(editUnitInput.value, 'min') : 'times';
            updates.target_amount = method === 'budget'
                ? Math.max(1, Number(editCurrentInput.value || editInitialInput.value) || 1)
                : 1;

            if (method === 'budget') {
                updates.initial_limit = Number(editInitialInput.value || 0);
                updates.current_limit = Number(editCurrentInput.value || 0);
                updates.goal_limit = Number(editGoalInput.value || 0);
                updates.taper_step_amount = Number(editStepInput.value || 0);
                updates.taper_interval_days = Number(editIntervalInput.value || 7);
                updates.taper_rate = `reduce by ${updates.taper_step_amount} ${updates.unit} every ${updates.taper_interval_days} days`;
            } else {
                updates.initial_limit = null;
                updates.current_limit = null;
                updates.goal_limit = null;
                updates.taper_step_amount = null;
                updates.taper_interval_days = null;
                updates.taper_rate = null;
            }
        }

        setModalStatus('Saving changes...', false);
        try {
            await core.updateHabit(client, config, habit.id, updates);
            await refreshFromCloud();
            closeEditModal();
            setStatus('Habit updated.', false);
        } catch (error) {
            setModalStatus(`Could not save changes: ${error.message}`, true);
        }
    });

    document.addEventListener('habit-shell:unlocked', () => {
        void unlock();
    });

    document.addEventListener('habit-shell:locked', lock);

    if (core.getCookie(core.COOKIE_NAME) === '1') {
        void unlock();
    }

    viceBudgetFields.hidden = true;
    setTimeSelection(focusTimeCheckboxes, ['anytime']);
});

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
