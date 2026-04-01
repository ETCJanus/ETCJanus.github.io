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
    time_of_day text[] not null default array['anytime']::text[] check (
        cardinality(time_of_day) >= 1
        and time_of_day <@ array['anytime', 'morning', 'afternoon', 'evening', 'night']::text[]
        and (array_position(time_of_day, 'anytime') is null or cardinality(time_of_day) = 1)
    ),
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
alter table public.habits add column if not exists time_of_day text[];
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

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'habits'
          and column_name = 'time_of_day'
          and not (data_type = 'ARRAY' and udt_name = '_text')
    ) then
        alter table public.habits
            alter column time_of_day type text[]
            using case
                when time_of_day is null or btrim(time_of_day) = '' then array['anytime']::text[]
                when lower(time_of_day) = 'anytime' then array['anytime']::text[]
                when lower(time_of_day) in ('morning', 'afternoon', 'evening', 'night') then array[lower(time_of_day)]::text[]
                else array['anytime']::text[]
            end;
    end if;
end
$$;

update public.habits
set time_of_day = array['anytime']::text[]
where time_of_day is null or cardinality(time_of_day) = 0;

alter table public.habits
    alter column category set default 'focus';

alter table public.habits
    alter column time_of_day set default array['anytime']::text[];

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
    add constraint habits_time_of_day_check check (
        cardinality(time_of_day) >= 1
        and time_of_day <@ array['anytime', 'morning', 'afternoon', 'evening', 'night']::text[]
        and (array_position(time_of_day, 'anytime') is null or cardinality(time_of_day) = 1)
    );

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

create table if not exists public.sleep_logs (
    id uuid primary key default gen_random_uuid(),
    passcode_key text not null,
    log_date date not null,
    slept_at time not null,
    woke_at time not null,
    duration_minutes integer not null check (duration_minutes > 0 and duration_minutes <= 1440),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint sleep_logs_owner_date_unique unique (passcode_key, log_date)
);

alter table public.sleep_logs add column if not exists slept_at time;
alter table public.sleep_logs add column if not exists woke_at time;
alter table public.sleep_logs add column if not exists duration_minutes integer;

update public.sleep_logs
set duration_minutes = coalesce(
    duration_minutes,
    case
        when woke_at > slept_at then extract(epoch from (woke_at - slept_at)) / 60
        else extract(epoch from ((woke_at + interval '24 hours') - slept_at)) / 60
    end
)::integer
where duration_minutes is null and slept_at is not null and woke_at is not null;

alter table public.sleep_logs
    alter column duration_minutes set default 480;

alter table public.sleep_logs
    drop constraint if exists sleep_logs_duration_minutes_check;

alter table public.sleep_logs
    add constraint sleep_logs_duration_minutes_check check (duration_minutes > 0 and duration_minutes <= 1440);

create table if not exists public.daily_metrics (
    id uuid primary key default gen_random_uuid(),
    passcode_key text not null,
    metric_date date not null,
    sleep_hours numeric(4,2) null check (sleep_hours >= 0 and sleep_hours <= 24),
    sleep_quality integer null check (sleep_quality >= 1 and sleep_quality <= 5),
    mood_score integer null check (mood_score >= 1 and mood_score <= 10),
    energy_score integer null check (energy_score >= 1 and energy_score <= 10),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint daily_metrics_owner_date_unique unique (passcode_key, metric_date)
);

alter table public.daily_metrics add column if not exists sleep_hours numeric(4,2);
alter table public.daily_metrics add column if not exists sleep_quality integer;
alter table public.daily_metrics add column if not exists mood_score integer;
alter table public.daily_metrics add column if not exists energy_score integer;

alter table public.daily_metrics
    drop constraint if exists daily_metrics_sleep_hours_check;

alter table public.daily_metrics
    add constraint daily_metrics_sleep_hours_check check (sleep_hours is null or (sleep_hours >= 0 and sleep_hours <= 24));

alter table public.daily_metrics
    drop constraint if exists daily_metrics_sleep_quality_check;

alter table public.daily_metrics
    add constraint daily_metrics_sleep_quality_check check (sleep_quality is null or (sleep_quality >= 1 and sleep_quality <= 5));

alter table public.daily_metrics
    drop constraint if exists daily_metrics_mood_score_check;

alter table public.daily_metrics
    add constraint daily_metrics_mood_score_check check (mood_score is null or (mood_score >= 1 and mood_score <= 10));

alter table public.daily_metrics
    drop constraint if exists daily_metrics_energy_score_check;

alter table public.daily_metrics
    add constraint daily_metrics_energy_score_check check (energy_score is null or (energy_score >= 1 and energy_score <= 10));

create table if not exists public.quick_notes (
    id uuid primary key default gen_random_uuid(),
    passcode_key text not null,
    note_text text not null check (char_length(note_text) > 0 and char_length(note_text) <= 1000),
    source text not null default 'dashboard' check (source in ('dashboard', 'insights', 'other')),
    created_at timestamptz not null default timezone('utc', now())
);

alter table public.quick_notes add column if not exists source text;

update public.quick_notes
set source = coalesce(source, 'dashboard')
where source is null;

alter table public.quick_notes
    alter column source set default 'dashboard';

alter table public.quick_notes
    drop constraint if exists quick_notes_source_check;

alter table public.quick_notes
    add constraint quick_notes_source_check check (source in ('dashboard', 'insights', 'other'));

create index if not exists habits_lookup_idx on public.habits(passcode_key, category, tracking_method, archived, sort_order);
create index if not exists habit_logs_lookup_idx on public.habit_logs(passcode_key, log_date, event_type);
create index if not exists sleep_logs_lookup_idx on public.sleep_logs(passcode_key, log_date);
create index if not exists daily_metrics_lookup_idx on public.daily_metrics(passcode_key, metric_date);
create index if not exists quick_notes_lookup_idx on public.quick_notes(passcode_key, created_at);

alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
alter table public.sleep_logs enable row level security;
alter table public.daily_metrics enable row level security;
alter table public.quick_notes enable row level security;

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

drop policy if exists sleep_logs_select_open on public.sleep_logs;
create policy sleep_logs_select_open on public.sleep_logs for select using (true);

drop policy if exists sleep_logs_insert_open on public.sleep_logs;
create policy sleep_logs_insert_open on public.sleep_logs for insert with check (true);

drop policy if exists sleep_logs_update_open on public.sleep_logs;
create policy sleep_logs_update_open on public.sleep_logs for update using (true) with check (true);

drop policy if exists sleep_logs_delete_open on public.sleep_logs;
create policy sleep_logs_delete_open on public.sleep_logs for delete using (true);

drop policy if exists daily_metrics_select_open on public.daily_metrics;
create policy daily_metrics_select_open on public.daily_metrics for select using (true);

drop policy if exists daily_metrics_insert_open on public.daily_metrics;
create policy daily_metrics_insert_open on public.daily_metrics for insert with check (true);

drop policy if exists daily_metrics_update_open on public.daily_metrics;
create policy daily_metrics_update_open on public.daily_metrics for update using (true) with check (true);

drop policy if exists daily_metrics_delete_open on public.daily_metrics;
create policy daily_metrics_delete_open on public.daily_metrics for delete using (true);

drop policy if exists quick_notes_select_open on public.quick_notes;
create policy quick_notes_select_open on public.quick_notes for select using (true);

drop policy if exists quick_notes_insert_open on public.quick_notes;
create policy quick_notes_insert_open on public.quick_notes for insert with check (true);

drop policy if exists quick_notes_update_open on public.quick_notes;
create policy quick_notes_update_open on public.quick_notes for update using (true) with check (true);

drop policy if exists quick_notes_delete_open on public.quick_notes;
create policy quick_notes_delete_open on public.quick_notes for delete using (true);

revoke all on public.habits from anon;
revoke all on public.habit_logs from anon;
revoke all on public.sleep_logs from anon;
revoke all on public.daily_metrics from anon;
revoke all on public.quick_notes from anon;

grant select, insert, update, delete on public.habits to anon;
grant select, insert, update, delete on public.habit_logs to anon;
grant select, insert, update, delete on public.sleep_logs to anon;
grant select, insert, update, delete on public.daily_metrics to anon;
grant select, insert, update, delete on public.quick_notes to anon;
