-- Legăturile spre rânduri „părinte” (categorie, obiectiv, investiție, credit) trebuie să fie ale aceluiași cont.
--
-- De ce: verificarea cheilor străine (FOREIGN KEY) din Postgres ocolește row-level security. Fără regula de
-- mai jos, un cont putea salva o intrare cu category_id / goal_id / investment_id / loan_id al altui cont
-- (id-uri ghicite). Datele celuilalt nu deveneau vizibile, dar se putea afla ce id-uri există și se puteau
-- crea rânduri care îi blocau celuilalt cont salvarea (ex. valoarea unei investiții pe o lună: cheie unică
-- (investment_id, month)). Vacanțele (0011_vacante.sql) au deja regula; aici o primesc și tabelele vechi.
--
-- Subinterogările pe tabelele părinte trec și ele prin RLS, deci „există” = „există și e al meu”.
-- Regula se aplică doar la scriere (with check); rândurile existente rămân neatinse.

drop policy if exists own_rows on entries;
create policy own_rows on entries for all to bp_app
  using (user_id = nullif(current_setting('app.user_id', true), '')::integer)
  with check (
    user_id = nullif(current_setting('app.user_id', true), '')::integer
    and (category_id is null or exists (select 1 from categories where categories.id = category_id))
    and (goal_id is null or exists (select 1 from goals where goals.id = goal_id))
    and (investment_id is null or exists (select 1 from investments where investments.id = investment_id))
  );

drop policy if exists own_rows on investment_values;
create policy own_rows on investment_values for all to bp_app
  using (user_id = nullif(current_setting('app.user_id', true), '')::integer)
  with check (
    user_id = nullif(current_setting('app.user_id', true), '')::integer
    and exists (select 1 from investments where investments.id = investment_id)
  );

do $$
declare t text;
begin
  foreach t in array array['loan_prepayments','loan_schedules']
  loop
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format(
      'create policy own_rows on public.%I for all to bp_app
         using (user_id = nullif(current_setting(''app.user_id'', true), '''')::integer)
         with check (user_id = nullif(current_setting(''app.user_id'', true), '''')::integer
                     and exists (select 1 from loans where loans.id = loan_id))', t);
  end loop;
end $$;
