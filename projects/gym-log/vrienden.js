// Gym Log — vrienden.
// Vrienden zien alleen wat jij deelt: wanneer je trainde (naam, aantal sets, duur) en je records.
// Sets, lichaamsgewicht en foto's blijven privé. Er wordt pas iets gedeeld als je een naam kiest.
// De database dwingt dit af (zie MIGRATIE-vrienden.sql).

(function () {
    "use strict";

    const G = () => window.GymLog;
    const EMOJI = ["💪", "🔥", "👏"];
    const UPSERT = { Prefer: "resolution=merge-duplicates,return=minimal" };

    const V = {
        geladen: false, laden: null, geladenOp: 0, fout: null,
        profiel: null, code: null, vrienden: [], feed: [], reacties: [],
        open: null,            // feed-id waar het berichtvak openstaat
        wijzigNaam: false,
        wachtCode: null,       // vriendcode uit een link, als je nog geen naam had
    };

    function gezienSleutel() { return `gym_vr_gezien_${G().uid()}`; }
    function foutTekst(e) {
        try { const j = JSON.parse(e.message); return j.message || e.message; } catch { return e.message || "Er ging iets mis."; }
    }

    // ---------- Laden ----------

    async function laad() {
        if (V.laden) return V.laden;
        V.laden = (async () => {
            const { sb, uid, datumStr } = G();
            const ik = uid();
            try {
                const [p] = await sb(`gym_profielen?select=user_id,naam,doel_per_week&user_id=eq.${ik}`);
                V.profiel = p || null;
                V.fout = null;
                if (!V.profiel) { V.vrienden = []; V.feed = []; V.reacties = []; return; }
                if (!V.code) V.code = await sb("rpc/gym_mijn_code", { method: "POST", body: {} });
                const ids = (await sb("gym_vrienden?select=vriend_id")).map((v) => v.vriend_id);
                V.vrienden = ids.length ? await sb(`gym_profielen?select=user_id,naam,doel_per_week&user_id=in.(${ids.join(",")})`) : [];
                const sinds = new Date(); sinds.setDate(sinds.getDate() - 28);
                V.feed = await sb(`gym_feed?select=*&user_id=in.(${[ik, ...ids].join(",")})&datum=gte.${datumStr(sinds)}&order=datum.desc,bijgewerkt.desc&limit=200`);
                const fids = V.feed.map((f) => f.id);
                V.reacties = fids.length ? await sb(`gym_reacties?select=*&feed_id=in.(${fids.join(",")})&order=created_at.asc`) : [];
            } catch (e) {
                console.warn("Vrienden laden", e);
                V.fout = e.status === 404 || /gym_profielen|gym_feed|gym_vrienden|does not exist|PGRST20[25]|42P01|42883/.test(e.message) ? "migratie" : "netwerk";
            } finally {
                V.geladen = true;
                V.geladenOp = Date.now();
            }
        })();
        try { await V.laden; } finally { V.laden = null; }
    }

    function reset() {
        Object.assign(V, { geladen: false, laden: null, geladenOp: 0, fout: null, profiel: null, code: null, vrienden: [], feed: [], reacties: [], open: null, wijzigNaam: false });
        Object.values(timers).forEach(clearTimeout);
    }

    // ---------- Delen van trainingen en records ----------

    const timers = {};
    function naTraining(tid, meteen = false) {
        if (!V.profiel) return;
        clearTimeout(timers[tid]);
        timers[tid] = setTimeout(() => publiceer(tid).catch((e) => console.warn("Delen mislukt", e)), meteen ? 0 : 2500);
    }

    async function publiceer(tid) {
        const { training, setsVan, isPr, oef, duurMinuten, eenheidVan, schrijf, score } = G();
        const t = training(tid);
        const sets = t ? setsVan(tid) : [];
        const nu = new Date().toISOString();
        if (!t || !sets.length) {
            await schrijf(`gym_feed?id=eq.${tid}`, { method: "DELETE" });
            await schrijf(`gym_feed?soort=eq.record&data->>training=eq.${tid}`, { method: "DELETE" });
            V.feed = V.feed.filter((f) => f.id !== tid && !(f.data && f.data.training === tid));
            return;
        }
        const items = [{
            id: tid, soort: "training", datum: t.datum, bijgewerkt: nu,
            data: { label: t.label || "Training", sets: sets.length, oefeningen: new Set(sets.map((s) => s.oefening_id)).size, duur: duurMinuten(sets) },
        }];
        // Records: per oefening de beste PR-set van deze training.
        const best = {};
        for (const s of sets.filter(isPr)) if (!best[s.oefening_id] || score(s) > score(best[s.oefening_id])) best[s.oefening_id] = s;
        for (const s of Object.values(best)) {
            const o = oef(s.oefening_id);
            items.push({ id: s.id, soort: "record", datum: t.datum, bijgewerkt: nu,
                data: { oefening: o.naam, gewicht: Number(s.gewicht), reps: s.reps, eenheid: eenheidVan(o), training: tid } });
        }
        await schrijf("gym_feed", { method: "POST", body: items, headers: UPSERT });
        const houd = items.filter((x) => x.soort === "record").map((x) => x.id);
        await schrijf(`gym_feed?soort=eq.record&data->>training=eq.${tid}${houd.length ? `&id=not.in.(${houd.join(",")})` : ""}`, { method: "DELETE" });
        // Lokaal bijwerken, zodat je eigen feed meteen klopt.
        const ik = G().uid();
        V.feed = V.feed.filter((f) => !(f.id === tid || (f.data && f.data.training === tid)));
        V.feed.unshift(...items.map((x) => ({ ...x, user_id: ik })));
        V.feed.sort((a, b) => b.datum.localeCompare(a.datum) || String(b.bijgewerkt).localeCompare(String(a.bijgewerkt)));
    }

    // Bij het aanmaken van je profiel: de laatste twee weken alvast delen.
    async function deelRecent() {
        const { gedaneTrainingen, dagenTussen, vandaag } = G();
        for (const t of gedaneTrainingen().filter((x) => dagenTussen(x.datum, vandaag()) <= 14)) {
            try { await publiceer(t.id); } catch (e) { console.warn(e); }
        }
    }

    function doelGewijzigd(n) {
        if (!V.profiel) return;
        V.profiel.doel_per_week = n || null;
        G().schrijf(`gym_profielen?user_id=eq.${G().uid()}`, { method: "PATCH", body: { doel_per_week: n || null } }).catch(() => {});
    }

    // ---------- Acties ----------

    async function maakProfiel(naam) {
        const { sb, trainingDoel, toast, render } = G();
        try {
            await sb("gym_profielen", { method: "POST", body: { naam, doel_per_week: trainingDoel() || null }, headers: { Prefer: "return=minimal" } });
            V.geladen = false;
            await laad();
            render();
            toast(`Welkom, ${G().esc(naam)}. Deel je code met een vriend.`);
            deelRecent().then(() => { if (G().tab() === "vrienden") render(); });
            if (V.wachtCode) { const c = V.wachtCode; V.wachtCode = null; await voegToe(c); }
        } catch (e) {
            toast(G().esc(foutTekst(e)), null, "fout");
        }
    }

    async function wijzigNaam(naam) {
        const { sb, toast, render, uid } = G();
        try {
            await sb(`gym_profielen?user_id=eq.${uid()}`, { method: "PATCH", body: { naam } });
            V.profiel.naam = naam; V.wijzigNaam = false; render();
        } catch (e) { toast(G().esc(foutTekst(e)), null, "fout"); }
    }

    async function voegToe(code) {
        const { sb, toast, render } = G();
        code = String(code || "").replace(/\s+/g, "").toUpperCase();
        if (!code) return;
        if (!V.profiel) { V.wachtCode = code; G().naarTab("vrienden"); toast("Kies eerst een naam, dan voegen we je vriend meteen toe."); return; }
        try {
            const [r] = await sb("rpc/gym_word_vriend", { method: "POST", body: { code } });
            V.geladen = false;
            await laad();
            render();
            toast(`Je bent nu vrienden met ${G().esc(r ? r.naam_vriend : "je vriend")}`);
        } catch (e) {
            const t = foutTekst(e);
            toast(G().esc(/Onbekende/.test(t) ? "Die code kennen we niet. Check of je hem goed hebt overgenomen." : t), null, "fout");
        }
    }

    async function verwijderVriend(id) {
        const v = V.vrienden.find((x) => x.user_id === id);
        if (!v || !confirm(`${v.naam} verwijderen als vriend? Jullie zien elkaars trainingen dan niet meer.`)) return;
        try {
            await G().sb("rpc/gym_verwijder_vriend", { method: "POST", body: { ander: id } });
            V.vrienden = V.vrienden.filter((x) => x.user_id !== id);
            V.feed = V.feed.filter((f) => f.user_id !== id);
            G().render();
            G().toast(`${G().esc(v.naam)} is geen vriend meer`);
        } catch (e) { G().toast(G().esc(foutTekst(e)), null, "fout"); }
    }

    async function nieuweCode() {
        if (!confirm("Nieuwe code maken? Je oude code en link werken dan niet meer. Bestaande vrienden blijven.")) return;
        try {
            V.code = await G().sb("rpc/gym_nieuwe_code", { method: "POST", body: {} });
            G().render();
            G().toast("Nieuwe code gemaakt");
        } catch (e) { G().toast(G().esc(foutTekst(e)), null, "fout"); }
    }

    function deelLink() {
        const url = `${location.origin}${location.pathname}?vriend=${V.code}`;
        const tekst = `Voeg me toe in de Gym Log! Mijn code is ${V.code}.`;
        if (navigator.share) { navigator.share({ title: "Gym Log", text: tekst, url }).catch(() => {}); return; }
        (navigator.clipboard ? navigator.clipboard.writeText(`${tekst} ${url}`) : Promise.reject())
            .then(() => G().toast("Link gekopieerd"))
            .catch(() => G().toast(`Je code: ${V.code}`));
    }

    function reageer(feedId, emoji) {
        const ik = G().uid();
        const mijn = V.reacties.find((r) => r.feed_id === feedId && r.user_id === ik && r.soort === "emoji" && r.tekst === emoji);
        if (mijn) {
            V.reacties = V.reacties.filter((r) => r !== mijn);
            G().schrijf(`gym_reacties?id=eq.${mijn.id}`, { method: "DELETE" }).catch(() => {});
        } else {
            const r = { id: G().uuid(), feed_id: feedId, soort: "emoji", tekst: emoji, created_at: new Date().toISOString() };
            V.reacties.push({ ...r, user_id: ik });
            if (navigator.vibrate) navigator.vibrate(10);
            G().schrijf("gym_reacties", { method: "POST", body: r, headers: { Prefer: "return=minimal" } })
                .catch(() => { V.reacties = V.reacties.filter((x) => x.id !== r.id); G().render(); G().toast("Reageren lukte niet.", null, "fout"); });
        }
        G().render();
    }

    function stuurBericht(feedId, tekst) {
        tekst = tekst.trim().slice(0, 280);
        if (!tekst) return;
        const r = { id: G().uuid(), feed_id: feedId, soort: "bericht", tekst, created_at: new Date().toISOString() };
        V.reacties.push({ ...r, user_id: G().uid() });
        V.open = null;
        G().schrijf("gym_reacties", { method: "POST", body: r, headers: { Prefer: "return=minimal" } })
            .catch(() => { V.reacties = V.reacties.filter((x) => x.id !== r.id); G().render(); G().toast("Versturen lukte niet.", null, "fout"); });
        G().render();
    }

    function wisBericht(id) {
        V.reacties = V.reacties.filter((r) => r.id !== id);
        G().schrijf(`gym_reacties?id=eq.${id}`, { method: "DELETE" }).catch(() => {});
        G().render();
    }

    // ---------- Nieuwe reacties op jouw trainingen ----------

    function nieuw() {
        if (!V.profiel) return 0;
        const ik = G().uid();
        let gezien = "";
        try { gezien = localStorage.getItem(gezienSleutel()) || ""; } catch { /* privé-modus */ }
        const mijnItems = new Set(V.feed.filter((f) => f.user_id === ik).map((f) => f.id));
        return V.reacties.filter((r) => r.user_id !== ik && mijnItems.has(r.feed_id) && r.created_at > gezien).length;
    }
    function markeerGezien() {
        try { localStorage.setItem(gezienSleutel(), new Date().toISOString()); } catch { /* geen probleem */ }
    }

    // ---------- Weergave ----------

    const KLEUREN = ["#d23a2c", "#2f66c9", "#e3a817", "#2b8f58", "#9a8fd0", "#e9e6de"];
    function avatar(id, naam) {
        let h = 0;
        for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
        const k = KLEUREN[h % KLEUREN.length];
        return `<span class="avatar" style="--kleur:${k}" aria-hidden="true">${G().esc((naam || "?").trim()[0].toUpperCase())}</span>`;
    }
    function naamVan(id) {
        if (id === G().uid()) return "Jij";
        const v = V.vrienden.find((x) => x.user_id === id);
        return v ? v.naam : "Iemand";
    }

    function view() {
        const { esc } = G();
        if (!V.geladen || Date.now() - V.geladenOp > 60000) {
            const eerst = !V.geladen;
            laad().then(() => { if (G().tab() === "vrienden") G().render(); });
            if (eerst) return `<p class="laden" role="status">Vrienden laden…</p>`;
        }
        if (V.fout === "migratie") return `<div class="melding fout">Vrienden werkt pas als de database is bijgewerkt (MIGRATIE-vrienden.sql in Supabase).</div>`;
        if (V.fout === "netwerk") return `<div class="melding fout">Vrienden laden lukte niet. Check je verbinding.</div><button class="knop breed" data-vr="opnieuw">Opnieuw proberen</button>`;
        if (!V.profiel) return viewIntro();
        markeerGezien();
        return viewWeek() + viewFeed() + viewToevoegen() + viewLijst();
    }

    function viewIntro() {
        return `<section class="vr-intro">
            <p class="vr-intro-titel">Samen trainen</p>
            <p class="uitleg">Voeg vrienden toe met een code. Ze zien wanneer je traint en je records, en kunnen je aanmoedigen. Je sets, je gewicht en je foto's blijven privé.</p>
            ${V.wachtCode ? `<div class="melding ok">Kies een naam, dan voegen we je vriend meteen toe.</div>` : ""}
            <form class="paneel" data-form="vr-profiel">
                <label class="veld"><span>Je naam voor vrienden</span><input name="naam" maxlength="40" required autocomplete="nickname" placeholder="Bijvoorbeeld je voornaam"></label>
                <button class="knop knop-hoofd breed" type="submit">Aan de slag</button>
            </form>
        </section>`;
    }

    function weekTelling(userId) {
        const { maandagVan, vandaag, trainDagen } = G();
        const ma = maandagVan(vandaag());
        if (userId === G().uid()) return [...trainDagen()].filter((d) => d >= ma).length;
        return new Set(V.feed.filter((f) => f.user_id === userId && f.soort === "training" && f.datum >= ma).map((f) => f.datum)).size;
    }

    function viewWeek() {
        const { esc } = G();
        const ik = G().uid();
        const mensen = [{ user_id: ik, naam: V.profiel.naam, doel: G().trainingDoel() }, ...V.vrienden.map((v) => ({ ...v, doel: v.doel_per_week }))]
            .map((m) => ({ ...m, n: weekTelling(m.user_id) }))
            .sort((a, b) => b.n - a.n || (a.user_id === ik ? -1 : 1));
        if (mensen.length < 2) return "";
        return `<section class="blok">
            <h2 class="kopje">Deze week</h2>
            <ul class="vr-week">${mensen.map((m) => {
                const vakjes = Math.max(m.doel || 0, m.n, 3);
                return `<li>${avatar(m.user_id, m.naam)}
                    <span class="vw-naam">${m.user_id === ik ? "Jij" : esc(m.naam)}</span>
                    <span class="vw-blokjes" aria-hidden="true">${Array.from({ length: vakjes }, (_, i) => `<i class="${i < m.n ? "ja" : ""} ${m.doel && i >= m.doel ? "extra" : ""}"></i>`).join("")}</span>
                    <span class="vw-getal ${m.doel && m.n >= m.doel ? "gehaald" : ""}">${m.n}${m.doel ? `<small>/${m.doel}</small>` : ""}</span>
                </li>`;
            }).join("")}</ul>
        </section>`;
    }

    function dagKop(d) {
        const { vandaag, dagenTussen, mooiDatum } = G();
        const n = dagenTussen(d, vandaag());
        return n === 0 ? "Vandaag" : n === 1 ? "Gisteren" : mooiDatum(d);
    }

    function viewFeed() {
        const trainingen = V.feed.filter((f) => f.soort === "training");
        const losseRecords = V.feed.filter((f) => f.soort === "record" && !trainingen.some((t) => t.id === f.data.training));
        const items = [...trainingen, ...losseRecords].sort((a, b) => b.datum.localeCompare(a.datum) || String(b.bijgewerkt).localeCompare(String(a.bijgewerkt)));
        if (!items.length) {
            return `<section class="blok"><h2 class="kopje">Trainingen</h2>
                <p class="leeg">${V.vrienden.length ? "Nog geen trainingen deze weken. De eerste die gaat, staat hier." : "Nog niks te zien. Voeg een vriend toe met je code hieronder."}</p></section>`;
        }
        let html = "", vorigeDag = null;
        for (const f of items) {
            if (f.datum !== vorigeDag) { html += `<h3 class="vr-dag">${dagKop(f.datum)}</h3>`; vorigeDag = f.datum; }
            html += itemHtml(f);
        }
        return `<section class="blok vr-feed"><h2 class="kopje">Trainingen<span>van jou en je vrienden, laatste 4 weken</span></h2>${html}</section>`;
    }

    function recordTekst(r) {
        const { getal } = G();
        const d = r.data;
        const e = d.eenheid === "lb" ? "lb" : "kg";
        const w = e === "lb" ? d.gewicht / 0.45359237 : d.gewicht;
        return d.gewicht > 0 ? `${getal(w, e === "lb" ? 1 : 2)} ${e} × ${d.reps}` : `${d.reps} reps`;
    }

    function itemHtml(f) {
        const { esc, ico } = G();
        const ik = G().uid();
        const wie = naamVan(f.user_id);
        const records = f.soort === "training" ? V.feed.filter((r) => r.soort === "record" && r.data.training === f.id) : [f];
        const d = f.data || {};
        const reacties = V.reacties.filter((r) => r.feed_id === f.id);
        const emoji = EMOJI.map((em) => {
            const van = reacties.filter((r) => r.soort === "emoji" && r.tekst === em);
            const mijn = van.some((r) => r.user_id === ik);
            return `<button class="vr-emoji" aria-pressed="${mijn}" data-vr="emoji" data-id="${f.id}" data-e="${em}" title="${esc(van.map((r) => naamVan(r.user_id)).join(", "))}">
                <span aria-hidden="true">${em}</span>${van.length ? `<b>${van.length}</b>` : ""}<span class="sr">${mijn ? "Haal je reactie weg" : "Reageer met"} ${em}</span></button>`;
        }).join("");
        const berichten = reacties.filter((r) => r.soort === "bericht");
        return `<article class="vr-item ${f.user_id === ik ? "eigen" : ""}">
            <header>${avatar(f.user_id, wie === "Jij" ? V.profiel.naam : wie)}
                <p>${f.soort === "training"
                    ? `<b>${esc(wie)}</b> trainde <b class="vr-label">${esc(d.label || "Training")}</b>`
                    : `<b>${esc(wie)}</b> zette een record`}
                ${f.soort === "training" ? `<span class="vr-meta">${d.sets} ${d.sets === 1 ? "set" : "sets"}${d.oefeningen ? `, ${d.oefeningen} ${d.oefeningen === 1 ? "oefening" : "oefeningen"}` : ""}${d.duur ? `, ${d.duur} min` : ""}</span>` : ""}</p>
            </header>
            ${records.length ? `<ul class="vr-records">${records.map((r) => `<li><span class="stempel">PR</span><span>${esc(r.data.oefening)}</span><b>${recordTekst(r)}</b></li>`).join("")}</ul>` : ""}
            ${berichten.length ? `<ul class="vr-berichten">${berichten.map((b) => `<li><b>${esc(naamVan(b.user_id))}</b> ${esc(b.tekst)}${b.user_id === ik
                ? `<button class="knop-icoon" data-vr="wis-bericht" data-id="${b.id}" aria-label="Bericht verwijderen">${ico("x")}</button>` : ""}</li>`).join("")}</ul>` : ""}
            <div class="vr-acties">${emoji}
                <button class="vr-reageer" data-vr="open" data-id="${f.id}" aria-expanded="${V.open === f.id}">Reageer</button>
            </div>
            ${V.open === f.id ? `<form class="vr-bericht" data-form="vr-bericht" data-id="${f.id}">
                <input name="tekst" maxlength="280" required placeholder="${f.user_id === ik ? "Reageer op je vrienden" : `Zeg iets tegen ${esc(wie)}`}" autocomplete="off" enterkeyhint="send">
                <button class="knop knop-klein knop-hoofd" type="submit">Stuur</button>
            </form>` : ""}
        </article>`;
    }

    function viewToevoegen() {
        const code = String(V.code || "");
        return `<section class="blok">
            <h2 class="kopje">Vriend toevoegen</h2>
            <div class="vr-code">
                <div><span>Jouw code</span><b>${code.slice(0, 4)} ${code.slice(4)}</b></div>
                <button class="knop knop-hoofd" data-vr="deel">Deel link</button>
            </div>
            <form class="invoer-knop vr-code-invoer" data-form="vr-code">
                <input name="code" placeholder="Code van vriend" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" aria-label="Code van een vriend">
                <button class="knop" type="submit">Toevoegen</button>
            </form>
            <p class="voetnoot">Wie je code heeft, kan je toevoegen. <button class="knop-link" data-vr="nieuwe-code">Nieuwe code maken</button></p>
        </section>`;
    }

    function viewLijst() {
        const { esc } = G();
        return `<section class="blok">
            <h2 class="kopje">Vrienden<span>${V.vrienden.length ? `${V.vrienden.length} ${V.vrienden.length === 1 ? "vriend" : "vrienden"}` : "Nog niemand"}</span></h2>
            ${V.vrienden.length ? `<ul class="vr-lijst">${V.vrienden.map((v) => `<li>${avatar(v.user_id, v.naam)}<span>${esc(v.naam)}</span>
                <button class="knop-link" data-vr="verwijder" data-id="${v.user_id}">Verwijderen</button></li>`).join("")}</ul>` : ""}
            ${V.wijzigNaam ? `<form class="invoer-knop vr-naam" data-form="vr-naam">
                    <input name="naam" maxlength="40" required value="${esc(V.profiel.naam)}" aria-label="Je naam voor vrienden">
                    <button class="knop" type="submit">Opslaan</button></form>`
                : `<p class="voetnoot">Vrienden zien je als <b>${esc(V.profiel.naam)}</b>. <button class="knop-link" data-vr="naam">Wijzig</button></p>`}
        </section>`;
    }

    // ---------- Events ----------

    document.addEventListener("click", (e) => {
        const el = e.target.closest("[data-vr]");
        if (!el) return;
        switch (el.dataset.vr) {
            case "opnieuw": V.geladen = false; G().render(); break;
            case "emoji": reageer(el.dataset.id, el.dataset.e); break;
            case "open":
                V.open = V.open === el.dataset.id ? null : el.dataset.id; G().render();
                requestAnimationFrame(() => { const i = document.querySelector(".vr-bericht input"); if (i) i.focus(); });
                break;
            case "wis-bericht": wisBericht(el.dataset.id); break;
            case "deel": deelLink(); break;
            case "nieuwe-code": nieuweCode(); break;
            case "verwijder": verwijderVriend(el.dataset.id); break;
            case "naam": V.wijzigNaam = true; G().render(); break;
        }
    });

    document.addEventListener("submit", (e) => {
        const f = e.target;
        if (!f.dataset.form || !f.dataset.form.startsWith("vr-")) return;
        e.preventDefault();
        const d = new FormData(f);
        switch (f.dataset.form) {
            case "vr-profiel": { const n = String(d.get("naam")).trim(); if (n) maakProfiel(n); break; }
            case "vr-naam": { const n = String(d.get("naam")).trim(); if (n) wijzigNaam(n); break; }
            case "vr-code": voegToe(d.get("code")); break;
            case "vr-bericht": stuurBericht(f.dataset.id, String(d.get("tekst"))); break;
        }
    });

    window.GymVrienden = { view, laad, reset, naTraining, doelGewijzigd, voegToe, nieuw, geladen: () => V.geladen };
})();
