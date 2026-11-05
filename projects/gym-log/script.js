// Gym Log — trainingslogboek met progressive overload, weegschaal en stats.
// Data staat in Supabase (zie SETUP.sql). Schrijfacties die mislukken door slecht
// bereik in de gym worden lokaal bewaard en later alsnog verstuurd.

(function () {
    "use strict";

    const SB_URL = window.GYM_SUPABASE_URL;
    const SB_KEY = window.GYM_SUPABASE_KEY;
    const STANDAARD_DOEL = Number(window.GYM_DOEL_PER_WEEK || 0);
    const LABELS = window.GYM_LABELS || [];

    // Inlogsessie (gedeeld voor het apparaat). Alle andere lokale opslag is per gebruiker,
    // zodat twee accounts op hetzelfde apparaat elkaar niet in de weg zitten.
    const LS_SESSIE = "gym_sessie";
    const LS = {};
    function zetSleutels(uid) {
        LS.outbox = `gym_outbox_${uid}`;
        LS.kaarten = `gym_kaarten_${uid}`;   // oefeningen die al op een training staan maar nog geen sets hebben
        LS.actief = `gym_actief_${uid}`;     // id van de training die open staat
        LS.rust = `gym_rust_${uid}`;
    }

    const SPIERGROEPEN = ["borst", "rug", "schouders", "benen", "armen", "core", "overig"];

    const state = {
        tab: "training",
        oefeningen: [],
        trainingen: [],
        sets: [],
        gewicht: [],
        actief: null,
        loginModus: "in",               // "in" of "nieuw"
        nieuwLabel: "",
        kopieerVan: "auto",
        nieuweDatum: vandaag(),
        startOpen: false,               // formulier "andere training" open
        andereDag: false,               // datumveld tonen (training of weging op een andere dag)
        openOef: {},                    // per training: welke oefening openstaat (null = alles dicht)
        laatsteSet: null,               // net gelogde set (voor de korte markering)
        samenvatting: null,             // id van de training waarvan de samenvatting open staat
        samenvattingNet: false,         // net afgerond (dan "Push klaar")
        sheet: null,                    // "kies" of "nieuw": het paneel van onderaf
        zoek: "",
        nieuweSpier: null,
        statsOef: null,
        weegBereik: 90,
        weegBewerk: false,
        lichaam: "gewicht",             // "gewicht" of "fotos" in de tab Lichaam
        openHist: null,
        bewerkOef: null,
        fout: "",
    };

    const app = document.getElementById("app");
    const tabsEl = document.getElementById("tabs");
    const syncEl = document.getElementById("sync");
    const kopEl = document.getElementById("kop");
    const sheetEl = document.getElementById("sheet");
    const toastEl = document.getElementById("toast");
    let grafieken = [];

    // ---------- Inloggen (Supabase Auth) ----------

    let sessie = (() => { try { return JSON.parse(localStorage.getItem(LS_SESSIE) || "null"); } catch { return null; } })();

    function bewaarSessie(s) {
        sessie = s;
        if (s) localStorage.setItem(LS_SESSIE, JSON.stringify(s)); else localStorage.removeItem(LS_SESSIE);
    }
    function sessieUit(d) {
        return {
            access_token: d.access_token,
            refresh_token: d.refresh_token,
            expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
            user: { id: d.user.id, email: d.user.email, meta: d.user.user_metadata || {} },
        };
    }

    async function auth(pad, opties = {}) {
        const res = await fetch(`${SB_URL}/auth/v1/${pad}`, {
            method: opties.method || "POST",
            headers: {
                apikey: SB_KEY,
                "Content-Type": "application/json",
                ...(opties.token ? { Authorization: `Bearer ${opties.token}` } : {}),
            },
            body: opties.body ? JSON.stringify(opties.body) : undefined,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const fout = new Error(data.msg || data.error_description || data.message || res.statusText);
            fout.status = res.status;
            fout.code = data.error_code || data.code || data.error;
            throw fout;
        }
        return data;
    }

    // Geeft een geldig access token; ververst het als het (bijna) verlopen is.
    let verversen = null;
    async function geldigToken() {
        if (!sessie) throw Object.assign(new Error("Niet ingelogd"), { status: 401 });
        if (sessie.expires_at - 60 > Date.now() / 1000) return sessie.access_token;
        if (!verversen) {
            verversen = auth("token?grant_type=refresh_token", { body: { refresh_token: sessie.refresh_token } })
                .then((d) => bewaarSessie(sessieUit(d)))
                .catch((e) => {
                    if (e.status) { bewaarSessie(null); e.status = 401; }  // sessie echt ongeldig
                    throw e;                                              // zonder status = offline
                })
                .finally(() => { verversen = null; });
        }
        await verversen;
        return sessie.access_token;
    }

    // Na een bevestigingsmail komt Supabase terug met #access_token=... in de URL.
    async function vangLinkSessie() {
        if (!location.hash.includes("access_token=")) return;
        const p = new URLSearchParams(location.hash.slice(1));
        history.replaceState(null, "", location.pathname + location.search);
        try {
            const user = await auth("user", { method: "GET", token: p.get("access_token") });
            bewaarSessie(sessieUit({
                access_token: p.get("access_token"),
                refresh_token: p.get("refresh_token"),
                expires_at: Number(p.get("expires_at")) || undefined,
                expires_in: Number(p.get("expires_in")) || 3600,
                user,
            }));
        } catch (e) {
            console.warn("Link-sessie mislukt", e);
        }
    }

    function doelPerWeek() {
        const m = sessie && sessie.user.meta;
        return m && m.doel_per_week != null ? Number(m.doel_per_week) : STANDAARD_DOEL;
    }

    // ---------- Supabase REST ----------

    async function sb(pad, opties = {}) {
        const token = await geldigToken();
        const res = await fetch(`${SB_URL}/rest/v1/${pad}`, {
            method: opties.method || "GET",
            headers: {
                apikey: SB_KEY,
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                ...(opties.headers || {}),
            },
            body: opties.body ? JSON.stringify(opties.body) : undefined,
        });
        if (!res.ok) {
            const fout = new Error((await res.text()) || res.statusText);
            fout.status = res.status;
            if (res.status === 401) { bewaarSessie(null); setTimeout(() => toonLogin("Je sessie is verlopen, log opnieuw in."), 0); }
            throw fout;
        }
        if (res.status === 204) return null;
        const tekst = await res.text();
        return tekst ? JSON.parse(tekst) : null;
    }

    // Supabase geeft standaard max 1000 rijen terug; haal alles op in blokken.
    async function sbAlles(pad) {
        const blok = 1000;
        let van = 0;
        let alles = [];
        for (;;) {
            const rijen = await sb(pad, { headers: { Range: `${van}-${van + blok - 1}`, "Range-Unit": "items" } });
            alles = alles.concat(rijen || []);
            if (!rijen || rijen.length < blok) return alles;
            van += blok;
        }
    }

    // ---------- Outbox: schrijven die het netwerk niet haalden ----------

    function outbox() {
        if (!LS.outbox) return [];
        try { return JSON.parse(localStorage.getItem(LS.outbox) || "[]"); } catch { return []; }
    }
    function zetOutbox(lijst) {
        localStorage.setItem(LS.outbox, JSON.stringify(lijst));
        toonSync();
    }

    // Probeert direct te versturen; bij netwerkfout (of verlopen sessie) komt het in de outbox.
    async function schrijf(pad, opties) {
        try {
            await sb(pad, opties);
            return true;
        } catch (e) {
            if (e.status && e.status !== 401) throw e;   // echte fout van de server: niet opnieuw proberen
            zetOutbox([...outbox(), { pad, opties }]);
            return false;
        }
    }

    let bezigMetFlush = false;
    async function flush() {
        if (bezigMetFlush) return;
        bezigMetFlush = true;
        try {
            let lijst = outbox();
            while (lijst.length) {
                try {
                    await sb(lijst[0].pad, lijst[0].opties);
                } catch (e) {
                    if (!e.status || e.status === 401) break;   // nog offline, of eerst opnieuw inloggen
                    console.warn("Outbox-item afgewezen, overgeslagen:", e);
                }
                lijst = lijst.slice(1);
                zetOutbox(lijst);
            }
        } finally {
            bezigMetFlush = false;
            toonSync();
        }
    }

    function toonSync() {
        const n = outbox().length;
        syncEl.textContent = n ? `● ${n} wacht${n === 1 ? "" : "en"} op verbinding` : "";
        syncEl.className = n ? "sync wacht" : "sync";
    }

    const INSERT = { "Prefer": "resolution=ignore-duplicates,return=minimal" };
    const UPSERT = { "Prefer": "resolution=merge-duplicates,return=minimal" };

    // ---------- Hulpjes ----------

    function esc(s) {
        return String(s ?? "").replace(/[&<>"']/g, (c) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
        }[c]));
    }
    function uuid() {
        if (crypto.randomUUID) return crypto.randomUUID();
        return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
            (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
    }
    function datumStr(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    function vandaag() { return datumStr(new Date()); }
    function parseDatum(s) { const [j, m, d] = s.split("-").map(Number); return new Date(j, m - 1, d); }
    function dagenTussen(a, b) { return Math.round((parseDatum(b) - parseDatum(a)) / 86400000); }
    const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
    const DAGEN = ["zo", "ma", "di", "wo", "do", "vr", "za"];
    function mooiDatum(s, metDag = true) {
        const d = parseDatum(s);
        const basis = `${d.getDate()} ${MAANDEN[d.getMonth()]}`;
        const jaar = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : "";
        return (metDag ? `${DAGEN[d.getDay()]} ` : "") + basis + jaar;
    }
    function relDatum(s) {
        const n = dagenTussen(s, vandaag());
        if (n === 0) return "vandaag";
        if (n === 1) return "gisteren";
        if (n < 7) return `${n} dagen geleden`;
        return mooiDatum(s, false);
    }
    // Getal voor weergave, met Nederlandse komma ("82,5").
    function getal(x, dec = 1) {
        const n = Number(x);
        if (!isFinite(n)) return "–";
        return (Number.isInteger(n) ? String(n) : n.toFixed(dec).replace(/\.?0+$/, "")).replace(".", ",");
    }
    // Zelfde getal voor in een <input type="number"> (die wil een punt).
    function punt(x, dec = 2) { return getal(x, dec).replace(",", "."); }
    function num(v) { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : null; }

    // Geschatte 1-rep max (Epley). Bij 1 rep is het gewoon het gewicht.
    function e1rm(gewicht, reps) {
        if (!reps) return 0;
        return reps === 1 ? gewicht : gewicht * (1 + reps / 30);
    }

    // Maat voor "hoe sterk was deze set": geschatte 1RM, of het aantal reps
    // bij oefeningen zonder extra gewicht (pull-ups, dips).
    function score(s) { return Number(s.gewicht) > 0 ? e1rm(Number(s.gewicht), s.reps) : s.reps; }

    function oef(id) { return state.oefeningen.find((o) => o.id === id); }
    function training(id) { return state.trainingen.find((t) => t.id === id); }

    function sorteerTrainingen() {
        state.trainingen.sort((a, b) =>
            b.datum.localeCompare(a.datum) || String(b.created_at).localeCompare(String(a.created_at)));
    }
    function setsVan(trainingId) {
        return state.sets.filter((s) => s.training_id === trainingId)
            .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    }

    // Oefeningen in een training, in de volgorde waarin ze gedaan zijn,
    // plus kaarten die al klaarstaan maar nog geen sets hebben.
    function oefeningenIn(trainingId) {
        const volgorde = [];
        for (const s of setsVan(trainingId)) if (!volgorde.includes(s.oefening_id)) volgorde.push(s.oefening_id);
        for (const id of kaarten(trainingId)) if (!volgorde.includes(id)) volgorde.push(id);
        return volgorde.filter((id) => oef(id));
    }

    function alleKaarten() { try { return JSON.parse(localStorage.getItem(LS.kaarten) || "{}"); } catch { return {}; } }
    function kaarten(tid) { return alleKaarten()[tid] || []; }
    function zetKaarten(tid, lijst) {
        const k = alleKaarten();
        if (lijst.length) k[tid] = lijst; else delete k[tid];
        localStorage.setItem(LS.kaarten, JSON.stringify(k));
    }

    // De laatste eerdere training waarin deze oefening gedaan is.
    function vorigeKeer(oefId, behalveTid) {
        const huidig = training(behalveTid);
        for (const t of state.trainingen) {
            if (t.id === behalveTid) continue;
            if (huidig && t.datum > huidig.datum) continue;
            const s = setsVan(t.id).filter((x) => x.oefening_id === oefId);
            if (s.length) return { training: t, sets: s };
        }
        return null;
    }

    // Double progression: haal je bij alle sets op je zwaarste gewicht de bovenkant
    // van de rep-range, dan omhoog met stap_kg. Anders zelfde gewicht, +1 rep per set.
    function doelVoor(o, vorige) {
        if (!vorige) return null;
        const top = Math.max(...vorige.sets.map((s) => Number(s.gewicht)));
        const opTop = vorige.sets.filter((s) => Number(s.gewicht) === top);
        if (opTop.every((s) => s.reps >= o.rep_max)) {
            return {
                omhoog: true,
                gewicht: top + Number(o.stap_kg),
                perSet: opTop.map(() => o.rep_min),
                tekst: `Omhoog naar ${getal(top + Number(o.stap_kg), 2)} kg × ${o.rep_min}+`,
            };
        }
        const perSet = opTop.map((s) => Math.min(s.reps + 1, o.rep_max));
        return {
            omhoog: false,
            gewicht: top,
            perSet,
            tekst: `${getal(top, 2)} kg × ${perSet.join(" / ")}`,
        };
    }

    // Beste e1RM ooit voor deze oefening, vóór een bepaald moment.
    function besteE1rmVoor(oefId, voorSet) {
        let best = 0;
        for (const s of state.sets) {
            if (s.oefening_id !== oefId || s.id === voorSet.id) continue;
            const t = training(s.training_id);
            const tv = training(voorSet.training_id);
            if (!t || !tv) continue;
            const eerder = t.datum < tv.datum || (t.datum === tv.datum && String(s.created_at) < String(voorSet.created_at));
            if (eerder) best = Math.max(best, score(s));
        }
        return best;
    }

    // ---------- Laden ----------

    async function laadAlles() {
        const [oefeningen, trainingen, sets, gewicht] = await Promise.all([
            sbAlles("gym_oefeningen?select=*&order=naam.asc"),
            sbAlles("gym_trainingen?select=*&order=datum.desc"),
            sbAlles("gym_sets?select=*&order=created_at.asc"),
            sbAlles("gym_gewicht?select=*&order=datum.asc"),
        ]);
        state.oefeningen = oefeningen;
        state.trainingen = trainingen;
        state.sets = sets;
        state.gewicht = gewicht;
        // Lokale wijzigingen die nog in de outbox staan ook tonen.
        for (const item of outbox()) pasLokaalToe(item);
        sorteerTrainingen();
        if (state.actief && !training(state.actief)) zetActief(null);
    }

    function pasLokaalToe(item) {
        const { pad, opties } = item;
        const tabel = pad.split("?")[0];
        if (opties.method === "POST" && opties.body) {
            const rijen = Array.isArray(opties.body) ? opties.body : [opties.body];
            const doel = { gym_sets: state.sets, gym_trainingen: state.trainingen, gym_gewicht: state.gewicht }[tabel];
            if (!doel) return;
            for (const r of rijen) {
                const sleutel = tabel === "gym_gewicht" ? "datum" : "id";
                const i = doel.findIndex((x) => x[sleutel] === r[sleutel]);
                if (i >= 0) doel[i] = { ...doel[i], ...r }; else doel.push({ ...r, _wacht: true });
            }
        } else if (opties.method === "DELETE") {
            const m = pad.match(/(id|datum)=eq\.([^&]+)/);
            if (!m) return;
            const lijst = { gym_sets: "sets", gym_trainingen: "trainingen", gym_gewicht: "gewicht" }[tabel];
            if (lijst) state[lijst] = state[lijst].filter((x) => x[m[1]] !== decodeURIComponent(m[2]));
        }
    }

    function zetActief(id) {
        state.actief = id;
        if (id) localStorage.setItem(LS.actief, id); else localStorage.removeItem(LS.actief);
    }

    // ---------- Acties ----------

    async function startTraining() {
        const t = {
            id: uuid(),
            datum: state.nieuweDatum || vandaag(),
            label: state.nieuwLabel.trim() || null,
            created_at: new Date().toISOString(),
        };
        // Oefeningen van de gekozen eerdere training alvast klaarzetten.
        const bron = bronTraining();
        if (bron) zetKaarten(t.id, oefeningenIn(bron.id));
        state.trainingen.push(t);
        sorteerTrainingen();
        zetActief(t.id);
        state.nieuwLabel = "";
        state.kopieerVan = "auto";
        render();
        await schrijf("gym_trainingen", { method: "POST", body: t, headers: INSERT });
    }

    // Trainingen die echt sets hebben, nieuwste eerst.
    function gedaneTrainingen() {
        return state.trainingen.filter((t) => setsVan(t.id).length);
    }

    // Van welke training nemen we de oefeningen over?
    // "auto" = de laatste met hetzelfde label, "" = leeg beginnen, anders een training-id.
    function bronTraining() {
        if (state.kopieerVan === "") return null;
        if (state.kopieerVan === "auto") {
            const label = state.nieuwLabel.trim();
            return label ? gedaneTrainingen().find((x) => x.label === label) || null : null;
        }
        return training(state.kopieerVan) || null;
    }

    // Labels die je eerder gebruikte (nieuwste eerst), aangevuld met die uit config.js.
    function bekendeLabels() {
        const lijst = [];
        for (const t of gedaneTrainingen()) if (t.label && !lijst.includes(t.label)) lijst.push(t.label);
        for (const l of LABELS) if (!lijst.includes(l)) lijst.push(l);
        return lijst;
    }

    async function logSet(tid, oefId, gewicht, reps) {
        const bestaand = setsVan(tid).filter((s) => s.oefening_id === oefId);
        const s = {
            id: uuid(),
            training_id: tid,
            oefening_id: oefId,
            set_nr: bestaand.length + 1,
            gewicht,
            reps,
            created_at: new Date().toISOString(),
        };
        state.sets.push(s);
        state.laatsteSet = s.id;
        localStorage.setItem(LS.rust, String(Date.now()));
        render();
        if (isPr(s)) {
            toast(`Nieuw record op ${esc(oef(oefId).naam)}: ${getal(gewicht, 2)} kg × ${reps}`, null, "pr");
            if (navigator.vibrate) navigator.vibrate([30, 60, 30]);
        } else if (navigator.vibrate) navigator.vibrate(15);
        const gelukt = await schrijf("gym_sets", { method: "POST", body: s, headers: INSERT });
        if (!gelukt) { s._wacht = true; render(); }
    }

    function zonderLokaal(r) { const { _wacht, ...rest } = r; return rest; }

    async function verwijderSet(id) {
        const weg = state.sets.find((s) => s.id === id);
        if (!weg) return;
        state.sets = state.sets.filter((s) => s.id !== id);
        if (state.laatsteSet === id) state.laatsteSet = null;
        render();
        toast(`Set ${getal(weg.gewicht, 2)} kg × ${weg.reps} verwijderd`, () => {
            state.sets.push(weg);
            render();
            schrijf("gym_sets", { method: "POST", body: zonderLokaal(weg), headers: INSERT });
        });
        await schrijf(`gym_sets?id=eq.${id}`, { method: "DELETE" });
    }

    async function verwijderTraining(id) {
        const t = training(id);
        const sets = setsVan(id);
        const k = kaarten(id);
        state.trainingen = state.trainingen.filter((x) => x.id !== id);
        state.sets = state.sets.filter((s) => s.training_id !== id);
        zetKaarten(id, []);
        if (state.actief === id) zetActief(null);
        if (state.openHist === id) state.openHist = null;
        render();
        toast(`${esc(t.label || "Training")} van ${mooiDatum(t.datum)} verwijderd`, async () => {
            state.trainingen.push(t);
            sorteerTrainingen();
            state.sets.push(...sets);
            zetKaarten(id, k);
            render();
            await schrijf("gym_trainingen", { method: "POST", body: zonderLokaal(t), headers: INSERT });
            if (sets.length) await schrijf("gym_sets", { method: "POST", body: sets.map(zonderLokaal), headers: INSERT });
        });
        await schrijf(`gym_trainingen?id=eq.${id}`, { method: "DELETE" });
    }

    async function slaGewichtOp(datum, kg) {
        const rij = { datum, kg };
        const i = state.gewicht.findIndex((g) => g.datum === datum);
        if (i >= 0) state.gewicht[i] = { ...state.gewicht[i], ...rij }; else state.gewicht.push(rij);
        state.gewicht.sort((a, b) => a.datum.localeCompare(b.datum));
        render();
        await schrijf("gym_gewicht?on_conflict=user_id,datum", { method: "POST", body: rij, headers: UPSERT });
    }

    async function verwijderGewicht(datum) {
        const weg = state.gewicht.find((g) => g.datum === datum);
        state.gewicht = state.gewicht.filter((g) => g.datum !== datum);
        render();
        if (weg) toast(`Meting van ${mooiDatum(datum)} verwijderd`, () => slaGewichtOp(weg.datum, Number(weg.kg)));
        await schrijf(`gym_gewicht?datum=eq.${datum}`, { method: "DELETE" });
    }

    async function nieuweOefening(velden, voorTraining) {
        try {
            const [o] = await sb("gym_oefeningen", { method: "POST", body: velden, headers: { Prefer: "return=representation" } });
            state.oefeningen.push(o);
            state.oefeningen.sort((a, b) => a.naam.localeCompare(b.naam));
            if (voorTraining) {
                zetKaarten(voorTraining, [...kaarten(voorTraining), o.id]);
                state.openOef[voorTraining] = o.id;
            }
            state.sheet = null;
            state.zoek = "";
            render();
            toast(`${esc(o.naam)} toegevoegd`);
        } catch (e) {
            toast(e.status === 409 ? "Die oefening bestaat al. Zoek hem in de lijst." : "Opslaan lukte niet. Check je verbinding en probeer opnieuw.", null, "fout");
        }
    }

    async function wijzigOefening(id, velden) {
        const o = oef(id);
        Object.assign(o, velden);
        state.bewerkOef = null;
        render();
        try {
            await sb(`gym_oefeningen?id=eq.${id}`, { method: "PATCH", body: velden });
        } catch {
            toast("Wijziging opslaan lukte niet. Check je verbinding.", null, "fout");
        }
    }

    // ---------- Iconen & kleuren ----------

    const ICON = {
        dumbbell: '<path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11"/>',
        scale: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M8.2 10.2a5 5 0 0 1 7.6 0"/><path d="M12 10.5l1.4-2"/>',
        chart: '<path d="M4 19.5h16"/><path d="M5 15.5l4.2-4.4 3.3 3 6.5-7"/>',
        calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
        sliders: '<path d="M4.5 7h8M18.5 7h1M4.5 17h2M12.5 17h7"/><circle cx="15.5" cy="7" r="2.3"/><circle cx="9.5" cy="17" r="2.3"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        min: '<path d="M5 12h14"/>',
        x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
        zoek: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l4.5 4.5"/>',
        pijl: '<path d="M9.5 6l6 6-6 6"/>',
        terug: '<path d="M14.5 6l-6 6 6 6"/>',
        vink: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
        omhoog: '<path d="M12 18.5v-13M6.5 11L12 5.5l5.5 5.5"/>',
        klok: '<circle cx="12" cy="12.5" r="7.5"/><path d="M12 8.5v4l2.5 2M10 3h4"/>',
        camera: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.5"/>',
        galerij: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="9.5" r="1.6"/><path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4"/>',
        film: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M10 9.3v5.4l4.6-2.7z"/>',
        geest: '<rect x="4" y="3.5" width="11" height="14.5" rx="2"/><rect x="9" y="6" width="11" height="14.5" rx="2" stroke-dasharray="2.2 2.2"/>',
        wissel: '<path d="M4.5 10a7.5 7.5 0 0 1 13.4-3.4M19.5 14a7.5 7.5 0 0 1-13.4 3.4"/><path d="M18.5 3.5v3.6h-3.6M5.5 20.5v-3.6h3.6"/>',
        doel: '<circle cx="12" cy="12" r="7.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/>',
    };
    function ico(n, extra = "") {
        return `<svg class="ico ${extra}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICON[n]}</svg>`;
    }

    // Spiergroepen krijgen de kleuren van wedstrijdschijven: 25 rood, 20 blauw, 15 geel, 10 groen, 5 wit.
    const SPIERKLEUR = {
        benen: "#e0472f", rug: "#3d74de", borst: "#e8b425", schouders: "#36a062",
        armen: "#e9e6de", core: "#9a8fd0", overig: "#7c838c",
    };
    function spierKleur(g) { return SPIERKLEUR[g] || SPIERKLEUR.overig; }

    // ---------- Snelle index over sets (wordt bij elke render opnieuw opgebouwd) ----------

    let cache = null;
    function idx() {
        if (cache) return cache;
        const perTraining = new Map();
        const perOef = new Map();
        const gesorteerd = [...state.sets].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
        for (const s of gesorteerd) {
            if (!perTraining.has(s.training_id)) perTraining.set(s.training_id, []);
            perTraining.get(s.training_id).push(s);
            if (!perOef.has(s.oefening_id)) perOef.set(s.oefening_id, []);
            perOef.get(s.oefening_id).push(s);
        }
        cache = { perTraining, perOef, pr: new Map() };
        return cache;
    }

    function isPr(s) {
        const c = idx().pr;
        if (!c.has(s.id)) {
            const best = besteE1rmVoor(s.oefening_id, s);
            c.set(s.id, best > 0 && score(s) > best + 0.01);
        }
        return c.get(s.id);
    }

    // Hoeveel sets je "van plan" bent: zoveel als vorige keer, anders 3.
    function doelSets(vorige) { return vorige ? vorige.sets.length : 3; }

    function duurMinuten(sets) {
        if (sets.length < 2) return null;
        const a = new Date(sets[0].created_at), b = new Date(sets[sets.length - 1].created_at);
        const m = Math.round((b - a) / 60000);
        return m > 0 && m < 300 ? m : null;
    }
    function volumeVan(sets) { return sets.reduce((a, s) => a + Number(s.gewicht) * s.reps, 0); }
    function duizend(n) { return Math.round(n).toLocaleString("nl-NL"); }
    function procent(nu, was) {
        if (!was) return null;
        return (nu - was) / was * 100;
    }
    function deltaTekst(p, dec = 0) {
        if (p == null) return "";
        const r = Number(p.toFixed(dec));
        if (r === 0) return "gelijk";
        return `${r > 0 ? "+" : "−"}${Math.abs(r).toLocaleString("nl-NL")}%`;
    }
    function deltaKlasse(p) { return p == null || Math.abs(p) < 0.5 ? "gelijk" : p > 0 ? "up" : "down"; }

    // ---------- Render ----------

    const TABS = [
        ["training", "dumbbell", "Training"],
        ["weegschaal", "scale", "Lichaam"],
        ["stats", "chart", "Stats"],
        ["historie", "calendar", "Historie"],
        ["instellingen", "sliders", "Instellingen"],
    ];

    function render() {
        cache = null;
        grafieken.forEach((g) => g.destroy());
        grafieken = [];
        tabsEl.hidden = false;
        tabsEl.innerHTML = TABS.map(([id, i, naam]) =>
            `<button data-actie="tab" data-tab="${id}" ${state.tab === id ? 'aria-current="page"' : ""}>${ico(i)}<span>${naam}</span></button>`
        ).join("");

        const fout = state.fout
            ? `<div class="melding fout" role="alert">${esc(state.fout)}<button class="knop-icoon" data-actie="fout-weg" aria-label="Melding sluiten">${ico("x")}</button></div>`
            : "";
        const views = { training: viewTraining, weegschaal: viewWeegschaal, stats: viewStats, historie: viewHistorie, instellingen: viewInstellingen };
        app.innerHTML = fout + views[state.tab]();
        kopEl.innerHTML = kop();
        renderSheet();
        if (state.tab === "weegschaal") tekenGewicht();
        if (state.tab === "stats" && state.statsOef) tekenStats();
        toonSync();
        tikKlok();
    }

    function kop() {
        if (state.tab === "training") {
            const t = state.actief && training(state.actief);
            if (state.samenvatting && training(state.samenvatting)) return "";
            if (t) {
                return `<div class="kop-titel"><h1>${esc(t.label || "Training")}</h1><span class="kop-sub">${mooiDatum(t.datum)}</span></div>
                    <div class="klokken">
                        <span class="klok-duur" id="duur" hidden></span>
                        <button class="klok-rust" id="rust" data-actie="rust-reset" hidden aria-label="Rusttimer stoppen"></button>
                    </div>`;
            }
            return `<h1>Training</h1>`;
        }
        if (state.tab === "stats" && state.statsOef && oef(state.statsOef)) {
            return `<button class="kop-terug" data-actie="stats-terug" aria-label="Terug naar alle oefeningen">${ico("terug")}</button>
                <h1>${esc(oef(state.statsOef).naam)}</h1>`;
        }
        return `<h1>${{ weegschaal: "Lichaam", stats: "Stats", historie: "Historie", instellingen: "Instellingen" }[state.tab]}</h1>`;
    }

    // ---------- Training: startscherm ----------

    function viewTraining() {
        if (state.samenvatting && training(state.samenvatting)) return viewSamenvatting(training(state.samenvatting));
        const t = state.actief && training(state.actief);
        if (!t) return viewStart();

        const lijst = oefeningenIn(t.id);
        const open = openOefVoor(t, lijst);
        const aantal = setsVan(t.id).length;
        return `
            ${t.datum === vandaag() ? weegRij() : ""}
            ${lijst.length
                ? `<div class="oef-lijst">${lijst.map((id) => kaartOefening(t, oef(id), id === open)).join("")}</div>`
                : `<div class="leeg-groot"><p>Voeg je eerste oefening toe. De volgende keer dat je deze training herhaalt staan ze meteen klaar.</p></div>`}
            <button class="knop-stippel" data-actie="sheet-open">${ico("plus")}<span>Oefening toevoegen</span></button>
            <button class="knop ${aantal ? "knop-hoofd" : ""} breed afronden" data-actie="afronden">${aantal ? "Training afronden" : "Training sluiten"}</button>`;
    }

    // Welke oefening staat open? Zelf gekozen, anders de eerste die nog niet af is.
    function openOefVoor(t, lijst) {
        if (Object.prototype.hasOwnProperty.call(state.openOef, t.id)) return state.openOef[t.id];
        for (const id of lijst) {
            const n = setsVan(t.id).filter((s) => s.oefening_id === id).length;
            if (n < doelSets(vorigeKeer(id, t.id))) return id;
        }
        return null;
    }

    function weekStrip() {
        const ma = parseDatum(maandagVan(vandaag()));
        const gedaan = new Set(gedaneTrainingen().map((t) => t.datum));
        const letters = ["M", "D", "W", "D", "V", "Z", "Z"];
        const namen = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"];
        let n = 0;
        const dagen = letters.map((l, i) => {
            const d = new Date(ma); d.setDate(ma.getDate() + i);
            const ds = datumStr(d);
            const ja = gedaan.has(ds);
            if (ja) n++;
            const k = [ja ? "gedaan" : "", ds === vandaag() ? "vandaag" : "", ds > vandaag() ? "later" : ""].join(" ");
            return `<li class="dag ${k}"><span aria-hidden="true">${l}</span><span class="sr">${namen[i]}${ja ? ", getraind" : ""}</span></li>`;
        }).join("");
        return `<section class="week" aria-label="Deze week">
            <ol class="week-dagen">${dagen}</ol>
            <p class="week-tekst">${n ? `${n} ${n === 1 ? "training" : "trainingen"} deze week` : "Nog niet getraind deze week"}</p>
        </section>`;
    }

    function fotoRij() {
        const f = window.GymFotos;
        if (!f || !f.geladen() || !f.heeftFotos() || f.heeftVandaag()) return "";
        return `<button class="weeg-rij foto-rij" data-actie="foto-vandaag">${ico("camera")}<span>Foto van vandaag maken</span>${ico("pijl")}</button>`;
    }

    function weegRij() {
        const g = state.gewicht.find((x) => x.datum === vandaag());
        if (g) return "";
        const laatste = state.gewicht[state.gewicht.length - 1];
        return `<form class="weeg-rij" data-form="weeg-snel">
            ${ico("scale")}
            <label for="weeg-snel">Weeg je vandaag</label>
            <input id="weeg-snel" type="number" name="kg" step="0.1" inputmode="decimal" placeholder="${laatste ? getal(laatste.kg, 2) : "kg"}" required>
            <button class="knop knop-klein" type="submit">Opslaan</button>
        </form>`;
    }

    // Laatste training per naam, nieuwste eerst: dat zijn je "sjablonen".
    function sjablonen() {
        const gezien = new Set();
        const lijst = [];
        for (const t of gedaneTrainingen()) {
            const naam = t.label || "Training";
            if (gezien.has(naam)) continue;
            gezien.add(naam);
            lijst.push(t);
            if (lijst.length === 6) break;
        }
        return lijst;
    }

    function viewStart() {
        const vandaagT = gedaneTrainingen().filter((t) => t.datum === vandaag());
        const sj = sjablonen();
        const formOpen = state.startOpen || !sj.length;
        return `
            ${weekStrip()}
            ${weegRij()}
            ${fotoRij()}
            ${vandaagT.length ? `<h2 class="kopje">Vandaag</h2>
                <div class="rijen">${vandaagT.map((t) => {
                    const s = setsVan(t.id);
                    return `<div class="rij">
                        <div class="rij-tekst"><span class="rij-titel">${esc(t.label || "Training")}</span>
                        <span class="rij-sub">${s.length} sets, ${oefeningenIn(t.id).length} oefeningen</span></div>
                        <button class="knop knop-klein" data-actie="toon-samenvatting" data-id="${t.id}">Bekijk</button>
                        <button class="knop knop-klein" data-actie="open-training" data-id="${t.id}">Verder</button>
                    </div>`;
                }).join("")}</div>` : ""}
            <h2 class="kopje">${vandaagT.length ? "Nog een training" : "Start een training"}</h2>
            ${sj.length ? `<div class="rijen">
                ${sj.map((t) => `<button class="rij rij-start" data-actie="herhaal" data-id="${t.id}">
                    <span class="rij-tekst"><span class="rij-titel">${esc(t.label || "Training")}</span>
                    <span class="rij-sub">Laatst ${relDatum(t.datum)}, ${oefeningenIn(t.id).length} oefeningen</span></span>
                    <span class="rij-actie">Start ${ico("pijl")}</span>
                </button>`).join("")}
                ${formOpen ? "" : `<button class="rij rij-start rij-anders" data-actie="start-open">${ico("plus")}<span class="rij-titel">Andere training</span></button>`}
            </div>` : ""}
            ${formOpen ? formNieuweTraining(!sj.length) : ""}`;
    }

    function formNieuweTraining(eerste) {
        return `<form class="paneel nieuwe-training" data-form="start">
            ${eerste ? `<p class="uitleg">Geef je training een naam, bijvoorbeeld Push of Rug + biceps. Volgende keer start je hem hier opnieuw met één tik, met dezelfde oefeningen klaar.</p>` : ""}
            <label class="veld"><span>Naam</span>
                <input id="nieuw-label" value="${esc(state.nieuwLabel)}" placeholder="Push, Pull 2, Rug + biceps…" autocomplete="off"></label>
            <div class="chips" role="group" aria-label="Eerder gebruikte namen">
                ${bekendeLabels().slice(0, 8).map((l) => `<button type="button" class="chip" aria-pressed="${state.nieuwLabel === l}" data-actie="label" data-label="${esc(l)}">${esc(l)}</button>`).join("")}
            </div>
            ${startBron()}
            ${state.andereDag
                ? `<label class="veld"><span>Datum</span><input type="date" id="nieuwe-datum" value="${state.nieuweDatum}" max="${vandaag()}"></label>`
                : `<button type="button" class="knop-link" data-actie="andere-dag">Training van een andere dag invullen</button>`}
            <div class="knoppen">
                ${eerste ? "" : `<button type="button" class="knop" data-actie="start-dicht">Annuleer</button>`}
                <button class="knop knop-hoofd" type="submit">Start training</button>
            </div>
        </form>`;
    }

    // Het deel van het startformulier dat meeverandert met de naam die je typt.
    function startBron() {
        const bron = bronTraining();
        return `<div id="start-bron">
            ${gedaneTrainingen().length ? `<label class="veld"><span>Oefeningen klaarzetten van</span>
                <select id="kopieer-van">
                    <option value="auto" ${state.kopieerVan === "auto" ? "selected" : ""}>${state.nieuwLabel.trim()
                        ? `Vorige ${esc(state.nieuwLabel.trim())}${bron || state.kopieerVan !== "auto" ? "" : " (nog nooit gedaan)"}`
                        : "Vorige training met dezelfde naam"}</option>
                    <option value="" ${state.kopieerVan === "" ? "selected" : ""}>Niets, leeg beginnen</option>
                    ${gedaneTrainingen().slice(0, 15).map((t) => `<option value="${t.id}" ${state.kopieerVan === t.id ? "selected" : ""}>${esc(t.label || "Training")}, ${mooiDatum(t.datum)}</option>`).join("")}
                </select></label>` : ""}
            ${bron ? `<p class="klaarzet">${oefeningenIn(bron.id).map((id) => `<span class="spier-stip" style="--spier:${spierKleur(oef(id).spiergroep)}"></span>${esc(oef(id).naam)}`).join("<br>")}</p>` : ""}
        </div>`;
    }

    // ---------- Training: oefeningkaart ----------

    function vergelijk(s, vorigeSet) {
        if (isPr(s)) return `<span class="stempel" title="Persoonlijk record">PR</span>`;
        if (!vorigeSet) return "";
        const dw = Number(s.gewicht) - Number(vorigeSet.gewicht);
        if (Math.abs(dw) > 0.001) {
            return `<span class="verschil ${dw > 0 ? "up" : "down"}">${dw > 0 ? "+" : "−"}${getal(Math.abs(dw), 2)} kg</span>`;
        }
        const dr = s.reps - vorigeSet.reps;
        if (dr === 0) return `<span class="verschil gelijk">=</span>`;
        return `<span class="verschil ${dr > 0 ? "up" : "down"}">${dr > 0 ? "+" : "−"}${Math.abs(dr)}</span>`;
    }

    function kaartOefening(t, o, open) {
        const sets = setsVan(t.id).filter((s) => s.oefening_id === o.id);
        const vorige = vorigeKeer(o.id, t.id);
        const doel = doelVoor(o, vorige);
        const n = doelSets(vorige);
        const klaar = sets.length >= n;
        const stijl = `style="--spier:${spierKleur(o.spiergroep)}"`;

        if (!open) {
            return `<button class="oef dicht ${klaar ? "klaar" : ""}" ${stijl} data-actie="open-oef" data-id="${o.id}" aria-expanded="false">
                <span class="oef-regel"><span class="oef-naam">${esc(o.naam)}</span>
                <span class="oef-telling">${klaar ? ico("vink") : ""}${sets.length}/${n}</span></span>
                <span class="oef-reeks">${sets.length
                    ? sets.map((s) => `<span class="${isPr(s) ? "is-pr" : ""}">${getal(s.gewicht, 2)}×${s.reps}</span>`).join("")
                    : `<span class="dim">${doel ? `Doel ${esc(doel.tekst.replace("Omhoog naar ", "↑ "))}` : "Nog niet gedaan"}</span>`}</span>
            </button>`;
        }

        // Waarden om het invoerveld mee te vullen.
        let wGewicht = "", wReps = "";
        if (sets.length) {
            const l = sets[sets.length - 1];
            wGewicht = punt(l.gewicht);
            const doelReps = doel && doel.perSet[sets.length];
            wReps = doelReps != null && Number(l.gewicht) === doel.gewicht ? doelReps : l.reps;
        } else if (doel) {
            wGewicht = punt(doel.gewicht);
            wReps = doel.perSet[0];
        }
        const volgende = sets.length >= n && volgendeOef(t, o.id);

        return `<section class="oef open" ${stijl} aria-label="${esc(o.naam)}">
            <button class="oef-kop" data-actie="sluit-oef" data-id="${o.id}" aria-expanded="true">
                <span class="oef-naam">${esc(o.naam)}</span>
                <span class="oef-range">${o.rep_min}–${o.rep_max} reps</span>
            </button>
            <dl class="oef-context">
                ${vorige ? `<div><dt>Vorige keer</dt><dd><span class="reeks">${vorige.sets.map((s) => `${getal(s.gewicht, 2)}×${s.reps}`).join("  ")}</span>
                    <span class="wanneer">${relDatum(vorige.training.datum)}</span></dd></div>
                    <div class="doel ${doel.omhoog ? "omhoog" : ""}"><dt>Doel</dt><dd>${doel.omhoog ? ico("omhoog") : ""}${esc(doel.tekst)}</dd></div>`
                : `<div class="eerste"><dt>Eerste keer</dt><dd>Kies een gewicht waarmee je ${o.rep_min} tot ${o.rep_max} reps haalt.</dd></div>`}
            </dl>
            ${sets.length ? `<ol class="sets">${sets.map((s, i) => `<li class="${s._wacht ? "wacht" : ""} ${s.id === state.laatsteSet ? "nieuw" : ""}">
                <span class="set-nr">${i + 1}</span>
                <span class="set-waarde"><b>${getal(s.gewicht, 2)}</b> kg × <b>${s.reps}</b></span>
                ${vergelijk(s, vorige && vorige.sets[i])}
                <button class="knop-icoon set-weg" data-actie="weg-set" data-id="${s.id}" aria-label="Set ${i + 1} verwijderen">${ico("x")}</button>
            </li>`).join("")}</ol>` : ""}
            <form class="invoer" data-form="set" data-tid="${t.id}" data-oef="${o.id}">
                <div class="teller">
                    <button type="button" data-actie="stap" data-d="-${o.stap_kg}" aria-label="${getal(o.stap_kg, 2)} kg minder">${ico("min")}</button>
                    <label><input name="gewicht" type="number" step="any" inputmode="decimal" value="${wGewicht}" placeholder="0" required aria-label="Gewicht in kg"><span>kg</span></label>
                    <button type="button" data-actie="stap" data-d="${o.stap_kg}" aria-label="${getal(o.stap_kg, 2)} kg meer">${ico("plus")}</button>
                </div>
                <div class="teller">
                    <button type="button" data-actie="stap" data-d="-1" aria-label="1 rep minder">${ico("min")}</button>
                    <label><input name="reps" type="number" step="1" min="1" inputmode="numeric" value="${wReps}" placeholder="0" required aria-label="Aantal reps"><span>reps</span></label>
                    <button type="button" data-actie="stap" data-d="1" aria-label="1 rep meer">${ico("plus")}</button>
                </div>
                <button class="knop ${volgende ? "" : "knop-hoofd"} breed" type="submit">Set ${sets.length + 1} opslaan</button>
                ${volgende ? `<button type="button" class="knop knop-hoofd breed" data-actie="open-oef" data-id="${volgende}">Volgende: ${esc(oef(volgende).naam)}</button>` : ""}
                ${!sets.length ? `<button type="button" class="knop-link" data-actie="weg-kaart" data-id="${o.id}">Haal ${esc(o.naam)} van deze training</button>` : ""}
            </form>
        </section>`;
    }

    function volgendeOef(t, naId) {
        const lijst = oefeningenIn(t.id);
        const start = lijst.indexOf(naId);
        for (let i = 1; i < lijst.length; i++) {
            const id = lijst[(start + i) % lijst.length];
            const n = setsVan(t.id).filter((s) => s.oefening_id === id).length;
            if (n < doelSets(vorigeKeer(id, t.id))) return id;
        }
        return null;
    }

    // ---------- Samenvatting ----------

    function samenvattingBlok(t) {
        const sets = setsVan(t.id);
        const ids = oefeningenIn(t.id).filter((id) => sets.some((s) => s.oefening_id === id));
        const duur = duurMinuten(sets);
        const volume = volumeVan(sets);
        const vorige = gedaneTrainingen().find((x) => x.id !== t.id && (x.label || "") === (t.label || "")
            && (x.datum < t.datum || (x.datum === t.datum && String(x.created_at) < String(t.created_at))));
        const volVorig = vorige ? volumeVan(setsVan(vorige.id)) : null;
        const pVol = procent(volume, volVorig);
        // Per oefening alleen het beste record van deze training.
        const prs = [];
        for (const s of sets.filter(isPr)) {
            const i = prs.findIndex((x) => x.oefening_id === s.oefening_id);
            if (i < 0) prs.push(s); else if (score(s) > score(prs[i])) prs[i] = s;
        }

        return `<div class="sv-cijfers">
                ${duur ? `<div><b>${duur}</b><span>minuten</span></div>` : ""}
                <div><b>${sets.length}</b><span>sets</span></div>
                <div><b>${duizend(volume)}</b><span>kg volume</span>
                    ${pVol != null ? `<em class="${deltaKlasse(pVol)}">${deltaTekst(pVol)} t.o.v. vorige ${esc(t.label || "training")}</em>` : ""}</div>
            </div>
            ${prs.length ? `<div class="sv-prs"><span class="stempel groot">PR</span><p>${prs.map((s) =>
                `<b>${esc(oef(s.oefening_id).naam)}</b> ${getal(s.gewicht, 2)} kg × ${s.reps}`).join("<br>")}</p></div>` : ""}
            <ul class="sv-oef">${ids.map((id) => {
                const o = oef(id);
                const s = sets.filter((x) => x.oefening_id === id);
                                const v = vorigeKeer(id, t.id);
                const p = v ? procent(Math.max(...s.map(score)), Math.max(...v.sets.map(score))) : null;
                return `<li style="--spier:${spierKleur(o.spiergroep)}">
                    <span class="spier-stip"></span>
                    <span class="sv-naam">${esc(o.naam)}<small>${s.map((x) => `${getal(x.gewicht, 2)}×${x.reps}`).join("  ")}</small></span>
                    <span class="sv-delta ${deltaKlasse(p)}">${p == null ? "nieuw" : deltaTekst(p, 1)}</span>
                </li>`;
            }).join("")}</ul>
            ${ids.length ? `<p class="voetnoot">Percentage = verschil in geschatte 1-rep max met de vorige keer.</p>` : ""}`;
    }

    function viewSamenvatting(t) {
        const net = state.samenvattingNet;
        return `<section class="samenvatting">
            <p class="sv-datum">${mooiDatum(t.datum)}</p>
            <h2 class="sv-titel">${esc(t.label || "Training")}${net ? " klaar" : ""}</h2>
            ${setsVan(t.id).length ? samenvattingBlok(t) : `<p class="uitleg">Deze training heeft nog geen sets.</p>`}
            <div class="knoppen">
                <button class="knop" data-actie="open-training" data-id="${t.id}">Aanpassen</button>
                <button class="knop knop-hoofd" data-actie="sluit-samenvatting">Klaar</button>
            </div>
        </section>`;
    }

    // ---------- Oefening-kiezer (paneel van onderaf) ----------

    function renderSheet() {
        if (!state.sheet) { sheetEl.hidden = true; sheetEl.innerHTML = ""; document.body.classList.remove("sheet-open"); return; }
        sheetEl.hidden = false;
        document.body.classList.add("sheet-open");
        const nieuw = state.sheet === "nieuw";
        sheetEl.innerHTML = `<div class="sheet-achter" data-actie="sheet-dicht"></div>
            <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-titel">
                <div class="sheet-greep" aria-hidden="true"></div>
                <div class="sheet-kop">
                    ${nieuw && state.tab === "training" ? `<button class="knop-icoon" data-actie="sheet-kies" aria-label="Terug naar de lijst">${ico("terug")}</button>` : ""}
                    <h2 id="sheet-titel">${nieuw ? "Nieuwe oefening" : "Oefening toevoegen"}</h2>
                    <button class="knop-icoon" data-actie="sheet-dicht" aria-label="Sluiten">${ico("x")}</button>
                </div>
                ${nieuw ? formNieuweOef() : `<label class="zoek">${ico("zoek")}<input id="zoek" type="search" value="${esc(state.zoek)}" placeholder="Zoek of typ een nieuwe naam" autocomplete="off" enterkeyhint="go"></label>
                    <div class="sheet-lijst" id="sheet-lijst">${kiezerLijst()}</div>`}
            </div>`;
    }

    function kiezerLijst() {
        const t = state.actief && training(state.actief);
        const al = new Set(t ? oefeningenIn(t.id) : []);
        const q = state.zoek.trim().toLowerCase();
        const pass = (o) => !o.gearchiveerd && !al.has(o.id) && (!q || o.naam.toLowerCase().includes(q));
        const item = (o) => `<button class="kies" data-actie="kies-oef" data-id="${o.id}" style="--spier:${spierKleur(o.spiergroep)}">
            <span class="spier-stip"></span><span class="kies-naam">${esc(o.naam)}</span><span class="kies-meta">${o.rep_min}–${o.rep_max}</span></button>`;

        let html = "";
        if (!q) {
            const recent = [];
            for (const tr of gedaneTrainingen().slice(0, 12)) for (const id of oefeningenIn(tr.id)) {
                const o = oef(id);
                if (o && pass(o) && !recent.includes(o)) recent.push(o);
            }
            if (recent.length) html += `<h3>Recent</h3>${recent.slice(0, 6).map(item).join("")}`;
        }
        for (const g of SPIERGROEPEN) {
            const os = state.oefeningen.filter((o) => o.spiergroep === g && pass(o));
            if (os.length) html += `<h3><span class="spier-stip" style="--spier:${spierKleur(g)}"></span>${esc(g[0].toUpperCase() + g.slice(1))}</h3>${os.map(item).join("")}`;
        }
        const exact = state.oefeningen.some((o) => o.naam.toLowerCase() === q);
        if (q && !exact) {
            html = `<button class="kies kies-nieuw" data-actie="sheet-nieuw">${ico("plus")}<span class="kies-naam">Maak “${esc(state.zoek.trim())}” aan</span></button>` + html;
        } else {
            html += `<button class="kies kies-nieuw" data-actie="sheet-nieuw">${ico("plus")}<span class="kies-naam">Nieuwe oefening maken</span></button>`;
        }
        if (q && !state.oefeningen.some(pass)) html += `<p class="uitleg">Geen oefening gevonden met “${esc(state.zoek.trim())}”.</p>`;
        return html;
    }

    function formNieuweOef() {
        const g = state.nieuweSpier || "borst";
        return `<form class="nieuwe-oef" data-form="nieuwe-oef">
            <label class="veld"><span>Naam</span><input name="naam" required value="${esc(state.zoek.trim())}" placeholder="bijvoorbeeld Cable fly" autocomplete="off"></label>
            <fieldset class="veld"><legend>Spiergroep</legend><div class="chips">
                ${SPIERGROEPEN.map((s) => `<label class="chip spier-chip" style="--spier:${spierKleur(s)}">
                    <input type="radio" name="spiergroep" value="${s}" ${s === g ? "checked" : ""}><span class="spier-stip"></span>${s}</label>`).join("")}
            </div></fieldset>
            <div class="rij-velden">
                <label class="veld"><span>Min. reps</span><input name="rep_min" type="number" inputmode="numeric" value="8"></label>
                <label class="veld"><span>Max. reps</span><input name="rep_max" type="number" inputmode="numeric" value="12"></label>
                <label class="veld"><span>Stap (kg)</span><input name="stap_kg" type="number" step="any" inputmode="decimal" value="2.5"></label>
            </div>
            <p class="uitleg">Haal je bij alle sets het maximum aantal reps, dan stelt de app voor om het gewicht met de stap te verhogen.</p>
            <button class="knop knop-hoofd breed" type="submit">Oefening opslaan</button>
        </form>`;
    }

    // ---------- Weegschaal ----------

    // 7-daags voortschrijdend gemiddelde (over de metingen in de 7 dagen t/m die dag).
    function gemiddelden() {
        return state.gewicht.map((g) => {
            const binnen = state.gewicht.filter((x) => x.datum <= g.datum && dagenTussen(x.datum, g.datum) < 7);
            return { datum: g.datum, kg: Number(g.kg), gem: binnen.reduce((a, x) => a + Number(x.kg), 0) / binnen.length };
        });
    }

    function trendPerWeek() {
        const gem = gemiddelden();
        if (gem.length < 2) return null;
        const nu = gem[gem.length - 1];
        // Vergelijk met het gemiddelde van ~14 dagen eerder (of zo ver terug als er data is).
        let ref = gem[0];
        for (const g of gem) if (dagenTussen(g.datum, nu.datum) >= 14) ref = g;
        const dagen = dagenTussen(ref.datum, nu.datum);
        if (dagen < 5) return null;
        return { perWeek: (nu.gem - ref.gem) / dagen * 7, dagen };
    }

    function plusMin(x, dec = 2) {
        const r = Number(x.toFixed(dec));
        return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toLocaleString("nl-NL", { maximumFractionDigits: dec })}`;
    }

    function viewWeegschaal() {
        const seg = `<div class="segment lichaam-segment" role="group" aria-label="Lichaam">
            <button aria-pressed="${state.lichaam !== "fotos"}" data-actie="lichaam" data-n="gewicht">Gewicht</button>
            <button aria-pressed="${state.lichaam === "fotos"}" data-actie="lichaam" data-n="fotos">Foto's</button></div>`;
        if (state.lichaam === "fotos" && window.GymFotos) return seg + window.GymFotos.view();
        return seg + viewGewicht();
    }

    function viewGewicht() {
        const vandaagG = state.gewicht.find((g) => g.datum === vandaag());
        const laatste = state.gewicht[state.gewicht.length - 1];
        const gem = gemiddelden();
        const nu = gem[gem.length - 1];
        const trend = trendPerWeek();
        const doel = doelPerWeek();
        const toonForm = !vandaagG || state.weegBewerk;

        let oordeel = "";
        if (trend && doel) {
            const afw = trend.perWeek - doel;
            const marge = Math.max(0.15, Math.abs(doel) * 0.6);
            if (Math.abs(afw) <= marge) oordeel = "Je zit op schema";
            else if (doel > 0) oordeel = afw > 0 ? "Sneller dan je doel" : "Langzamer dan je doel";
            else oordeel = afw < 0 ? "Sneller dan je doel" : "Langzamer dan je doel";
        }
        const goed = oordeel === "Je zit op schema";
        const eerste = gem[0];

        return `
            <section class="weeg-hero">
                ${toonForm ? `<form data-form="weeg" class="weeg-form">
                    <label class="weeg-invoer"><input type="number" name="kg" step="0.1" inputmode="decimal" required
                        value="${vandaagG ? punt(vandaagG.kg) : ""}" placeholder="${laatste ? getal(laatste.kg, 2) : "0,0"}" aria-label="Gewicht in kg"><span>kg</span></label>
                    ${state.andereDag
                        ? `<label class="veld"><span>Datum</span><input type="date" name="datum" value="${vandaag()}" max="${vandaag()}"></label>`
                        : `<p class="weeg-wanneer">Vandaag, ${mooiDatum(vandaag())} <button type="button" class="knop-link" data-actie="andere-dag">andere dag</button></p>`}
                    <button class="knop knop-hoofd breed" type="submit">Opslaan</button>
                </form>`
                : `<div class="weeg-vandaag">
                    <p class="weeg-getal"><b>${getal(vandaagG.kg, 2)}</b><span>kg</span></p>
                    <p class="weeg-wanneer">Vandaag gewogen <button class="knop-link" data-actie="weeg-bewerk">wijzig</button> <button class="knop-link" data-actie="andere-dag-weeg">andere dag</button></p>
                </div>`}
            </section>

            ${gem.length ? `<div class="tegels">
                <div class="tegel"><span class="t-label">7-daags gemiddelde</span><b class="t-waarde">${getal(nu.gem.toFixed(1), 1)}<small> kg</small></b></div>
                <div class="tegel"><span class="t-label">Per week</span><b class="t-waarde ${oordeel ? (goed ? "goed" : "matig") : ""}">${trend ? plusMin(trend.perWeek) : "–"}<small> kg</small></b>
                    <span class="t-sub">${trend ? (oordeel || `over ${trend.dagen} dagen`) : "Nog te weinig metingen"}</span></div>
                <div class="tegel"><span class="t-label">Sinds ${mooiDatum(eerste.datum, false)}</span><b class="t-waarde">${plusMin(nu.gem - eerste.gem, 1)}<small> kg</small></b></div>
            </div>
            <p class="doel-regel">${doel ? `Doel ${plusMin(doel)} kg per week.` : "Geen weekdoel ingesteld."}
                <button class="knop-link" data-actie="tab" data-tab="instellingen">Aanpassen</button></p>` : ""}

            ${state.gewicht.length > 1 ? `
            <section class="paneel grafiek-paneel">
                <div class="segment" role="group" aria-label="Periode">
                    ${[[30, "30 dagen"], [90, "90 dagen"], [365, "Jaar"], [0, "Alles"]].map(([n, l]) =>
                        `<button aria-pressed="${state.weegBereik === n}" data-actie="weeg-bereik" data-n="${n}">${l}</button>`).join("")}
                </div>
                <div class="grafiek"><canvas id="grafiek-gewicht" aria-label="Grafiek van je gewicht en 7-daags gemiddelde"></canvas></div>
            </section>` : ""}

            ${state.gewicht.length ? `
            <h2 class="kopje">Metingen</h2>
            <ul class="metingen">
                ${state.gewicht.slice(state.meerMetingen ? 0 : -10).reverse().map((g) => {
                    const i = state.gewicht.indexOf(g);
                    const v = i > 0 ? Number(g.kg) - Number(state.gewicht[i - 1].kg) : null;
                    return `<li>
                        <span class="m-datum">${mooiDatum(g.datum)}</span>
                        <span class="m-kg">${getal(g.kg, 2)}</span>
                        <span class="m-delta ${v == null ? "" : v > 0 ? "up" : v < 0 ? "down" : ""}">${v == null ? "" : plusMin(v, 1)}</span>
                        <button class="knop-icoon" data-actie="weg-gewicht" data-datum="${g.datum}" aria-label="Meting van ${mooiDatum(g.datum)} verwijderen">${ico("x")}</button>
                    </li>`;
                }).join("")}
            </ul>
            ${state.gewicht.length > 10 && !state.meerMetingen ? `<button class="knop breed meer" data-actie="meer-metingen">Alle ${state.gewicht.length} metingen tonen</button>` : ""}` : `<p class="leeg">Weeg je elke ochtend op hetzelfde moment, na het opstaan. Na een week zie je hier je trend.</p>`}`;
    }

    function stijlGrafiek() {
        if (!window.Chart) return false;
        Chart.defaults.color = "#9ba1a8";
        Chart.defaults.borderColor = "rgba(255,255,255,0.07)";
        Chart.defaults.font.family = "Archivo, system-ui, sans-serif";
        Chart.defaults.font.size = 12;
        return true;
    }

    function tekenGewicht() {
        const el = document.getElementById("grafiek-gewicht");
        if (!el || !stijlGrafiek()) return;
        let data = gemiddelden();
        if (state.weegBereik) data = data.filter((g) => dagenTussen(g.datum, vandaag()) < state.weegBereik);
        grafieken.push(new Chart(el, {
            type: "line",
            data: {
                labels: data.map((g) => mooiDatum(g.datum, false)),
                datasets: [
                    { label: "Meting", data: data.map((g) => g.kg), showLine: false, pointRadius: 2.5, pointHoverRadius: 4, pointBackgroundColor: "#6d747c", borderColor: "#6d747c" },
                    { label: "7-daags gemiddelde", data: data.map((g) => +g.gem.toFixed(2)), borderColor: "#f2efe8", backgroundColor: "#f2efe8", pointRadius: 0, borderWidth: 2.5, tension: 0.35 },
                ],
            },
            options: {
                maintainAspectRatio: false,
                animation: matchMedia("(prefers-reduced-motion: reduce)").matches ? false : { duration: 400 },
                interaction: { mode: "index", intersect: false },
                plugins: { legend: { position: "bottom", labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, padding: 16 } } },
                scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 5, maxRotation: 0 } }, y: { ticks: { maxTicksLimit: 5 } } },
            },
        }));
    }

    // ---------- Stats ----------

    function statsPerTraining(oefId) {
        const rijen = [];
        for (const t of [...state.trainingen].reverse()) {
            const s = setsVan(t.id).filter((x) => x.oefening_id === oefId);
            if (!s.length) continue;
            rijen.push({
                datum: t.datum,
                e1rm: Math.max(...s.map(score)),
                lg: s.every((x) => Number(x.gewicht) === 0),   // alleen lichaamsgewicht: score = reps
                top: Math.max(...s.map((x) => Number(x.gewicht))),
                volume: volumeVan(s),
                sets: s,
            });
        }
        return rijen;
    }

    function maandagVan(s) {
        const d = parseDatum(s);
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        return datumStr(d);
    }

    function sparkline(waarden) {
        if (waarden.length < 2) return `<svg class="spark" viewBox="0 0 80 28" aria-hidden="true"></svg>`;
        const min = Math.min(...waarden), max = Math.max(...waarden);
        const b = max - min || 1;
        const pts = waarden.map((v, i) => [2 + i * 76 / (waarden.length - 1), 25 - (v - min) / b * 22]);
        const [lx, ly] = pts[pts.length - 1];
        return `<svg class="spark" viewBox="0 0 80 28" aria-hidden="true">
            <polyline points="${pts.map((p) => p.map((x) => x.toFixed(1)).join(",")).join(" ")}"/>
            <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.6"/></svg>`;
    }

    // Verandering in e1RM: laatste sessie t.o.v. de sessie van ~4 weken eerder.
    function groei4w(rijen) {
        if (rijen.length < 2) return null;
        const nu = rijen[rijen.length - 1];
        let ref = null;
        for (const r of rijen) if (dagenTussen(r.datum, nu.datum) >= 21 && r !== nu) ref = r;
        if (!ref) ref = rijen[0];
        if (ref === nu) return null;
        return procent(nu.e1rm, ref.e1rm);
    }

    function viewStats() {
        if (state.statsOef && oef(state.statsOef)) return viewStatsDetail(oef(state.statsOef));
        const gedaan = state.oefeningen.filter((o) => (idx().perOef.get(o.id) || []).length);
        if (!gedaan.length) return `<p class="leeg">Log eerst een paar trainingen. Daarna zie je hier per oefening of je sterker wordt.</p>`;

        // Sets per spiergroep, laatste 28 dagen. Gedeeld door het aantal weken dat je
        // echt logt (max 4), zodat het getal ook in je eerste weken je echte tempo is.
        const perGroep = {};
        for (const s of state.sets) {
            const t = training(s.training_id);
            const o = oef(s.oefening_id);
            if (!t || !o || dagenTussen(t.datum, vandaag()) >= 28) continue;
            perGroep[o.spiergroep] = (perGroep[o.spiergroep] || 0) + 1;
        }
        const gedaneDatums = gedaneTrainingen().map((t) => t.datum);
        const eersteDatum = gedaneDatums.length ? gedaneDatums.reduce((a, b) => (a < b ? a : b)) : vandaag();
        const dagenGelogd = Math.min(28, dagenTussen(eersteDatum, vandaag()) + 1);
        const weken = Math.max(1, dagenGelogd / 7);
        const periode = dagenGelogd >= 28 ? "laatste 4 weken"
            : dagenGelogd <= 7 ? `sinds ${mooiDatum(eersteDatum, false)}`
            : `sinds ${mooiDatum(eersteDatum, false)} (${getal(weken, 1)} weken)`;
        // De hoofdgroepen altijd tonen, ook op 0: dan zie je ook wat je overslaat.
        const groepen = SPIERGROEPEN.filter((g) => ["borst", "rug", "schouders", "benen", "armen"].includes(g) || perGroep[g]);
        const schaal = Math.max(20, ...groepen.map((g) => (perGroep[g] || 0) / weken));

        // Oefeningen: meest recent gedaan eerst.
        const laatsteDatum = (o) => {
            const s = idx().perOef.get(o.id);
            return s.reduce((m, x) => { const t = training(x.training_id); return t && t.datum > m ? t.datum : m; }, "");
        };
        const lijst = gedaan.map((o) => ({ o, rijen: statsPerTraining(o.id), laatst: laatsteDatum(o) }))
            .sort((a, b) => b.laatst.localeCompare(a.laatst));

        return `
            ${Object.keys(perGroep).length ? `<section class="paneel" style="--tien:${(10 / schaal * 100).toFixed(1)}%;--twintig:${(20 / schaal * 100).toFixed(1)}%">
                <h2 class="paneel-titel">Sets per week<span>gemiddeld, ${periode}</span></h2>
                <ul class="balken">${groepen.map((g) => {
                    const perWeek = (perGroep[g] || 0) / weken;
                    const zone = perWeek >= 10 ? (perWeek > 20 ? "boven" : "binnen") : "onder";
                    return `<li style="--spier:${spierKleur(g)}" class="${zone}">
                        <span class="b-naam">${esc(g)}</span>
                        <span class="b-balk"><span style="width:${Math.min(100, perWeek / schaal * 100).toFixed(1)}%"></span></span>
                        <span class="b-getal">${getal(perWeek, 1)}</span>
                    </li>`;
                }).join("")}</ul>
                <p class="b-schaal" aria-hidden="true"><span style="left:var(--tien)">10</span><span style="left:var(--twintig)">20</span></p>
                <p class="voetnoot">Het lichte vlak is 10 tot 20 sets per week: de vuistregel voor spiergroei per spiergroep.</p>
            </section>` : ""}

            <h2 class="kopje">Oefeningen</h2>
            <ul class="stat-lijst">${lijst.map(({ o, rijen, laatst }) => {
                const g = groei4w(rijen);
                const nu = rijen[rijen.length - 1];
                return `<li><button class="stat-rij" data-actie="stats-oef" data-id="${o.id}" style="--spier:${spierKleur(o.spiergroep)}">
                    <span class="stat-naam"><span class="spier-stip"></span>${esc(o.naam)}<small>${relDatum(laatst)}, ${rijen.length} keer</small></span>
                    ${sparkline(rijen.slice(-12).map((r) => r.e1rm))}
                    <span class="stat-cijfer"><b>${Math.round(nu.e1rm)}${nu.lg ? "<small> reps</small>" : ""}</b><span class="${deltaKlasse(g)}">${g == null ? "" : deltaTekst(g)}</span></span>
                </button></li>`;
            }).join("")}</ul>
            <p class="voetnoot">Het getal is je geschatte 1-rep max uit je beste set van de laatste keer, of je meeste reps bij oefeningen met alleen je lichaamsgewicht. Het percentage is de verandering over ongeveer 4 weken.</p>`;
    }

    function viewStatsDetail(o) {
        const rijen = statsPerTraining(o.id);
        if (!rijen.length) { state.statsOef = null; return viewStats(); }
        const alleSets = rijen.flatMap((r) => r.sets);
        const zwaarste = alleSets.reduce((b, s) => (Number(s.gewicht) > Number(b.gewicht) || (Number(s.gewicht) === Number(b.gewicht) && s.reps > b.reps) ? s : b), alleSets[0]);
        const besteE = alleSets.reduce((b, s) => (score(s) > score(b) ? s : b), alleSets[0]);
        const lg = rijen.every((r) => r.lg);
        const eerste = rijen[0], laatste = rijen[rijen.length - 1];
        const groei = rijen.length > 1 ? procent(laatste.e1rm, eerste.e1rm) : null;

        return `
            <div class="tegels twee">
                ${lg ? `<div class="tegel"><span class="t-label">Meeste reps</span><b class="t-waarde">${besteE.reps}<small> reps</small></b><span class="t-sub">alleen lichaamsgewicht</span></div>
                <div class="tegel"><span class="t-label">Laatste keer</span><b class="t-waarde">${rijen[rijen.length - 1].e1rm}<small> reps</small></b><span class="t-sub">${relDatum(rijen[rijen.length - 1].datum)}</span></div>`
                : `<div class="tegel"><span class="t-label">Beste set (e1RM)</span><b class="t-waarde">${Math.round(score(besteE))}<small> kg</small></b><span class="t-sub">${getal(besteE.gewicht, 2)} kg × ${besteE.reps}</span></div>
                <div class="tegel"><span class="t-label">Zwaarste gewicht</span><b class="t-waarde">${getal(zwaarste.gewicht, 2)}<small> kg</small></b><span class="t-sub">× ${zwaarste.reps} reps</span></div>`}
                <div class="tegel"><span class="t-label">Groei sinds ${mooiDatum(eerste.datum, false)}</span><b class="t-waarde ${groei > 0 ? "goed" : ""}">${groei == null ? "–" : deltaTekst(groei)}</b></div>
                <div class="tegel"><span class="t-label">Gedaan</span><b class="t-waarde">${rijen.length}<small> keer</small></b><span class="t-sub">${alleSets.length} sets</span></div>
            </div>
            <section class="paneel"><div class="grafiek"><canvas id="grafiek-oef" aria-label="Grafiek van je geschatte 1-rep max en zwaarste gewicht"></canvas></div></section>
            <p class="voetnoot">e1RM is je geschatte 1-rep max (Epley). Stijgt die lijn, dan werkt je progressive overload, ook als het gewicht nog gelijk is en alleen de reps omhoog gaan.</p>
            <h2 class="kopje">Per keer</h2>
            <ul class="sessies">${[...rijen].reverse().map((r) => `<li>
                <span class="m-datum">${mooiDatum(r.datum)}</span>
                <span class="s-sets">${r.sets.map((s) => `${getal(s.gewicht, 2)}×${s.reps}`).join("  ")}</span>
                <span class="m-kg">${Math.round(r.e1rm)}${r.lg ? "<small> reps</small>" : ""}</span>
            </li>`).join("")}</ul>`;
    }

    function tekenStats() {
        const el = document.getElementById("grafiek-oef");
        if (!el || !stijlGrafiek()) return;
        const rijen = statsPerTraining(state.statsOef);
        const kleur = spierKleur(oef(state.statsOef).spiergroep);
        const lg = rijen.every((r) => r.lg);
        grafieken.push(new Chart(el, {
            type: "line",
            data: {
                labels: rijen.map((r) => mooiDatum(r.datum, false)),
                datasets: [
                    { label: lg ? "Meeste reps" : "e1RM", data: rijen.map((r) => +r.e1rm.toFixed(1)), borderColor: "#f2efe8", backgroundColor: "#f2efe8", borderWidth: 2.5, pointRadius: 2.5, tension: 0.3 },
                    ...(lg ? [] : [{ label: "Zwaarste gewicht", data: rijen.map((r) => r.top), borderColor: kleur, backgroundColor: kleur, borderWidth: 2, pointRadius: 2, tension: 0.3 }]),
                ],
            },
            options: {
                maintainAspectRatio: false,
                animation: matchMedia("(prefers-reduced-motion: reduce)").matches ? false : { duration: 400 },
                interaction: { mode: "index", intersect: false },
                plugins: { legend: { position: "bottom", labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, padding: 16 } } },
                scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 5, maxRotation: 0 } }, y: { ticks: { maxTicksLimit: 5, callback: (v) => `${v} ${lg ? "" : "kg"}` } } },
            },
        }));
    }

    // ---------- Historie ----------

    function viewHistorie() {
        const lijst = state.trainingen.filter((t) => setsVan(t.id).length || t.id === state.actief);
        if (!lijst.length) return `<p class="leeg">Nog geen trainingen. Als je er een afrondt, staat hij hier.</p>`;
        const weken = [];
        for (const t of lijst) {
            const w = maandagVan(t.datum);
            let wk = weken[weken.length - 1];
            if (!wk || wk.w !== w) { wk = { w, t: [] }; weken.push(wk); }
            wk.t.push(t);
        }
        const dezeWeek = maandagVan(vandaag());
        return weken.map(({ w, t }) => `
            <h2 class="kopje week-kop">${w === dezeWeek ? "Deze week" : `Week van ${mooiDatum(w, false)}`}<span>${t.length} ${t.length === 1 ? "training" : "trainingen"}</span></h2>
            <div class="rijen">${t.map((tr) => {
                const sets = setsVan(tr.id);
                const duur = duurMinuten(sets);
                const open = state.openHist === tr.id;
                const kleuren = [...new Set(oefeningenIn(tr.id).map((id) => oef(id).spiergroep))];
                return `<div class="hist ${open ? "open" : ""}">
                    <button class="rij hist-rij" data-actie="hist" data-id="${tr.id}" aria-expanded="${open}">
                        <span class="hist-dag"><b>${parseDatum(tr.datum).getDate()}</b>${DAGEN[parseDatum(tr.datum).getDay()]}</span>
                        <span class="rij-tekst"><span class="rij-titel">${esc(tr.label || "Training")}${tr.id === state.actief ? ` <span class="label-bezig">bezig</span>` : ""}</span>
                        <span class="rij-sub">${sets.length} sets${duur ? `, ${duur} min` : ""}</span></span>
                        <span class="hist-stippen">${kleuren.map((g) => `<span class="spier-stip" style="--spier:${spierKleur(g)}"></span>`).join("")}</span>
                    </button>
                    ${open ? `<div class="hist-detail">${sets.length ? samenvattingBlok(tr) : ""}
                        <div class="knoppen">
                            <button class="knop knop-klein knop-gevaar" data-actie="weg-training" data-id="${tr.id}">Verwijderen</button>
                            <button class="knop knop-klein" data-actie="open-training" data-id="${tr.id}">Aanpassen</button>
                        </div></div>` : ""}
                </div>`;
            }).join("")}</div>`).join("");
    }

    // ---------- Instellingen ----------

    function viewInstellingen() {
        const regel = (o) => {
            const stijl = `style="--spier:${spierKleur(o.spiergroep)}"`;
            if (state.bewerkOef === o.id) {
                return `<form class="oef-bewerk" data-form="bewerk-oef" data-id="${o.id}" ${stijl}>
                    <p class="oef-bewerk-naam">${esc(o.naam)}</p>
                    <div class="rij-velden">
                        <label class="veld"><span>Min. reps</span><input name="rep_min" type="number" inputmode="numeric" value="${o.rep_min}"></label>
                        <label class="veld"><span>Max. reps</span><input name="rep_max" type="number" inputmode="numeric" value="${o.rep_max}"></label>
                        <label class="veld"><span>Stap (kg)</span><input name="stap_kg" type="number" step="any" inputmode="decimal" value="${punt(o.stap_kg)}"></label>
                    </div>
                    <label class="veld"><span>Spiergroep</span><select name="spiergroep">${SPIERGROEPEN.map((g) => `<option ${g === o.spiergroep ? "selected" : ""}>${g}</option>`).join("")}</select></label>
                    <div class="knoppen">
                        <button type="button" class="knop knop-klein" data-actie="archiveer" data-id="${o.id}">${o.gearchiveerd ? "Terugzetten" : "Archiveren"}</button>
                        <button type="button" class="knop knop-klein" data-actie="bewerk-dicht">Annuleer</button>
                        <button class="knop knop-klein knop-hoofd" type="submit">Opslaan</button>
                    </div>
                </form>`;
            }
            return `<button class="oef-instelling" data-actie="bewerk-oef" data-id="${o.id}" ${stijl}>
                <span class="kies-naam">${esc(o.naam)}</span>
                <span class="kies-meta">${o.rep_min}–${o.rep_max} reps, +${getal(o.stap_kg, 2)} kg</span>
                ${ico("pijl")}
            </button>`;
        };
        const actief = state.oefeningen.filter((o) => !o.gearchiveerd);
        const archief = state.oefeningen.filter((o) => o.gearchiveerd);
        const groepen = SPIERGROEPEN.filter((g) => actief.some((o) => o.spiergroep === g));
        return `
            <h2 class="kopje">Oefeningen</h2>
            <p class="uitleg">De rep-range bepaalt je doel. Haal je bij alle sets het maximum, dan gaat het gewicht de volgende keer met de stap omhoog.</p>
            ${groepen.map((g) => `<section class="groep" style="--spier:${spierKleur(g)}">
                <h3><span class="spier-stip"></span>${esc(g[0].toUpperCase() + g.slice(1))}</h3>
                <div class="rijen">${actief.filter((o) => o.spiergroep === g).map(regel).join("")}</div>
            </section>`).join("")}
            <button class="knop-stippel" data-actie="sheet-nieuw">${ico("plus")}<span>Nieuwe oefening</span></button>
            ${archief.length ? `<details class="archief"><summary>Gearchiveerd (${archief.length})</summary><div class="rijen">${archief.map(regel).join("")}</div></details>` : ""}

            <h2 class="kopje">Lichaamsgewicht</h2>
            <form class="paneel" data-form="doel">
                <label class="veld"><span>Doel per week in kg. Positief voor een bulk, negatief voor een cut, 0 voor geen doel.</span>
                    <div class="invoer-knop"><input name="doel" type="number" step="0.05" inputmode="decimal" value="${punt(doelPerWeek())}">
                    <button class="knop" type="submit">Opslaan</button></div></label>
            </form>

            <h2 class="kopje">Account</h2>
            <div class="paneel account">
                <p>Ingelogd als <b>${esc(sessie.user.email)}</b></p>
                <button class="knop knop-klein" data-actie="uitloggen">Uitloggen</button>
            </div>`;
    }

    // ---------- Klokken: duur van de training en rusttimer ----------

    let klokInterval = null;
    function tikKlok() {
        const duurEl = document.getElementById("duur");
        const rustEl = document.getElementById("rust");
        if (!duurEl || !rustEl) { clearInterval(klokInterval); klokInterval = null; return; }
        const t = training(state.actief);
        const sets = t ? setsVan(t.id) : [];
        if (t && t.datum === vandaag() && sets.length) {
            const m = Math.floor((Date.now() - new Date(sets[0].created_at)) / 60000);
            duurEl.hidden = m < 1 || m >= 300;
            duurEl.innerHTML = `${ico("klok")}${m} min`;
        } else duurEl.hidden = true;
        const start = Number(localStorage.getItem(LS.rust) || 0);
        const sec = Math.floor((Date.now() - start) / 1000);
        if (start && sec <= 15 * 60) {
            rustEl.hidden = false;
            rustEl.innerHTML = `<span>rust</span> ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
        } else rustEl.hidden = true;
        if (!klokInterval) klokInterval = setInterval(tikKlok, 1000);
    }

    // ---------- Melding onderin met "ongedaan maken" ----------

    let toastTimer = null;
    let ongedaanActie = null;
    function toast(tekst, ongedaan = null, soort = "") {
        ongedaanActie = ongedaan;
        toastEl.className = `toast ${soort}`;
        toastEl.innerHTML = `<span>${tekst}</span>${ongedaan ? `<button data-actie="ongedaan">Ongedaan maken</button>` : ""}`;
        toastEl.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { toastEl.hidden = true; ongedaanActie = null; }, ongedaan ? 6000 : 3500);
    }

    // ---------- Events ----------

    document.addEventListener("click", (e) => {
        const el = e.target.closest("[data-actie]");
        if (el) actie(el.dataset.actie, el, e);
    });

    function scrollNaar(sel) {
        requestAnimationFrame(() => {
            const el = document.querySelector(sel);
            if (el) el.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        });
    }

    function actie(naam, el, e) {
        const id = el.dataset.id;
        switch (naam) {
            case "tab":
                if (state.tab === el.dataset.tab && el.closest(".tabs")) { state.statsOef = null; }
                state.tab = el.dataset.tab; state.fout = ""; state.bewerkOef = null; state.sheet = null;
                render(); window.scrollTo(0, 0); break;
            case "fout-weg": state.fout = ""; render(); break;
            case "label":
                state.nieuwLabel = state.nieuwLabel === el.dataset.label ? "" : el.dataset.label; render(); break;
            case "start-open": state.startOpen = true; render(); scrollNaar(".nieuwe-training"); break;
            case "start-dicht": state.startOpen = false; state.andereDag = false; state.nieuwLabel = ""; state.kopieerVan = "auto"; render(); break;
            case "andere-dag": state.andereDag = true; render(); break;
            case "herhaal": {
                const t = training(id);
                state.nieuwLabel = t.label || "";
                state.kopieerVan = t.id;
                state.nieuweDatum = vandaag();
                startTraining();
                break;
            }
            case "open-training":
                e.stopPropagation(); zetActief(id); state.samenvatting = null; state.tab = "training"; render(); window.scrollTo(0, 0); break;
            case "toon-samenvatting":
                state.samenvatting = id; state.samenvattingNet = false; render(); window.scrollTo(0, 0); break;
            case "afronden": {
                const tid = state.actief;
                const heeftSets = setsVan(tid).length;
                zetActief(null); localStorage.removeItem(LS.rust);
                state.samenvatting = heeftSets ? tid : null;
                state.samenvattingNet = true;
                render(); window.scrollTo(0, 0); break;
            }
            case "sluit-samenvatting": state.samenvatting = null; render(); window.scrollTo(0, 0); break;
            case "open-oef":
                state.openOef[state.actief] = id; render(); scrollNaar(".oef.open"); break;
            case "sluit-oef":
                state.openOef[state.actief] = null; render(); break;
            case "weg-kaart":
                zetKaarten(state.actief, kaarten(state.actief).filter((x) => x !== id));
                if (state.openOef[state.actief] === id) delete state.openOef[state.actief];
                render(); break;
            case "sheet-open": state.sheet = "kies"; state.zoek = ""; renderSheet(); focusZoek(); break;
            case "sheet-dicht": state.sheet = null; renderSheet(); break;
            case "sheet-nieuw":
                if (!el.closest(".sheet")) state.zoek = "";   // vanuit de lijst: getypte naam meenemen
                state.sheet = "nieuw"; renderSheet(); focusEerste(); break;
            case "sheet-kies": state.sheet = "kies"; renderSheet(); focusZoek(); break;
            case "kies-oef": {
                const tid = state.actief;
                zetKaarten(tid, [...kaarten(tid), id]);
                state.openOef[tid] = id;
                state.sheet = null;
                render(); scrollNaar(".oef.open"); break;
            }
            case "stap": {
                const input = el.closest(".teller").querySelector("input");
                const nieuw = Math.max(0, (num(input.value) || 0) + Number(el.dataset.d));
                input.value = punt(nieuw);
                break;
            }
            case "rust-reset": localStorage.removeItem(LS.rust); tikKlok(); break;
            case "weg-set": verwijderSet(id); break;
            case "weg-gewicht": verwijderGewicht(el.dataset.datum); break;
            case "lichaam": state.lichaam = el.dataset.n; render(); break;
            case "foto-vandaag": state.tab = "weegschaal"; state.lichaam = "fotos"; render(); if (window.GymFotos) window.GymFotos.openCamera(); break;
            case "meer-metingen": state.meerMetingen = true; render(); break;
            case "weeg-bereik": state.weegBereik = Number(el.dataset.n); render(); break;
            case "weeg-bewerk": state.weegBewerk = true; render(); focusEerste("input[name=kg]"); break;
            case "andere-dag-weeg": state.weegBewerk = true; state.andereDag = true; render(); break;
            case "stats-oef": state.statsOef = id; render(); window.scrollTo(0, 0); break;
            case "stats-terug": state.statsOef = null; render(); window.scrollTo(0, 0); break;
            case "hist":
                state.openHist = state.openHist === id ? null : id; render(); break;
            case "weg-training": e.stopPropagation(); verwijderTraining(id); break;
            case "bewerk-oef": state.bewerkOef = id; render(); break;
            case "bewerk-dicht": state.bewerkOef = null; render(); break;
            case "archiveer": wijzigOefening(id, { gearchiveerd: !oef(id).gearchiveerd }); break;
            case "ongedaan": {
                const f = ongedaanActie;
                ongedaanActie = null;
                toastEl.hidden = true;
                if (f) f();
                break;
            }
            case "uitloggen": uitloggen(); break;
            case "login-modus": state.loginModus = state.loginModus === "nieuw" ? "in" : "nieuw"; toonLogin(); break;
        }
    }

    function focusZoek() { requestAnimationFrame(() => { const z = document.getElementById("zoek"); if (z) z.focus(); }); }
    function focusEerste(sel = ".sheet input") { requestAnimationFrame(() => { const z = document.querySelector(sel); if (z) z.focus(); }); }

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && state.sheet) { state.sheet = null; renderSheet(); }
    });

    document.addEventListener("input", (e) => {
        if (e.target.id === "nieuw-label") {
            state.nieuwLabel = e.target.value;
            const el = document.getElementById("start-bron");
            if (el) el.outerHTML = startBron();
            document.querySelectorAll(".nieuwe-training .chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.label === state.nieuwLabel)));
        }
        if (e.target.id === "zoek") {
            state.zoek = e.target.value;
            const l = document.getElementById("sheet-lijst");
            if (l) l.innerHTML = kiezerLijst();
        }
    });

    document.addEventListener("change", (e) => {
        if (e.target.id === "nieuwe-datum") state.nieuweDatum = e.target.value || vandaag();
        if (e.target.id === "kopieer-van") { state.kopieerVan = e.target.value; render(); }
        if (e.target.name === "spiergroep" && e.target.type === "radio") state.nieuweSpier = e.target.value;
    });

    document.addEventListener("submit", (e) => {
        e.preventDefault();
        const f = e.target;
        const d = new FormData(f);
        switch (f.dataset.form) {
            case "set": {
                const gewicht = num(d.get("gewicht")), reps = parseInt(d.get("reps"), 10);
                if (gewicht == null || !reps) return;
                logSet(f.dataset.tid, f.dataset.oef, gewicht, reps);
                break;
            }
            case "start":
                state.startOpen = false; state.andereDag = false;
                startTraining();
                break;
            case "weeg-snel": {
                const kg = num(d.get("kg"));
                if (kg) { slaGewichtOp(vandaag(), kg); toast(`${getal(kg, 2)} kg opgeslagen`); }
                break;
            }
            case "weeg": {
                const kg = num(d.get("kg"));
                if (!kg) return;
                const datum = d.get("datum") || vandaag();
                state.weegBewerk = false; state.andereDag = false;
                slaGewichtOp(datum, kg);
                toast(`${getal(kg, 2)} kg opgeslagen${datum === vandaag() ? "" : ` voor ${mooiDatum(datum)}`}`);
                break;
            }
            case "login":
                login(String(d.get("email")).trim(), String(d.get("wachtwoord")));
                break;
            case "doel": {
                const doel = num(d.get("doel")) ?? 0;
                slaDoelOp(doel);
                toast("Weekdoel opgeslagen");
                break;
            }
            case "nieuwe-oef": {
                const rep_min = parseInt(d.get("rep_min"), 10) || 8;
                const rep_max = Math.max(rep_min, parseInt(d.get("rep_max"), 10) || 12);
                const voorTraining = state.tab === "training" && state.actief ? state.actief : null;
                nieuweOefening({
                    naam: String(d.get("naam")).trim(),
                    spiergroep: d.get("spiergroep") || "overig",
                    rep_min, rep_max,
                    stap_kg: num(d.get("stap_kg")) || 2.5,
                }, voorTraining);
                break;
            }
            case "bewerk-oef": {
                const rep_min = parseInt(d.get("rep_min"), 10) || 1;
                wijzigOefening(f.dataset.id, {
                    rep_min,
                    rep_max: Math.max(rep_min, parseInt(d.get("rep_max"), 10) || rep_min),
                    stap_kg: num(d.get("stap_kg")) || 2.5,
                    spiergroep: d.get("spiergroep"),
                });
                break;
            }
        }
    });

    window.addEventListener("online", () => {
        if (sessie) flush().then(() => laadAlles()).then(render).catch(() => {});
    });
    document.addEventListener("visibilitychange", () => {
        if (sessie && document.visibilityState === "visible" && outbox().length) flush();
    });

    // ---------- Account ----------

    function toonLogin(melding = "", soort = "fout") {
        tabsEl.hidden = true;
        syncEl.textContent = "";
        kopEl.innerHTML = "";
        state.sheet = null;
        renderSheet();
        toastEl.hidden = true;
        const nieuw = state.loginModus === "nieuw";
        app.innerHTML = `<form class="login" data-form="login">
            <div class="merk" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
            <h1 class="login-titel">Gym Log</h1>
            <p class="login-uitleg">${nieuw
                ? "Maak je eigen logboek. Niemand anders ziet jouw trainingen of je gewicht."
                : "Log in om verder te gaan. Je blijft op dit apparaat ingelogd."}</p>
            ${melding ? `<div class="melding ${soort}" role="alert">${esc(melding)}</div>` : ""}
            <label class="veld"><span>E-mailadres</span><input type="email" name="email" autocomplete="email" required></label>
            <label class="veld"><span>Wachtwoord${nieuw ? ", minstens 6 tekens" : ""}</span><input type="password" name="wachtwoord"
                autocomplete="${nieuw ? "new-password" : "current-password"}" minlength="6" required></label>
            <button class="knop knop-hoofd breed" type="submit">${nieuw ? "Account maken" : "Inloggen"}</button>
            <button class="knop-link" type="button" data-actie="login-modus">${nieuw ? "Ik heb al een account" : "Nog geen account? Maak er een"}</button>
        </form>`;
    }

    function vertaalAuthFout(e) {
        const t = `${e.code || ""} ${e.message || ""}`.toLowerCase();
        if (!e.status) return "Geen verbinding. Probeer het zo nog eens.";
        if (t.includes("invalid login") || t.includes("invalid_credentials")) return "E-mail of wachtwoord klopt niet.";
        if (t.includes("not confirmed")) return "Bevestig eerst je e-mailadres via de link in je inbox.";
        if (t.includes("already registered") || t.includes("user_already_exists")) return "Er bestaat al een account met dit adres. Log in.";
        if (t.includes("password") && (t.includes("6") || t.includes("weak") || t.includes("short"))) return "Kies een wachtwoord van minstens 6 tekens.";
        if (t.includes("signup") && t.includes("disabled")) return "Nieuwe accounts maken staat uit.";
        if (t.includes("rate limit") || e.status === 429) return "Even te veel pogingen. Wacht een paar minuten.";
        return e.message || "Er ging iets mis.";
    }

    async function login(email, wachtwoord) {
        const knop = app.querySelector("button[type=submit]");
        if (knop) { knop.disabled = true; knop.textContent = "Even wachten…"; }
        try {
            if (state.loginModus === "nieuw") {
                const terug = encodeURIComponent(location.origin + location.pathname);
                const d = await auth(`signup?redirect_to=${terug}`, { body: { email, password: wachtwoord } });
                if (!d.access_token) {
                    // E-mailbevestiging staat aan in Supabase: eerst de link in de mail volgen.
                    state.loginModus = "in";
                    return toonLogin("Account gemaakt! Klik op de link in de mail die je net kreeg, dan ben je meteen ingelogd.", "ok");
                }
                bewaarSessie(sessieUit(d));
            } else {
                bewaarSessie(sessieUit(await auth("token?grant_type=password", { body: { email, password: wachtwoord } })));
            }
            start();
        } catch (e) {
            toonLogin(vertaalAuthFout(e));
            const veld = app.querySelector("input[name=email]");
            if (veld) veld.value = email;
        }
    }

    async function uitloggen() {
        const wacht = outbox().length;
        if (wacht && !confirm(`Er ${wacht === 1 ? "staat nog 1 wijziging" : `staan nog ${wacht} wijzigingen`} te wachten op verbinding. Die worden verstuurd als je hier weer inlogt. Toch uitloggen?`)) return;
        const token = sessie && sessie.access_token;
        if (window.GymFotos) window.GymFotos.reset();
        bewaarSessie(null);
        for (const k of Object.keys(LS)) delete LS[k];
        Object.assign(state, {
            tab: "training", oefeningen: [], trainingen: [], sets: [], gewicht: [], actief: null, statsOef: null,
            openHist: null, bewerkOef: null, fout: "", loginModus: "in", openOef: {}, samenvatting: null,
            sheet: null, startOpen: false, andereDag: false, weegBewerk: false, laatsteSet: null,
        });
        toonLogin();
        if (token) auth("logout", { token }).catch(() => {});
    }

    async function slaDoelOp(doel) {
        sessie.user.meta = { ...sessie.user.meta, doel_per_week: doel };
        bewaarSessie(sessie);
        render();
        try {
            const user = await auth("user", { method: "PUT", token: await geldigToken(), body: { data: { doel_per_week: doel } } });
            sessie.user.meta = user.user_metadata || sessie.user.meta;
            bewaarSessie(sessie);
        } catch {
            state.fout = "Weekdoel alleen op dit apparaat opgeslagen (geen verbinding).";
            render();
        }
    }

    // Lokale opslag van vóór de accounts (zonder gebruiker in de naam) overnemen.
    function verhuisOudeOpslag() {
        const oud = { gym_outbox: LS.outbox, gym_kaarten: LS.kaarten, gym_actief: LS.actief, gym_rust_start: LS.rust };
        for (const [van, naar] of Object.entries(oud)) {
            const v = localStorage.getItem(van);
            if (v != null && localStorage.getItem(naar) == null) localStorage.setItem(naar, v);
            localStorage.removeItem(van);
        }
        localStorage.removeItem("gym_ok");
    }

    // Nieuw account zonder oefeningen: begin met de standaardlijst uit config.js.
    async function zaaiOefeningen() {
        const lijst = (window.GYM_STANDAARD_OEFENINGEN || []).map(([naam, spiergroep, rep_min, rep_max, stap_kg]) =>
            ({ naam, spiergroep, rep_min, rep_max, stap_kg }));
        if (!lijst.length) return;
        try {
            const rijen = await sb("gym_oefeningen", { method: "POST", body: lijst, headers: { Prefer: "return=representation" } });
            state.oefeningen = (rijen || []).sort((a, b) => a.naam.localeCompare(b.naam));
        } catch (e) {
            console.warn("Standaard oefeningen toevoegen mislukt", e);
        }
    }

    // Hulpjes voor fotos.js.
    window.GymLog = {
        uid: () => (sessie ? sessie.user.id : "anoniem"),
        render: () => render(),
        toast: (...a) => toast(...a),
        esc, ico, mooiDatum, relDatum, getal, vandaag, datumStr, dagenTussen,
        gewichtOp: (d) => { const g = state.gewicht.find((x) => x.datum === d); return g ? Number(g.kg) : null; },
    };

    // ---------- Start ----------

    async function start() {
        await vangLinkSessie();
        if (!sessie) return toonLogin();
        zetSleutels(sessie.user.id);
        verhuisOudeOpslag();
        state.actief = localStorage.getItem(LS.actief) || null;
        app.innerHTML = `<div class="laden" role="status">Laden…</div>`;
        await flush();
        try {
            await laadAlles();
            if (!state.oefeningen.length) await zaaiOefeningen();
            if (window.GymFotos) window.GymFotos.laad().then(() => { if (state.tab === "training") render(); }).catch(() => {});
        } catch (e) {
            console.error(e);
            if (e.status === 401) return toonLogin("Je sessie is verlopen, log opnieuw in.");
            app.innerHTML = `<div class="melding fout">Kon de gegevens niet laden. ${e.status === 404 || /relation|does not exist/.test(e.message)
                ? "Heb je SETUP.sql al in Supabase gedraaid?" : "Check je verbinding en herlaad."}</div>`;
            return;
        }
        render();
    }

    start();
})();
