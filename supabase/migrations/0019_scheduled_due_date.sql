-- Intrările din programări se deosebesc după data scadenței, nu după lună.
--
-- Cu luna de buget de la salariu la salariu, o plată programată intră în luna salariului din care se plătește,
-- iar o lună de buget de 32–33 de zile poate cuprinde două scadențe ale aceleiași programări (ex. salariul pe 5,
-- plata pe 4: luna decembrie ține de vineri 4 dec până pe 4 ian). Indexul vechi, pe (programare, lună), ar fi
-- aruncat a doua plată. Cheia devine data scadenței.
--
-- Compatibil cu producția: coloana e opțională, nimic nu se șterge, iar intrările din programări se creează
-- doar pe beta (materializeDue nu rulează în producție), deci nimic din producție nu folosește indexul vechi.

alter table entries add column if not exists due_date date;

-- Intrările create deja din programări: scadența e ziua lor (create la 09:00, ora României).
update entries
   set due_date = (created_at at time zone 'Europe/Bucharest')::date
 where scheduled_id is not null and due_date is null and created_at is not null;

drop index if exists idx_entries_scheduled_month;
create unique index if not exists idx_entries_scheduled_due on entries (user_id, scheduled_id, due_date) where scheduled_id is not null;

-- Revenire (merge doar cât timp nu există două intrări ale aceleiași programări în aceeași lună):
--   drop index idx_entries_scheduled_due;
--   create unique index idx_entries_scheduled_month on entries (user_id, scheduled_id, month) where scheduled_id is not null;
--   alter table entries drop column due_date;
