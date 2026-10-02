-- Multi-user: every financial row belongs to a user; Postgres row-level security enforces it.
--
-- How it works: for each request the server opens a transaction and runs
--   select set_config('app.user_id', '<id>', true)
-- RLS policies on the user tables only expose rows where user_id matches, and the user_id column
-- defaults to the same setting, so INSERTs need no code change. Without app.user_id set (e.g. the
-- login/session code), user tables are simply invisible and inserts fail (user_id NOT NULL).
-- Shared tables (exchange rates, inflation, users, sessions, login throttle, system settings)
-- stay readable/writable by the server role.

-- The app role must no longer bypass RLS.
alter role bp_app nobypassrls;

-- Owner of the existing data = the first (and so far only) account.
do $$
declare
  owner_id integer := (select min(id) from users);
  t text;
begin
  foreach t in array array['categories','goals','investments','entries','investment_values',
                           'loans','loan_prepayments','loan_schedules','planned_purchases']
  loop
    execute format('alter table public.%I add column user_id integer references users(id) on delete cascade', t);
    if owner_id is not null then
      execute format('update public.%I set user_id = %s', t, owner_id);
    end if;
    execute format('alter table public.%I alter column user_id set default nullif(current_setting(''app.user_id'', true), '''')::integer', t);
    execute format('alter table public.%I alter column user_id set not null', t);
    execute format('create index on public.%I (user_id)', t);
    execute format(
      'create policy own_rows on public.%I for all to bp_app
         using (user_id = nullif(current_setting(''app.user_id'', true), '''')::integer)
         with check (user_id = nullif(current_setting(''app.user_id'', true), '''')::integer)', t);
  end loop;
end $$;

-- Category names are unique per user now (not globally).
drop index if exists idx_categories_unique_name;
create unique index idx_categories_unique_name on categories (user_id, lower(trim(name)));

-- User preferences move to their own table; `settings` keeps only system keys
-- (BNR/Eurostat fetch bookkeeping) shared by everyone.
create table user_settings (
  user_id integer not null default nullif(current_setting('app.user_id', true), '')::integer
          references users(id) on delete cascade,
  key text not null,
  value text not null,
  primary key (user_id, key)
);
alter table user_settings enable row level security;
revoke all on user_settings from anon, authenticated;
grant select, insert, update, delete on user_settings to bp_app;
create policy own_rows on user_settings for all to bp_app
  using (user_id = nullif(current_setting('app.user_id', true), '')::integer)
  with check (user_id = nullif(current_setting('app.user_id', true), '')::integer);

insert into user_settings (user_id, key, value)
select (select min(id) from users), key, value from settings
where key !~ '^(fx_|inflation_last_|inflation_source)' and exists (select 1 from users);
delete from settings where key !~ '^(fx_|inflation_last_|inflation_source)';

-- Shared tables: the server role may use them freely (RLS stays on so the public API sees nothing).
do $$
declare t text;
begin
  foreach t in array array['settings','fx_rates','inflation_rates','users','sessions','login_attempts']
  loop
    execute format('create policy server_all on public.%I for all to bp_app using (true) with check (true)', t);
  end loop;
end $$;
