document.addEventListener('DOMContentLoaded', () => {
    const core = window.HabitAppCore;
    const config = core.readConfig();
    const client = core.createClient(config);

    const form = document.getElementById('notes-form');
    const editor = document.getElementById('notes-editor');
    const statusEl = document.getElementById('notes-status');
    const listEl = document.getElementById('notes-list');
    const emptyEl = document.getElementById('notes-empty');
    const clearBtn = document.getElementById('notes-clear-btn');
    const refreshBtn = document.getElementById('notes-refresh-btn');

    const DRAFT_KEY = 'habit_notes_draft';
    const state = {
        unlocked: false,
        notes: []
    };

    const setStatus = (message, isError) => {
        statusEl.textContent = message;
        statusEl.style.color = isError ? '#ff8b8b' : '';
    };

    const renderNotes = () => {
        listEl.innerHTML = '';
        emptyEl.hidden = state.notes.length > 0;

        state.notes.forEach((note) => {
            const row = document.createElement('article');
            row.className = 'compact-item stack';

            const createdAt = note.createdAt
                ? new Date(note.createdAt).toLocaleString()
                : 'Unknown date';

            row.innerHTML = `
                <div class="split-row">
                    <span class="pill">${escapeHtml(note.source)}</span>
                    <span class="card-meta">${escapeHtml(createdAt)}</span>
                </div>
                <p class="notes-text">${escapeHtml(note.noteText)}</p>
                <div class="row-actions">
                    <button class="ghost-btn" type="button" data-action="delete-note" data-note-id="${note.id}">Delete</button>
                </div>
            `;

            listEl.appendChild(row);
        });
    };

    const loadNotes = async () => {
        if (!client) {
            setStatus('Supabase is not configured.', true);
            return;
        }

        try {
            state.notes = await core.loadNotes(client, config, {
                limit: 80
            });
            renderNotes();
            setStatus('Synced with quick_notes.', false);
        } catch (error) {
            setStatus(`Could not load notes: ${error.message}`, true);
        }
    };

    const unlock = async () => {
        state.unlocked = true;
        await loadNotes();
    };

    const lock = () => {
        state.unlocked = false;
        state.notes = [];
        renderNotes();
        setStatus('Locked.', false);
    };

    editor.value = localStorage.getItem(DRAFT_KEY) || '';

    editor.addEventListener('input', () => {
        localStorage.setItem(DRAFT_KEY, editor.value);
    });

    clearBtn.addEventListener('click', () => {
        editor.value = '';
        localStorage.removeItem(DRAFT_KEY);
        setStatus('Draft cleared.', false);
    });

    refreshBtn.addEventListener('click', async () => {
        if (!state.unlocked) return;
        setStatus('Refreshing notes...', false);
        await loadNotes();
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!state.unlocked) return;

        const noteText = String(editor.value || '').trim();
        if (!noteText) {
            setStatus('Please write something before saving.', true);
            return;
        }

        setStatus('Saving note...', false);
        try {
            await core.createNote(client, config, {
                noteText,
                source: 'other'
            });

            editor.value = '';
            localStorage.removeItem(DRAFT_KEY);
            await loadNotes();
            setStatus('Saved to cloud.', false);
        } catch (error) {
            setStatus(`Could not save note: ${error.message}`, true);
        }
    });

    listEl.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-action="delete-note"]');
        if (!button || !state.unlocked) return;

        const noteId = button.dataset.noteId;
        if (!noteId) return;

        button.disabled = true;
        setStatus('Deleting note...', false);
        try {
            await core.deleteNote(client, config, noteId);
            await loadNotes();
            setStatus('Note deleted.', false);
        } catch (error) {
            setStatus(`Delete failed: ${error.message}`, true);
            button.disabled = false;
        }
    });

    document.addEventListener('habit-shell:unlocked', () => {
        void unlock();
    });

    document.addEventListener('habit-shell:locked', lock);

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
