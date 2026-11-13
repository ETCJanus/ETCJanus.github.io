-- GYM LOG — kg/lb per oefening en vrienden (eenmalig, na MIGRATIE-accounts.sql).
-- Plak dit hele script in de Supabase SQL Editor en klik Run. Veilig om opnieuw te draaien.
--
-- Wat vrienden van elkaar kunnen zien, wordt hier door de database afgedwongen:
--   - je naam (die je zelf kiest),
--   - je gedeelde trainingen (datum, naam, aantal sets, duur) en records (oefening, gewicht, reps),
--   - je weekdoel (trainingen per week),
--   - reacties en berichtjes op die trainingen.
-- Je sets, lichaamsgewicht en foto's zijn nooit zichtbaar voor anderen.
-- Er wordt pas iets gedeeld als je in de app een naam voor vrienden kiest.

-- ---------- kg of lb per oefening (leeg = zoals je account) ----------
alter table public.gym_oefeningen add column if not exists eenheid text;
alter table public.gym_oefeningen drop constraint if exists gym_oefeningen_eenheid_check;
alter table public.gym_oefeningen add constraint gym_oefeningen_eenheid_check check (eenheid is null or eenheid in ('kg', 'lb'));

-- ---------- Profiel: de naam die vrienden zien, en je vriendcode ----------
create table if not exists public.gym_profielen (
    user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
    naam text not null check (char_length(btrim(naam)) between 1 and 40),
    vriendcode text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    doel_per_week integer check (doel_per_week is null or doel_per_week between 0 and 14),
    created_at timestamptz not null default timezone('utc', now())
);

-- ---------- Vriendschappen: twee rijen per vriendschap (a→b en b→a) ----------
create table if not exists public.gym_vrienden (
    user_id uuid not null references auth.users(id) on delete cascade,
    vriend_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default timezone('utc', now()),
    primary key (user_id, vriend_id),
    check (user_id <> vriend_id)
);

-- ---------- Gedeelde items: een training of een record ----------
-- id = id van de training (soort 'training') of van de set (soort 'record').
create table if not exists public.gym_feed (
    id uuid primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    soort text not null check (soort in ('training', 'record')),
    datum date not null,
    data jsonb not null default '{}'::jsonb,
    bijgewerkt timestamptz not null default timezone('utc', now())
);
create index if not exists gym_feed_user_datum_idx on public.gym_feed(user_id, datum desc);

-- ---------- Reacties (emoji) en korte berichtjes ----------
create table if not exists public.gym_reacties (
    id uuid primary key default gen_random_uuid(),
    feed_id uuid not null references public.gym_feed(id) on delete cascade,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    soort text not null check (soort in ('emoji', 'bericht')),
    tekst text not null check (char_length(btrim(tekst)) between 1 and 280),
    created_at timestamptz not null default timezone('utc', now())
);
create index if not exists gym_reacties_feed_idx on public.gym_reacties(feed_id);

-- ---------- Hulpfunctie: is iemand mijn vriend? ----------
create or replace function public.gym_is_vriend(ander uuid)
returns boolean language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.gym_vrienden v where v.user_id = auth.uid() and v.vriend_id = ander);
$$;

-- ---------- Rechten per rij ----------
alter table public.gym_profielen enable row level security;
alter table public.gym_vrienden enable row level security;
alter table public.gym_feed enable row level security;
alter table public.gym_reacties enable row level security;

drop policy if exists gym_profielen_lezen on public.gym_profielen;
drop policy if exists gym_profielen_eigen on public.gym_profielen;
drop policy if exists gym_profielen_wijzigen on public.gym_profielen;
create policy gym_profielen_lezen on public.gym_profielen for select to authenticated
    using (user_id = (select auth.uid()) or public.gym_is_vriend(user_id));
create policy gym_profielen_eigen on public.gym_profielen for insert to authenticated
    with check (user_id = (select auth.uid()));
create policy gym_profielen_wijzigen on public.gym_profielen for update to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Vriendschappen alleen lezen; toevoegen en verwijderen gaat via de functies hieronder.
drop policy if exists gym_vrienden_lezen on public.gym_vrienden;
create policy gym_vrienden_lezen on public.gym_vrienden for select to authenticated
    using (user_id = (select auth.uid()));

drop policy if exists gym_feed_lezen on public.gym_feed;
drop policy if exists gym_feed_eigen on public.gym_feed;
create policy gym_feed_lezen on public.gym_feed for select to authenticated
    using (user_id = (select auth.uid()) or public.gym_is_vriend(user_id));
create policy gym_feed_eigen on public.gym_feed for all to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Reacties: zichtbaar voor de eigenaar van de training, de schrijver, en vrienden van allebei.
drop policy if exists gym_reacties_lezen on public.gym_reacties;
drop policy if exists gym_reacties_plaatsen on public.gym_reacties;
drop policy if exists gym_reacties_weghalen on public.gym_reacties;
create policy gym_reacties_lezen on public.gym_reacties for select to authenticated
    using (
        user_id = (select auth.uid())
        or exists (
            select 1 from public.gym_feed f
            where f.id = feed_id
              and (f.user_id = (select auth.uid())
                   or (public.gym_is_vriend(f.user_id) and public.gym_is_vriend(gym_reacties.user_id)))
        )
    );
create policy gym_reacties_plaatsen on public.gym_reacties for insert to authenticated
    with check (
        user_id = (select auth.uid())
        and exists (
            select 1 from public.gym_feed f
            where f.id = feed_id and (f.user_id = (select auth.uid()) or public.gym_is_vriend(f.user_id))
        )
    );
create policy gym_reacties_weghalen on public.gym_reacties for delete to authenticated
    using (user_id = (select auth.uid()));

revoke all on public.gym_profielen, public.gym_vrienden, public.gym_feed, public.gym_reacties from anon;
-- Profielen: vrienden zien je naam en weekdoel, maar niet je vriendcode (die haal je zelf op via gym_mijn_code).
revoke all on public.gym_profielen from authenticated;
grant select (user_id, naam, doel_per_week, created_at) on public.gym_profielen to authenticated;
grant insert (naam, doel_per_week), update (naam, doel_per_week) on public.gym_profielen to authenticated;
grant select on public.gym_vrienden to authenticated;
grant select, insert, update, delete on public.gym_feed to authenticated;
grant select, insert, delete on public.gym_reacties to authenticated;

-- ---------- Vriend worden met een code ----------
create or replace function public.gym_word_vriend(code text)
returns table (id_vriend uuid, naam_vriend text)
language plpgsql security definer set search_path = public as $$
declare
    ik uuid := auth.uid();
    ander uuid;
begin
    if ik is null then raise exception 'Niet ingelogd'; end if;
    if not exists (select 1 from public.gym_profielen p where p.user_id = ik) then
        raise exception 'Kies eerst een naam voor vrienden';
    end if;
    select p.user_id into ander from public.gym_profielen p where p.vriendcode = upper(btrim(code));
    if ander is null then raise exception 'Onbekende vriendcode'; end if;
    if ander = ik then raise exception 'Dat is je eigen code'; end if;
    insert into public.gym_vrienden (user_id, vriend_id) values (ik, ander), (ander, ik) on conflict do nothing;
    return query select p.user_id, p.naam from public.gym_profielen p where p.user_id = ander;
end;
$$;

create or replace function public.gym_verwijder_vriend(ander uuid)
returns void language sql security definer set search_path = public as $$
    delete from public.gym_vrienden
    where (user_id = auth.uid() and vriend_id = ander) or (user_id = ander and vriend_id = auth.uid());
$$;

-- Je eigen vriendcode ophalen.
create or replace function public.gym_mijn_code()
returns text language sql stable security definer set search_path = public as $$
    select vriendcode from public.gym_profielen where user_id = auth.uid();
$$;

-- Nieuwe vriendcode als je oude ergens rondslingert (oude code werkt dan niet meer).
create or replace function public.gym_nieuwe_code()
returns text language sql security definer set search_path = public as $$
    update public.gym_profielen
    set vriendcode = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
    where user_id = auth.uid()
    returning vriendcode;
$$;

revoke all on function public.gym_is_vriend(uuid), public.gym_word_vriend(text), public.gym_verwijder_vriend(uuid), public.gym_nieuwe_code(), public.gym_mijn_code() from public, anon;
grant execute on function public.gym_is_vriend(uuid), public.gym_word_vriend(text), public.gym_verwijder_vriend(uuid), public.gym_nieuwe_code(), public.gym_mijn_code() to authenticated;
