-- GYM LOG — overstap naar eigen accounts (eenmalig, voor de installatie van vóór november 2026).
--
-- Volgorde:
--   1. Open de Gym Log, kies "Nog geen account? Maak er een" en maak je account aan.
--   2. Check hieronder het e-mailadres (regel met EIGENAAR). Al je bestaande data wordt van dat account.
--   3. Plak dit hele script in de Supabase SQL Editor en klik Run.
--
-- Veilig om opnieuw te draaien. Als het account nog niet bestaat stopt het script zonder iets te veranderen.

do $$
declare
    eigenaar uuid;
begin
    select id into eigenaar from auth.users
    where lower(email) = lower('etcjanus@gmail.com');   -- EIGENAAR: pas aan als je een ander adres gebruikte

    if eigenaar is null then
        raise exception 'Geen account met dit e-mailadres gevonden. Maak eerst in de app je account aan (of pas het adres in het script aan) en draai het daarna opnieuw.';
    end if;

    -- Elke rij krijgt een eigenaar. Nieuwe rijen krijgen automatisch de ingelogde gebruiker.
    alter table public.gym_oefeningen add column if not exists user_id uuid default auth.uid() references auth.users(id) on delete cascade;
    alter table public.gym_trainingen add column if not exists user_id uuid default auth.uid() references auth.users(id) on delete cascade;
    alter table public.gym_sets       add column if not exists user_id uuid default auth.uid() references auth.users(id) on delete cascade;
    alter table public.gym_gewicht    add column if not exists user_id uuid default auth.uid() references auth.users(id) on delete cascade;

    -- Alle bestaande data hoort bij jou.
    update public.gym_oefeningen set user_id = eigenaar where user_id is null;
    update public.gym_trainingen set user_id = eigenaar where user_id is null;
    update public.gym_sets       set user_id = eigenaar where user_id is null;
    update public.gym_gewicht    set user_id = eigenaar where user_id is null;

    -- Je oude weekdoel (+0,25 kg/week bulk) meenemen naar je account.
    update auth.users
    set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"doel_per_week": 0.25}'::jsonb
    where id = eigenaar and not (coalesce(raw_user_meta_data, '{}'::jsonb) ? 'doel_per_week');
end $$;

alter table public.gym_oefeningen alter column user_id set not null;
alter table public.gym_trainingen alter column user_id set not null;
alter table public.gym_sets       alter column user_id set not null;
alter table public.gym_gewicht    alter column user_id set not null;

-- Oefeningnamen zijn uniek per persoon (jullie mogen allebei een "Bench press" hebben).
alter table public.gym_oefeningen drop constraint if exists gym_oefeningen_naam_key;
alter table public.gym_oefeningen drop constraint if exists gym_oefeningen_user_naam_key;
alter table public.gym_oefeningen add constraint gym_oefeningen_user_naam_key unique (user_id, naam);

-- Weegschaal: een meting per dag per persoon (was: per dag).
alter table public.gym_gewicht drop constraint if exists gym_gewicht_pkey;
alter table public.gym_gewicht add column if not exists id uuid not null default gen_random_uuid();
alter table public.gym_gewicht add primary key (id);
alter table public.gym_gewicht drop constraint if exists gym_gewicht_user_datum_key;
alter table public.gym_gewicht add constraint gym_gewicht_user_datum_key unique (user_id, datum);

create index if not exists gym_oefeningen_user_idx on public.gym_oefeningen(user_id);
create index if not exists gym_trainingen_user_idx on public.gym_trainingen(user_id, datum);
create index if not exists gym_sets_user_idx on public.gym_sets(user_id);

-- Iedereen ziet en wijzigt alleen zijn eigen rijen. Dit dwingt de database af, niet de pagina.
drop policy if exists gym_oefeningen_open on public.gym_oefeningen;
drop policy if exists gym_trainingen_open on public.gym_trainingen;
drop policy if exists gym_sets_open on public.gym_sets;
drop policy if exists gym_gewicht_open on public.gym_gewicht;
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

-- Niet-ingelogde bezoekers kunnen niets meer.
revoke all on public.gym_oefeningen, public.gym_trainingen, public.gym_sets, public.gym_gewicht from anon;
grant select, insert, update, delete on public.gym_oefeningen, public.gym_trainingen, public.gym_sets, public.gym_gewicht to authenticated;
