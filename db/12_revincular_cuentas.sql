-- D-3.1 (#39). Ejecutar después de 03_datos_ficticios.sql.
-- No crea usuarios, no cambia credenciales y no sustituye vínculos existentes.
BEGIN;
UPDATE abastece.staff_members s
SET auth_user_id = u.id
FROM auth.users u
WHERE u.email = s.demo_email
  AND s.auth_user_id IS NULL
  AND u.email LIKE '%@abasteceai.example'
  AND u.email_confirmed_at IS NOT NULL;
COMMIT;
