-- Facturi și costuri periodice (funcționalitate în beta), pe programările din 0012_scheduled_entries.sql:
-- frecvența trimestrială și un memento cu câteva zile înainte de scadență.
-- Producția nu folosește tabelul scheduled_entries, deci schimbarea nu o atinge.

-- Trimestrial: month_of_year = o lună din ciclu (ex. 3 → martie, iunie, septembrie, decembrie).
alter table scheduled_entries drop constraint if exists scheduled_entries_frequency_check;
alter table scheduled_entries add constraint scheduled_entries_frequency_check
  check (frequency in ('monthly', 'quarterly', 'yearly'));

-- Cu câte zile înainte de scadență vine mementoul (Telegram / email); gol = fără memento.
alter table scheduled_entries add column if not exists remind_days integer check (remind_days between 0 and 30);

-- Revenire (întâi șterge sau transformă programările trimestriale, altfel regula veche nu se poate pune):
--   alter table scheduled_entries drop column remind_days;
--   alter table scheduled_entries drop constraint scheduled_entries_frequency_check;
--   alter table scheduled_entries add constraint scheduled_entries_frequency_check check (frequency in ('monthly', 'yearly'));
