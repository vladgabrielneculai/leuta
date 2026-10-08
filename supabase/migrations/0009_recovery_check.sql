-- Verificarea periodică a codurilor de recuperare: la 3 luni, aplicația îți cere un cod (fără să-l consume), ca
-- să fii sigur că lista e încă la tine înainte de a avea nevoie de ea. Data se reînnoiește și la generarea unei
-- liste noi. Conturile care au deja coduri pornesc de acum (prima verificare peste 3 luni).
alter table users add column recovery_checked_at timestamptz;
update users u set recovery_checked_at = now()
where exists (select 1 from recovery_codes r where r.user_id = u.id and r.used_at is null);
