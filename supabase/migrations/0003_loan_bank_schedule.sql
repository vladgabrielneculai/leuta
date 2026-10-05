-- Graficul de rambursare de la bancă devine sursa calculelor creditului, plus „situația la zi”
-- din aplicația băncii (George BCR etc.) și asigurările anuale (PAD, facultativă).
-- Toate coloanele sunt noi și au valori implicite (datele pot lipsi = null): creditele existente rămân neschimbate.
alter table loans
  -- 1 = ratele, dobânda, asigurarea și soldul se iau din loan_schedules (graficul băncii)
  add column use_schedule integer not null default 0,
  -- 'pdf' | 'file' | 'manual' | 'text' | 'contract': de unde a venit graficul activ
  add column schedule_source text not null default '',
  add column schedule_generated_at text,
  add column contract_nr text not null default '',

  -- Situația la zi (completată manual sau preluată din PDF)
  add column status_date text,
  add column current_balance double precision not null default 0,
  add column arrears_amount double precision not null default 0, -- suma restantă
  add column arrears_count integer not null default 0,           -- restanțe (nr. rate)
  add column next_payment_date text,
  add column next_payment_amount double precision not null default 0,
  add column next_principal double precision not null default 0,
  add column next_interest double precision not null default 0,
  add column next_fees double precision not null default 0,       -- taxe lunare (asigurare de viață etc.)
  add column maturity_date text,
  add column current_rate double precision not null default 0,    -- rata dobânzii curente, % pe an

  -- Asigurări plătite o dată pe an
  add column pad_amount double precision not null default 0,
  add column pad_due_date text,
  add column opt_ins_amount double precision not null default 0,
  add column opt_ins_due_date text;
