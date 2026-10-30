// Gym Log — trainingslogboek met progressive overload, weegschaal en stats.
// Data staat in Supabase (zie SETUP.sql). Schrijfacties die mislukken door slecht
// bereik in de gym worden lokaal bewaard en later alsnog verstuurd.

(function () {
    "use strict";

    const SB_URL = window.GYM_SUPABASE_URL;
    const SB_KEY = window.GYM_SUPABASE_KEY;
    const DOEL_PER_WEEK = Number(window.GYM_DOEL_PER_WEEK || 0);
    const LABELS = window.GYM_LABELS || [];

    const LS_OUTBOX = "gym_outbox";
    const LS_OK = "gym_ok";
    const LS_KAARTEN = "gym_kaarten";   // oefeningen die al op een training staan maar nog geen sets hebben
    const LS_ACTIEF = "gym_actief";     // id van de training die open staat
    const LS_RUST = "gym_rust_start";

    const SPIERGROEPEN = ["borst", "rug", "schouders", "benen", "armen", "core", "overig"];

    const state = {
        tab: "training",
        oefeningen: [],
        trainingen: [],
        sets: [],
        gewicht: [],
        actief: localStorage.getItem(LS_ACTIEF) || null,
        nieuwLabel: "",
        kopieerVan: "auto",
        nieuweDatum: vandaag(),
        toonNieuweOef: false,
        statsOef: null,
        weegBereik: 90,
        openHist: null,
        bewerkOef: null,
        fout: "",
    };

    const app = document.getElementById("app");
    const tabsEl = document.getElementById("tabs");
    const syncEl = document.getElementById("sync");
    const rustEl = document.getElementById("rust");
    let grafieken = [];

    // ---------- Supabase REST ----------

    async function sb(pad, opties = {}) {
        const res = await fetch(`${SB_URL}/rest/v1/${pad}`, {
            method: opties.method || "GET",
            headers: {
                apikey: SB_KEY,
                Authorization: `Bearer ${SB_KEY}`,
                "Content-Type": "application/json",
                ...(opties.headers || {}),
            },
            body: opties.body ? JSON.stringify(opties.body) : undefined,
        });
        if (!res.ok) {
            const fout = new Error((await res.text()) || res.statusText);
            fout.status = res.status;
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
        try { return JSON.parse(localStorage.getItem(LS_OUTBOX) || "[]"); } catch { return []; }
    }
    function zetOutbox(lijst) {
        localStorage.setItem(LS_OUTBOX, JSON.stringify(lijst));
        toonSync();
    }

    // Probeert direct te versturen; bij netwerkfout komt het in de outbox.
    async function schrijf(pad, opties) {
        try {
            await sb(pad, opties);
            return true;
        } catch (e) {
            if (e.status) throw e;           // echte fout van de server: niet opnieuw proberen
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
                    if (!e.status) break;      // nog steeds offline
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
    function getal(x, dec = 1) {
        const n = Number(x);
        if (!isFinite(n)) return "–";
        return Number.isInteger(n) ? String(n) : n.toFixed(dec).replace(/\.?0+$/, "");
    }
    function num(v) { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : null; }

    // Geschatte 1-rep max (Epley). Bij 1 rep is het gewoon het gewicht.
    function e1rm(gewicht, reps) {
        if (!reps) return 0;
        return reps === 1 ? gewicht : gewicht * (1 + reps / 30);
    }

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

    function alleKaarten() { try { return JSON.parse(localStorage.getItem(LS_KAARTEN) || "{}"); } catch { return {}; } }
    function kaarten(tid) { return alleKaarten()[tid] || []; }
    function zetKaarten(tid, lijst) {
        const k = alleKaarten();
        if (lijst.length) k[tid] = lijst; else delete k[tid];
        localStorage.setItem(LS_KAARTEN, JSON.stringify(k));
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
            if (eerder) best = Math.max(best, e1rm(Number(s.gewicht), s.reps));
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
        if (id) localStorage.setItem(LS_ACTIEF, id); else localStorage.removeItem(LS_ACTIEF);
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
        localStorage.setItem(LS_RUST, String(Date.now()));
        render();
        const gelukt = await schrijf("gym_sets", { method: "POST", body: s, headers: INSERT });
        if (!gelukt) { s._wacht = true; render(); }
    }

    async function verwijderSet(id) {
        state.sets = state.sets.filter((s) => s.id !== id);
        render();
        await schrijf(`gym_sets?id=eq.${id}`, { method: "DELETE" });
    }

    async function verwijderTraining(id) {
        if (!confirm("Deze training en alle sets verwijderen?")) return;
        state.trainingen = state.trainingen.filter((t) => t.id !== id);
        state.sets = state.sets.filter((s) => s.training_id !== id);
        zetKaarten(id, []);
        if (state.actief === id) zetActief(null);
        render();
        await schrijf(`gym_trainingen?id=eq.${id}`, { method: "DELETE" });
    }

    async function slaGewichtOp(datum, kg) {
        const rij = { datum, kg };
        const i = state.gewicht.findIndex((g) => g.datum === datum);
        if (i >= 0) state.gewicht[i] = { ...state.gewicht[i], ...rij }; else state.gewicht.push(rij);
        state.gewicht.sort((a, b) => a.datum.localeCompare(b.datum));
        render();
        await schrijf("gym_gewicht", { method: "POST", body: rij, headers: UPSERT });
    }

    async function verwijderGewicht(datum) {
        state.gewicht = state.gewicht.filter((g) => g.datum !== datum);
        render();
        await schrijf(`gym_gewicht?datum=eq.${datum}`, { method: "DELETE" });
    }

    async function nieuweOefening(velden, voorTraining) {
        try {
            const [o] = await sb("gym_oefeningen", { method: "POST", body: velden, headers: { Prefer: "return=representation" } });
            state.oefeningen.push(o);
            state.oefeningen.sort((a, b) => a.naam.localeCompare(b.naam));
            if (voorTraining) zetKaarten(voorTraining, [...kaarten(voorTraining), o.id]);
            state.toonNieuweOef = false;
            state.fout = "";
        } catch (e) {
            state.fout = e.status === 409 ? "Die oefening bestaat al." : "Opslaan lukte niet (geen verbinding?).";
        }
        render();
    }

    async function wijzigOefening(id, velden) {
        const o = oef(id);
        Object.assign(o, velden);
        state.bewerkOef = null;
        render();
        try {
            await sb(`gym_oefeningen?id=eq.${id}`, { method: "PATCH", body: velden });
        } catch {
            state.fout = "Wijziging opslaan lukte niet.";
            render();
        }
    }

    // ---------- Render ----------

    const TABS = [
        ["training", "🏋️", "Training"],
        ["weegschaal", "⚖️", "Gewicht"],
        ["stats", "📈", "Stats"],
        ["historie", "🗓️", "Historie"],
        ["oefeningen", "⚙️", "Oefeningen"],
    ];

    function render() {
        grafieken.forEach((g) => g.destroy());
        grafieken = [];
        tabsEl.hidden = false;
        tabsEl.innerHTML = TABS.map(([id, ico, naam]) =>
            `<button data-actie="tab" data-tab="${id}" class="${state.tab === id ? "actief" : ""}"><span class="ico">${ico}</span>${naam}</button>`
        ).join("");

        const fout = state.fout ? `<div class="melding fout">${esc(state.fout)}</div>` : "";
        const views = { training: viewTraining, weegschaal: viewWeegschaal, stats: viewStats, historie: viewHistorie, oefeningen: viewOefeningen };
        app.innerHTML = fout + views[state.tab]();
        if (state.tab === "weegschaal") tekenGewicht();
        if (state.tab === "stats") tekenStats();
        toonSync();
        tikRust();
    }

    function weegSnel() {
        const g = state.gewicht.find((x) => x.datum === vandaag());
        if (g) {
            return `<div class="weeg-snel klaar"><span class="lbl">⚖️ Vandaag gewogen: <b class="mono">${getal(g.kg, 2)} kg</b></span></div>`;
        }
        const laatste = state.gewicht[state.gewicht.length - 1];
        return `<form class="weeg-snel" data-form="weeg-snel">
            <span class="lbl">⚖️ Nog niet gewogen vandaag</span>
            <input type="number" name="kg" step="0.1" inputmode="decimal" placeholder="${laatste ? getal(laatste.kg, 2) : "kg"}" required>
            <button class="knop-klein knop-hoofd" type="submit">OK</button>
        </form>`;
    }

    function viewTraining() {
        const t = state.actief && training(state.actief);
        if (!t) return weegSnel() + viewStart();

        const lijst = oefeningenIn(t.id);
        const gebruikt = new Set(lijst);
        const opties = SPIERGROEPEN.map((g) => {
            const os = state.oefeningen.filter((o) => o.spiergroep === g && !o.gearchiveerd && !gebruikt.has(o.id));
            return os.length ? `<optgroup label="${esc(g)}">${os.map((o) => `<option value="${o.id}">${esc(o.naam)}</option>`).join("")}</optgroup>` : "";
        }).join("");
        const totaalSets = setsVan(t.id).length;

        return `
            ${t.datum === vandaag() ? weegSnel() : ""}
            <div class="training-kop">
                <div>
                    <h2>${esc(t.label || "Training")}</h2>
                    <div class="sub">${mooiDatum(t.datum)} · ${totaalSets} set${totaalSets === 1 ? "" : "s"}</div>
                </div>
                <button class="knop-klein" data-actie="sluit-training">Klaar</button>
            </div>
            ${lijst.map((id) => kaartOefening(t, oef(id))).join("") || `<div class="leeg">Voeg je eerste oefening toe.</div>`}
            <div class="kaart toevoegen">
                <div class="rij">
                    <select id="kies-oef"><option value="">+ Oefening toevoegen…</option>${opties}</select>
                    <button class="vast" data-actie="voeg-oef">Voeg toe</button>
                </div>
                ${state.toonNieuweOef ? formNieuweOef(t.id) : `<button class="knop-link" data-actie="toon-nieuwe-oef">Staat er niet tussen? Nieuwe oefening</button>`}
            </div>`;
    }

    function viewStart() {
        const vandaagT = state.trainingen.filter((t) => t.datum === vandaag());
        const laatste = state.trainingen[0];
        return `
            <h2>Nieuwe training</h2>
            <div class="kaart">
                <label class="veld"><span>Naam (mag leeg)</span>
                    <input id="nieuw-label" value="${esc(state.nieuwLabel)}" placeholder="bv. Pull, Pull 2, Rug + biceps" autocomplete="off"></label>
                <div class="chips">
                    ${bekendeLabels().map((l) => `<button class="chip ${state.nieuwLabel === l ? "aan" : ""}" data-actie="label" data-label="${esc(l)}">${esc(l)}</button>`).join("")}
                </div>
                <label class="veld"><span>Oefeningen klaarzetten van</span>
                    <select id="kopieer-van">
                        <option value="auto" ${state.kopieerVan === "auto" ? "selected" : ""}>${state.nieuwLabel.trim()
                            ? `Vorige "${esc(state.nieuwLabel.trim())}"${bronTraining() || state.kopieerVan !== "auto" ? "" : " (nog nooit gedaan: leeg)"}`
                            : "Automatisch (zelfde naam)"}</option>
                        <option value="" ${state.kopieerVan === "" ? "selected" : ""}>Niks, leeg beginnen</option>
                        ${gedaneTrainingen().slice(0, 15).map((t) => `<option value="${t.id}" ${state.kopieerVan === t.id ? "selected" : ""}>${esc(t.label || "Training")} · ${mooiDatum(t.datum)} (${oefeningenIn(t.id).length} oef.)</option>`).join("")}
                    </select></label>
                <label class="veld"><span>Datum</span><input type="date" id="nieuwe-datum" value="${state.nieuweDatum}" max="${vandaag()}"></label>
                <button class="knop-hoofd knop-breed" data-actie="start">Start training</button>
                ${(() => {
                    const bron = bronTraining();
                    return bron ? `<p class="sub" style="margin-top:8px">Klaar te zetten: ${oefeningenIn(bron.id).map((id) => esc(oef(id).naam)).join(", ")}</p>` : "";
                })()}
            </div>
            ${vandaagT.length ? `<h2>Vandaag</h2>${vandaagT.map(trainingRegel).join("")}` : ""}
            ${laatste && !vandaagT.length ? `<h2>Vorige training</h2>${trainingRegel(laatste)}` : ""}`;
    }

    function trainingRegel(t) {
        const n = setsVan(t.id).length;
        return `<div class="kaart lijst-training">
            <div><b>${esc(t.label || "Training")}</b> <span class="sub">${relDatum(t.datum)} · ${n} sets</span></div>
            <button class="knop-klein" data-actie="open-training" data-id="${t.id}">Open</button>
        </div>`;
    }

    function kaartOefening(t, o) {
        const sets = setsVan(t.id).filter((s) => s.oefening_id === o.id);
        const vorige = vorigeKeer(o.id, t.id);
        const doel = doelVoor(o, vorige);

        // Waarden om het invoerveld mee te vullen.
        let wGewicht = "", wReps = "";
        if (sets.length) {
            const l = sets[sets.length - 1];
            wGewicht = getal(l.gewicht, 2);
            const doelReps = doel && doel.perSet[sets.length];
            wReps = doelReps != null && Number(l.gewicht) === doel.gewicht ? doelReps : l.reps;
        } else if (doel) {
            wGewicht = getal(doel.gewicht, 2);
            wReps = doel.perSet[0];
        }

        return `<div class="kaart oef" data-oef="${o.id}">
            <div class="oef-kop">
                <div><span class="oef-naam">${esc(o.naam)}</span><span class="oef-range">${o.rep_min}–${o.rep_max} reps</span></div>
                ${sets.length ? "" : `<button class="knop-link" data-actie="weg-kaart" data-id="${o.id}">weg</button>`}
            </div>
            <div class="oef-info">
                ${vorige
                    ? `<span>Vorige keer (${relDatum(vorige.training.datum)}): <span class="mono">${vorige.sets.map((s) => `${getal(s.gewicht, 2)}×${s.reps}`).join(" · ")}</span></span>
                       <span class="doel ${doel.omhoog ? "omhoog" : ""}">Doel: ${esc(doel.tekst)}</span>`
                    : `<span class="dim">Eerste keer: kies een gewicht waarmee je ${o.rep_min}–${o.rep_max} reps haalt.</span>`}
            </div>
            ${sets.length ? `<div class="sets">${sets.map((s, i) => regelSet(s, i)).join("")}</div>` : ""}
            <form class="invoer" data-form="set" data-tid="${t.id}" data-oef="${o.id}">
                <div>
                    <div class="stepper">
                        <button type="button" data-actie="stap" data-veld="gewicht" data-d="-${o.stap_kg}">−</button>
                        <input name="gewicht" type="number" step="any" inputmode="decimal" value="${wGewicht}" placeholder="0" required>
                        <button type="button" data-actie="stap" data-veld="gewicht" data-d="${o.stap_kg}">+</button>
                    </div>
                    <div class="stepper-lbl">kg</div>
                </div>
                <div>
                    <div class="stepper">
                        <button type="button" data-actie="stap" data-veld="reps" data-d="-1">−</button>
                        <input name="reps" type="number" step="1" min="1" inputmode="numeric" value="${wReps}" placeholder="0" required>
                        <button type="button" data-actie="stap" data-veld="reps" data-d="1">+</button>
                    </div>
                    <div class="stepper-lbl">reps</div>
                </div>
                <button class="knop-hoofd" type="submit">+ Set</button>
            </form>
        </div>`;
    }

    function regelSet(s, i) {
        const e = e1rm(Number(s.gewicht), s.reps);
        const vorigeBest = besteE1rmVoor(s.oefening_id, s);
        const pr = vorigeBest > 0 && e > vorigeBest + 0.01;
        return `<div class="set ${s._wacht ? "wacht" : ""}">
            <span class="nr">${i + 1}</span>
            <span>${getal(s.gewicht, 2)} kg × ${s.reps}${pr ? `<span class="pr">PR</span>` : ""}</span>
            <span class="e1">~${Math.round(e)}</span>
            <button class="weg" data-actie="weg-set" data-id="${s.id}" aria-label="Set verwijderen">×</button>
        </div>`;
    }

    function formNieuweOef(tid) {
        return `<form class="nieuwe-oef" data-form="nieuwe-oef" data-tid="${tid || ""}">
            <label class="veld"><span>Naam</span><input name="naam" required placeholder="bv. Cable fly"></label>
            <div class="rij">
                <label class="veld"><span>Spiergroep</span><select name="spiergroep">${SPIERGROEPEN.map((g) => `<option>${g}</option>`).join("")}</select></label>
                <label class="veld"><span>Stap (kg)</span><input name="stap_kg" type="number" step="any" inputmode="decimal" value="2.5"></label>
            </div>
            <div class="rij">
                <label class="veld"><span>Min reps</span><input name="rep_min" type="number" inputmode="numeric" value="8"></label>
                <label class="veld"><span>Max reps</span><input name="rep_max" type="number" inputmode="numeric" value="12"></label>
            </div>
            <div class="rij"><button type="button" data-actie="annuleer-nieuwe-oef">Annuleer</button><button class="knop-hoofd" type="submit">Opslaan</button></div>
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

    function viewWeegschaal() {
        const vandaagG = state.gewicht.find((g) => g.datum === vandaag());
        const laatste = state.gewicht[state.gewicht.length - 1];
        const gem = gemiddelden();
        const nu = gem[gem.length - 1];
        const trend = trendPerWeek();

        let trendTxt = "–", trendKlasse = "", trendSub = "nog te weinig data";
        if (trend) {
            trendTxt = `${trend.perWeek >= 0 ? "+" : ""}${trend.perWeek.toFixed(2)}`;
            trendSub = `kg/week · ${trend.dagen} dgn`;
            if (DOEL_PER_WEEK) {
                const afwijking = Math.abs(trend.perWeek - DOEL_PER_WEEK);
                trendKlasse = afwijking <= Math.max(0.15, Math.abs(DOEL_PER_WEEK) * 0.6) ? "goed" : "matig";
            }
        }

        return `
            <h2>Weegschaal</h2>
            <form class="kaart" data-form="weeg">
                <div class="groot-invoer">
                    <input type="number" name="kg" step="0.1" inputmode="decimal" required
                        value="${vandaagG ? getal(vandaagG.kg, 2) : ""}" placeholder="${laatste ? getal(laatste.kg, 2) : "kg"}">
                    <button class="knop-hoofd" type="submit">${vandaagG ? "Wijzig" : "Opslaan"}</button>
                </div>
                <label class="veld" style="margin:10px 0 0"><span>Datum</span><input type="date" name="datum" value="${vandaag()}" max="${vandaag()}"></label>
            </form>

            <div class="tegels">
                <div class="tegel"><div class="l">Laatste</div><div class="w">${laatste ? getal(laatste.kg, 2) : "–"}</div><div class="x">${laatste ? relDatum(laatste.datum) : ""}</div></div>
                <div class="tegel"><div class="l">7d gem.</div><div class="w">${nu ? nu.gem.toFixed(1) : "–"}</div><div class="x">kg</div></div>
                <div class="tegel"><div class="l">Trend</div><div class="w ${trendKlasse}">${trendTxt}</div><div class="x">${trendSub}</div></div>
            </div>
            ${DOEL_PER_WEEK ? `<p class="sub" style="margin:-4px 0 12px">Doel: ${DOEL_PER_WEEK > 0 ? "+" : ""}${DOEL_PER_WEEK} kg/week (aan te passen in config.js).</p>` : ""}

            ${state.gewicht.length > 1 ? `
            <div class="kaart">
                <div class="chips">
                    ${[[30, "30 dgn"], [90, "90 dgn"], [365, "jaar"], [0, "alles"]].map(([n, l]) =>
                        `<button class="chip ${state.weegBereik === n ? "aan" : ""}" data-actie="weeg-bereik" data-n="${n}">${l}</button>`).join("")}
                </div>
                <div class="grafiek"><canvas id="grafiek-gewicht"></canvas></div>
            </div>` : ""}

            ${state.gewicht.length ? `
            <h2>Metingen</h2>
            <div class="kaart metingen">
                ${state.gewicht.slice(-14).reverse().map((g) => `<div class="meting">
                    <span>${mooiDatum(g.datum)}</span>
                    <span>${getal(g.kg, 2)} kg <button class="knop-link" data-actie="weg-gewicht" data-datum="${g.datum}">×</button></span>
                </div>`).join("")}
            </div>` : `<div class="leeg">Nog geen metingen. Weeg je elke ochtend op hetzelfde moment voor de beste trend.</div>`}`;
    }

    function stijlGrafiek() {
        if (!window.Chart) return false;
        Chart.defaults.color = "#9aa1ae";
        Chart.defaults.borderColor = "#2a2f3a";
        Chart.defaults.font.family = "Inter, system-ui, sans-serif";
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
                    { label: "Meting", data: data.map((g) => g.kg), showLine: false, pointRadius: 3, pointBackgroundColor: "#6b7280", borderColor: "#6b7280" },
                    { label: "7d gemiddelde", data: data.map((g) => +g.gem.toFixed(2)), borderColor: "#c6f432", backgroundColor: "#c6f432", pointRadius: 0, borderWidth: 2.5, tension: 0.3 },
                ],
            },
            options: {
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: { legend: { labels: { boxWidth: 10, boxHeight: 10 } } },
                scales: { x: { ticks: { maxTicksLimit: 6, maxRotation: 0 } }, y: { ticks: { maxTicksLimit: 6 } } },
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
                e1rm: Math.max(...s.map((x) => e1rm(Number(x.gewicht), x.reps))),
                top: Math.max(...s.map((x) => Number(x.gewicht))),
                volume: s.reduce((a, x) => a + Number(x.gewicht) * x.reps, 0),
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

    function viewStats() {
        const gedaan = state.oefeningen.filter((o) => state.sets.some((s) => s.oefening_id === o.id));
        if (!gedaan.length) return `<h2>Stats</h2><div class="leeg">Log eerst een paar trainingen, dan verschijnen hier je grafieken.</div>`;

        if (!state.statsOef || !gedaan.some((o) => o.id === state.statsOef)) {
            // Standaard: de oefening met de meeste sets.
            const telling = gedaan.map((o) => [o.id, state.sets.filter((s) => s.oefening_id === o.id).length]);
            telling.sort((a, b) => b[1] - a[1]);
            state.statsOef = telling[0][0];
        }
        const o = oef(state.statsOef);
        const rijen = statsPerTraining(o.id);
        const alleSets = rijen.flatMap((r) => r.sets);
        const zwaarste = alleSets.reduce((b, s) => (Number(s.gewicht) > Number(b.gewicht) || (Number(s.gewicht) === Number(b.gewicht) && s.reps > b.reps) ? s : b), alleSets[0]);
        const besteE = alleSets.reduce((b, s) => (e1rm(Number(s.gewicht), s.reps) > e1rm(Number(b.gewicht), b.reps) ? s : b), alleSets[0]);
        const eerste = rijen[0], laatste = rijen[rijen.length - 1];
        const groei = rijen.length > 1 ? (laatste.e1rm - eerste.e1rm) / eerste.e1rm * 100 : null;

        // Sets per spiergroep, laatste 4 weken.
        const weken = [];
        for (let i = 3; i >= 0; i--) {
            const d = parseDatum(maandagVan(vandaag()));
            d.setDate(d.getDate() - i * 7);
            weken.push(datumStr(d));
        }
        const perGroep = {};
        for (const s of state.sets) {
            const t = training(s.training_id);
            const og = oef(s.oefening_id);
            if (!t || !og) continue;
            const w = maandagVan(t.datum);
            const i = weken.indexOf(w);
            if (i < 0) continue;
            (perGroep[og.spiergroep] ||= [0, 0, 0, 0])[i]++;
        }
        const groepen = SPIERGROEPEN.filter((g) => perGroep[g]);
        const trainingenPerWeek = weken.map((w) => state.trainingen.filter((t) => maandagVan(t.datum) === w && setsVan(t.id).length).length);

        return `
            <h2>Stats</h2>
            <select id="stats-oef" style="margin-bottom:12px">
                ${gedaan.map((x) => `<option value="${x.id}" ${x.id === o.id ? "selected" : ""}>${esc(x.naam)}</option>`).join("")}
            </select>
            <div class="tegels pr-tegels">
                <div class="tegel"><div class="l">Zwaarste set</div><div class="w">${getal(zwaarste.gewicht, 2)}×${zwaarste.reps}</div><div class="x">kg × reps</div></div>
                <div class="tegel"><div class="l">Beste e1RM</div><div class="w">${Math.round(e1rm(Number(besteE.gewicht), besteE.reps))}</div><div class="x">uit ${getal(besteE.gewicht, 2)}×${besteE.reps}</div></div>
                <div class="tegel"><div class="l">Sessies</div><div class="w">${rijen.length}</div><div class="x">${alleSets.length} sets totaal</div></div>
                <div class="tegel"><div class="l">Groei e1RM</div><div class="w ${groei > 0 ? "goed" : ""}">${groei == null ? "–" : `${groei >= 0 ? "+" : ""}${groei.toFixed(0)}%`}</div><div class="x">sinds ${mooiDatum(eerste.datum, false)}</div></div>
            </div>
            <div class="kaart"><div class="grafiek"><canvas id="grafiek-oef"></canvas></div></div>
            <p class="sub" style="margin:-4px 0 4px">e1RM = geschatte 1-rep max (Epley). Gaat die lijn omhoog, dan werkt je progressive overload, ook als het gewicht gelijk blijft maar de reps stijgen.</p>

            <h2>Laatste 4 weken</h2>
            <div class="kaart">
                <table class="tabel">
                    <thead><tr><th>Sets per spiergroep</th>${weken.map((w, i) => `<th>${i === 3 ? "deze" : mooiDatum(w, false)}</th>`).join("")}</tr></thead>
                    <tbody>
                        ${groepen.map((g) => `<tr><td>${esc(g)}</td>${perGroep[g].map((n) => `<td>${n || "·"}</td>`).join("")}</tr>`).join("")}
                        <tr><td class="dim">trainingen</td>${trainingenPerWeek.map((n) => `<td class="dim">${n}</td>`).join("")}</tr>
                    </tbody>
                </table>
            </div>`;
    }

    function tekenStats() {
        const el = document.getElementById("grafiek-oef");
        if (!el || !stijlGrafiek()) return;
        const rijen = statsPerTraining(state.statsOef);
        grafieken.push(new Chart(el, {
            type: "line",
            data: {
                labels: rijen.map((r) => mooiDatum(r.datum, false)),
                datasets: [
                    { label: "e1RM", data: rijen.map((r) => +r.e1rm.toFixed(1)), borderColor: "#c6f432", backgroundColor: "#c6f432", borderWidth: 2.5, pointRadius: 3, tension: 0.25 },
                    { label: "Zwaarste gewicht", data: rijen.map((r) => r.top), borderColor: "#6cb6ff", backgroundColor: "#6cb6ff", borderWidth: 2, pointRadius: 2, borderDash: [4, 4], tension: 0.25 },
                ],
            },
            options: {
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: { legend: { labels: { boxWidth: 10, boxHeight: 10 } } },
                scales: { x: { ticks: { maxTicksLimit: 6, maxRotation: 0 } }, y: { title: { display: true, text: "kg" }, ticks: { maxTicksLimit: 6 } } },
            },
        }));
    }

    // ---------- Historie ----------

    function viewHistorie() {
        const lijst = state.trainingen.filter((t) => setsVan(t.id).length || t.id === state.actief);
        if (!lijst.length) return `<h2>Historie</h2><div class="leeg">Nog geen trainingen gelogd.</div>`;
        return `<h2>Historie</h2>` + lijst.map((t) => {
            const sets = setsVan(t.id);
            const perOef = oefeningenIn(t.id).map((id) => {
                const s = sets.filter((x) => x.oefening_id === id);
                if (!s.length) return "";
                return `<span>${esc(oef(id).naam)} <span class="mono">${s.map((x) => `${getal(x.gewicht, 2)}×${x.reps}`).join(" ")}</span></span>`;
            }).join("");
            const open = state.openHist === t.id;
            return `<div class="kaart hist" data-actie="hist" data-id="${t.id}">
                <div class="hist-kop"><b>${esc(t.label || "Training")}</b><span class="sub">${mooiDatum(t.datum)} · ${sets.length} sets</span></div>
                ${open ? `<div class="hist-regels">${perOef || `<span class="dim">Leeg</span>`}</div>
                    <div class="hist-acties">
                        <button class="knop-klein" data-actie="open-training" data-id="${t.id}">Bewerken</button>
                        <button class="knop-klein knop-gevaar" data-actie="weg-training" data-id="${t.id}">Verwijderen</button>
                    </div>` : ""}
            </div>`;
        }).join("");
    }

    // ---------- Oefeningen ----------

    function viewOefeningen() {
        const actief = state.oefeningen.filter((o) => !o.gearchiveerd);
        const archief = state.oefeningen.filter((o) => o.gearchiveerd);
        const regel = (o) => {
            if (state.bewerkOef === o.id) {
                return `<form class="oef-beheer" data-form="bewerk-oef" data-id="${o.id}">
                    <b>${esc(o.naam)}</b><span></span>
                    <div class="oef-bewerk">
                        <label class="veld"><span>Min reps</span><input name="rep_min" type="number" inputmode="numeric" value="${o.rep_min}"></label>
                        <label class="veld"><span>Max reps</span><input name="rep_max" type="number" inputmode="numeric" value="${o.rep_max}"></label>
                        <label class="veld"><span>Stap (kg)</span><input name="stap_kg" type="number" step="any" inputmode="decimal" value="${o.stap_kg}"></label>
                        <label class="veld"><span>Spiergroep</span><select name="spiergroep">${SPIERGROEPEN.map((g) => `<option ${g === o.spiergroep ? "selected" : ""}>${g}</option>`).join("")}</select></label>
                        <div class="rij vol">
                            <button type="button" data-actie="archiveer" data-id="${o.id}">${o.gearchiveerd ? "Terugzetten" : "Archiveren"}</button>
                            <button class="knop-hoofd" type="submit">Opslaan</button>
                        </div>
                    </div>
                </form>`;
            }
            return `<div class="oef-beheer">
                <b>${esc(o.naam)}</b>
                <button class="knop-klein" data-actie="bewerk-oef" data-id="${o.id}">Wijzig</button>
                <span class="meta">${esc(o.spiergroep)} · ${o.rep_min}–${o.rep_max} reps · +${getal(o.stap_kg, 2)} kg</span>
            </div>`;
        };
        return `
            <h2>Oefeningen</h2>
            <p class="sub" style="margin-bottom:12px">De rep-range bepaalt het doel: haal je bij alle sets de bovenkant, dan stelt de app voor om het gewicht met de stap te verhogen.</p>
            <div class="kaart">${actief.map(regel).join("")}</div>
            <div class="kaart">${state.toonNieuweOef ? formNieuweOef(null) : `<button class="knop-breed" data-actie="toon-nieuwe-oef">+ Nieuwe oefening</button>`}</div>
            ${archief.length ? `<h2>Gearchiveerd</h2><div class="kaart">${archief.map(regel).join("")}</div>` : ""}`;
    }

    // ---------- Rusttimer ----------

    let rustInterval = null;
    function tikRust() {
        const start = Number(localStorage.getItem(LS_RUST) || 0);
        const t = state.actief && training(state.actief);
        const sec = Math.floor((Date.now() - start) / 1000);
        if (!start || !t || state.tab !== "training" || sec > 15 * 60) {
            rustEl.hidden = true;
            return;
        }
        rustEl.hidden = false;
        rustEl.innerHTML = `<span class="l">rust</span>${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
        if (!rustInterval) rustInterval = setInterval(tikRust, 1000);
    }
    rustEl.addEventListener("click", () => { localStorage.removeItem(LS_RUST); tikRust(); });

    // ---------- Events ----------

    app.addEventListener("click", (e) => {
        const el = e.target.closest("[data-actie]");
        if (el) actie(el.dataset.actie, el, e);
    });
    tabsEl.addEventListener("click", (e) => {
        const el = e.target.closest("[data-actie]");
        if (el) actie(el.dataset.actie, el, e);
    });

    function actie(naam, el, e) {
        const id = el.dataset.id;
        switch (naam) {
            case "tab":
                state.tab = el.dataset.tab; state.fout = ""; state.toonNieuweOef = false; state.bewerkOef = null;
                render(); window.scrollTo(0, 0); break;
            case "label":
                state.nieuwLabel = state.nieuwLabel === el.dataset.label ? "" : el.dataset.label; render(); break;
            case "start": startTraining(); break;
            case "open-training":
                e.stopPropagation(); zetActief(id); state.tab = "training"; render(); window.scrollTo(0, 0); break;
            case "sluit-training":
                zetActief(null); localStorage.removeItem(LS_RUST); render(); break;
            case "voeg-oef": {
                const v = document.getElementById("kies-oef").value;
                if (v) { zetKaarten(state.actief, [...kaarten(state.actief), v]); render(); }
                break;
            }
            case "weg-kaart":
                zetKaarten(state.actief, kaarten(state.actief).filter((x) => x !== id)); render(); break;
            case "toon-nieuwe-oef": state.toonNieuweOef = true; render(); break;
            case "annuleer-nieuwe-oef": state.toonNieuweOef = false; state.fout = ""; render(); break;
            case "stap": {
                const input = el.closest(".stepper").querySelector("input");
                const nieuw = Math.max(0, (num(input.value) || 0) + Number(el.dataset.d));
                input.value = getal(nieuw, 2);
                break;
            }
            case "weg-set": verwijderSet(id); break;
            case "weg-gewicht": verwijderGewicht(el.dataset.datum); break;
            case "weeg-bereik": state.weegBereik = Number(el.dataset.n); render(); break;
            case "hist":
                if (e.target.closest("button")) return;
                state.openHist = state.openHist === id ? null : id; render(); break;
            case "weg-training": e.stopPropagation(); verwijderTraining(id); break;
            case "bewerk-oef": state.bewerkOef = id; render(); break;
            case "archiveer": wijzigOefening(id, { gearchiveerd: !oef(id).gearchiveerd }); break;
        }
    }

    app.addEventListener("input", (e) => {
        if (e.target.id === "nieuw-label") state.nieuwLabel = e.target.value;
    });

    app.addEventListener("change", (e) => {
        if (e.target.id === "nieuwe-datum") state.nieuweDatum = e.target.value || vandaag();
        if (e.target.id === "nieuw-label") render();
        if (e.target.id === "kopieer-van") { state.kopieerVan = e.target.value; render(); }
        if (e.target.id === "stats-oef") { state.statsOef = e.target.value; render(); }
        if (e.target.id === "kies-oef" && e.target.value) {
            zetKaarten(state.actief, [...kaarten(state.actief), e.target.value]);
            render();
        }
    });

    app.addEventListener("submit", (e) => {
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
            case "weeg-snel": {
                const kg = num(d.get("kg"));
                if (kg) slaGewichtOp(vandaag(), kg);
                break;
            }
            case "weeg": {
                const kg = num(d.get("kg"));
                if (kg) slaGewichtOp(d.get("datum") || vandaag(), kg);
                break;
            }
            case "nieuwe-oef": {
                const rep_min = parseInt(d.get("rep_min"), 10) || 8;
                const rep_max = Math.max(rep_min, parseInt(d.get("rep_max"), 10) || 12);
                nieuweOefening({
                    naam: String(d.get("naam")).trim(),
                    spiergroep: d.get("spiergroep"),
                    rep_min, rep_max,
                    stap_kg: num(d.get("stap_kg")) || 2.5,
                }, f.dataset.tid || null);
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

    window.addEventListener("online", () => flush().then(() => laadAlles()).then(render).catch(() => {}));
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && outbox().length) flush();
    });

    // ---------- Start ----------

    function slot() {
        tabsEl.hidden = true;
        app.innerHTML = `<form class="slot" id="slot">
            <p>Even je code.</p>
            <input type="password" name="code" autofocus>
            <button class="knop-hoofd knop-breed" type="submit">Open</button>
        </form>`;
        document.getElementById("slot").addEventListener("submit", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (new FormData(e.target).get("code") === window.GYM_WACHTWOORD) {
                localStorage.setItem(LS_OK, "1");
                start();
            } else {
                e.target.querySelector("p").textContent = "Klopt niet, probeer opnieuw.";
            }
        }, { once: false });
    }

    async function start() {
        if (window.GYM_WACHTWOORD && localStorage.getItem(LS_OK) !== "1") return slot();
        app.innerHTML = `<div class="laden">Even laden…</div>`;
        await flush();
        try {
            await laadAlles();
        } catch (e) {
            console.error(e);
            app.innerHTML = `<div class="melding fout">Kon de gegevens niet laden. ${e.status === 404 || /relation|does not exist/.test(e.message)
                ? "Heb je SETUP.sql al in Supabase gedraaid?" : "Check je verbinding en herlaad."}</div>`;
            return;
        }
        render();
    }

    start();
})();
