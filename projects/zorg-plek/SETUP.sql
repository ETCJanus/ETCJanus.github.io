-- ZORG PLEK — eenmalige setup.
-- Plak dit hele script in de Supabase SQL Editor (zelfde project als de habit tracker) en klik Run.
-- Veilig om opnieuw te draaien: bestaande tabellen blijven staan.

create extension if not exists pgcrypto;

-- Familieleden. Geen wachtwoorden: mensen kiezen zelf wie ze zijn.
create table if not exists public.zorgplek_personen (
    id uuid primary key default gen_random_uuid(),
    naam text not null unique,
    is_beheerder boolean not null default false,
    created_at timestamptz not null default timezone('utc', now())
);

-- Beschikbaarheid: een rij = "deze persoon kan op deze datum van/tot deze tijd".
create table if not exists public.zorgplek_beschikbaarheid (
    id uuid primary key default gen_random_uuid(),
    persoon_id uuid not null references public.zorgplek_personen(id) on delete cascade,
    datum date not null,
    van_tijd time not null,
    tot_tijd time not null,
    created_at timestamptz not null default timezone('utc', now()),
    unique (persoon_id, datum, van_tijd, tot_tijd)
);

-- Rooster: een rij = "deze persoon gaat op deze datum van/tot deze tijd".
create table if not exists public.zorgplek_rooster (
    id uuid primary key default gen_random_uuid(),
    datum date not null,
    persoon_id uuid not null references public.zorgplek_personen(id) on delete cascade,
    van_tijd time not null,
    tot_tijd time not null,
    notitie text,
    created_at timestamptz not null default timezone('utc', now()),
    unique (datum, persoon_id, van_tijd, tot_tijd)
);

-- Gedeelde boodschappenlijst.
create table if not exists public.zorgplek_boodschappen (
    id uuid primary key default gen_random_uuid(),
    tekst text not null,
    afgevinkt boolean not null default false,
    toegevoegd_door uuid references public.zorgplek_personen(id) on delete set null,
    created_at timestamptz not null default timezone('utc', now())
);

-- Dagschema voor Wim en Willie (alleen zichtbaar voor beheerders).
create table if not exists public.zorgplek_taken (
    id uuid primary key default gen_random_uuid(),
    tijd time not null default '09:00',
    tekst text not null,
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists zorgplek_beschikbaarheid_datum_idx on public.zorgplek_beschikbaarheid(datum);
create index if not exists zorgplek_rooster_datum_idx on public.zorgplek_rooster(datum);

-- Open toegang via de publishable key (zelfde model als de habit tracker).
alter table public.zorgplek_personen enable row level security;
alter table public.zorgplek_beschikbaarheid enable row level security;
alter table public.zorgplek_rooster enable row level security;
alter table public.zorgplek_boodschappen enable row level security;
alter table public.zorgplek_taken enable row level security;

drop policy if exists zorgplek_personen_open on public.zorgplek_personen;
drop policy if exists zorgplek_beschikbaarheid_open on public.zorgplek_beschikbaarheid;
drop policy if exists zorgplek_rooster_open on public.zorgplek_rooster;
drop policy if exists zorgplek_boodschappen_open on public.zorgplek_boodschappen;
drop policy if exists zorgplek_taken_open on public.zorgplek_taken;

create policy zorgplek_personen_open on public.zorgplek_personen for all using (true) with check (true);
create policy zorgplek_beschikbaarheid_open on public.zorgplek_beschikbaarheid for all using (true) with check (true);
create policy zorgplek_rooster_open on public.zorgplek_rooster for all using (true) with check (true);
create policy zorgplek_boodschappen_open on public.zorgplek_boodschappen for all using (true) with check (true);
create policy zorgplek_taken_open on public.zorgplek_taken for all using (true) with check (true);

grant usage on schema public to anon;
grant all on public.zorgplek_personen to anon;
grant all on public.zorgplek_beschikbaarheid to anon;
grant all on public.zorgplek_rooster to anon;
grant all on public.zorgplek_boodschappen to anon;
grant all on public.zorgplek_taken to anon;

-- Eerste beheerder. Voeg je moeder toe via het Beheer-tabblad op de pagina zelf,
-- of pas deze regel aan.
insert into public.zorgplek_personen (naam, is_beheerder)
values ('Ewoud', true)
on conflict (naam) do update set is_beheerder = true;
