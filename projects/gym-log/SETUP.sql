-- GYM LOG — eenmalige setup.
-- Plak dit hele script in de Supabase SQL Editor (zelfde project als de habit tracker) en klik Run.
-- Veilig om opnieuw te draaien: bestaande tabellen en data blijven staan.

create extension if not exists pgcrypto;

-- Oefeningen met hun rep-range. De rep-range stuurt het "doel" (double progression):
-- haal je bij alle sets rep_max, dan gaat het gewicht omhoog met stap_kg.
create table if not exists public.gym_oefeningen (
    id uuid primary key default gen_random_uuid(),
    naam text not null unique,
    spiergroep text not null default 'overig',
    rep_min integer not null default 6,
    rep_max integer not null default 10,
    stap_kg numeric not null default 2.5,
    gearchiveerd boolean not null default false,
    created_at timestamptz not null default timezone('utc', now())
);

-- Een training = een gymsessie op een dag, met optioneel label ("Push", "Legs", ...).
create table if not exists public.gym_trainingen (
    id uuid primary key default gen_random_uuid(),
    datum date not null,
    label text,
    notitie text,
    created_at timestamptz not null default timezone('utc', now())
);

-- Een rij = een set. id wordt in de browser gemaakt, zodat sets die offline gelogd zijn
-- later veilig opnieuw verstuurd kunnen worden zonder dubbele rijen.
create table if not exists public.gym_sets (
    id uuid primary key default gen_random_uuid(),
    training_id uuid not null references public.gym_trainingen(id) on delete cascade,
    oefening_id uuid not null references public.gym_oefeningen(id) on delete cascade,
    set_nr integer not null default 1,
    gewicht numeric not null default 0,
    reps integer not null,
    rpe numeric,
    created_at timestamptz not null default timezone('utc', now())
);

-- Weegschaal: een meting per dag (opnieuw invullen overschrijft).
create table if not exists public.gym_gewicht (
    datum date primary key,
    kg numeric not null,
    notitie text,
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists gym_trainingen_datum_idx on public.gym_trainingen(datum);
create index if not exists gym_sets_training_idx on public.gym_sets(training_id);
create index if not exists gym_sets_oefening_idx on public.gym_sets(oefening_id, created_at);

-- Zelfde open model als de habit tracker: de anon key mag lezen en schrijven.
alter table public.gym_oefeningen enable row level security;
alter table public.gym_trainingen enable row level security;
alter table public.gym_sets enable row level security;
alter table public.gym_gewicht enable row level security;

drop policy if exists gym_oefeningen_open on public.gym_oefeningen;
drop policy if exists gym_trainingen_open on public.gym_trainingen;
drop policy if exists gym_sets_open on public.gym_sets;
drop policy if exists gym_gewicht_open on public.gym_gewicht;
create policy gym_oefeningen_open on public.gym_oefeningen for all using (true) with check (true);
create policy gym_trainingen_open on public.gym_trainingen for all using (true) with check (true);
create policy gym_sets_open on public.gym_sets for all using (true) with check (true);
create policy gym_gewicht_open on public.gym_gewicht for all using (true) with check (true);

grant usage on schema public to anon;
grant all on public.gym_oefeningen to anon;
grant all on public.gym_trainingen to anon;
grant all on public.gym_sets to anon;
grant all on public.gym_gewicht to anon;

-- Een paar standaard oefeningen om mee te beginnen. Pas aan of archiveer in de app.
insert into public.gym_oefeningen (naam, spiergroep, rep_min, rep_max, stap_kg) values
    ('Bench press', 'borst', 6, 10, 2.5),
    ('Incline dumbbell press', 'borst', 8, 12, 2),
    ('Overhead press', 'schouders', 6, 10, 2.5),
    ('Lateral raise', 'schouders', 12, 20, 1),
    ('Pull-up', 'rug', 6, 12, 2.5),
    ('Barbell row', 'rug', 6, 10, 2.5),
    ('Lat pulldown', 'rug', 8, 12, 5),
    ('Squat', 'benen', 5, 8, 2.5),
    ('Romanian deadlift', 'benen', 6, 10, 5),
    ('Leg press', 'benen', 8, 15, 10),
    ('Bicep curl', 'armen', 8, 12, 1),
    ('Tricep pushdown', 'armen', 10, 15, 2.5)
on conflict (naam) do nothing;
