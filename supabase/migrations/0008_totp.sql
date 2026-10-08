-- Autentificare în doi pași cu o aplicație (Google Authenticator, Microsoft Authenticator, 1Password, Parole pe
-- iPhone…): coduri TOTP de 6 cifre, schimbate la 30 de secunde (RFC 6238). Pe lângă Face ID / amprentă
-- (webauthn_credentials), e al doilea mod de a proteja contul: cu oricare dintre ele activ, parola singură
-- nu mai deschide contul.
alter table users
  add column totp_secret text,                     -- cheia comună cu aplicația (base32); null = 2FA dezactivat
  add column totp_enabled_at timestamptz,
  add column totp_last_step bigint not null default 0; -- ultimul interval de 30 s folosit: un cod nu merge de două ori
