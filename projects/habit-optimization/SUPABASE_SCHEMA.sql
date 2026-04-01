-- Habit schema for mixed habit types (Boolean + Duration)
-- This mode is intentionally lightweight and not secure auth.

create extension if not exists pgcrypto;

create table if not exists public.habits (
    id uuid primary key default gen_random_uuid(),
    passcode_key text not null,
    name text not null,
    habit_type text not null check (habit_type in ('boolean', 'duration')),
    target_amount numeric not null check (target_amount > 0),
    unit text not null,
    sort_order integer not null default 0,
    archived boolean not null default false,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.habit_logs (
    id uuid primary key default gen_random_uuid(),
    passcode_key text not null,
    habit_id uuid not null references public.habits(id) on delete cascade,
    log_date date not null,
    current_amount numeric not null default 0 check (current_amount >= 0),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint habit_logs_unique unique (passcode_key, habit_id, log_date)
);

create index if not exists habits_lookup_idx on public.habits(passcode_key, archived, sort_order);
create index if not exists habit_logs_lookup_idx on public.habit_logs(passcode_key, log_date);

alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;

-- Open policies for lightweight passcode-wall mode.
drop policy if exists habits_select_open on public.habits;
create policy habits_select_open on public.habits for select using (true);

drop policy if exists habits_insert_open on public.habits;
create policy habits_insert_open on public.habits for insert with check (true);

drop policy if exists habits_update_open on public.habits;
create policy habits_update_open on public.habits for update using (true) with check (true);

drop policy if exists habits_delete_open on public.habits;
create policy habits_delete_open on public.habits for delete using (true);

drop policy if exists habit_logs_select_open on public.habit_logs;
create policy habit_logs_select_open on public.habit_logs for select using (true);

drop policy if exists habit_logs_insert_open on public.habit_logs;
create policy habit_logs_insert_open on public.habit_logs for insert with check (true);

drop policy if exists habit_logs_update_open on public.habit_logs;
create policy habit_logs_update_open on public.habit_logs for update using (true) with check (true);

drop policy if exists habit_logs_delete_open on public.habit_logs;
create policy habit_logs_delete_open on public.habit_logs for delete using (true);

revoke all on public.habits from anon;
revoke all on public.habit_logs from anon;

grant select, insert, update, delete on public.habits to anon;
grant select, insert, update, delete on public.habit_logs to anon;
