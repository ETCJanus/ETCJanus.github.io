-- Phase 1 migration: upgrade habits.time_of_day from text to text[]
-- Supports multi-slot scheduling, e.g. ['morning', 'evening'].

begin;

-- Ensure old scalar values are converted to array values.
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
    alter column time_of_day set default array['anytime']::text[];

alter table public.habits
    drop constraint if exists habits_time_of_day_check;

alter table public.habits
    add constraint habits_time_of_day_check check (
        cardinality(time_of_day) >= 1
        and time_of_day <@ array['anytime', 'morning', 'afternoon', 'evening', 'night']::text[]
        and (array_position(time_of_day, 'anytime') is null or cardinality(time_of_day) = 1)
    );

commit;
