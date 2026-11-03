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

- **Training**: geef de training een naam (vrij te typen; eerder gebruikte namen staan als knopjes) en kies van welke eerdere training je de oefeningen wilt klaarzetten, of begin leeg. Standaard is dat de vorige training met dezelfde naam.
  Per oefening zie je wat je vorige keer deed en een **doel**: haal je bij alle sets de bovenkant van de rep-range,
  dan stelt hij voor het gewicht te verhogen; anders zelfde gewicht en +1 rep per set (double progression).
  De invoervelden staan al op het doel ingevuld, dus meestal is het alleen op "+ Set" tikken.
- **Gewicht**: een meting per dag, met 7-daags gemiddelde en trend in kg/week, vergeleken met `GYM_DOEL_PER_WEEK` in `config.js`.
- **Stats**: per oefening geschatte 1RM (Epley) en zwaarste gewicht over tijd, en sets per spiergroep per week.
- **Slecht bereik in de gym**: sets en metingen die niet verstuurd konden worden blijven lokaal bewaard en gaan vanzelf
  mee zodra er weer verbinding is (rechtsboven zie je hoeveel er wachten).

## Accounts

Iedereen logt in met een eigen e-mail en wachtwoord en blijft op dat apparaat ingelogd. De database zelf (row level security)
zorgt dat je alleen je eigen oefeningen, trainingen en metingen ziet, ook als iemand de pagina omzeilt.
Een nieuw account begint met de standaard oefeningen uit `config.js`. Het weekdoel voor lichaamsgewicht is per account
(Oefeningen > Account). Uitloggen staat daar ook.
