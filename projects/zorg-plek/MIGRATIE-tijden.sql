-- ZORG PLEK — migratie van dagdelen naar tijden (van/tot).
-- Plak dit in de Supabase SQL Editor en klik Run. Veilig om vaker te draaien.
-- Bestaande dagdelen worden omgezet: ochtend = 09:00-12:00, middag = 12:00-17:00, avond = 17:00-21:00.

-- Beschikbaarheid
alter table public.zorgplek_beschikbaarheid
    add column if not exists van_tijd time,
    add column if not exists tot_tijd time;

do $$
begin
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'zorgplek_beschikbaarheid'
                 and column_name = 'dagdeel') then
        update public.zorgplek_beschikbaarheid set
            van_tijd = case dagdeel when 'ochtend' then time '09:00' when 'middag' then time '12:00' else time '17:00' end,
            tot_tijd = case dagdeel when 'ochtend' then time '12:00' when 'middag' then time '17:00' else time '21:00' end
        where van_tijd is null;

        alter table public.zorgplek_beschikbaarheid
            drop constraint if exists zorgplek_beschikbaarheid_persoon_id_datum_dagdeel_key;
        alter table public.zorgplek_beschikbaarheid drop column dagdeel;
    end if;
end $$;

alter table public.zorgplek_beschikbaarheid
    alter column van_tijd set not null,
    alter column tot_tijd set not null;

create unique index if not exists zorgplek_beschikbaarheid_uniek
    on public.zorgplek_beschikbaarheid (persoon_id, datum, van_tijd, tot_tijd);

-- Rooster
alter table public.zorgplek_rooster
    add column if not exists van_tijd time,
    add column if not exists tot_tijd time;

do $$
begin
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'zorgplek_rooster'
                 and column_name = 'dagdeel') then
        update public.zorgplek_rooster set
            van_tijd = case dagdeel when 'ochtend' then time '09:00' when 'middag' then time '12:00' else time '17:00' end,
            tot_tijd = case dagdeel when 'ochtend' then time '12:00' when 'middag' then time '17:00' else time '21:00' end
        where van_tijd is null;

        alter table public.zorgplek_rooster
            drop constraint if exists zorgplek_rooster_datum_dagdeel_persoon_id_key;
        alter table public.zorgplek_rooster drop column dagdeel;
    end if;
end $$;

alter table public.zorgplek_rooster
    alter column van_tijd set not null,
    alter column tot_tijd set not null;

create unique index if not exists zorgplek_rooster_uniek
    on public.zorgplek_rooster (datum, persoon_id, van_tijd, tot_tijd);
