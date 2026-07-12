-- ZORG PLEK — dagschema (takenlijst met tijden) toevoegen.
-- Plak dit in de Supabase SQL Editor en klik Run. Veilig om vaker te draaien.

create table if not exists public.zorgplek_taken (
    id uuid primary key default gen_random_uuid(),
    tijd time not null default '09:00',
    tekst text not null,
    created_at timestamptz not null default timezone('utc', now())
);

-- Voor wie de eerdere versie (zonder tijd) al had aangemaakt:
alter table public.zorgplek_taken add column if not exists tijd time not null default '09:00';

alter table public.zorgplek_taken enable row level security;

drop policy if exists zorgplek_taken_open on public.zorgplek_taken;
create policy zorgplek_taken_open on public.zorgplek_taken for all using (true) with check (true);

grant all on public.zorgplek_taken to anon;
