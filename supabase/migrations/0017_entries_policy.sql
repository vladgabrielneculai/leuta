-- Regula RLS a intrărilor, cu ambele legături noi: cardul (0013_cards.sql) și contul (0013_accounts.sql).
-- Ambele migrări 0013 înlocuiau aceeași regulă, iar cea rulată a doua o pierdea pe a celeilalte; aceasta le
-- reunește. Producția nu trimite card_id și nici account_id, deci condițiile noi sunt mereu adevărate pentru ea.

drop policy if exists own_rows on entries;
create policy own_rows on entries for all to bp_app
  using (user_id = nullif(current_setting('app.user_id', true), '')::integer)
  with check (
    user_id = nullif(current_setting('app.user_id', true), '')::integer
    and (category_id is null or exists (select 1 from categories where categories.id = category_id))
    and (goal_id is null or exists (select 1 from goals where goals.id = goal_id))
    and (investment_id is null or exists (select 1 from investments where investments.id = investment_id))
    and (card_id is null or exists (select 1 from cards where cards.id = card_id))
    and (account_id is null or exists (select 1 from accounts where accounts.id = account_id))
  );

-- Revenire: regula din 0013_accounts.sql (fără card_id) sau din 0013_cards.sql (fără account_id).
