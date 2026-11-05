// Gym Log — progressiefoto's.
// Foto's blijven alleen op dit apparaat (IndexedDB), per gebruiker. Niets gaat naar de server.
// Elke foto wordt bewaard als origineel plus een uitlijning (verschuiven, schalen, draaien),
// zodat schouders en heupen op elke foto op dezelfde plek staan. Daarmee maak je een timelapse.

(function () {
    "use strict";

    const G = () => window.GymLog;

    // Uitgelijnd beeld: staand 3:4. Schouders en heupen komen op deze lijnen.
    const W = 1080, H = 1440;
    const DOEL_SCHOUDER = { x: W / 2, y: H * 0.28 };
    const DOEL_HEUP = { x: W / 2, y: H * 0.60 };
    const TORSO = DOEL_HEUP.y - DOEL_SCHOUDER.y;
    const SCHOUDERBREEDTE = TORSO * 0.75;        // als de heupen niet in beeld zijn
    const DUIM_B = 360, DUIM_H = 480;            // miniatuur

    const MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21";
    const MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
    const MUXER = "https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.mjs";
    const FFLATE = "https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js";

    const F = {
        lijst: [],            // records zonder origineel geladen: { datum, thumb, transform, punten, bron, gemaakt, url }
        geladen: false,
        laden: null,
        laatsteBackup: null,
        laag: null,           // het schermvullende scherm (camera, uitlijnen, bekijken, video, backup)
        stream: null,
        camera: "user",       // "user" (voorkant) of "environment"
        timer: 0,
        geest: true,
        geestDekking: 0.35,
        uit: null,            // { bitmap, transform, punten, bron, datum, status }
        bekijkIndex: 0,
        video: { periode: 0, fps: 8, tekst: true },
        resultaat: null,      // { url, blob, naam, soort }
    };

    // ---------- Opslag ----------

    let dbBelofte = null, dbUid = null;
    function db() {
        const uid = G().uid();
        if (dbBelofte && dbUid === uid) return dbBelofte;
        dbUid = uid;
        dbBelofte = new Promise((ok, nee) => {
            const req = indexedDB.open(`gymlog_fotos_${uid}`, 1);
            req.onupgradeneeded = () => {
                req.result.createObjectStore("fotos", { keyPath: "datum" });
                req.result.createObjectStore("meta");
            };
            req.onsuccess = () => ok(req.result);
            req.onerror = () => nee(req.error);
        });
        return dbBelofte;
    }
    async function opslag(store, modus, werk) {
        const d = await db();
        return new Promise((ok, nee) => {
            const t = d.transaction(store, modus);
            const req = werk(t.objectStore(store));
            t.oncomplete = () => ok(req ? req.result : undefined);
            t.onerror = () => nee(t.error);
            t.onabort = () => nee(t.error || new Error("Opslaan afgebroken"));
        });
    }
    const pak = (datum) => opslag("fotos", "readonly", (s) => s.get(datum));
    const zet = (rec) => opslag("fotos", "readwrite", (s) => s.put(rec));
    const wis = (datum) => opslag("fotos", "readwrite", (s) => s.delete(datum));
    const alle = () => opslag("fotos", "readonly", (s) => s.getAll());

    async function laad() {
        if (F.laden) return F.laden;
        F.laden = (async () => {
            const recs = await alle();
            F.lijst.forEach((r) => URL.revokeObjectURL(r.url));
            F.lijst = recs.map((r) => ({
                datum: r.datum, transform: r.transform, punten: r.punten, bron: r.bron, gemaakt: r.gemaakt,
                url: URL.createObjectURL(r.thumb),
            })).sort((a, b) => a.datum.localeCompare(b.datum));
            F.laatsteBackup = await opslag("meta", "readonly", (s) => s.get("laatsteBackup")).catch(() => null);
            F.geladen = true;
        })();
        try { await F.laden; } finally { F.laden = null; }
    }

    function reset() {
        sluitLaag();
        F.lijst.forEach((r) => URL.revokeObjectURL(r.url));
        F.lijst = []; F.geladen = false; F.laatsteBackup = null;
        if (dbBelofte) dbBelofte.then((d) => d.close()).catch(() => {});
        dbBelofte = null; dbUid = null;
    }

    // Vraag de browser om de foto's niet op te ruimen als de opslag vol raakt.
    async function vraagBlijvend() {
        try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch { /* geen probleem */ }
    }

    // ---------- Tekenen met uitlijning ----------

    function matrix(t, schaal = 1) {
        const c = Math.cos(t.r) * t.s * schaal, s = Math.sin(t.r) * t.s * schaal;
        return [c, s, -s, c, t.tx * schaal, t.ty * schaal];
    }
    function teken(ctx, bron, t, b = W, h = H) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, b, h);
        ctx.setTransform(...matrix(t, b / W));
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(bron, 0, 0);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    // Foto zo groot dat hij het kader vult, gecentreerd.
    function vullend(bw, bh) {
        const s = Math.max(W / bw, H / bh);
        return { s, r: 0, tx: (W - bw * s) / 2, ty: (H - bh * s) / 2 };
    }
    // Zet twee punten in de bron precies op twee doelpunten (verschuiven + schalen + draaien).
    function tweePunten(a, b, da, db) {
        const vs = { x: b.x - a.x, y: b.y - a.y }, vd = { x: db.x - da.x, y: db.y - da.y };
        const s = Math.hypot(vd.x, vd.y) / Math.hypot(vs.x, vs.y);
        const r = Math.atan2(vd.y, vd.x) - Math.atan2(vs.y, vs.x);
        const c = Math.cos(r) * s, sn = Math.sin(r) * s;
        return { s, r, tx: da.x - (c * a.x - sn * a.y), ty: da.y - (sn * a.x + c * a.y) };
    }
    function opDoel(punten) {
        if (punten.heup) return tweePunten(punten.schouder, punten.heup, DOEL_SCHOUDER, DOEL_HEUP);
        // Alleen schouders: linker- en rechterschouder op een vaste breedte.
        return tweePunten(punten.links, punten.rechts,
            { x: DOEL_SCHOUDER.x - SCHOUDERBREEDTE / 2, y: DOEL_SCHOUDER.y },
            { x: DOEL_SCHOUDER.x + SCHOUDERBREEDTE / 2, y: DOEL_SCHOUDER.y });
    }

    async function blobUit(canvas, kwaliteit = 0.9) {
        if (canvas.convertToBlob) return canvas.convertToBlob({ type: "image/jpeg", quality: kwaliteit });
        return new Promise((ok) => canvas.toBlob(ok, "image/jpeg", kwaliteit));
    }
    function nieuwCanvas(b, h) {
        const c = document.createElement("canvas");
        c.width = b; c.height = h;
        return c;
    }
    async function bitmapVan(blob) {
        try { return await createImageBitmap(blob, { imageOrientation: "from-image" }); }
        catch { return createImageBitmap(blob); }
    }
    // Grote foto's verkleinen voor opslag (max 1600 px lang).
    async function verklein(bitmap, max = 1600) {
        const k = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
        const c = nieuwCanvas(Math.round(bitmap.width * k), Math.round(bitmap.height * k));
        c.getContext("2d").drawImage(bitmap, 0, 0, c.width, c.height);
        return c;
    }

    // Uitgelijnde versie van een opgeslagen foto als object-URL (voor de geest en het bekijken).
    const uitgelijndCache = new Map();
    async function uitgelijndUrl(datum) {
        if (uitgelijndCache.has(datum)) return uitgelijndCache.get(datum);
        const rec = await pak(datum);
        if (!rec) return null;
        const bm = await bitmapVan(rec.origineel);
        const c = nieuwCanvas(W, H);
        teken(c.getContext("2d"), bm, rec.transform);
        bm.close && bm.close();
        const url = URL.createObjectURL(await blobUit(c, 0.88));
        uitgelijndCache.set(datum, url);
        return url;
    }
    function vergeetUitgelijnd(datum) {
        const u = uitgelijndCache.get(datum);
        if (u) URL.revokeObjectURL(u);
        uitgelijndCache.delete(datum);
    }

    // ---------- Herkennen van schouders en heupen ----------

    let detector = null;
    async function laadDetector() {
        if (detector) return detector;
        const vision = await import(`${MP}/vision_bundle.mjs`);
        const bestanden = await vision.FilesetResolver.forVisionTasks(`${MP}/wasm`);
        const maak = (delegate) => vision.PoseLandmarker.createFromOptions(bestanden, {
            baseOptions: { modelAssetPath: MODEL, delegate },
            runningMode: "IMAGE",
            numPoses: 1,
        });
        try { detector = await maak("GPU"); } catch { detector = await maak("CPU"); }
        return detector;
    }

    async function herken(bron) {
        const d = await laadDetector();
        const res = d.detect(bron);
        const lm = res && res.landmarks && res.landmarks[0];
        if (!lm) return null;
        // Sommige versies vullen "visibility" niet; dan kijken we alleen of het punt in beeld is.
        const metZicht = lm.some((p) => p.visibility > 0);
        const ok = (p) => p && p.x > -0.02 && p.x < 1.02 && p.y > -0.02 && p.y < 1.02 && (!metZicht || p.visibility > 0.5);
        const px = (p) => ({ x: p.x * bron.width, y: p.y * bron.height });
        const [ls, rs, lh, rh] = [lm[11], lm[12], lm[23], lm[24]];
        if (!ok(ls) || !ok(rs)) return null;
        const links = px(ls), rechts = px(rs);
        // MediaPipe: 11 = linkerschouder van de persoon (rechts in beeld). Sorteer op x zodat het niet uitmaakt.
        const [a, b] = links.x < rechts.x ? [links, rechts] : [rechts, links];
        const schouder = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const heup = ok(lh) && ok(rh) ? { x: (px(lh).x + px(rh).x) / 2, y: (px(lh).y + px(rh).y) / 2 } : null;
        return { schouder, heup, links: a, rechts: b };
    }

    // ---------- Weergave in de app (tab Lichaam > Foto's) ----------

    function heeftVandaag() { return F.lijst.some((r) => r.datum === G().vandaag()); }
    function heeftFotos() { return F.lijst.length > 0; }

    function view() {
        const { esc, ico, mooiDatum, getal } = G();
        if (!F.geladen) {
            laad().then(() => G().render()).catch((e) => { console.error(e); G().toast("Foto's laden lukte niet in deze browser.", null, "fout"); });
            return `<p class="laden" role="status">Foto's laden…</p>`;
        }
        const vandaag = G().vandaag();
        const v = F.lijst.find((r) => r.datum === vandaag);
        const eerste = F.lijst[0], laatste = F.lijst[F.lijst.length - 1];
        const dagenSindsBackup = F.laatsteBackup ? Math.floor((Date.now() - new Date(F.laatsteBackup)) / 86400000) : null;
        const backupNodig = F.lijst.length >= 7 && (dagenSindsBackup == null || dagenSindsBackup >= 30);

        return `
            ${v ? `<section class="foto-vandaag">
                    <button class="foto-groot" data-foto="bekijk" data-datum="${v.datum}" aria-label="Foto van vandaag bekijken"><img src="${v.url}" alt=""></button>
                    <div><p class="foto-vandaag-titel">Foto van vandaag staat erin</p>
                    <div class="knoppen"><button class="knop knop-klein" data-foto="camera">Opnieuw</button>
                    <button class="knop knop-klein" data-foto="uitlijnen" data-datum="${v.datum}">Uitlijning</button></div></div>
                </section>`
            : `<section class="foto-start">
                    <button class="knop knop-hoofd breed" data-foto="camera">${ico("camera")}Foto van vandaag maken</button>
                    <label class="knop breed foto-galerij">${ico("galerij")}Kies uit je galerij
                        <input type="file" accept="image/*" data-foto-invoer="galerij" hidden></label>
                    <p class="uitleg">Elke dag op dezelfde plek, met hetzelfde licht en in dezelfde houding. De app lijnt je schouders en heupen uit, zodat je er later een timelapse van maakt. Je foto's blijven alleen op dit apparaat.</p>
                </section>`}

            ${backupNodig ? `<div class="melding foto-backup-melding">
                <span>${dagenSindsBackup == null ? "Je hebt nog geen back-up van je foto's." : `Je laatste back-up is ${dagenSindsBackup} dagen oud.`} Ze staan alleen op dit apparaat.</span>
                <button class="knop knop-klein" data-foto="backup">Back-up</button></div>` : ""}

            ${F.lijst.length >= 2 ? `<h2 class="kopje">Eerste en laatste</h2>
                <div class="vergelijk">
                    ${[eerste, laatste].map((r) => {
                        const kg = G().gewichtOp(r.datum);
                        return `<button class="vergelijk-foto" data-foto="bekijk" data-datum="${r.datum}">
                            <img src="${r.url}" alt="Foto van ${mooiDatum(r.datum)}">
                            <span>${mooiDatum(r.datum, false)}${kg ? `<b>${getal(kg, 2)} kg</b>` : ""}</span></button>`;
                    }).join("")}
                </div>
                <button class="knop knop-hoofd breed" data-foto="video">${ico("film")}Maak een timelapse</button>` : ""}

            ${F.lijst.length ? `<h2 class="kopje foto-kopje">Alle foto's<span>${F.lijst.length}</span></h2>
                <div class="foto-grid">${[...F.lijst].reverse().map((r) =>
                    `<button data-foto="bekijk" data-datum="${r.datum}"><img src="${r.url}" alt="" loading="lazy"><span>${mooiDatum(r.datum, false)}</span></button>`).join("")}</div>
                <div class="knoppen foto-onder">
                    <label class="knop knop-klein">${ico("galerij")}Foto toevoegen<input type="file" accept="image/*" data-foto-invoer="galerij" hidden></label>
                    <button class="knop knop-klein" data-foto="backup">Back-up</button>
                </div>`
            : `<div class="foto-onder"><button class="knop-link" data-foto="backup">Back-up terugzetten</button></div>`}`;
    }

    // ---------- Schermvullende laag ----------

    function laagEl() {
        let el = document.getElementById("foto-laag");
        if (!el) {
            el = document.createElement("div");
            el.id = "foto-laag";
            el.setAttribute("role", "dialog");
            el.setAttribute("aria-modal", "true");
            document.body.appendChild(el);
        }
        return el;
    }
    function openLaag(soort) {
        F.laag = soort;
        document.body.classList.add("laag-open");
        laagEl().hidden = false;
        laagEl().className = `foto-laag laag-${soort}`;
    }
    function sluitLaag() {
        stopCamera();
        clearInterval(aftelTimer);
        if (F.uit && F.uit.bitmap && F.uit.bitmap.close) F.uit.bitmap.close();
        F.uit = null;
        F.laag = null;
        if (F.resultaat) { URL.revokeObjectURL(F.resultaat.url); F.resultaat = null; }
        const el = document.getElementById("foto-laag");
        if (el) { el.hidden = true; el.innerHTML = ""; el.className = "foto-laag"; }
        document.body.classList.remove("laag-open");
    }

    // ---------- Camera ----------

    let aftelTimer = null;

    function stopCamera() {
        if (F.stream) F.stream.getTracks().forEach((t) => t.stop());
        F.stream = null;
    }

    async function openCamera() {
        openLaag("camera");
        const { ico } = G();
        const vorige = F.lijst.filter((r) => r.datum !== G().vandaag()).slice(-1)[0];
        const geest = vorige ? await uitgelijndUrl(vorige.datum) : null;
        laagEl().innerHTML = `
            <div class="cam-kader" id="cam-kader">
                <video id="cam-video" playsinline muted autoplay></video>
                ${geest ? `<img class="geest" id="cam-geest" src="${geest}" alt="" style="opacity:${F.geest ? F.geestDekking : 0}">` : ""}
                <div class="hulplijnen" aria-hidden="true"><span style="top:28%"></span><span style="top:60%"></span></div>
                <div class="aftellen" id="aftellen" hidden></div>
                <p class="cam-melding" id="cam-melding" hidden></p>
            </div>
            <div class="cam-balk">
                <button class="cam-knop" data-foto="sluit" aria-label="Sluiten">${ico("x")}</button>
                ${geest ? `<button class="cam-knop" data-foto="geest" aria-pressed="${F.geest}" aria-label="Vorige foto als overlay">${ico("geest")}</button>` : ""}
                <button class="cam-knop cam-timer" data-foto="timer" aria-label="Zelfontspanner">${ico("klok")}<span>${F.timer ? `${F.timer}s` : "uit"}</span></button>
                <button class="sluiter" data-foto="sluiter" aria-label="Foto maken"><span></span></button>
                <button class="cam-knop" data-foto="wissel" aria-label="Andere camera">${ico("wissel")}</button>
                <label class="cam-knop" aria-label="Kies uit je galerij">${ico("galerij")}<input type="file" accept="image/*" data-foto-invoer="galerij" hidden></label>
            </div>`;
        await startCamera();
    }

    async function startCamera() {
        stopCamera();
        const video = document.getElementById("cam-video");
        const melding = document.getElementById("cam-melding");
        if (!video) return;
        video.classList.toggle("spiegel", F.camera === "user");
        try {
            F.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: F.camera, width: { ideal: 1920 }, height: { ideal: 1920 } },
                audio: false,
            });
            if (F.laag !== "camera") { stopCamera(); return; }
            video.srcObject = F.stream;
            await video.play().catch(() => {});
            melding.hidden = true;
        } catch (e) {
            console.warn(e);
            melding.hidden = false;
            melding.textContent = e && e.name === "NotAllowedError"
                ? "De app mag je camera niet gebruiken. Sta het toe in je browserinstellingen, of kies een foto uit je galerij."
                : "Camera starten lukte niet. Kies een foto uit je galerij.";
        }
    }

    function sluiter() {
        if (!F.stream) return;
        if (!F.timer) return neemFoto();
        const el = document.getElementById("aftellen");
        let n = F.timer;
        el.hidden = false; el.textContent = n;
        clearInterval(aftelTimer);
        aftelTimer = setInterval(() => {
            n--;
            if (n <= 0) { clearInterval(aftelTimer); el.hidden = true; neemFoto(); }
            else el.textContent = n;
        }, 1000);
    }

    async function neemFoto() {
        const video = document.getElementById("cam-video");
        if (!video || !video.videoWidth) return;
        // Snij het camerabeeld bij tot 3:4, zoals het kader laat zien.
        const vw = video.videoWidth, vh = video.videoHeight;
        let sw = vw, sh = vw * 4 / 3;
        if (sh > vh) { sh = vh; sw = vh * 3 / 4; }
        const sx = (vw - sw) / 2, sy = (vh - sh) / 2;
        const k = Math.min(1, 1600 / sh);
        const c = nieuwCanvas(Math.round(sw * k), Math.round(sh * k));
        const ctx = c.getContext("2d");
        if (F.camera === "user") { ctx.translate(c.width, 0); ctx.scale(-1, 1); }   // zoals je jezelf zag
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
        if (navigator.vibrate) navigator.vibrate(20);
        stopCamera();
        const bitmap = await createImageBitmap(c);
        await openUitlijnen({ bitmap, bron: "camera", datum: G().vandaag(), nieuw: true });
    }

    async function vanGalerij(bestand) {
        if (!bestand) return;
        try {
            const bm = await bitmapVan(bestand);
            const c = await verklein(bm);
            bm.close && bm.close();
            stopCamera();
            const bitmap = await createImageBitmap(c);
            // Datum: van het bestand als het een oude foto is, anders vandaag.
            const d = bestand.lastModified ? new Date(bestand.lastModified) : new Date();
            const datum = isNaN(d) ? G().vandaag() : G().datumStr(d);
            await openUitlijnen({ bitmap, bron: "galerij", datum: datum > G().vandaag() ? G().vandaag() : datum, nieuw: true });
        } catch (e) {
            console.error(e);
            G().toast("Deze foto kon niet geopend worden.", null, "fout");
        }
    }

    // ---------- Uitlijnen ----------

    async function openUitlijnenBestaand(datum) {
        const rec = await pak(datum);
        if (!rec) return;
        const bitmap = await bitmapVan(rec.origineel);
        await openUitlijnen({ bitmap, bron: rec.bron, datum, transform: rec.transform, punten: rec.punten, origineelDatum: datum, origineel: rec.origineel });
    }

    async function openUitlijnen(u) {
        openLaag("uitlijnen");
        F.uit = { ...u, transform: u.transform || vullend(u.bitmap.width, u.bitmap.height), status: u.transform ? "" : "zoeken" };
        const { ico, vandaag } = G();
        const vorige = F.lijst.filter((r) => r.datum !== u.origineelDatum && r.datum !== u.datum).slice(-1)[0];
        const geest = vorige ? await uitgelijndUrl(vorige.datum) : null;
        laagEl().innerHTML = `
            <div class="uit-kop">
                <button class="cam-knop" data-foto="sluit" aria-label="Annuleren">${ico("x")}</button>
                <h2>Uitlijnen</h2>
                <button class="knop knop-hoofd knop-klein" data-foto="bewaar">Opslaan</button>
            </div>
            <div class="uit-kader" id="uit-kader">
                <canvas id="uit-canvas" width="${W}" height="${H}"></canvas>
                ${geest ? `<img class="geest" id="uit-geest" src="${geest}" alt="" style="opacity:${F.geest ? F.geestDekking : 0}">` : ""}
                <div class="hulplijnen" aria-hidden="true"><span style="top:28%"><i>schouders</i></span><span style="top:60%"><i>heupen</i></span></div>
            </div>
            <p class="uit-status" id="uit-status" role="status"></p>
            <div class="uit-balk">
                <button class="knop knop-klein" data-foto="auto">${ico("doel")}Automatisch</button>
                <label class="uit-datum"><span class="sr">Datum van de foto</span><input type="date" value="${F.uit.datum}" max="${vandaag()}" data-foto-invoer="datum"></label>
            </div>
            ${geest ? `<label class="uit-dekking"><span>Vorige foto erover</span>
                <input type="range" min="0" max="0.8" step="0.05" value="${F.geest ? F.geestDekking : 0}" data-foto-invoer="dekking"></label>` : ""}`;
        tekenUit();
        koppelGebaren(document.getElementById("uit-kader"));
        if (!u.transform) autoUitlijnen();
        else zetStatus("Sleep om te verschuiven, knijp om te zoomen of te draaien.");
    }

    function tekenUit() {
        const c = document.getElementById("uit-canvas");
        if (!c || !F.uit) return;
        teken(c.getContext("2d"), F.uit.bitmap, F.uit.transform);
    }
    function zetStatus(t, soort = "") {
        const el = document.getElementById("uit-status");
        if (el) { el.textContent = t; el.className = `uit-status ${soort}`; }
    }

    async function autoUitlijnen() {
        if (!F.uit) return;
        zetStatus("Schouders en heupen zoeken… (de eerste keer duurt dit even)");
        try {
            const p = await herken(F.uit.bitmap);
            if (!F.uit) return;
            if (!p) {
                zetStatus("Geen schouders gevonden. Lijn zelf uit: schouders op de bovenste lijn, heupen op de onderste.", "matig");
                return;
            }
            F.uit.punten = p;
            F.uit.transform = opDoel(p);
            tekenUit();
            zetStatus(p.heup ? "Uitgelijnd op schouders en heupen. Bijstellen kan met slepen en knijpen."
                : "Uitgelijnd op je schouders (heupen niet in beeld). Bijstellen kan met slepen en knijpen.", "goed");
        } catch (e) {
            console.warn("Herkennen mislukt", e);
            zetStatus("Automatisch uitlijnen lukt nu niet (geen verbinding?). Lijn zelf uit: schouders op de bovenste lijn, heupen op de onderste.", "matig");
        }
    }

    // Slepen = verschuiven. Twee vingers = zoomen en draaien om het midden tussen je vingers.
    function koppelGebaren(kader) {
        const vingers = new Map();
        let vorig = null;
        const naarCanvas = (e) => {
            const r = kader.getBoundingClientRect();
            return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
        };
        const meting = () => {
            const p = [...vingers.values()];
            if (p.length === 1) return { c: p[0], d: 1, a: 0, n: 1 };
            const [a, b] = p;
            return { c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d: Math.hypot(b.x - a.x, b.y - a.y), a: Math.atan2(b.y - a.y, b.x - a.x), n: 2 };
        };
        const pas = (k, da, c, dx, dy) => {
            const t = F.uit.transform;
            const cos = Math.cos(da) * k, sin = Math.sin(da) * k;
            const x = t.tx - c.x, y = t.ty - c.y;
            F.uit.transform = { s: t.s * k, r: t.r + da, tx: c.x + cos * x - sin * y + dx, ty: c.y + sin * x + cos * y + dy };
            tekenUit();
        };
        kader.addEventListener("pointerdown", (e) => {
            kader.setPointerCapture(e.pointerId);
            vingers.set(e.pointerId, naarCanvas(e));
            vorig = meting();
        });
        kader.addEventListener("pointermove", (e) => {
            if (!vingers.has(e.pointerId) || !F.uit) return;
            vingers.set(e.pointerId, naarCanvas(e));
            const nu = meting();
            if (vorig && nu.n === vorig.n) {
                if (nu.n === 1) pas(1, 0, nu.c, nu.c.x - vorig.c.x, nu.c.y - vorig.c.y);
                else pas(nu.d / vorig.d, nu.a - vorig.a, vorig.c, nu.c.x - vorig.c.x, nu.c.y - vorig.c.y);
            }
            vorig = nu;
        });
        const los = (e) => { vingers.delete(e.pointerId); vorig = vingers.size ? meting() : null; };
        kader.addEventListener("pointerup", los);
        kader.addEventListener("pointercancel", los);
        // Op de computer: scrollen = zoomen, met shift = draaien.
        kader.addEventListener("wheel", (e) => {
            e.preventDefault();
            const c = naarCanvas(e);
            if (e.shiftKey) pas(1, e.deltaY * 0.002, c, 0, 0);
            else pas(Math.exp(-e.deltaY * 0.0015), 0, c, 0, 0);
        }, { passive: false });
    }

    async function bewaar() {
        const u = F.uit;
        if (!u) return;
        const knop = laagEl().querySelector("[data-foto=bewaar]");
        if (knop) { knop.disabled = true; knop.textContent = "Opslaan…"; }
        try {
            const duim = nieuwCanvas(DUIM_B, DUIM_H);
            teken(duim.getContext("2d"), u.bitmap, u.transform, DUIM_B, DUIM_H);
            let origineel = u.origineel;
            if (!origineel) {
                const c = nieuwCanvas(u.bitmap.width, u.bitmap.height);
                c.getContext("2d").drawImage(u.bitmap, 0, 0);
                origineel = await blobUit(c, 0.9);
            }
            const bestond = F.lijst.some((r) => r.datum === u.datum) && u.datum !== u.origineelDatum;
            const rec = {
                datum: u.datum, origineel, thumb: await blobUit(duim, 0.85),
                transform: u.transform, punten: u.punten || null, bron: u.bron,
                gemaakt: new Date().toISOString(),
            };
            await zet(rec);
            // Datum veranderd bij bijwerken: oude datum weghalen.
            if (u.origineelDatum && u.origineelDatum !== u.datum) await wis(u.origineelDatum);
            vergeetUitgelijnd(u.datum);
            if (u.origineelDatum) vergeetUitgelijnd(u.origineelDatum);
            vraagBlijvend();
            await laad();
            sluitLaag();
            G().render();
            G().toast(bestond ? `Foto van ${G().mooiDatum(u.datum)} vervangen` : u.origineelDatum ? "Uitlijning opgeslagen" : `Foto van ${G().mooiDatum(u.datum)} opgeslagen`);
        } catch (e) {
            console.error(e);
            if (knop) { knop.disabled = false; knop.textContent = "Opslaan"; }
            const vol = e && (e.name === "QuotaExceededError" || /quota/i.test(e.message));
            G().toast(vol ? "Je telefoon heeft geen ruimte meer voor foto's. Maak een back-up en verwijder oude foto's." : "Opslaan lukte niet.", null, "fout");
        }
    }

    // ---------- Bekijken ----------

    async function openBekijk(datum) {
        openLaag("bekijk");
        F.bekijkIndex = Math.max(0, F.lijst.findIndex((r) => r.datum === datum));
        await tekenBekijk();
    }
    async function tekenBekijk() {
        const r = F.lijst[F.bekijkIndex];
        if (!r) return sluitLaag();
        const { ico, mooiDatum, getal } = G();
        const kg = G().gewichtOp(r.datum);
        laagEl().innerHTML = `
            <div class="uit-kop">
                <button class="cam-knop" data-foto="sluit" aria-label="Sluiten">${ico("x")}</button>
                <h2>${mooiDatum(r.datum)}${kg ? `<span>${getal(kg, 2)} kg</span>` : ""}</h2>
                <span class="bekijk-teller">${F.bekijkIndex + 1}/${F.lijst.length}</span>
            </div>
            <div class="uit-kader bekijk-kader" id="bekijk-kader">
                <img src="${r.url}" alt="Foto van ${mooiDatum(r.datum)}" id="bekijk-img">
                <button class="bekijk-pijl links" data-foto="vorige" aria-label="Vorige foto" ${F.bekijkIndex ? "" : "hidden"}>${ico("terug")}</button>
                <button class="bekijk-pijl rechts" data-foto="volgende" aria-label="Volgende foto" ${F.bekijkIndex < F.lijst.length - 1 ? "" : "hidden"}>${ico("pijl")}</button>
            </div>
            <div class="uit-balk">
                <button class="knop knop-klein knop-gevaar" data-foto="verwijder">Verwijderen</button>
                <button class="knop knop-klein" data-foto="uitlijnen" data-datum="${r.datum}">Uitlijning aanpassen</button>
            </div>`;
        // Eerst de miniatuur, dan de scherpe versie.
        const url = await uitgelijndUrl(r.datum);
        const img = document.getElementById("bekijk-img");
        if (img && url && F.lijst[F.bekijkIndex] === r) img.src = url;
        // Vegen naar links/rechts.
        const kader = document.getElementById("bekijk-kader");
        let x0 = null;
        kader.addEventListener("pointerdown", (e) => { x0 = e.clientX; });
        kader.addEventListener("pointerup", (e) => {
            if (x0 == null) return;
            const dx = e.clientX - x0; x0 = null;
            if (Math.abs(dx) > 50) bladeren(dx < 0 ? 1 : -1);
        });
    }
    function bladeren(stap) {
        const i = F.bekijkIndex + stap;
        if (i < 0 || i >= F.lijst.length) return;
        F.bekijkIndex = i;
        tekenBekijk();
    }

    async function verwijder() {
        const r = F.lijst[F.bekijkIndex];
        if (!r) return;
        const rec = await pak(r.datum);
        await wis(r.datum);
        vergeetUitgelijnd(r.datum);
        await laad();
        sluitLaag();
        G().render();
        G().toast(`Foto van ${G().mooiDatum(r.datum)} verwijderd`, async () => {
            await zet(rec);
            await laad();
            G().render();
        });
    }

    // ---------- Video ----------

    function videoFotos() {
        const p = F.video.periode;
        return p ? F.lijst.filter((r) => G().dagenTussen(r.datum, G().vandaag()) < p) : F.lijst;
    }

    function openVideo() {
        openLaag("video");
        tekenVideoKeuze();
    }
    function tekenVideoKeuze() {
        const { ico, getal } = G();
        const n = videoFotos().length;
        const sec = n / F.video.fps + 1.5;
        const seg = (naam, opties, waarde) => `<div class="segment" role="group">${opties.map(([v, l]) =>
            `<button aria-pressed="${waarde === v}" data-foto="video-optie" data-naam="${naam}" data-waarde="${v}">${l}</button>`).join("")}</div>`;
        laagEl().innerHTML = `
            <div class="uit-kop">
                <button class="cam-knop" data-foto="sluit" aria-label="Sluiten">${ico("x")}</button>
                <h2>Timelapse</h2><span></span>
            </div>
            <div class="video-paneel">
                ${F.resultaat ? `<video class="video-voorbeeld" src="${F.resultaat.url}" controls autoplay loop muted playsinline></video>
                    <div class="knoppen">
                        <button class="knop" data-foto="deel">Delen</button>
                        <a class="knop knop-hoofd" href="${F.resultaat.url}" download="${F.resultaat.naam}">Opslaan</a>
                    </div>
                    <button class="knop-link" data-foto="opnieuw">Andere instellingen</button>`
                : `<label class="veld"><span>Welke foto's</span></label>
                    ${seg("periode", [[0, "Alles"], [90, "90 dagen"], [30, "30 dagen"]], F.video.periode)}
                    <label class="veld"><span>Snelheid</span></label>
                    ${seg("fps", [[4, "Rustig"], [8, "Normaal"], [15, "Snel"]], F.video.fps)}
                    <label class="schakel"><input type="checkbox" data-foto-invoer="tekst" ${F.video.tekst ? "checked" : ""}><span>Datum en gewicht in beeld</span></label>
                    <p class="uitleg">${n} foto's, ongeveer ${getal(sec, 1)} seconden.</p>
                    <div class="voortgang" id="voortgang" hidden><span></span></div>
                    <button class="knop knop-hoofd breed" data-foto="render" ${n < 2 ? "disabled" : ""}>${ico("film")}Video maken</button>
                    ${n < 2 ? `<p class="uitleg">Je hebt minstens 2 foto's nodig.</p>` : ""}`}
            </div>`;
    }

    function tekstOpFrame(ctx, b, h, r) {
        const { mooiDatum, getal } = G();
        const kg = G().gewichtOp(r.datum);
        const k = b / W;
        ctx.save();
        const grad = ctx.createLinearGradient(0, h - 200 * k, 0, h);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, "rgba(0,0,0,0.55)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, h - 200 * k, b, 200 * k);
        ctx.fillStyle = "#f2efe8";
        ctx.textBaseline = "alphabetic";
        ctx.font = `800 ${Math.round(64 * k)}px Archivo, system-ui, sans-serif`;
        try { ctx.fontStretch = "condensed"; } catch { /* oudere browsers */ }
        ctx.fillText(mooiDatum(r.datum, false), 48 * k, h - 56 * k);
        if (kg) {
            const t = `${getal(kg, 2)} kg`;
            ctx.textAlign = "right";
            ctx.fillText(t, b - 48 * k, h - 56 * k);
        }
        ctx.restore();
    }

    async function kiesEncoder(fps) {
        if (!("VideoEncoder" in window)) return null;
        const kandidaten = [];
        for (const [b, h] of [[1080, 1440], [720, 960]]) {
            for (const [codec, muxCodec] of [["avc1.640028", "avc"], ["avc1.4d0028", "avc"], ["avc1.42001f", "avc"], ["vp09.00.40.08", "vp9"]]) {
                kandidaten.push({ cfg: { codec, width: b, height: h, bitrate: b > 800 ? 8e6 : 5e6, framerate: fps }, muxCodec });
            }
        }
        for (const k of kandidaten) {
            try { if ((await VideoEncoder.isConfigSupported(k.cfg)).supported) return k; } catch { /* volgende */ }
        }
        return null;
    }

    async function renderVideo() {
        const fotos = videoFotos();
        const fps = F.video.fps;
        const knop = laagEl().querySelector("[data-foto=render]");
        const balk = document.getElementById("voortgang");
        if (knop) { knop.disabled = true; knop.textContent = "Video maken…"; }
        if (balk) balk.hidden = false;
        const voortgang = (x) => { const s = balk && balk.querySelector("span"); if (s) s.style.width = `${Math.round(x * 100)}%`; };
        const extra = Math.round(fps * 1.5);   // laatste foto iets langer laten staan
        try {
            const enc = await kiesEncoder(fps);
            const b = enc ? enc.cfg.width : 720, h = enc ? enc.cfg.height : 960;
            const canvas = nieuwCanvas(b, h);
            const ctx = canvas.getContext("2d");
            const frame = async (r) => {
                const rec = await pak(r.datum);
                const bm = await bitmapVan(rec.origineel);
                teken(ctx, bm, rec.transform, b, h);
                bm.close && bm.close();
                if (F.video.tekst) tekstOpFrame(ctx, b, h, r);
            };
            let blob, soort;
            if (enc) {
                const { Muxer, ArrayBufferTarget } = await import(MUXER);
                const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: enc.muxCodec, width: b, height: h, frameRate: fps }, fastStart: "in-memory" });
                let fout = null;
                const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { fout = e; } });
                encoder.configure(enc.cfg);
                const totaal = fotos.length + extra;
                const duur = Math.round(1e6 / fps);
                for (let i = 0; i < totaal; i++) {
                    if (i < fotos.length) await frame(fotos[i]);
                    const vf = new VideoFrame(canvas, { timestamp: i * duur, duration: duur });
                    encoder.encode(vf, { keyFrame: i % (fps * 2) === 0 });
                    vf.close();
                    while (encoder.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 10));
                    if (fout) throw fout;
                    voortgang((i + 1) / totaal);
                }
                await encoder.flush();
                encoder.close();
                muxer.finalize();
                blob = new Blob([muxer.target.buffer], { type: "video/mp4" });
                soort = "mp4";
            } else {
                // Terugval: opnemen in real time met MediaRecorder.
                const mime = ["video/mp4", "video/webm;codecs=vp9", "video/webm"].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
                if (!mime) throw new Error("Deze browser kan geen video maken.");
                const stream = canvas.captureStream(fps);
                const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5e6 });
                const stukken = [];
                rec.ondataavailable = (e) => e.data.size && stukken.push(e.data);
                const klaar = new Promise((r) => { rec.onstop = r; });
                await frame(fotos[0]);
                rec.start();
                for (let i = 0; i < fotos.length; i++) {
                    await frame(fotos[i]);
                    await new Promise((r) => setTimeout(r, 1000 / fps));
                    voortgang((i + 1) / fotos.length);
                }
                await new Promise((r) => setTimeout(r, 1500));
                rec.stop();
                await klaar;
                soort = mime.startsWith("video/mp4") ? "mp4" : "webm";
                blob = new Blob(stukken, { type: mime.split(";")[0] });
            }
            const naam = `gymlog-timelapse-${G().vandaag()}.${soort}`;
            F.resultaat = { url: URL.createObjectURL(blob), blob, naam, soort };
            tekenVideoKeuze();
        } catch (e) {
            console.error(e);
            G().toast(`Video maken lukte niet: ${G().esc(e.message || "onbekende fout")}`, null, "fout");
            tekenVideoKeuze();
        }
    }

    async function deel(blob, naam, titel) {
        const bestand = new File([blob], naam, { type: blob.type });
        if (navigator.canShare && navigator.canShare({ files: [bestand] })) {
            try { await navigator.share({ files: [bestand], title: titel }); return true; }
            catch (e) { if (e.name === "AbortError") return true; }
        }
        // Delen kan niet: gewoon downloaden.
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = naam;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
        return true;
    }

    // ---------- Back-up ----------

    function openBackup() {
        openLaag("backup");
        const { ico, mooiDatum } = G();
        laagEl().innerHTML = `
            <div class="uit-kop">
                <button class="cam-knop" data-foto="sluit" aria-label="Sluiten">${ico("x")}</button>
                <h2>Back-up</h2><span></span>
            </div>
            <div class="video-paneel">
                <p class="uitleg">Je foto's staan alleen op dit apparaat. Verwijder je de app van je beginscherm of wis je browsergegevens, dan zijn ze weg. Bewaar daarom af en toe een back-up, bijvoorbeeld in Google Drive.</p>
                ${F.resultaat ? `<p class="uitleg"><b>${F.resultaat.naam}</b> staat klaar.</p>
                    <div class="knoppen">
                        <button class="knop" data-foto="deel-backup">Delen</button>
                        <a class="knop knop-hoofd" href="${F.resultaat.url}" download="${F.resultaat.naam}" data-foto="gedownload">Downloaden</a>
                    </div>`
                : `<button class="knop knop-hoofd breed" data-foto="maak-backup" ${F.lijst.length ? "" : "disabled"}>Back-up maken van ${F.lijst.length} foto's</button>`}
                ${F.laatsteBackup ? `<p class="voetnoot">Laatste back-up: ${mooiDatum(F.laatsteBackup.slice(0, 10))}.</p>` : ""}
                <h2 class="kopje">Terugzetten</h2>
                <p class="uitleg">Kies een back-up (.zip) die je eerder maakte. Foto's van dagen die al op dit apparaat staan, blijven zoals ze zijn.</p>
                <label class="knop breed">Back-up kiezen<input type="file" accept=".zip,application/zip" data-foto-invoer="zip" hidden></label>
            </div>`;
    }

    async function maakBackup() {
        const knop = laagEl().querySelector("[data-foto=maak-backup]");
        if (knop) { knop.disabled = true; knop.textContent = "Back-up maken…"; }
        try {
            const { zipSync, strToU8 } = await import(FFLATE);
            const recs = await alle();
            const bestanden = {};
            const meta = [];
            for (const r of recs) {
                bestanden[`fotos/${r.datum}.jpg`] = [new Uint8Array(await r.origineel.arrayBuffer()), { level: 0 }];
                meta.push({ datum: r.datum, transform: r.transform, punten: r.punten, bron: r.bron, gemaakt: r.gemaakt });
            }
            bestanden["gymlog-fotos.json"] = strToU8(JSON.stringify({ versie: 1, gemaakt: new Date().toISOString(), fotos: meta }, null, 1));
            const blob = new Blob([zipSync(bestanden)], { type: "application/zip" });
            F.resultaat = { url: URL.createObjectURL(blob), blob, naam: `gymlog-fotos-${G().vandaag()}.zip`, soort: "zip" };
            openBackup();
        } catch (e) {
            console.error(e);
            G().toast("Back-up maken lukte niet.", null, "fout");
            openBackup();
        }
    }
    async function backupGemaakt() {
        F.laatsteBackup = new Date().toISOString();
        await opslag("meta", "readwrite", (s) => s.put(F.laatsteBackup, "laatsteBackup")).catch(() => {});
    }

    async function zetTerug(bestand) {
        if (!bestand) return;
        try {
            const { unzipSync, strFromU8 } = await import(FFLATE);
            const inhoud = unzipSync(new Uint8Array(await bestand.arrayBuffer()));
            const json = inhoud["gymlog-fotos.json"];
            if (!json) throw new Error("Dit is geen Gym Log back-up.");
            const meta = JSON.parse(strFromU8(json));
            const bestaand = new Set(F.lijst.map((r) => r.datum));
            let n = 0;
            for (const m of meta.fotos || []) {
                const data = inhoud[`fotos/${m.datum}.jpg`];
                if (!data || bestaand.has(m.datum)) continue;
                const origineel = new Blob([data], { type: "image/jpeg" });
                const bm = await bitmapVan(origineel);
                const duim = nieuwCanvas(DUIM_B, DUIM_H);
                teken(duim.getContext("2d"), bm, m.transform || vullend(bm.width, bm.height), DUIM_B, DUIM_H);
                bm.close && bm.close();
                await zet({ ...m, transform: m.transform || vullend(bm.width, bm.height), origineel, thumb: await blobUit(duim, 0.85) });
                n++;
            }
            vraagBlijvend();
            await laad();
            sluitLaag();
            G().render();
            G().toast(n ? `${n} ${n === 1 ? "foto" : "foto's"} teruggezet` : "Alle foto's uit deze back-up stonden er al.");
        } catch (e) {
            console.error(e);
            G().toast(G().esc(e.message && e.message.includes("Gym Log") ? e.message : "Deze back-up kon niet gelezen worden."), null, "fout");
        }
    }

    // ---------- Events ----------

    document.addEventListener("click", (e) => {
        const el = e.target.closest("[data-foto]");
        if (!el) return;
        const a = el.dataset.foto;
        switch (a) {
            case "camera": openCamera(); break;
            case "sluit": sluitLaag(); break;
            case "sluiter": sluiter(); break;
            case "wissel": F.camera = F.camera === "user" ? "environment" : "user"; startCamera(); break;
            case "timer": {
                F.timer = { 0: 3, 3: 10, 10: 0 }[F.timer];
                el.querySelector("span").textContent = F.timer ? `${F.timer}s` : "uit";
                break;
            }
            case "geest": {
                F.geest = !F.geest;
                el.setAttribute("aria-pressed", String(F.geest));
                const g = document.getElementById("cam-geest");
                if (g) g.style.opacity = F.geest ? F.geestDekking : 0;
                break;
            }
            case "auto": autoUitlijnen(); break;
            case "bewaar": bewaar(); break;
            case "uitlijnen": openUitlijnenBestaand(el.dataset.datum); break;
            case "bekijk": openBekijk(el.dataset.datum); break;
            case "vorige": bladeren(-1); break;
            case "volgende": bladeren(1); break;
            case "verwijder": verwijder(); break;
            case "video": F.resultaat = null; openVideo(); break;
            case "video-optie": F.video[el.dataset.naam] = Number(el.dataset.waarde); tekenVideoKeuze(); break;
            case "render": renderVideo(); break;
            case "opnieuw": URL.revokeObjectURL(F.resultaat.url); F.resultaat = null; tekenVideoKeuze(); break;
            case "deel": if (F.resultaat) deel(F.resultaat.blob, F.resultaat.naam, "Mijn timelapse"); break;
            case "backup": F.resultaat = null; openBackup(); break;
            case "maak-backup": maakBackup(); break;
            case "deel-backup": if (F.resultaat) deel(F.resultaat.blob, F.resultaat.naam, "Gym Log foto's").then(backupGemaakt); break;
            case "gedownload": backupGemaakt(); break;
        }
    });

    document.addEventListener("change", (e) => {
        const el = e.target.closest("[data-foto-invoer]");
        if (!el) return;
        switch (el.dataset.fotoInvoer) {
            case "galerij": vanGalerij(el.files && el.files[0]); el.value = ""; break;
            case "zip": zetTerug(el.files && el.files[0]); el.value = ""; break;
            case "datum": if (F.uit && el.value) F.uit.datum = el.value > G().vandaag() ? G().vandaag() : el.value; break;
            case "tekst": F.video.tekst = el.checked; break;
        }
    });
    document.addEventListener("input", (e) => {
        const el = e.target.closest("[data-foto-invoer=dekking]");
        if (!el) return;
        F.geestDekking = Number(el.value) || 0.35;
        F.geest = Number(el.value) > 0;
        const g = document.getElementById("uit-geest");
        if (g) g.style.opacity = el.value;
    });
    document.addEventListener("keydown", (e) => {
        if (!F.laag) return;
        if (e.key === "Escape") sluitLaag();
        if (F.laag === "bekijk" && e.key === "ArrowLeft") bladeren(-1);
        if (F.laag === "bekijk" && e.key === "ArrowRight") bladeren(1);
    });
    // Camera uitzetten als de app naar de achtergrond gaat.
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden" && F.laag === "camera") stopCamera();
        else if (document.visibilityState === "visible" && F.laag === "camera" && !F.stream) startCamera();
    });

    window.GymFotos = { view, reset, laad, heeftVandaag, heeftFotos, openCamera, geladen: () => F.geladen };
})();
