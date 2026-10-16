# D-0.3 — Aprovisionamiento local de las siete cuentas ficticias

Este directorio prepara las cuentas de demostración del proyecto Supabase **`ylwrzbxlpdmcvqwgnwtb`**. El script no contiene claves ni contraseñas. No crea usuarios con SQL: utiliza `auth.admin.createUser`. Solo usa SQL parametrizado para leer el estado y vincular `abastece.staff_members.auth_user_id`.

La instalación y los comandos de bóveda no crean usuarios. La creación de usuarios y los vínculos ocurren únicamente cuando el operador ejecuta `provision <rol>` en su equipo Windows.

## Requisitos

- Windows 10/11, Node.js 22 o posterior y PowerShell.
- Acceso administrativo al proyecto y su clave **secret** `sb_secret_…`, obtenida en Supabase Dashboard → Project Settings → API Keys. No uses la clave `publishable`, `anon` ni `SUPABASE_ACCESS_TOKEN` para Auth Admin.
- `SUPABASE_URL`: exactamente `https://ylwrzbxlpdmcvqwgnwtb.supabase.co`.
- `DATABASE_URL`: URI PostgreSQL del mismo proyecto obtenida en Dashboard → **Connect → Session pooler**, puerto **5432**, base `postgres`. Es necesaria porque `abastece` no está expuesto a la Data API. El script exige TLS y valida el certificado; no cambia la configuración de la Data API.
- Un gestor de contraseñas para guardar **la frase maestra de la bóveda** y, opcionalmente, una copia individual de las siete contraseñas generadas. La frase maestra debe tener al menos 20 caracteres y ser distinta de las contraseñas de las cuentas.

No guardes claves, URI ni frase maestra en `.env`, `setx`, archivos del repositorio, capturas o el historial de PowerShell. La bóveda cifrada se crea **fuera del repositorio**, en `%LOCALAPPDATA%\AbasteceAI\D-0.3\credentials.enc.json`. Usa AES-256-GCM con una clave derivada mediante scrypt. Su recuperación requiere la frase maestra; haz una copia de seguridad del archivo cifrado y guarda la frase maestra en tu gestor de contraseñas. Si se pierden ambos, las contraseñas no se podrán recuperar.

## Instalación en Windows

En PowerShell, desde la raíz del repositorio:

```powershell
cd db\tools\d03-provision-auth
node --version
npm ci --ignore-scripts
```

La dependencia de Auth es `@supabase/supabase-js`; `pg` se utiliza exclusivamente para el vínculo parametrizado con PostgreSQL. Las versiones están fijadas en `package-lock.json`.

Define las variables protegidas **solo en esta sesión de PowerShell**. `Read-Host -AsSecureString` evita mostrarlas o escribir su valor en el historial:

```powershell
function Set-PrivateEnvironmentValue([string]$Name) {
    $Secure = Read-Host $Name -AsSecureString
    $Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try {
        [Environment]::SetEnvironmentVariable(
            $Name,
            [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer),
            'Process'
        )
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer)
    }
}

Set-PrivateEnvironmentValue 'ABASTECEAI_VAULT_PASSPHRASE'
```

La frase maestra entra temporalmente en la memoria del proceso y en su entorno; cierra PowerShell al terminar. No ejecutas el script con secretos como argumentos de línea de comandos.

## Paso 1: guardar y comprobar las contraseñas, sin tocar Supabase

```powershell
node provision.mjs prepare-vault
node provision.mjs verify-vault
```

`prepare-vault` genera siete contraseñas diferentes de 36 bytes aleatorios (`crypto.randomBytes`) y **las escribe cifradas y comprueba que puede descifrarlas antes de cualquier alta remota**. Si el archivo ya existe, lo verifica sin regenerar contraseñas. Un archivo existente ilegible detiene el proceso; no lo elimines automáticamente.

Para recuperar una contraseña sin imprimirla, ejecuta, por ejemplo:

```powershell
node provision.mjs copy-password auxiliar
```

El comando la copia al portapapeles por 30 segundos para pegarla en tu gestor de contraseñas y después vacía el portapapeles. Antes, desactiva el historial y la sincronización del portapapeles de Windows. Repite con los siete roles y comprueba que puedes recuperar sus entradas **antes** de crear usuarios. Si interrumpes el comando, vacía el portapapeles manualmente. No uses esta operación durante una sesión compartida o grabada.

## Paso 2: configurar la conexión administrativa local

Una vez comprobada la bóveda, añade las otras variables al mismo PowerShell. Introduce los valores en los campos ocultos; no los pegues en este chat:

```powershell
$env:SUPABASE_URL = 'https://ylwrzbxlpdmcvqwgnwtb.supabase.co'
Set-PrivateEnvironmentValue 'SUPABASE_SECRET_KEY'
Set-PrivateEnvironmentValue 'DATABASE_URL'
```

`DATABASE_URL` debe ser la URI completa del **Session pooler**. El script la analiza y crea la conexión con validación TLS explícita; no la imprime. La clave secret permite operaciones administrativas amplias: úsala solo en tu equipo confiable y cierra PowerShell al terminar.

## Paso 3: una cuenta por ejecución

Ejecuta **un comando**, revisa su resultado y solo entonces continúa con el siguiente. No se ha preparado un bucle que cree las siete cuentas de una vez.

```powershell
node provision.mjs provision auxiliar
node provision.mjs provision supervisor
node provision.mjs provision administrador
node provision.mjs provision bodega
node provision.mjs provision logistica
node provision.mjs provision compras
node provision.mjs provision gerencia
node provision.mjs verify-remote
```

Cada `provision <rol>`:

1. Descifra y verifica **toda** la bóveda, comprueba la URL, el pooler, TLS, los siete perfiles y las 703 ubicaciones.
2. Comprueba que permanecen los dos UUID Auth originales y que no hay usuarios ajenos ni correos demo duplicados.
3. Si la cuenta demo no existe, la crea con `auth.admin.createUser({ email, password, email_confirm: true })` y una marca administrativa D-0.3 de rol y perfil. La contraseña ya estaba en la bóveda. Si existe, exige que la marca corresponda exactamente al perfil previsto; nunca adopta una cuenta ajena.
4. Vincula únicamente ese perfil mediante `UPDATE` parametrizado, condicionado por UUID, correo, rol, estado activo y `auth_user_id IS NULL`. El vínculo SQL corre en una transacción. Una vinculación ya correcta es una operación sin cambios.
5. Comprueba correo confirmado, identidad de email, UUID, rol y asignaciones explícitas. En una transacción de **solo lectura**, activa el rol PostgreSQL `authenticated` y el UUID de la cuenta para comprobar que RLS permite 3, 24 o 703 ubicaciones según corresponda, y que los costos solo sean visibles para administrador, compras y gerencia. Después vuelve a comprobar los dos usuarios originales.

`verify-remote` exige nueve usuarios Auth en total, siete vínculos válidos y los dos usuarios originales. La prueba de RLS anterior usa una sesión SQL con rol y UUID simulados; los permisos efectivos **desde un cliente con JWT real** deberán probarse cuando el esquema `abastece` se exponga a la Data API mediante una autorización distinta. Este script no realiza ese cambio.

Ante un error, el proceso termina. Auth Admin y PostgreSQL no comparten una transacción: una cuenta puede quedar creada pero sin vincular si falla el segundo paso. **No borres, recrees ni reintentes automáticamente**. Inspecciona primero Auth y `staff_members`; al reejecutar el mismo rol, el script solo continúa si la cuenta lleva la marca D-0.3 esperada y conserva su contraseña en la bóveda.

Al finalizar, cierra la terminal o elimina las variables de esta sesión:

```powershell
Remove-Item Env:ABASTECEAI_VAULT_PASSPHRASE, Env:SUPABASE_SECRET_KEY, Env:DATABASE_URL, Env:SUPABASE_URL
```
