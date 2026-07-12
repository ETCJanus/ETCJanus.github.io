/* ============================================================
   FIELD LOG — deck + record logic
   Reads window.FIELD_LOG from entries.js. No dependencies.

   THE MODEL
   - challenges are standing cards; they never expire
   - a completion is (challenge id, date); "done" only ever
     means "done today", so at midnight every stamp resets
     by itself — the date IS the reset
   - completions merge from two sources:
       1. FIELD_LOG.logbook (committed, permanent)
       2. localStorage      (stamped in this browser, pending)
     pending ones can be copied out and pasted into entries.js;
     once committed there, the local copies are cleaned up

   INTERACTIONS
   - click a card's stamp spot -> done today (click again: undo)
   - click the card itself     -> flips to its service record
   - category stamps           -> filter the deck
   - click an ✕ in the tally   -> jumps to that day in The Record
   - click the header stamp    -> re-stamps it (because it's fun)
   ============================================================ */

(function () {
    "use strict";

    var LOG = window.FIELD_LOG || {};
    var challenges = LOG.challenges || [];
    var STORE_KEY = "fieldlog-local-v1";

    var MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN",
                  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    var WEEKDAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY",
                    "THURSDAY", "FRIDAY", "SATURDAY"];

    var CAT_CLASS = {
        MIND: "cat-mind",
        BODY: "cat-body",
        DISCIPLINE: "cat-discipline"
    };

    var GRADE_WORDS = {
        1: "A WARM-UP",
        2: "UNCOMFORTABLE",
        3: "PROPERLY HARD",
        4: "GENUINELY BRUTAL",
        5: "PEAK RESISTANCE"
    };

    /* ---------- helpers ---------- */

    function parseDate(str) {
        var p = str.split("-");
        return new Date(+p[0], +p[1] - 1, +p[2]);
    }

    function dayKey(d) {
        return d.getFullYear() + "-" +
            String(d.getMonth() + 1).padStart(2, "0") + "-" +
            String(d.getDate()).padStart(2, "0");
    }

    function fmtDate(str) {
        var d = parseDate(str);
        return String(d.getDate()).padStart(2, "0") + " " +
            MONTHS[d.getMonth()] + " " + d.getFullYear();
    }

    function fmtShort(str) {
        var d = parseDate(str);
        return String(d.getDate()).padStart(2, "0") + " " + MONTHS[d.getMonth()];
    }

    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
        });
    }

    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var today = new Date();
    var todayKey = dayKey(today);

    var byId = {};
    challenges.forEach(function (c) { byId[c.id] = c; });

    /* ---------- completions: committed + local, merged ---------- */

    var committed = (LOG.logbook || []).filter(function (r) {
        return r && r.date && byId[r.id];
    });

    var committedKeys = {};
    committed.forEach(function (r) { committedKeys[r.id + "@" + r.date] = true; });

    function loadLocal() {
        try {
            var raw = JSON.parse(localStorage.getItem(STORE_KEY)) || [];
            // drop malformed rows, rows for unknown challenges, and rows
            // that have since been transcribed into the committed logbook
            return raw.filter(function (r) {
                return r && r.date && byId[r.id] && !committedKeys[r.id + "@" + r.date];
            });
        } catch (e) { return []; }
    }

    function saveLocal(rows) {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(rows)); } catch (e) {}
    }

    var local = loadLocal();
    saveLocal(local); // persist the cleanup

    function allCompletions() {
        // committed wins on duplicates; dedupe by id@date
        var seen = {};
        var out = [];
        committed.concat(local).forEach(function (r) {
            var k = r.id + "@" + r.date;
            if (seen[k]) return;
            seen[k] = true;
            out.push(r);
        });
        return out;
    }

    function isDone(id, date) {
        return allCompletions().some(function (r) {
            return r.id === id && r.date === date;
        });
    }

    function isCommitted(id, date) {
        return !!committedKeys[id + "@" + date];
    }

    /* ---------- derived stats (recomputed on every change) ---------- */

    function computeStats() {
        var rows = allCompletions();
        var loggedDays = {};
        rows.forEach(function (r) {
            loggedDays[r.date] = (loggedDays[r.date] || 0) + 1;
        });

        var monthPrefix = todayKey.slice(0, 7);
        var streak = 0;
        var cursor = new Date(today);
        if (!loggedDays[dayKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
        while (loggedDays[dayKey(cursor)]) {
            streak++;
            cursor.setDate(cursor.getDate() - 1);
        }

        return {
            rows: rows,
            loggedDays: loggedDays,
            total: rows.length,
            thisMonth: rows.filter(function (r) { return r.date.slice(0, 7) === monthPrefix; }).length,
            streak: streak,
            summits: rows.filter(function (r) { return (byId[r.id].grade || 0) >= 5; }).length
        };
    }

    function challengeStats(id) {
        var rows = allCompletions().filter(function (r) { return r.id === id; })
            .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
        var days = {};
        rows.forEach(function (r) { days[r.date] = true; });
        var streak = 0;
        var cursor = new Date(today);
        if (!days[dayKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
        while (days[dayKey(cursor)]) {
            streak++;
            cursor.setDate(cursor.getDate() - 1);
        }
        return { times: rows.length, last: rows[0] ? rows[0].date : null, streak: streak };
    }

    /* ---------- stat tiles ---------- */

    var statsRevealed = false;

    function renderStats(animate) {
        var s = computeStats();
        var targets = {
            "stat-total": s.total,
            "stat-month": s.thisMonth,
            "stat-streak": s.streak,
            "stat-summits": s.summits
        };
        Object.keys(targets).forEach(function (id) {
            var el = document.getElementById(id);
            if (animate && !reduceMotion) countUp(el, targets[id]);
            else el.textContent = targets[id];
        });
    }

    function countUp(el, target) {
        if (target === 0) { el.textContent = 0; return; }
        var start = null;
        var dur = 900;
        function step(ts) {
            if (!start) start = ts;
            var p = Math.min((ts - start) / dur, 1);
            el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
            if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    /* ---------- ink tally ---------- */

    var tallyGrid = document.getElementById("tally-grid");
    document.getElementById("tally-month").textContent =
        MONTHS[today.getMonth()] + " " + today.getFullYear();

    function renderTally() {
        var s = computeStats();
        var monthPrefix = todayKey.slice(0, 7);
        var daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        var html = "";
        var crossDelay = 0;
        for (var day = 1; day <= daysInMonth; day++) {
            var key = monthPrefix + "-" + String(day).padStart(2, "0");
            var isFuture = day > today.getDate();
            var n = s.loggedDays[key] || 0;
            var cls = "tally-cell" + (isFuture ? " future" : "") + (n ? " logged" : "");
            var attrs = "";
            var cross = "";
            if (n) {
                attrs = ' data-date="' + key + '" tabindex="0" role="button"' +
                    ' title="' + n + (n > 1 ? " completions" : " completion") + " — see the record of " + fmtDate(key) + '"' +
                    ' aria-label="Jump to the record of ' + fmtDate(key) + '"';
                // hand-drawn ✕ — jitter the endpoints so no two look identical
                var j = function () { return (Math.random() * 3 - 1.5).toFixed(1); };
                cross = '<svg viewBox="0 0 20 20" style="--d:' + crossDelay.toFixed(2) + 's" aria-hidden="true">' +
                    '<path d="M' + (3 + +j()) + " " + (3.5 + +j()) + " L" + (17 + +j()) + " " + (16.5 + +j()) + '"/>' +
                    '<path d="M' + (17 + +j()) + " " + (3.5 + +j()) + " L" + (3 + +j()) + " " + (16.5 + +j()) + '"/>' +
                    "</svg>";
                crossDelay += 0.07;
            }
            html += '<div class="' + cls + '"' + attrs + '><span class="daynum">' + day + "</span>" + cross + "</div>";
        }
        tallyGrid.innerHTML = html;
    }

    tallyGrid.addEventListener("click", function (ev) {
        var cell = ev.target.closest(".tally-cell.logged");
        if (cell) jumpToRecord(cell.dataset.date);
    });
    tallyGrid.addEventListener("keydown", function (ev) {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        var cell = ev.target.closest(".tally-cell.logged");
        if (cell) { ev.preventDefault(); jumpToRecord(cell.dataset.date); }
    });

    /* ---------- the deck ---------- */

    var container = document.getElementById("entries");
    document.getElementById("deck-date").textContent =
        WEEKDAYS[today.getDay()] + ", " + fmtShort(todayKey);

    var cardEls = {};

    function gradeMarks(grade) {
        var out = "";
        for (var g = 1; g <= 5; g++) {
            out += g <= grade ? "▲" : '<span class="dim">▲</span>';
        }
        return out;
    }

    function buildCard(c, i) {
        var el = document.createElement("article");
        el.className = "entry" + (c.grade >= 5 ? " summit" : "");
        el.dataset.id = c.id;
        el.dataset.category = c.category;
        el.style.setProperty("--tilt", ((i % 2 === 0 ? -1 : 1) * (0.35 + Math.random() * 0.5)).toFixed(2) + "deg");
        el.style.setProperty("--tape-tilt", (Math.random() * 6 - 3).toFixed(1) + "deg");
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.setAttribute("aria-expanded", "false");
        el.setAttribute("aria-label", c.title + " — click to see its service record");

        var catClass = CAT_CLASS[c.category] || "cat-other";

        el.innerHTML =
            '<div class="entry-flip">' +

            '<div class="entry-face entry-front">' +
            '<div class="entry-meta">' +
            '<span class="entry-cat ' + catClass + '">' + esc(c.category) + "</span>" +
            '<span class="entry-grade" title="Grade ' + c.grade + ' of 5">' + gradeMarks(c.grade) + "</span>" +
            "</div>" +
            "<h3>" + esc(c.title) + "</h3>" +
            '<p class="note">' + esc(c.rules || "") + "</p>" +
            (c.margin ? '<span class="margin-note">' + esc(c.margin) + "</span>" : "") +
            '<button type="button" class="stamp-spot" aria-pressed="false"></button>' +
            '<span class="flip-hint">TURN OVER ⟳</span>' +
            "</div>" +

            '<div class="entry-face entry-back">' +
            '<span class="back-line">SERVICE RECORD — <b>' + esc(c.title.toUpperCase()) + "</b></span>" +
            '<span class="back-line back-times"></span>' +
            '<span class="back-line back-last"></span>' +
            '<span class="back-line back-streak"></span>' +
            '<span class="back-line">GRADE: <b>' + c.grade + "/5</b> — " + (GRADE_WORDS[c.grade] || "UNRATED") + "</span>" +
            '<span class="logged-stamp" aria-hidden="true">LOGGED</span>' +
            '<span class="flip-hint">TURN BACK ⟲</span>' +
            "</div>" +

            "</div>";

        var stampBtn = el.querySelector(".stamp-spot");

        el.addEventListener("click", function (ev) {
            if (ev.target.closest(".stamp-spot")) return;
            toggleFlip(el);
        });
        el.addEventListener("keydown", function (ev) {
            if (ev.target !== el) return;
            if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                toggleFlip(el);
            }
        });
        stampBtn.addEventListener("click", function (ev) {
            ev.stopPropagation();
            toggleDone(c.id);
        });

        return el;
    }

    function toggleFlip(el) {
        var c = byId[el.dataset.id];
        if (c && !el.classList.contains("flipped")) {
            var st = challengeStats(c.id);
            el.querySelector(".back-times").innerHTML =
                "TIMES COMPLETED: <b>" + st.times + "</b>";
            el.querySelector(".back-last").innerHTML = st.last
                ? "LAST: <b>" + fmtDate(st.last) + "</b>" + (st.last === todayKey ? " — TODAY" : "")
                : "LAST: <b>NEVER</b> — THE CARD IS WAITING";
            el.querySelector(".back-streak").innerHTML =
                st.streak > 1 ? "DAY STREAK: <b>" + st.streak + "</b>" :
                (st.times > 0 ? "STATUS: <b>ON THE RECORD</b>" : "STATUS: <b>UNTOUCHED</b>");
        }
        var flipped = el.classList.toggle("flipped");
        el.setAttribute("aria-expanded", flipped ? "true" : "false");
    }

    function refreshCardStamp(id) {
        var el = cardEls[id];
        if (!el) return;
        var done = isDone(id, todayKey);
        var locked = done && isCommitted(id, todayKey);
        var btn = el.querySelector(".stamp-spot");
        el.classList.toggle("done-today", done);
        btn.classList.toggle("locked", locked);
        btn.setAttribute("aria-pressed", done ? "true" : "false");
        if (done) {
            btn.innerHTML = "DONE ✓<br>" + fmtShort(todayKey);
            btn.title = locked
                ? "In the permanent record — edit entries.js to change it"
                : "Stamped today — click to undo";
        } else {
            btn.innerHTML = "STAMP<br>WHEN<br>DONE";
            btn.title = "Mark “" + byId[id].title + "” done today";
        }
    }

    function toggleDone(id) {
        if (isCommitted(id, todayKey)) {
            refreshCardStamp(id); // committed entries are read-only here
            return;
        }
        var idx = local.findIndex(function (r) { return r.id === id && r.date === todayKey; });
        if (idx >= 0) local.splice(idx, 1);
        else local.push({ date: todayKey, id: id });
        saveLocal(local);
        refreshCardStamp(id);
        renderStats(false);
        renderTally();
        revealTallyNow();
        renderLedger();
    }

    var cardList = [];

    if (challenges.length === 0) {
        container.innerHTML =
            '<div class="entry revealed" style="--tilt:-0.4deg; text-align:center; cursor:default;">' +
            '<div class="entry-flip"><div class="entry-face">' +
            "<h3>The deck is empty.</h3>" +
            '<p class="note">Define your standing challenges in entries.js and they appear here as cards.</p>' +
            "</div></div></div>";
    } else {
        challenges.forEach(function (c, i) {
            var el = buildCard(c, i);
            cardEls[c.id] = el;
            cardList.push(el);
            container.appendChild(el);
            refreshCardStamp(c.id);
        });
    }

    /* ---------- category filter stamps ---------- */

    var filterBar = document.getElementById("filter-bar");
    var filterCount = document.getElementById("filter-count");
    var activeFilter = "ALL";

    var categories = [];
    challenges.forEach(function (c) {
        if (categories.indexOf(c.category) === -1) categories.push(c.category);
    });

    function applyFilter(cat) {
        activeFilter = cat;
        filterBar.querySelectorAll(".filter-stamp").forEach(function (b) {
            var on = b.dataset.cat === cat;
            b.classList.toggle("active", on);
            b.setAttribute("aria-pressed", on ? "true" : "false");
        });

        var shown = 0;
        cardList.forEach(function (el) {
            var match = cat === "ALL" || el.dataset.category === cat;
            el.classList.toggle("hidden", !match);
            el.classList.remove("resettle");
            if (match) {
                el.classList.add("revealed");
                el.classList.remove("flipped");
                el.setAttribute("aria-expanded", "false");
                if (!reduceMotion) {
                    void el.offsetWidth; // restart the animation
                    el.style.setProperty("--rd", (shown * 0.06).toFixed(2) + "s");
                    el.classList.add("resettle");
                }
                shown++;
            }
        });

        filterCount.textContent = "SHOWING " + shown + " / " + challenges.length +
            (cat === "ALL" ? " CHALLENGES" : " — " + cat);
    }

    container.addEventListener("animationend", function (ev) {
        if (ev.animationName === "resettle") ev.target.classList.remove("resettle");
    });

    if (challenges.length > 0) {
        ["ALL"].concat(categories).forEach(function (cat) {
            var b = document.createElement("button");
            b.type = "button";
            b.className = "filter-stamp " + (CAT_CLASS[cat] || (cat === "ALL" ? "" : "cat-other"));
            b.dataset.cat = cat;
            b.textContent = cat;
            b.setAttribute("aria-pressed", cat === "ALL" ? "true" : "false");
            if (cat === "ALL") b.classList.add("active");
            b.addEventListener("click", function () {
                if (activeFilter !== cat) applyFilter(cat);
            });
            filterBar.appendChild(b);
        });
        filterCount.textContent = "SHOWING " + challenges.length + " / " + challenges.length + " CHALLENGES";
    }

    /* ---------- the record (ledger) ---------- */

    var ledgerEl = document.getElementById("ledger");
    var transcribeSlot = document.getElementById("transcribe-slot");
    var LEDGER_LIMIT = 30;

    function renderLedger() {
        var rows = allCompletions().slice().sort(function (a, b) {
            if (a.date !== b.date) return a.date < b.date ? 1 : -1;
            return 0;
        });

        if (rows.length === 0) {
            ledgerEl.innerHTML =
                '<p class="ledger-more">THE RECORD IS EMPTY — GO DO SOMETHING HARD</p>';
        } else {
            var html = "";
            rows.slice(0, LEDGER_LIMIT).forEach(function (r) {
                var c = byId[r.id];
                var pending = !isCommitted(r.id, r.date);
                html += '<div class="ledger-row" data-date="' + r.date + '">' +
                    '<span class="ledger-date">' + fmtDate(r.date) + "</span>" +
                    '<span class="ledger-title">' + esc(c.title) + "</span>" +
                    '<span class="ledger-meta">' + esc(c.category) + " · GR." + c.grade + "</span>" +
                    (pending ? '<span class="pending-mark">PENDING</span>' : "") +
                    (r.note ? '<span class="ledger-note">' + esc(r.note) + "</span>" : "") +
                    "</div>";
            });
            if (rows.length > LEDGER_LIMIT) {
                html += '<p class="ledger-more">+ ' + (rows.length - LEDGER_LIMIT) +
                    " OLDER — THE FULL RECORD LIVES IN THE FILE</p>";
            }
            ledgerEl.innerHTML = html;
        }

        renderTranscribeBox();
    }

    function renderTranscribeBox() {
        if (local.length === 0) {
            transcribeSlot.innerHTML = "";
            return;
        }
        transcribeSlot.innerHTML =
            '<div class="transcribe">' +
            '<span class="t-head">FIELD NOTES — PENDING TRANSCRIPTION</span>' +
            local.length + " completion" + (local.length > 1 ? "s are" : " is") +
            " stamped only in this browser.<br>" +
            "Copy the lines below into the logbook in entries.js to make " +
            (local.length > 1 ? "them" : "it") + " permanent." +
            '<br><button type="button" class="copy-btn" id="copy-pending">COPY LOGBOOK LINES</button>' +
            "</div>";

        document.getElementById("copy-pending").addEventListener("click", function () {
            var btn = this;
            var lines = local.slice().sort(function (a, b) {
                return a.date < b.date ? 1 : -1;
            }).map(function (r) {
                return '        { date: "' + r.date + '", id: "' + r.id + '" },';
            }).join("\n");

            function ok() {
                btn.textContent = "COPIED ✓ — PASTE INTO entries.js";
                setTimeout(function () { btn.textContent = "COPY LOGBOOK LINES"; }, 2600);
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(lines).then(ok, function () { fallbackCopy(lines, ok); });
            } else {
                fallbackCopy(lines, ok);
            }
        });
    }

    function fallbackCopy(text, done) {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); done(); } catch (e) {}
        document.body.removeChild(ta);
    }

    function jumpToRecord(date) {
        var rows = ledgerEl.querySelectorAll('.ledger-row[data-date="' + date + '"]');
        if (!rows.length) return;
        rows[0].scrollIntoView({
            behavior: reduceMotion ? "auto" : "smooth",
            block: "center"
        });
        rows.forEach(function (r) {
            r.classList.remove("flash");
            void r.offsetWidth;
            r.classList.add("flash");
            setTimeout(function () { r.classList.remove("flash"); }, 1700);
        });
    }

    /* ---------- typewriter subject line ---------- */

    var subjectEl = document.getElementById("typed-subject");
    var caret = subjectEl.querySelector(".caret");
    var subjectText = "SUBJECT: " + (LOG.operative || "OPERATIVE") +
        " — OPERATION: " + (LOG.operation || "DO HARD THINGS").toUpperCase();

    if (reduceMotion) {
        subjectEl.insertBefore(document.createTextNode(subjectText), caret);
    } else {
        var ti = 0;
        (function type() {
            if (ti < subjectText.length) {
                subjectEl.insertBefore(document.createTextNode(subjectText[ti]), caret);
                ti++;
                setTimeout(type, 28 + Math.random() * 45);
            }
        })();
    }

    /* ---------- header stamp: click to re-stamp ---------- */

    var headerStamp = document.getElementById("header-stamp");
    headerStamp.classList.add("stamp-in");
    headerStamp.title = "Stamp it again";
    headerStamp.addEventListener("click", function () {
        headerStamp.classList.remove("stamp-in");
        headerStamp.style.animationDelay = "0s";
        void headerStamp.offsetWidth;
        headerStamp.classList.add("stamp-in");
    });

    /* ---------- scroll reveal ---------- */

    function revealTallyNow() {
        var tally = document.querySelector(".tally");
        if (tally.classList.contains("revealed")) return;
        // if the tally was already revealed once, keep new crosses instant
        tally.classList.add("revealed");
    }

    var revealables = document.querySelectorAll(".reveal, .entry");

    if ("IntersectionObserver" in window && !reduceMotion) {
        var io = new IntersectionObserver(function (obs) {
            obs.forEach(function (o) {
                if (!o.isIntersecting) return;
                o.target.classList.add("revealed");
                if (o.target.querySelector("[data-count]") && !statsRevealed) {
                    statsRevealed = true;
                    renderStats(true);
                }
                io.unobserve(o.target);
            });
        }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });

        revealables.forEach(function (el) { io.observe(el); });
    } else {
        revealables.forEach(function (el) { el.classList.add("revealed"); });
        statsRevealed = true;
        renderStats(false);
    }

    /* ---------- day rollover: reload if the date changed ---------- */

    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible" && dayKey(new Date()) !== todayKey) {
            location.reload();
        }
    });

    /* ---------- initial render ---------- */

    renderTally();
    renderLedger();
    renderStats(false);
})();
