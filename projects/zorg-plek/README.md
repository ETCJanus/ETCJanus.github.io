# Zorg Plek

Gedeelde familiepagina om de zorg voor Wim en Willie te regelen: wie kan wanneer,
wie gaat wanneer (rooster in kalendervorm), en een gezamenlijke boodschappenlijst.

**Live:** `https://etcjanus.github.io/projects/zorg-plek/`

## Eenmalige setup (alleen jij)

1. Open het Supabase-dashboard van het bestaande project (zelfde als de habit tracker).
2. Nieuwe installatie: plak [`SETUP.sql`](SETUP.sql) in de **SQL Editor** en klik **Run**.
   Bestaande installatie met dagdelen (van vóór 2026-07-12): draai [`MIGRATIE-tijden.sql`](MIGRATIE-tijden.sql)
   — bestaande dagdelen worden omgezet naar tijden (ochtend 09:00–12:00, middag 12:00–17:00, avond 17:00–21:00).
   Bestaande installatie zonder takenlijst: draai daarna ook [`UPDATE-taken.sql`](UPDATE-taken.sql).
3. Open de pagina, kies "Ewoud" (staat al klaar als beheerder).
4. Laat je moeder zichzelf toevoegen via "Voeg mij toe", en vink haar daarna in het
   **⚙️ Beheer**-tabblad aan als "mag rooster maken".

## Hoe het werkt

- **Geen wachtwoorden.** Bij het eerste bezoek kies je wie je bent; een cookie onthoudt dat.
  Nieuwe familieleden voegen zichzelf toe met de knop "Voeg mij toe".
- **📅 Rooster** — een maandkalender: groene dagen zijn (deels) gevuld, met de namen in de vakjes.
  Klik op een dag voor de tijden. Beheerders kunnen in dat dagvenster mensen inplannen;
  wie beschikbaar is staat bovenaan de lijst met ✋ en hun tijden worden alvast ingevuld.
- **✋ Wanneer kan ik?** — zelfde kalender; klik op een dag en geef door van hoe laat tot hoe laat
  je kunt (meerdere tijdvakken per dag mag).
- **📋 Taken** — vaste takenlijst voor bij een bezoek. Iedereen kan hem bekijken;
  beheerders kunnen taken toevoegen, bewerken, verwijderen en met ▲▼ op volgorde zetten.
- **🛒 Boodschappen** — gedeelde lijst; aanklikken = gekocht.
- **⚙️ Beheer** (alleen beheerders) — beheerdersrechten geven/afnemen en personen verwijderen.

## Aanpassen

- Titel en ondertekst: bovenin [`config.js`](config.js).
- Tijdkeuzes lopen van 07:00 tot 22:00 in stappen van een half uur (`tijdOpties` in `script.js`).

## Let op

Net als de habit tracker gebruikt dit open tabellen met de publishable key: iedereen die de
link kent kan meedoen én gegevens aanpassen. Voor een besloten familiepagina is dat een
bewuste keuze — deel de link alleen binnen de familie en zet geen gevoelige informatie
(medische details, adressen) op de pagina.
