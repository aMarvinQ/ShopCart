/*
    045_Funciones_Seguridad.sql
    Funciones de apoyo para los SPs de seguridad y usuarios:
    - FU_Seguridad_Actor: rol de quien ejecuta una acción, solo si está activo y no es el
      usuario de sistema. Los SPs la usan para validar permisos además del middleware de la
      API (defensa en profundidad).
    - FU_Seguridad_ParametrosSesion: vigencia de las sesiones, leída de Parametro.
    - FU_Usuarios_ValidarDatos: reglas de los datos de un usuario con su error estable.
*/
:on error exit
SET NOCOUNT ON;
GO

CREATE OR ALTER FUNCTION dbo.FU_Seguridad_Actor (@IDUsuario INT)
RETURNS TABLE
AS
RETURN
    SELECT u.IDUsuario, r.Codigo AS CodigoRol
    FROM dbo.Usuario AS u
    JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
    WHERE u.IDUsuario = @IDUsuario
      AND u.Activo = 1
      AND u.EsSistema = 0;
GO

/*
    Siempre devuelve una fila. Un valor NULL indica que el parámetro falta o no es válido
    (días > 0, gracia >= 0): el SP lo rechaza en lugar de inventar una vigencia.
    - SESION_DIAS_INACTIVIDAD: el refresh token vence tras estos días sin usarse.
    - SESION_DIAS_MAXIMO: la sesión termina a estos días del inicio de sesión, aunque se use.
    - SESION_SEGUNDOS_GRACIA: un token recién rotado que se vuelve a presentar dentro de este
      plazo se rechaza sin revocar la sesión (dos pestañas que renuevan a la vez).
*/
CREATE OR ALTER FUNCTION dbo.FU_Seguridad_ParametrosSesion ()
RETURNS TABLE
AS
RETURN
    SELECT
        CASE WHEN v.DiasInactividad > 0 THEN v.DiasInactividad END AS DiasInactividad,
        CASE WHEN v.DiasMaximo > 0 THEN v.DiasMaximo END AS DiasMaximo,
        CASE WHEN v.SegundosGracia >= 0 THEN v.SegundosGracia END AS SegundosGracia
    FROM (
        SELECT
            (SELECT TRY_CAST(p.Valor AS INT) FROM dbo.Parametro AS p WHERE p.Clave = 'SESION_DIAS_INACTIVIDAD') AS DiasInactividad,
            (SELECT TRY_CAST(p.Valor AS INT) FROM dbo.Parametro AS p WHERE p.Clave = 'SESION_DIAS_MAXIMO') AS DiasMaximo,
            (SELECT TRY_CAST(p.Valor AS INT) FROM dbo.Parametro AS p WHERE p.Clave = 'SESION_SEGUNDOS_GRACIA') AS SegundosGracia
    ) AS v;
GO

/*
    Recibe los datos ya normalizados por el SP (correo en minúsculas, textos sin espacios en
    los extremos). Un parámetro NULL no se valida: así sirve para registrar (el SP envía ''
    en lugar de NULL para los obligatorios) y para actualizar el perfil (sin correo ni hash).
    Los SPs declaran los textos con un carácter más que la columna: un valor más largo llega
    truncado a ese tamaño y la regla de longitud lo rechaza en lugar de guardarlo recortado.
    Devuelve el primer error en orden de prioridad, o ninguna fila si los datos son válidos.
    El teléfono se compara en BIN2 (en la intercalación de la BD, '²' o '½' cuentan como
    dígitos) y el guion va primero en la clase: al final, con NVARCHAR, ' -]' se interpreta
    como el rango del espacio a ']', que incluye las letras.
*/
CREATE OR ALTER FUNCTION dbo.FU_Usuarios_ValidarDatos
(
    @Correo         NVARCHAR(255),
    @HashContrasena VARCHAR(256),
    @Nombre         NVARCHAR(101),
    @Apellido       NVARCHAR(101),
    @Telefono       NVARCHAR(21)
)
RETURNS TABLE
AS
RETURN
    SELECT TOP (1) v.NumeroError, v.MensajeError
    FROM (VALUES
        (1, 50001, N'CORREO_INVALIDO: el correo no tiene un formato válido.',
            CASE WHEN @Correo IS NOT NULL
                       AND (LEN(@Correo) > 254 OR @Correo NOT LIKE N'_%@_%._%' OR @Correo LIKE N'% %')
                 THEN 1 ELSE 0 END),
        (2, 50002, N'HASH_INVALIDO: la contraseña debe llegar como hash Argon2id.',
            CASE WHEN @HashContrasena IS NOT NULL
                       AND (LEN(@HashContrasena) > 255 OR @HashContrasena NOT LIKE '$argon2id$%')
                 THEN 1 ELSE 0 END),
        (3, 50003, N'NOMBRE_INVALIDO: el nombre y el apellido son obligatorios (máximo 100 caracteres).',
            CASE WHEN (@Nombre IS NOT NULL AND (LEN(@Nombre) = 0 OR LEN(@Nombre) > 100))
                       OR (@Apellido IS NOT NULL AND (LEN(@Apellido) = 0 OR LEN(@Apellido) > 100))
                 THEN 1 ELSE 0 END),
        (4, 50004, N'TELEFONO_INVALIDO: el teléfono solo admite dígitos, espacios, + y - (máximo 20 caracteres).',
            CASE WHEN @Telefono IS NOT NULL
                       AND (LEN(@Telefono) > 20 OR @Telefono COLLATE Latin1_General_100_BIN2 LIKE N'%[^-0-9+ ]%')
                 THEN 1 ELSE 0 END)
    ) AS v (Prioridad, NumeroError, MensajeError, Falla)
    WHERE v.Falla = 1
    ORDER BY v.Prioridad;
GO
