document.addEventListener('DOMContentLoaded', () => {
    const core = window.HabitAppCore;
    const config = core.readConfig();

    const authScreen = document.getElementById('auth-screen');
    const authForm = document.getElementById('auth-form');
    const authPassword = document.getElementById('auth-password');
    const authStatus = document.getElementById('auth-status');
    const shellBody = document.getElementById('shell-body');
    const signOutBtn = document.getElementById('sign-out-btn');

    if (!authScreen || !authForm || !authPassword || !authStatus || !shellBody || !signOutBtn) {
        return;
    }

    const emitLifecycleEvent = (name) => {
        document.dispatchEvent(new CustomEvent(name));
    };

    const unlock = () => {
        shellBody.hidden = false;
        authScreen.hidden = true;
        core.setCookie(core.COOKIE_NAME, '1', config.cookieDays);
        authStatus.textContent = 'Unlocked.';
        emitLifecycleEvent('habit-shell:unlocked');
    };

    const lock = () => {
        shellBody.hidden = true;
        authScreen.hidden = false;
        core.clearCookie(core.COOKIE_NAME);
        authStatus.textContent = 'Locked.';
        emitLifecycleEvent('habit-shell:locked');
    };

    signOutBtn.addEventListener('click', lock);

    authForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const entered = String(authPassword.value || '').trim();
        if (entered !== config.wallPassword) {
            authStatus.textContent = 'Wrong password.';
            return;
        }

        authPassword.value = '';
        unlock();
    });

    if (core.getCookie(core.COOKIE_NAME) === '1') {
        unlock();
    } else {
        lock();
    }
});
