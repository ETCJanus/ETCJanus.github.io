-- Schema v2: Focus Dashboard + Vice Tracker
-- Lightweight passcode-wall mode (not secure authentication)

create extension if not exists pgcrypto;

create table if not exists public.habits (
    id uuid primary key default gen_random_uuid(),
    passcode_key text not null,
    name text not null,
    category text not null default 'focus' check (category in ('focus', 'vice')),
    habit_type text not null check (habit_type in ('boolean', 'duration')),
    tracking_method text null check (tracking_method in ('streak', 'budget')),
    time_of_day text not null default 'anytime' check (time_of_day in ('anytime', 'morning', 'afternoon', 'evening', 'night')),
    target_amount numeric not null check (target_amount > 0),
    unit text not null,
    initial_limit numeric null,
    current_limit numeric null,
    goal_limit numeric null,
    taper_rate text null,
    taper_step_amount numeric null,
    taper_interval_days integer null,
    taper_started_at timestamptz null,
    taper_last_applied_at timestamptz null,
    sort_order integer not null default 0,
    archived boolean not null default false,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint vice_method_requires_category check (
        tracking_method is null or category = 'vice'
    )
);

-- Migration-safe column adds for existing tables.
alter table public.habits add column if not exists category text;
alter table public.habits add column if not exists tracking_method text;
alter table public.habits add column if not exists time_of_day text;
alter table public.habits add column if not exists initial_limit numeric;
alter table public.habits add column if not exists current_limit numeric;
alter table public.habits add column if not exists goal_limit numeric;
alter table public.habits add column if not exists taper_rate text;
alter table public.habits add column if not exists taper_step_amount numeric;
alter table public.habits add column if not exists taper_interval_days integer;
alter table public.habits add column if not exists taper_started_at timestamptz;
alter table public.habits add column if not exists taper_last_applied_at timestamptz;

update public.habits
set category = coalesce(category, 'focus')
where category is null;

update public.habits
set time_of_day = coalesce(time_of_day, 'anytime')
where time_of_day is null;

alter table public.habits
    alter column category set default 'focus';

alter table public.habits
    alter column time_of_day set default 'anytime';

alter table public.habits
    drop constraint if exists habits_category_check;

alter table public.habits
    add constraint habits_category_check check (category in ('focus', 'vice'));

alter table public.habits
    drop constraint if exists habits_tracking_method_check;

alter table public.habits
    add constraint habits_tracking_method_check check (tracking_method is null or tracking_method in ('streak', 'budget'));

alter table public.habits
    drop constraint if exists habits_time_of_day_check;

alter table public.habits
    add constraint habits_time_of_day_check check (time_of_day in ('anytime', 'morning', 'afternoon', 'evening', 'night'));

alter table public.habits
    drop constraint if exists vice_method_requires_category;

alter table public.habits
    add constraint vice_method_requires_category check (tracking_method is null or category = 'vice');

create table if not exists public.habit_logs (
    id uuid primary key default gen_random_uuid(),
    passcode_key text not null,
    habit_id uuid null references public.habits(id) on delete cascade,
    log_date date not null,
    event_type text not null default 'progress' check (
        event_type in (
            'progress',
            'count_increment',
            'duration_add',
            'vice_budget_add',
            'vice_streak_reset',
            'craving_defeated',
            'note'
        )
    ),
    amount_delta numeric not null default 0,
    current_amount numeric not null default 0 check (current_amount >= 0),
    metadata jsonb null,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint habit_logs_unique unique (passcode_key, habit_id, log_date, event_type)
);

alter table public.habit_logs add column if not exists event_type text;
alter table public.habit_logs add column if not exists amount_delta numeric;
alter table public.habit_logs add column if not exists metadata jsonb;

update public.habit_logs
set event_type = coalesce(event_type, 'progress');

update public.habit_logs
set amount_delta = coalesce(amount_delta, 0);

alter table public.habit_logs
    alter column event_type set default 'progress';

alter table public.habit_logs
    alter column amount_delta set default 0;

alter table public.habit_logs
    alter column habit_id drop not null;

alter table public.habit_logs
    drop constraint if exists habit_logs_unique;

alter table public.habit_logs
    drop constraint if exists habit_logs_owner_habit_date_uniq;

alter table public.habit_logs
    add constraint habit_logs_unique unique (passcode_key, habit_id, log_date, event_type);

alter table public.habit_logs
    drop constraint if exists habit_logs_event_type_check;

alter table public.habit_logs
    add constraint habit_logs_event_type_check check (
        event_type in (
            'progress',
            'count_increment',
            'duration_add',
            'vice_budget_add',
            'vice_streak_reset',
            'craving_defeated',
            'note'
        )
    );

create index if not exists habits_lookup_idx on public.habits(passcode_key, category, tracking_method, archived, sort_order);
create index if not exists habit_logs_lookup_idx on public.habit_logs(passcode_key, log_date, event_type);

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
