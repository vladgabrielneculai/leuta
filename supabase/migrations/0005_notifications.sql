-- Notificări: reminder zilnic și alerte pe Telegram, rezumate pe email, adăugare de cheltuieli din Telegram.

-- Când a fost introdusă o înregistrare (pentru „cheltuielile de azi” și rezumatul săptămânal).
-- Rândurile existente rămân fără dată; cele noi o primesc automat.
alter table entries add column created_at timestamptz default now();
create index if not exists idx_entries_created on entries(created_at);

-- Contul de Telegram legat de un utilizator (un chat ↔ un cont).
create table telegram_links (
  user_id integer primary key references users(id) on delete cascade,
  chat_id bigint not null unique,
  username text not null default '',
  linked_at timestamptz not null default now()
);

-- Ce s-a trimis deja (cron-ul poate rula de două ori; fiecare mesaj pleacă o singură dată).
create table notification_log (
  user_id integer not null references users(id) on delete cascade,
  kind text not null,          -- daily | loan_due | annual_ins | budget | weekly | monthly
  period_key text not null,    -- ex. 2026-10-05, 2026-W41, 2026-10:cat12:100
  channels text not null default '',
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, period_key)
);
create index on notification_log(sent_at);

do $$
declare t text;
begin
  foreach t in array array['telegram_links','notification_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to bp_app', t);
    execute format('create policy server_all on public.%I for all to bp_app using (true) with check (true)', t);
  end loop;
end $$;
