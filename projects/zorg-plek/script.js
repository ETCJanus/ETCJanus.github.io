// Zorg Plek — gedeelde familiepagina voor de zorg voor Wim en Willie.
// Data staat in Supabase (zie SETUP.sql); identiteit wordt lokaal onthouden.

(function () {
    "use strict";

    const SB_URL = window.ZORGPLEK_SUPABASE_URL;
    const SB_KEY = window.ZORGPLEK_SUPABASE_KEY;
    const OPSLAG_SLEUTEL = "zorgplek_persoon_id";

    const state = {
        personen: [],
        ik: null,                       // persoon-object van de huidige gebruiker
        tab: "rooster",
        maand: eersteVanMaand(new Date()), // maand die de kalender toont
        openDag: null,                  // "YYYY-MM-DD" waarvan het dagvenster open staat
        rooster: [],
        beschikbaarheid: [],
        boodschappen: [],
        taken: [],
        bewerkTaak: null,               // id van de taak die in bewerking is
    };

    const app = document.getElementById("app");
    const tabsEl = document.getElementById("tabs");
    const wieEl = document.getElementById("wie-balk");

    // ---------- Supabase REST helper ----------

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
            const tekst = await res.text();
            const fout = new Error(tekst || res.statusText);
            fout.status = res.status;
            throw fout;
        }
        if (res.status === 204) return null;
        const tekst = await res.text();
        return tekst ? JSON.parse(tekst) : null;
    }

    // ---------- Hulpjes ----------

    function esc(s) {
        return String(s ?? "").replace(/[&<>"']/g, (c) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
        }[c]));
    }

    function eersteVanMaand(d) {
        return new Date(d.getFullYear(), d.getMonth(), 1);
    }

    function isoDatum(d) {
        return d.getFullYear() + "-" +
            String(d.getMonth() + 1).padStart(2, "0") + "-" +
            String(d.getDate()).padStart(2, "0");
    }

    function tijd(t) {
        return String(t || "").slice(0, 5); // "10:00:00" -> "10:00"
    }

    function tijdOpties(geselecteerd) {
        let html = "";
        for (let m = 7 * 60; m <= 22 * 60; m += 30) {
            const t = String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
            html += `<option value="${t}" ${t === geselecteerd ? "selected" : ""}>${t}</option>`;
        }
        return html;
    }

    function voornaam(naam) {
        return String(naam).trim().split(/\s+/)[0];
    }

    function persoonNaam(id) {
        const p = state.personen.find((p) => p.id === id);
        return p ? p.naam : "Onbekend";
    }

    const maandFmt = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" });
    const dagFmt = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" });

    function hoofdletter(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    function dagTitel(datum) {
        const [j, m, d] = datum.split("-").map(Number);
        const dObj = new Date(j, m - 1, d);
        let titel = hoofdletter(dagFmt.format(dObj));
        if (datum === isoDatum(new Date())) titel = "Vandaag — " + titel;
        return titel;
    }

    function toast(bericht) {
        const el = document.getElementById("toast");
        el.textContent = bericht;
        el.classList.add("zichtbaar");
        clearTimeout(toast._t);
        toast._t = setTimeout(() => el.classList.remove("zichtbaar"), 3200);
    }

    function foutmelding(fout, vervangScherm = false) {
        console.error(fout);
        if (fout && (fout.status === 404 || /does not exist|relation/i.test(fout.message || ""))) {
            app.innerHTML = `<div class="melding-fout">
                <strong>De database is nog niet (helemaal) klaargezet.</strong><br>
                Voer <code>SETUP.sql</code> uit in de Supabase SQL Editor (nieuwe installatie),
                of het nieuwste update-script zoals <code>UPDATE-taken.sql</code> (eenmalig, voor de beheerder).
            </div>`;
        } else if (fout && fout.status === 400 && /van_tijd|tot_tijd|dagdeel/i.test(fout.message || "")) {
            app.innerHTML = `<div class="melding-fout">
                <strong>De database gebruikt nog de oude indeling.</strong><br>
                Voer <code>MIGRATIE-tijden.sql</code> uit in de Supabase SQL Editor (eenmalig, voor de beheerder).
            </div>`;
        } else if (vervangScherm) {
            app.innerHTML = `<div class="melding-fout">
                <strong>De gegevens konden niet geladen worden.</strong><br>
                Controleer of je internet hebt en vernieuw daarna deze pagina.<br><br>
                <button class="knop" onclick="location.reload()">🔄 Probeer opnieuw</button>
            </div>`;
        } else {
            toast("Er ging iets mis. Probeer het nog een keer.");
        }
    }

    // ---------- Data laden ----------

    async function laadPersonen() {
        state.personen = await sb("zorgplek_personen?select=*&order=naam.asc");
    }

    async function laadPlanning() {
        const van = isoDatum(state.maand);
        const tot = isoDatum(new Date(state.maand.getFullYear(), state.maand.getMonth() + 1, 0));
        const bereik = `datum=gte.${van}&datum=lte.${tot}`;
        [state.rooster, state.beschikbaarheid] = await Promise.all([
            sb(`zorgplek_rooster?select=*&${bereik}&order=van_tijd.asc`),
            sb(`zorgplek_beschikbaarheid?select=*&${bereik}&order=van_tijd.asc`),
        ]);
    }

    async function laadBoodschappen() {
        state.boodschappen = await sb("zorgplek_boodschappen?select=*&order=afgevinkt.asc,created_at.asc");
    }

    async function laadTaken() {
        state.taken = await sb("zorgplek_taken?select=*&order=sort_order.asc,created_at.asc");
    }

    // ---------- Identiteit ----------

    function bewaarIdentiteit(id) {
        try {
            localStorage.setItem(OPSLAG_SLEUTEL, id);
            document.cookie = `${OPSLAG_SLEUTEL}=${id}; max-age=${60 * 60 * 24 * 365}; path=/; SameSite=Lax`;
        } catch (e) { /* privémodus: dan vragen we het volgende keer opnieuw */ }
    }

    function leesIdentiteit() {
        try {
            const uitOpslag = localStorage.getItem(OPSLAG_SLEUTEL);
            if (uitOpslag) return uitOpslag;
            const m = document.cookie.match(new RegExp(OPSLAG_SLEUTEL + "=([^;]+)"));
            return m ? m[1] : null;
        } catch (e) { return null; }
    }

    function wisIdentiteit() {
        try {
            localStorage.removeItem(OPSLAG_SLEUTEL);
            document.cookie = `${OPSLAG_SLEUTEL}=; max-age=0; path=/`;
        } catch (e) { /* geen probleem */ }
    }

    // ---------- Weergave: wie ben jij ----------

    function toonIdentiteitskeuze() {
        tabsEl.style.display = "none";
        wieEl.innerHTML = "";
        const knoppen = state.personen.map((p) =>
            `<button class="naam-knop" data-id="${p.id}">${esc(p.naam)}</button>`
        ).join("");

        app.innerHTML = `
            <div class="kaart identiteit">
                <h2>Wie ben jij?</h2>
                <p>Klik op je naam. De pagina onthoudt dit voor de volgende keer.</p>
                <div class="namen-grid">${knoppen || ""}</div>
                <div class="nieuw-persoon">
                    <p style="margin-bottom:10px;">Staat je naam er niet bij?</p>
                    <input type="text" id="nieuwe-naam" placeholder="Typ hier je naam" maxlength="40">
                    <button class="knop" id="voeg-toe">Voeg mij toe</button>
                </div>
            </div>`;

        app.querySelectorAll(".naam-knop").forEach((k) => {
            k.addEventListener("click", () => kiesPersoon(k.dataset.id));
        });

        const invoer = document.getElementById("nieuwe-naam");
        const voegToe = document.getElementById("voeg-toe");
        async function toevoegen() {
            const naam = invoer.value.trim();
            if (!naam) { invoer.focus(); return; }
            voegToe.disabled = true;
            try {
                const rijen = await sb("zorgplek_personen", {
                    method: "POST",
                    headers: { Prefer: "return=representation" },
                    body: { naam },
                });
                state.personen.push(rijen[0]);
                kiesPersoon(rijen[0].id);
            } catch (fout) {
                if (fout.status === 409) toast(`"${naam}" bestaat al — klik op die naam in de lijst.`);
                else foutmelding(fout);
                voegToe.disabled = false;
            }
        }
        voegToe.addEventListener("click", toevoegen);
        invoer.addEventListener("keydown", (e) => { if (e.key === "Enter") toevoegen(); });
    }

    function kiesPersoon(id) {
        const p = state.personen.find((p) => p.id === id);
        if (!p) return;
        state.ik = p;
        bewaarIdentiteit(id);
        state.tab = "rooster";
        toonApp();
    }

    // ---------- Weergave: hoofdscherm ----------

    function toonApp() {
        wieEl.innerHTML = `Hallo, <strong>${esc(state.ik.naam)}</strong> 👋
            <button class="wissel" id="wissel-knop">Ben jij dit niet? Klik hier</button>`;
        document.getElementById("wissel-knop").addEventListener("click", () => {
            wisIdentiteit();
            state.ik = null;
            toonIdentiteitskeuze();
        });

        const tabs = [
            ["rooster", "📅", "Rooster"],
            ["beschikbaar", "✋", "Wanneer kan ik?"],
            ["taken", "📋", "Taken"],
            ["boodschappen", "🛒", "Boodschappen"],
        ];
        if (state.ik.is_beheerder) tabs.push(["beheer", "⚙️", "Beheer"]);

        tabsEl.style.display = "flex";
        tabsEl.innerHTML = tabs.map(([id, icoon, label]) =>
            `<button data-tab="${id}" class="${state.tab === id ? "actief" : ""}">
                <span class="tab-icoon">${icoon}</span>
                <span class="tab-label">${label}</span>
            </button>`
        ).join("");
        tabsEl.querySelectorAll("button").forEach((k) => {
            k.addEventListener("click", () => {
                state.tab = k.dataset.tab;
                state.openDag = null;
                state.bewerkTaak = null;
                toonApp();
            });
        });

        verversTab();
    }

    async function verversTab() {
        app.innerHTML = `<div class="laden">Even laden…</div>`;
        try {
            if (state.tab === "rooster") { await Promise.all([laadPlanning(), laadPersonen()]); toonRooster(); }
            else if (state.tab === "beschikbaar") { await laadPlanning(); toonBeschikbaarheid(); }
            else if (state.tab === "taken") { await laadTaken(); toonTaken(); }
            else if (state.tab === "boodschappen") { await laadBoodschappen(); toonBoodschappen(); }
            else if (state.tab === "beheer") { await laadPersonen(); toonBeheer(); }
        } catch (fout) { foutmelding(fout, true); }
    }

    // ---------- Kalender (gedeeld door rooster en beschikbaarheid) ----------

    function kalenderHtml(perDag) {
        const jaar = state.maand.getFullYear();
        const maandNr = state.maand.getMonth();
        const vandaag = isoDatum(new Date());
        const startOffset = (new Date(jaar, maandNr, 1).getDay() + 6) % 7; // maandag = 0
        const dagenInMaand = new Date(jaar, maandNr + 1, 0).getDate();

        let cellen = "";
        for (let i = 0; i < startOffset; i++) cellen += `<div class="cel leeg-cel"></div>`;
        for (let d = 1; d <= dagenInMaand; d++) {
            const datum = isoDatum(new Date(jaar, maandNr, d));
            const info = perDag(datum);
            const klassen = [
                "cel",
                info.vol ? "vol" : "",
                datum === vandaag ? "vandaag" : "",
                datum < vandaag ? "verleden" : "",
            ].join(" ");
            cellen += `<button class="${klassen}" data-dag="${datum}">
                <span class="cel-nr">${d}</span>${info.inhoud}
            </button>`;
        }

        const koppen = ["ma", "di", "wo", "do", "vr", "za", "zo"]
            .map((k) => `<div class="week-kop">${k}</div>`).join("");

        return `
            <div class="kalender-nav">
                <button class="knop rustig nav-knop" data-nav="-1" aria-label="Vorige maand">‹</button>
                <span class="maand-titel">${hoofdletter(maandFmt.format(state.maand))}</span>
                <button class="knop rustig nav-knop" data-nav="1" aria-label="Volgende maand">›</button>
            </div>
            <div class="kalender">${koppen}${cellen}</div>`;
    }

    function koppelKalender(herteken) {
        app.querySelectorAll("[data-nav]").forEach((k) => {
            k.addEventListener("click", () => {
                state.maand = new Date(state.maand.getFullYear(), state.maand.getMonth() + Number(k.dataset.nav), 1);
                state.openDag = null;
                verversTab();
            });
        });
        app.querySelectorAll(".cel[data-dag]").forEach((k) => {
            k.addEventListener("click", () => {
                state.openDag = k.dataset.dag;
                herteken();
                const paneel = app.querySelector(".paneel");
                if (paneel) paneel.scrollIntoView({ behavior: "smooth", block: "center" });
            });
        });
        app.querySelectorAll("[data-sluit]").forEach((k) => {
            k.addEventListener("click", () => { state.openDag = null; herteken(); });
        });
    }

    function paneelHtml(binnenkant) {
        return `
            <div class="paneel-achtergrond" data-sluit></div>
            <div class="paneel">
                <button class="paneel-sluit" data-sluit aria-label="Sluiten">✕</button>
                ${binnenkant}
                <button class="knop rustig paneel-onder" data-sluit>Sluiten</button>
            </div>`;
    }

    // ---------- Rooster ----------

    function toonRooster() {
        const beheer = state.ik.is_beheerder;

        let html = `<div class="uitleg">Hier zie je wie er wanneer naar Wim en Willie gaat.
            Op <strong>groene dagen</strong> gaat er iemand. Klik op een dag voor de tijden${beheer ? " of om iemand in te plannen" : ""}.</div>`;

        html += kalenderHtml((datum) => {
            const rijen = state.rooster.filter((r) => r.datum === datum);
            const namen = rijen.slice(0, 3).map((r) =>
                `<span class="cel-item">${esc(voornaam(persoonNaam(r.persoon_id)))}</span>`
            ).join("");
            const extra = rijen.length > 3 ? `<span class="cel-item meer">+${rijen.length - 3}</span>` : "";
            return { inhoud: namen + extra, vol: rijen.length > 0 };
        });

        if (state.openDag) html += roosterDagHtml(state.openDag, beheer);

        app.innerHTML = html;
        koppelKalender(toonRooster);
        koppelRoosterDag();
    }

    function roosterDagHtml(datum, beheer) {
        const rijen = state.rooster.filter((r) => r.datum === datum);
        const besch = state.beschikbaarheid.filter((b) => b.datum === datum);

        const lijst = rijen.map((r) => `
            <div class="regel">
                <span class="regel-tijd">🕐 ${tijd(r.van_tijd)} – ${tijd(r.tot_tijd)}</span>
                <span class="regel-naam">${esc(persoonNaam(r.persoon_id))}${r.persoon_id === state.ik.id ? " ⭐" : ""}</span>
                ${beheer ? `<button class="regel-x" data-verwijder-rooster="${r.id}" aria-label="Uit rooster halen">✕</button>` : ""}
            </div>`).join("") || `<p class="leeg">Er is nog niemand ingepland op deze dag.</p>`;

        const kanLijst = besch.map((b) => `
            <div class="regel zacht">
                <span class="regel-tijd">✋ ${tijd(b.van_tijd)} – ${tijd(b.tot_tijd)}</span>
                <span class="regel-naam">${esc(persoonNaam(b.persoon_id))}</span>
            </div>`).join("") || `<p class="leeg">Nog niemand heeft doorgegeven dat hij of zij op deze dag kan.</p>`;

        let inplannen = "";
        if (beheer) {
            const kanIds = new Set(besch.map((b) => b.persoon_id));
            const gesorteerd = [...state.personen].sort((a, b) =>
                (kanIds.has(b.id) - kanIds.has(a.id)) || a.naam.localeCompare(b.naam, "nl"));
            const opties = gesorteerd.map((p) =>
                `<option value="${p.id}">${kanIds.has(p.id) ? "✋ " : ""}${esc(p.naam)}</option>`).join("");
            inplannen = `
                <h4 class="paneel-kopje">Iemand inplannen</h4>
                <div class="plan-form">
                    <select id="plan-persoon" class="tijd-select">${opties}</select>
                    <span class="plan-tijden">
                        van <select id="plan-van" class="tijd-select">${tijdOpties("10:00")}</select>
                        tot <select id="plan-tot" class="tijd-select">${tijdOpties("12:00")}</select>
                    </span>
                    <button class="knop" id="plan-toevoegen">＋ Zet in het rooster</button>
                </div>`;
        }

        return paneelHtml(`
            <h3 class="paneel-titel">${dagTitel(datum)}</h3>
            <h4 class="paneel-kopje">Wie gaan er?</h4>
            ${lijst}
            <h4 class="paneel-kopje">Wie kunnen er?</h4>
            ${kanLijst}
            ${inplannen}`);
    }

    function koppelRoosterDag() {
        app.querySelectorAll("[data-verwijder-rooster]").forEach((k) => {
            k.addEventListener("click", async () => {
                try {
                    await sb(`zorgplek_rooster?id=eq.${k.dataset.verwijderRooster}`, { method: "DELETE" });
                    await laadPlanning();
                    toonRooster();
                } catch (fout) { foutmelding(fout); }
            });
        });

        const persoonSelect = document.getElementById("plan-persoon");
        const toevoegKnop = document.getElementById("plan-toevoegen");
        if (!persoonSelect || !toevoegKnop) return;

        // Bij het kiezen van iemand die kan: vul hun tijden alvast in.
        persoonSelect.addEventListener("change", () => {
            const b = state.beschikbaarheid.find(
                (b) => b.datum === state.openDag && b.persoon_id === persoonSelect.value);
            if (b) {
                document.getElementById("plan-van").value = tijd(b.van_tijd);
                document.getElementById("plan-tot").value = tijd(b.tot_tijd);
            }
        });
        persoonSelect.dispatchEvent(new Event("change"));

        toevoegKnop.addEventListener("click", async () => {
            const van = document.getElementById("plan-van").value;
            const tot = document.getElementById("plan-tot").value;
            if (tot <= van) { toast("De eindtijd moet na de begintijd liggen."); return; }
            toevoegKnop.disabled = true;
            try {
                await sb("zorgplek_rooster", {
                    method: "POST",
                    body: { datum: state.openDag, persoon_id: persoonSelect.value, van_tijd: van, tot_tijd: tot },
                });
                await laadPlanning();
                toonRooster();
            } catch (fout) {
                toevoegKnop.disabled = false;
                if (fout.status === 409) toast("Deze persoon staat al precies zo in het rooster.");
                else foutmelding(fout);
            }
        });
    }

    // ---------- Beschikbaarheid ----------

    function toonBeschikbaarheid() {
        let html = `<div class="uitleg">Klik op een dag en geef door <strong>van hoe laat tot hoe laat</strong>
            jij naar Wim en Willie kunt. Groene dagen heb jij al ingevuld.</div>`;

        html += kalenderHtml((datum) => {
            const mijn = state.beschikbaarheid.filter(
                (b) => b.datum === datum && b.persoon_id === state.ik.id);
            const tijden = mijn.slice(0, 2).map((b) =>
                `<span class="cel-item tijdje">${tijd(b.van_tijd)}–${tijd(b.tot_tijd)}</span>`).join("");
            const extra = mijn.length > 2 ? `<span class="cel-item meer">+${mijn.length - 2}</span>` : "";
            return { inhoud: tijden + extra, vol: mijn.length > 0 };
        });

        if (state.openDag) html += beschikbaarDagHtml(state.openDag);

        app.innerHTML = html;
        koppelKalender(toonBeschikbaarheid);
        koppelBeschikbaarDag();
    }

    function beschikbaarDagHtml(datum) {
        const mijn = state.beschikbaarheid.filter(
            (b) => b.datum === datum && b.persoon_id === state.ik.id);
        const ingepland = state.rooster.filter(
            (r) => r.datum === datum && r.persoon_id === state.ik.id);

        const lijst = mijn.map((b) => `
            <div class="regel">
                <span class="regel-tijd">✋ ${tijd(b.van_tijd)} – ${tijd(b.tot_tijd)}</span>
                <span class="regel-naam">jij kunt dan</span>
                <button class="regel-x" data-verwijder-beschikbaar="${b.id}" aria-label="Weghalen">✕</button>
            </div>`).join("") || `<p class="leeg">Je hebt voor deze dag nog niets doorgegeven.</p>`;

        const roosterInfo = ingepland.map((r) =>
            `<div class="regel zacht"><span class="regel-tijd">⭐ ${tijd(r.van_tijd)} – ${tijd(r.tot_tijd)}</span>
             <span class="regel-naam">je staat dan in het rooster</span></div>`).join("");

        return paneelHtml(`
            <h3 class="paneel-titel">${dagTitel(datum)}</h3>
            ${roosterInfo}
            <h4 class="paneel-kopje">Wanneer kun jij?</h4>
            ${lijst}
            <div class="plan-form">
                <span class="plan-tijden">
                    van <select id="kan-van" class="tijd-select">${tijdOpties("10:00")}</select>
                    tot <select id="kan-tot" class="tijd-select">${tijdOpties("12:00")}</select>
                </span>
                <button class="knop" id="kan-toevoegen">✓ Ik kan dan</button>
            </div>`);
    }

    function koppelBeschikbaarDag() {
        app.querySelectorAll("[data-verwijder-beschikbaar]").forEach((k) => {
            k.addEventListener("click", async () => {
                try {
                    await sb(`zorgplek_beschikbaarheid?id=eq.${k.dataset.verwijderBeschikbaar}`, { method: "DELETE" });
                    await laadPlanning();
                    toonBeschikbaarheid();
                } catch (fout) { foutmelding(fout); }
            });
        });

        const toevoegKnop = document.getElementById("kan-toevoegen");
        if (!toevoegKnop) return;
        toevoegKnop.addEventListener("click", async () => {
            const van = document.getElementById("kan-van").value;
            const tot = document.getElementById("kan-tot").value;
            if (tot <= van) { toast("De eindtijd moet na de begintijd liggen."); return; }
            toevoegKnop.disabled = true;
            try {
                await sb("zorgplek_beschikbaarheid", {
                    method: "POST",
                    body: { datum: state.openDag, persoon_id: state.ik.id, van_tijd: van, tot_tijd: tot },
                });
                await laadPlanning();
                toonBeschikbaarheid();
            } catch (fout) {
                toevoegKnop.disabled = false;
                if (fout.status === 409) toast("Dit tijdvak had je al doorgegeven.");
                else foutmelding(fout);
            }
        });
    }

    // ---------- Taken ----------

    function toonTaken() {
        const beheer = state.ik.is_beheerder;

        const rijen = state.taken.map((t, i) => {
            if (beheer && state.bewerkTaak === t.id) {
                return `<div class="taak-rij">
                    <span class="taak-nr">${i + 1}</span>
                    <input class="taak-invoer" id="taak-bewerk-invoer" value="${esc(t.tekst)}" maxlength="200">
                    <button class="knop" data-taak-opslaan="${t.id}">Opslaan</button>
                </div>`;
            }
            return `<div class="taak-rij">
                <span class="taak-nr">${i + 1}</span>
                <span class="taak-tekst">${esc(t.tekst)}</span>
                ${beheer ? `<span class="taak-acties">
                    <button class="taak-knopje" data-taak-schuif="${t.id}" data-richting="-1" ${i === 0 ? "disabled" : ""} aria-label="Omhoog">▲</button>
                    <button class="taak-knopje" data-taak-schuif="${t.id}" data-richting="1" ${i === state.taken.length - 1 ? "disabled" : ""} aria-label="Omlaag">▼</button>
                    <button class="taak-knopje" data-taak-bewerk="${t.id}" aria-label="Bewerken">✏️</button>
                    <button class="taak-knopje rood" data-taak-weg="${t.id}" aria-label="Verwijderen">✕</button>
                </span>` : ""}
            </div>`;
        }).join("") || `<p class="leeg" style="padding:6px 4px;">Er staan nog geen taken op de lijst.</p>`;

        app.innerHTML = `
            <div class="uitleg">${beheer
                ? "De takenlijst voor bij Wim en Willie. Jij kunt hem bewerken; iedereen kan hem bekijken."
                : "Deze taken horen bij een bezoek aan Wim en Willie."}</div>
            ${beheer ? `<div class="boodschap-form">
                <input type="text" id="taak-invoer" placeholder="Nieuwe taak, bijvoorbeeld: medicijnen klaarzetten" maxlength="200">
                <button class="knop" id="taak-toevoegen">+ Zet erbij</button>
            </div>` : ""}
            <div class="kaart">${rijen}</div>`;

        if (!beheer) return;

        const invoer = document.getElementById("taak-invoer");
        const toevoegKnop = document.getElementById("taak-toevoegen");
        async function toevoegen() {
            const tekst = invoer.value.trim();
            if (!tekst) { invoer.focus(); return; }
            toevoegKnop.disabled = true;
            const hoogste = state.taken.reduce((m, t) => Math.max(m, t.sort_order), 0);
            try {
                await sb("zorgplek_taken", {
                    method: "POST",
                    body: { tekst, sort_order: hoogste + 1 },
                });
                await laadTaken();
                toonTaken();
            } catch (fout) { toevoegKnop.disabled = false; foutmelding(fout); }
        }
        toevoegKnop.addEventListener("click", toevoegen);
        invoer.addEventListener("keydown", (e) => { if (e.key === "Enter") toevoegen(); });

        app.querySelectorAll("[data-taak-schuif]").forEach((k) => {
            k.addEventListener("click", async () => {
                const richting = Number(k.dataset.richting);
                const index = state.taken.findIndex((t) => t.id === k.dataset.taakSchuif);
                const taak = state.taken[index];
                const buur = state.taken[index + richting];
                if (!taak || !buur) return;
                let nieuwTaak = buur.sort_order;
                let nieuwBuur = taak.sort_order;
                if (nieuwTaak === nieuwBuur) nieuwTaak = buur.sort_order + richting;
                try {
                    await sb(`zorgplek_taken?id=eq.${taak.id}`, { method: "PATCH", body: { sort_order: nieuwTaak } });
                    await sb(`zorgplek_taken?id=eq.${buur.id}`, { method: "PATCH", body: { sort_order: nieuwBuur } });
                    await laadTaken();
                    toonTaken();
                } catch (fout) { foutmelding(fout); }
            });
        });

        app.querySelectorAll("[data-taak-bewerk]").forEach((k) => {
            k.addEventListener("click", () => {
                state.bewerkTaak = k.dataset.taakBewerk;
                toonTaken();
                const veld = document.getElementById("taak-bewerk-invoer");
                if (veld) { veld.focus(); veld.select(); }
            });
        });

        const opslaan = async (id) => {
            const veld = document.getElementById("taak-bewerk-invoer");
            const tekst = veld.value.trim();
            if (!tekst) { veld.focus(); return; }
            try {
                await sb(`zorgplek_taken?id=eq.${id}`, { method: "PATCH", body: { tekst } });
                state.bewerkTaak = null;
                await laadTaken();
                toonTaken();
            } catch (fout) { foutmelding(fout); }
        };
        app.querySelectorAll("[data-taak-opslaan]").forEach((k) => {
            k.addEventListener("click", () => opslaan(k.dataset.taakOpslaan));
        });
        const bewerkVeld = document.getElementById("taak-bewerk-invoer");
        if (bewerkVeld) bewerkVeld.addEventListener("keydown", (e) => {
            if (e.key === "Enter") opslaan(state.bewerkTaak);
        });

        app.querySelectorAll("[data-taak-weg]").forEach((k) => {
            k.addEventListener("click", async () => {
                const taak = state.taken.find((t) => t.id === k.dataset.taakWeg);
                if (!confirm(`"${taak ? taak.tekst : "deze taak"}" van de lijst halen?`)) return;
                try {
                    await sb(`zorgplek_taken?id=eq.${k.dataset.taakWeg}`, { method: "DELETE" });
                    await laadTaken();
                    toonTaken();
                } catch (fout) { foutmelding(fout); }
            });
        });
    }

    // ---------- Boodschappen ----------

    function toonBoodschappen() {
        const open = state.boodschappen.filter((b) => !b.afgevinkt);
        const af = state.boodschappen.filter((b) => b.afgevinkt);

        const rij = (b) => `<div class="boodschap-rij ${b.afgevinkt ? "af" : ""}" data-boodschap="${b.id}">
            <span class="vinkje">${b.afgevinkt ? "✓" : ""}</span>
            <span class="tekst">${esc(b.tekst)}</span>
            <span class="door">${esc(persoonNaam(b.toegevoegd_door))}</span>
        </div>`;

        app.innerHTML = `
            <div class="uitleg">Zet hier wat er nodig is voor Wim en Willie. Klik op een boodschap als je hem hebt gekocht.</div>
            <div class="boodschap-form">
                <input type="text" id="boodschap-invoer" placeholder="Bijvoorbeeld: melk, brood…" maxlength="120">
                <button class="knop" id="boodschap-toevoegen">+ Zet erbij</button>
            </div>
            ${open.map(rij).join("") || `<p class="leeg" style="padding:10px 4px;">De lijst is leeg.</p>`}
            ${af.length ? `<h3 class="sectie-titel" style="margin-top:26px;">Al gekocht</h3>${af.map(rij).join("")}
                <button class="knop rustig" id="opruimen" style="margin-top:6px;">🧹 Verwijder alles wat al gekocht is</button>` : ""}
        `;

        const invoer = document.getElementById("boodschap-invoer");
        const toevoegKnop = document.getElementById("boodschap-toevoegen");
        async function toevoegen() {
            const tekst = invoer.value.trim();
            if (!tekst) { invoer.focus(); return; }
            toevoegKnop.disabled = true;
            try {
                await sb("zorgplek_boodschappen", {
                    method: "POST",
                    body: { tekst, toegevoegd_door: state.ik.id },
                });
                await laadBoodschappen();
                toonBoodschappen();
            } catch (fout) { toevoegKnop.disabled = false; foutmelding(fout); }
        }
        toevoegKnop.addEventListener("click", toevoegen);
        invoer.addEventListener("keydown", (e) => { if (e.key === "Enter") toevoegen(); });

        app.querySelectorAll("[data-boodschap]").forEach((el) => {
            el.addEventListener("click", async () => {
                const item = state.boodschappen.find((b) => b.id === el.dataset.boodschap);
                try {
                    await sb(`zorgplek_boodschappen?id=eq.${item.id}`, {
                        method: "PATCH",
                        body: { afgevinkt: !item.afgevinkt },
                    });
                    await laadBoodschappen();
                    toonBoodschappen();
                } catch (fout) { foutmelding(fout); }
            });
        });

        const opruimen = document.getElementById("opruimen");
        if (opruimen) opruimen.addEventListener("click", async () => {
            if (!confirm("Alles wat al gekocht is van de lijst halen?")) return;
            try {
                await sb("zorgplek_boodschappen?afgevinkt=eq.true", { method: "DELETE" });
                await laadBoodschappen();
                toonBoodschappen();
            } catch (fout) { foutmelding(fout); }
        });
    }

    // ---------- Beheer ----------

    function toonBeheer() {
        const rijen = state.personen.map((p) => `
            <div class="beheer-rij">
                <span class="naam">${esc(p.naam)}${p.id === state.ik.id ? " (jij)" : ""}</span>
                <label><input type="checkbox" data-beheerder="${p.id}" ${p.is_beheerder ? "checked" : ""}> mag rooster maken</label>
                ${p.id !== state.ik.id ? `<button class="mini-knop" data-verwijder="${p.id}">Verwijder</button>` : ""}
            </div>`).join("");

        app.innerHTML = `
            <div class="uitleg">Alleen beheerders zien dit tabblad. "Mag rooster maken" geeft iemand
                de mogelijkheid om het rooster te bewerken en dit beheerscherm te zien.</div>
            <div class="kaart">${rijen}</div>`;

        app.querySelectorAll("[data-beheerder]").forEach((vak) => {
            vak.addEventListener("change", async () => {
                try {
                    await sb(`zorgplek_personen?id=eq.${vak.dataset.beheerder}`, {
                        method: "PATCH",
                        body: { is_beheerder: vak.checked },
                    });
                    await laadPersonen();
                    state.ik = state.personen.find((p) => p.id === state.ik.id) || state.ik;
                    toast("Opgeslagen ✓");
                } catch (fout) { vak.checked = !vak.checked; foutmelding(fout); }
            });
        });

        app.querySelectorAll("[data-verwijder]").forEach((k) => {
            k.addEventListener("click", async () => {
                const naam = persoonNaam(k.dataset.verwijder);
                if (!confirm(`${naam} verwijderen? Ook hun beschikbaarheid en roostermomenten verdwijnen.`)) return;
                try {
                    await sb(`zorgplek_personen?id=eq.${k.dataset.verwijder}`, { method: "DELETE" });
                    await laadPersonen();
                    toonBeheer();
                } catch (fout) { foutmelding(fout); }
            });
        });
    }

    // ---------- Start ----------

    async function start() {
        document.getElementById("titel").textContent = window.ZORGPLEK_TITEL || "Zorg Plek";
        document.getElementById("ondertitel").textContent = window.ZORGPLEK_ONDERTITEL || "";
        document.title = window.ZORGPLEK_TITEL || "Zorg Plek";

        try {
            await laadPersonen();
        } catch (fout) { foutmelding(fout, true); return; }

        const bewaardId = leesIdentiteit();
        const ik = bewaardId && state.personen.find((p) => p.id === bewaardId);
        if (ik) {
            state.ik = ik;
            toonApp();
        } else {
            wisIdentiteit();
            toonIdentiteitskeuze();
        }
    }

    // Ververs de gegevens als iemand terugkeert naar de pagina (bv. telefoon uit slaapstand).
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && state.ik) verversTab();
    });

    start();
})();
