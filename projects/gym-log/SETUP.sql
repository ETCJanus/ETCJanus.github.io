-- GYM LOG — setup voor een nieuwe installatie (met accounts).
-- Plak dit hele script in de Supabase SQL Editor en klik Run.
-- Had je de Gym Log al vóór november 2026? Gebruik dan MIGRATIE-accounts.sql in plaats van dit script.
--
-- Iedereen logt in met een eigen account (Supabase Auth) en ziet alleen zijn eigen data.
-- Nieuwe accounts krijgen bij de eerste keer inloggen de standaard oefeningen uit config.js.

create extension if not exists pgcrypto;

-- Oefeningen met hun rep-range. De rep-range stuurt het "doel" (double progression):
-- haal je bij alle sets rep_max, dan gaat het gewicht omhoog met stap_kg.
create table if not exists public.gym_oefeningen (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    naam text not null,
    spiergroep text not null default 'overig',
    rep_min integer not null default 6,
    rep_max integer not null default 10,
    stap_kg numeric not null default 2.5,
    gearchiveerd boolean not null default false,
    created_at timestamptz not null default timezone('utc', now()),
    constraint gym_oefeningen_user_naam_key unique (user_id, naam)
);

-- Een training = een gymsessie op een dag, met optioneel label ("Push", "Legs", ...).
create table if not exists public.gym_trainingen (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    datum date not null,
    label text,
    notitie text,
    created_at timestamptz not null default timezone('utc', now())
);

-- Een rij = een set. id wordt in de browser gemaakt, zodat sets die offline gelogd zijn
-- later veilig opnieuw verstuurd kunnen worden zonder dubbele rijen.
create table if not exists public.gym_sets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    training_id uuid not null references public.gym_trainingen(id) on delete cascade,
    oefening_id uuid not null references public.gym_oefeningen(id) on delete cascade,
    set_nr integer not null default 1,
    gewicht numeric not null default 0,
    reps integer not null,
    rpe numeric,
    created_at timestamptz not null default timezone('utc', now())
);

-- Weegschaal: een meting per dag per persoon (opnieuw invullen overschrijft).
create table if not exists public.gym_gewicht (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    datum date not null,
    kg numeric not null,
    notitie text,
    created_at timestamptz not null default timezone('utc', now()),
    constraint gym_gewicht_user_datum_key unique (user_id, datum)
);

create index if not exists gym_oefeningen_user_idx on public.gym_oefeningen(user_id);
create index if not exists gym_trainingen_user_idx on public.gym_trainingen(user_id, datum);
create index if not exists gym_sets_user_idx on public.gym_sets(user_id);
create index if not exists gym_sets_training_idx on public.gym_sets(training_id);
create index if not exists gym_sets_oefening_idx on public.gym_sets(oefening_id, created_at);

-- Iedereen ziet en wijzigt alleen zijn eigen rijen.
alter table public.gym_oefeningen enable row level security;
alter table public.gym_trainingen enable row level security;
alter table public.gym_sets enable row level security;
alter table public.gym_gewicht enable row level security;

drop policy if exists gym_oefeningen_eigen on public.gym_oefeningen;
drop policy if exists gym_trainingen_eigen on public.gym_trainingen;
drop policy if exists gym_sets_eigen on public.gym_sets;
drop policy if exists gym_gewicht_eigen on public.gym_gewicht;
create policy gym_oefeningen_eigen on public.gym_oefeningen for all to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy gym_trainingen_eigen on public.gym_trainingen for all to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy gym_sets_eigen on public.gym_sets for all to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy gym_gewicht_eigen on public.gym_gewicht for all to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.gym_oefeningen, public.gym_trainingen, public.gym_sets, public.gym_gewicht from anon;
grant select, insert, update, delete on public.gym_oefeningen, public.gym_trainingen, public.gym_sets, public.gym_gewicht to authenticated;
