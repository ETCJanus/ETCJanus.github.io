# Gym Log

Persoonlijk trainingslogboek: sets, reps en gewicht per oefening, dagelijkse weegschaal check-in en stats.

**Live:** `https://etcjanus.github.io/projects/gym-log/`

## Eenmalige setup

**Nieuwe installatie:** plak [`SETUP.sql`](SETUP.sql) in de Supabase **SQL Editor** en klik **Run**.

**Bestaande installatie (van vóór de accounts):**
1. Open de Gym Log, kies "Nog geen account? Maak er een" en maak je account aan.
2. Check het e-mailadres in [`MIGRATIE-accounts.sql`](MIGRATIE-accounts.sql), plak het in de SQL Editor en klik **Run**.
   Al je bestaande data wordt dan van jouw account. Zonder account stopt het script zonder iets te veranderen.

**Supabase Auth instellen** (Authentication in het dashboard):
- Makkelijkst: zet **Confirm email** uit (Sign In / Providers > Email). Dan werkt een nieuw account meteen.
- Laat je het aan, zet dan `https://etcjanus.github.io/projects/gym-log/` bij **URL Configuration > Redirect URLs**,
  anders stuurt de bevestigingslink je naar de verkeerde pagina.
- Heeft iedereen die je wilt een account? Dan kun je **Allow new users to sign up** uitzetten.

## Hoe het werkt

- **Training**: bovenaan zie je je week (welke dagen je trainde). Eerder gedane trainingen start je opnieuw met één tik, met dezelfde oefeningen klaar. "Andere training" voor een nieuwe naam of een training op een andere dag.
  Alleen de oefening waar je mee bezig bent staat open, met wat je vorige keer deed en een **doel** (double progression:
  haal je bij alle sets de bovenkant van de rep-range, dan gaat het gewicht omhoog; anders +1 rep per set).
  Elke set laat zien of hij beter was dan dezelfde set vorige keer; een nieuw record krijgt een PR-stempel.
  Na je laatste geplande set gaat de volgende oefening vanzelf open. Rusttimer en trainingsduur staan in de kop.
  Oefening toevoegen gaat via een zoekpaneel (recent eerst, dan per spiergroep). "Training afronden" geeft een samenvatting.
- **Lichaam > Foto's**: dagelijkse progressiefoto. De camera opent in de app met je vorige foto doorzichtig erover
  (zelfontspanner 3 of 10 s, voor- of achtercamera, of kies uit je galerij). Daarna lijnt de app de foto automatisch uit:
  schouders en heupen worden herkend (MediaPipe Pose, draait op je telefoon) en op twee vaste lijnen gezet. Bijstellen met
  slepen, knijpen en draaien. Van alle foto's maak je een timelapse (mp4, met datum en gewicht in beeld) om te delen of op te slaan.
  **Foto's staan alleen op het apparaat** (IndexedDB, per account) en gaan nooit naar Supabase. Maak daarom af en toe
  een back-up (zip, via delen of downloaden); die zet je ook weer terug. De app herinnert je eraan na 30 dagen.
- **Lichaam > Gewicht**: een meting per dag, met 7-daags gemiddelde, trend per week vergeleken met je weekdoel, en een grafiek.
- **Stats**: sets per spiergroep per week, en per oefening een minigrafiek en groei over ~4 weken. Tik voor details.
  Oefeningen zonder extra gewicht (pull-ups) worden in reps gemeten in plaats van geschatte 1RM.
- **Historie**: per week, tik op een training voor de samenvatting, aanpassen of verwijderen.
- Een set, meting of training verwijderen kun je ongedaan maken via de melding onderin.
- **Slecht bereik in de gym**: sets en metingen die niet verstuurd konden worden blijven lokaal bewaard en gaan vanzelf
  mee zodra er weer verbinding is (rechtsboven zie je hoeveel er wachten).

Spiergroepen hebben de kleuren van wedstrijdschijven: benen rood, rug blauw, borst geel, schouders groen, armen wit.

## Accounts

Iedereen logt in met een eigen e-mail en wachtwoord en blijft op dat apparaat ingelogd. De database zelf (row level security)
zorgt dat je alleen je eigen oefeningen, trainingen en metingen ziet, ook als iemand de pagina omzeilt.
Een nieuw account begint met de standaard oefeningen uit `config.js`. Het weekdoel voor lichaamsgewicht is per account
(Oefeningen > Account). Uitloggen staat daar ook.
