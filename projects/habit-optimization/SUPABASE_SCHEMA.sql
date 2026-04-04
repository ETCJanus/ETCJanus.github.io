-- V3: Ultra Simplified Habit Grid Schema
-- Run this entire script in your Supabase SQL Editor to wipe the old setup and start fresh.

-- 1. DROP old unused tables
drop table if exists public.sleep_logs cascade;
drop table if exists public.daily_metrics cascade;
drop table if exists public.quick_notes cascade;

-- 2. DROP and RECREATE the main tables for a true fresh start
drop table if exists public.habit_logs cascade;
drop table if exists public.habits cascade;

create extension if not exists pgcrypto;

-- Simple Habits Table
create table public.habits (
    id uuid primary key default gen_random_uuid(),
    passcode_key text not null,
    name text not null,
    target_amount numeric not null default 1,
    sort_order integer not null default 0,
    archived boolean not null default false,
    created_at timestamptz not null default timezone('utc', now())
);

-- Simple Logs Table (Combines notes and habit completions)
create table public.habit_logs (
    id uuid primary key default gen_random_uuid(),
    passcode_key text not null,
    habit_id uuid references public.habits(id) on delete cascade null,
    log_date date not null,
    event_type text not null default 'progress',
    current_amount numeric not null default 0,
    amount_delta numeric not null default 0,
    metadata jsonb null,
    created_at timestamptz not null default timezone('utc', now()),
    constraint habit_logs_unique unique (passcode_key, habit_id, log_date, event_type)
);

-- Indexes for fast querying
create index habits_passcode_idx on public.habits(passcode_key, archived);
create index habit_logs_passcode_idx on public.habit_logs(passcode_key, log_date);

-- RLS Policies (Security via your simple passcode)
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;

create policy habits_open on public.habits for all using (true) with check (true);
create policy habit_logs_open on public.habit_logs for all using (true) with check (true);

-- Grants to allow the javascript client to query
grant usage on schema public to anon;
grant all on public.habits to anon;
grant all on public.habit_logs to anon;
