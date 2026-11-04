-- Cardul și contul lui (beta): un card bancar plătește din contul la care e legat, ca la adăugarea unei
-- cheltuieli să alegi un singur lucru („Plătit cu”) și soldul contului să se schimbe.
-- Doar adăugări: coloana e opțională, cardurile existente rămân fără cont; producția nu folosește cardurile.

alter table cards add column if not exists account_id integer references accounts(id) on delete set null;

-- Contul trebuie să fie al aceluiași utilizator. Ca la subcategorii (0014): un trigger, nu regula RLS a cardurilor.
create or replace function cards_account_same_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.account_id is null then return new; end if;
  if not exists (select 1 from accounts a where a.id = new.account_id and a.user_id = new.user_id) then
    raise exception 'Contul ales nu există.';
  end if;
  return new;
end $$;
revoke all on function cards_account_same_user() from public;
drop trigger if exists trg_cards_account on cards;
create trigger trg_cards_account before insert or update of account_id on cards
  for each row execute function cards_account_same_user();

-- Revenire:
--   drop trigger trg_cards_account on cards; drop function cards_account_same_user();
--   alter table cards drop column account_id;
