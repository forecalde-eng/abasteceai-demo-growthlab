-- Sustituto mínimo de Supabase (roles y auth) para una base DESECHABLE de pruebas. NO usar en Supabase.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz DEFAULT now());
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
 'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
REVOKE EXECUTE ON FUNCTION auth.uid() FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
