# Gym Log

Persoonlijk trainingslogboek: sets, reps en gewicht per oefening, dagelijkse weegschaal check-in en stats.

**Live:** `https://etcjanus.github.io/projects/gym-log/`

## Eenmalige setup

1. Open het Supabase-dashboard (zelfde project als de habit tracker en Zorg Plek).
2. Plak [`SETUP.sql`](SETUP.sql) in de **SQL Editor** en klik **Run**. Dit maakt de `gym_`-tabellen en een paar standaard oefeningen.
3. Open de pagina op je telefoon, vul de code in (zie `config.js`) en zet hem op je beginscherm.

## Hoe het werkt

- **Training**: geef de training een naam (vrij te typen; eerder gebruikte namen staan als knopjes) en kies van welke eerdere training je de oefeningen wilt klaarzetten, of begin leeg. Standaard is dat de vorige training met dezelfde naam.
  Per oefening zie je wat je vorige keer deed en een **doel**: haal je bij alle sets de bovenkant van de rep-range,
  dan stelt hij voor het gewicht te verhogen; anders zelfde gewicht en +1 rep per set (double progression).
  De invoervelden staan al op het doel ingevuld, dus meestal is het alleen op "+ Set" tikken.
- **Gewicht**: een meting per dag, met 7-daags gemiddelde en trend in kg/week, vergeleken met `GYM_DOEL_PER_WEEK` in `config.js`.
- **Stats**: per oefening geschatte 1RM (Epley) en zwaarste gewicht over tijd, en sets per spiergroep per week.
- **Slecht bereik in de gym**: sets en metingen die niet verstuurd konden worden blijven lokaal bewaard en gaan vanzelf
  mee zodra er weer verbinding is (rechtsboven zie je hoeveel er wachten).

Net als de andere tools is de "code" alleen een drempel, geen echte beveiliging: de tabellen staan open voor de anon key.
