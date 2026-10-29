/*
    070_SP_Seguridad.sql
    Registro, credenciales y sesiones (RF-01).

    - La contraseña nunca llega a la BD: la API envía el hash Argon2id y verifica la contraseña
      con el hash que devuelve SP_Seguridad_ObtenerCredenciales.
    - Los refresh tokens llegan como SHA-256 (32 bytes); el token en claro vive solo en la
      cookie. Se declaran VARBINARY(64) para detectar un tamaño incorrecto: un BINARY(32)
      rellenaría con ceros o recortaría sin avisar.
    - Orden de bloqueo en todo el módulo: Usuario y después RefreshToken. Evita interbloqueos
      entre la rotación, el inicio de sesión y la desactivación de un usuario.
    - Errores: ver docs/errores.md.
*/
:on error exit
SET NOCOUNT ON;
GO

/*
    Registro de un cliente. No inicia sesión: la API llama después a SP_Seguridad_IniciarSesion.
    El correo duplicado se detecta con la restricción UNIQUE y no con una consulta previa: dos
    registros simultáneos del mismo correo no pueden pasar ambos.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Seguridad_RegistrarCliente
    @Correo         NVARCHAR(255),
    @HashContrasena VARCHAR(256),
    @Nombre         NVARCHAR(101),
    @Apellido       NVARCHAR(101),
    @Telefono       NVARCHAR(21) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @NumeroError INT, @MensajeError NVARCHAR(200), @IDRol TINYINT, @IDUsuario INT;

    SELECT @Correo         = LOWER(TRIM(ISNULL(@Correo, N''))),
           @HashContrasena = ISNULL(@HashContrasena, ''),
           @Nombre         = TRIM(ISNULL(@Nombre, N'')),
           @Apellido       = TRIM(ISNULL(@Apellido, N'')),
           @Telefono       = NULLIF(TRIM(@Telefono), N'');

    SELECT @NumeroError = v.NumeroError, @MensajeError = v.MensajeError
    FROM dbo.FU_Usuarios_ValidarDatos(@Correo, @HashContrasena, @Nombre, @Apellido, @Telefono) AS v;
    IF @NumeroError IS NOT NULL
        THROW @NumeroError, @MensajeError, 1;

    SELECT @IDRol = r.IDRol FROM dbo.Rol AS r WHERE r.Codigo = 'CLIENTE';
    IF @IDRol IS NULL
        THROW 59001, N'CONFIGURACION_INCOMPLETA: no existe el rol CLIENTE.', 1;

    BEGIN TRY
        INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido, Telefono)
        VALUES (@IDRol, @Correo, @HashContrasena, @Nombre, @Apellido, @Telefono);
        SET @IDUsuario = SCOPE_IDENTITY();
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() IN (2601, 2627) AND ERROR_MESSAGE() LIKE N'%UQ_Usuario_Correo%'
            THROW 51101, N'CORREO_REGISTRADO: ya existe una cuenta con ese correo.', 1;
        THROW;
    END CATCH;

    SELECT d.IDUsuario, d.Correo, d.Nombre, d.Apellido, d.Telefono, d.CodigoRol
    FROM dbo.VW_Usuarios_Detalle AS d
    WHERE d.IDUsuario = @IDUsuario;
END;
GO

/*
    Datos para verificar la contraseña: por correo (inicio de sesión) o por usuario (cambio de
    contraseña). Si no hay fila, la API ejecuta una verificación ficticia del mismo costo para
    que el tiempo de respuesta no revele si el correo existe. Activo se devuelve para que la
    API informe la cuenta desactivada solo después de validar la contraseña.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Seguridad_ObtenerCredenciales
    @Correo    NVARCHAR(255) = NULL,
    @IDUsuario INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF (@Correo IS NULL AND @IDUsuario IS NULL) OR (@Correo IS NOT NULL AND @IDUsuario IS NOT NULL)
        THROW 50006, N'PARAMETRO_REQUERIDO: indique el correo o el usuario, no ambos.', 1;

    -- Dos consultas separadas: cada una usa su índice (UQ_Usuario_Correo o la PK).
    IF @Correo IS NOT NULL
        SELECT u.IDUsuario, u.HashContrasena, r.Codigo AS CodigoRol, u.Activo
        FROM dbo.Usuario AS u
        JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
        WHERE u.Correo = LOWER(TRIM(@Correo)) AND u.EsSistema = 0;
    ELSE
        SELECT u.IDUsuario, u.HashContrasena, r.Codigo AS CodigoRol, u.Activo
        FROM dbo.Usuario AS u
        JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
        WHERE u.IDUsuario = @IDUsuario AND u.EsSistema = 0;
END;
GO

/*
    Crea una sesión nueva (familia nueva) después de que la API verificó la contraseña.
    Vigencia: SESION_DIAS_INACTIVIDAD desde ahora, sin pasar de SESION_DIAS_MAXIMO (D11).
    El UPDATE de UltimoAcceso bloquea al usuario y comprueba en la misma sentencia que siga
    activo: una desactivación simultánea no puede dejar una sesión viva.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Seguridad_IniciarSesion
    @IDUsuario     INT,
    @TokenHash     VARBINARY(64),
    @DireccionIP   VARCHAR(45) = NULL,
    @AgenteUsuario NVARCHAR(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @DiasInactividad INT, @DiasMaximo INT, @FechaExpiracionSesion DATETIME2(3), @FechaExpiracion DATETIME2(3);

    IF @IDUsuario IS NULL OR DATALENGTH(@TokenHash) <> 32 OR @TokenHash IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el usuario y el hash SHA-256 del token.', 1;

    SELECT @DiasInactividad = p.DiasInactividad, @DiasMaximo = p.DiasMaximo
    FROM dbo.FU_Seguridad_ParametrosSesion() AS p;
    IF @DiasInactividad IS NULL OR @DiasMaximo IS NULL
        THROW 59001, N'CONFIGURACION_INCOMPLETA: faltan los parámetros SESION_DIAS_INACTIVIDAD o SESION_DIAS_MAXIMO.', 1;

    SET @FechaExpiracionSesion = DATEADD(DAY, @DiasMaximo, @Ahora);
    SET @FechaExpiracion = DATEADD(DAY, @DiasInactividad, @Ahora);
    IF @FechaExpiracion > @FechaExpiracionSesion
        SET @FechaExpiracion = @FechaExpiracionSesion;

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE dbo.Usuario
        SET UltimoAcceso = @Ahora
        WHERE IDUsuario = @IDUsuario AND Activo = 1 AND EsSistema = 0;

        IF @@ROWCOUNT = 0
            THROW 50301, N'USUARIO_INACTIVO: la cuenta no existe o está desactivada.', 1;

        INSERT INTO dbo.RefreshToken (IDUsuario, TokenHash, Familia, FechaCreacion, FechaExpiracion,
                                      FechaExpiracionSesion, DireccionIP, AgenteUsuario)
        VALUES (@IDUsuario, @TokenHash, NEWID(), @Ahora, @FechaExpiracion,
                @FechaExpiracionSesion, @DireccionIP, LEFT(@AgenteUsuario, 400));

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    SELECT d.IDUsuario, d.Correo, d.Nombre, d.Apellido, d.CodigoRol,
           @FechaExpiracion AS FechaExpiracion, @FechaExpiracionSesion AS FechaExpiracionSesion
    FROM dbo.VW_Usuarios_Detalle AS d
    WHERE d.IDUsuario = @IDUsuario;
END;
GO

/*
    Rotación del refresh token. Devuelve siempre una fila con Resultado, en lugar de lanzar un
    error, porque algunos resultados deben guardar cambios (revocar la familia) y un THROW
    revertiría la transacción. La API responde 401 a todo lo que no sea ROTADO.
      ROTADO                 token válido: se emite el nuevo y el actual queda revocado.
      ROTACION_CONCURRENTE   el token se rotó hace menos de SESION_SEGUNDOS_GRACIA (otra
                             pestaña renovó al mismo tiempo): se rechaza sin cerrar la sesión.
      REUSO_DETECTADO        se presentó un token rotado fuera del plazo de gracia: se asume
                             robado y se revoca toda la familia.
      SESION_EXPIRADA        venció por inactividad o por el máximo de la sesión.
      USUARIO_INACTIVO       el usuario fue desactivado: se revoca la familia.
      SESION_INVALIDA        el token no existe o fue revocado por otro motivo.
    Dos rotaciones simultáneas del mismo token se serializan con UPDLOCK: la segunda ve el
    token ya rotado y obtiene ROTACION_CONCURRENTE.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Seguridad_RotarSesion
    @TokenHashActual VARBINARY(64),
    @TokenHashNuevo  VARBINARY(64),
    @DireccionIP     VARCHAR(45) = NULL,
    @AgenteUsuario   NVARCHAR(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @DiasInactividad INT, @SegundosGracia INT;
    DECLARE @Resultado VARCHAR(25), @IDUsuario INT, @UsuarioActivo BIT;
    DECLARE @IDRefreshToken BIGINT, @Familia UNIQUEIDENTIFIER, @FechaExpiracion DATETIME2(3),
            @FechaExpiracionSesion DATETIME2(3), @FechaRevocacion DATETIME2(3), @MotivoRevocacion VARCHAR(25),
            @IDRefreshTokenNuevo BIGINT, @FechaExpiracionNueva DATETIME2(3);

    IF DATALENGTH(@TokenHashActual) <> 32 OR DATALENGTH(@TokenHashNuevo) <> 32
       OR @TokenHashActual IS NULL OR @TokenHashNuevo IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requieren los hash SHA-256 del token actual y del nuevo.', 1;

    SELECT @DiasInactividad = p.DiasInactividad, @SegundosGracia = p.SegundosGracia
    FROM dbo.FU_Seguridad_ParametrosSesion() AS p;
    IF @DiasInactividad IS NULL OR @SegundosGracia IS NULL
        THROW 59001, N'CONFIGURACION_INCOMPLETA: faltan los parámetros SESION_DIAS_INACTIVIDAD o SESION_SEGUNDOS_GRACIA.', 1;

    -- Lectura sin bloqueo solo para conocer al usuario y bloquearlo primero (orden Usuario → RefreshToken).
    -- El usuario de un token nunca cambia.
    SELECT @IDUsuario = t.IDUsuario FROM dbo.RefreshToken AS t WHERE t.TokenHash = @TokenHashActual;

    IF @IDUsuario IS NULL
        SET @Resultado = 'SESION_INVALIDA';
    ELSE
    BEGIN
        BEGIN TRY
            BEGIN TRANSACTION;

            SELECT @UsuarioActivo = CASE WHEN u.Activo = 1 AND u.EsSistema = 0 THEN 1 ELSE 0 END
            FROM dbo.Usuario AS u WITH (UPDLOCK, ROWLOCK)
            WHERE u.IDUsuario = @IDUsuario;

            SELECT @IDRefreshToken        = t.IDRefreshToken,
                   @Familia               = t.Familia,
                   @FechaExpiracion       = t.FechaExpiracion,
                   @FechaExpiracionSesion = t.FechaExpiracionSesion,
                   @FechaRevocacion       = t.FechaRevocacion,
                   @MotivoRevocacion      = t.MotivoRevocacion
            FROM dbo.RefreshToken AS t WITH (UPDLOCK, ROWLOCK)
            WHERE t.TokenHash = @TokenHashActual;

            SET @Resultado = CASE
                WHEN @FechaRevocacion IS NOT NULL AND @MotivoRevocacion = 'ROTACION'
                     AND @Ahora <= DATEADD(SECOND, @SegundosGracia, @FechaRevocacion) THEN 'ROTACION_CONCURRENTE'
                WHEN @FechaRevocacion IS NOT NULL AND @MotivoRevocacion = 'ROTACION' THEN 'REUSO_DETECTADO'
                WHEN @FechaRevocacion IS NOT NULL THEN 'SESION_INVALIDA'
                WHEN @UsuarioActivo = 0 THEN 'USUARIO_INACTIVO'
                WHEN @FechaExpiracion <= @Ahora THEN 'SESION_EXPIRADA'
                ELSE 'ROTADO'
            END;

            IF @Resultado IN ('REUSO_DETECTADO', 'USUARIO_INACTIVO')
                UPDATE dbo.RefreshToken
                SET FechaRevocacion  = @Ahora,
                    MotivoRevocacion = CASE @Resultado WHEN 'REUSO_DETECTADO' THEN 'REUSO_DETECTADO' ELSE 'USUARIO_DESACTIVADO' END
                WHERE Familia = @Familia AND FechaRevocacion IS NULL;
            ELSE IF @Resultado = 'ROTADO'
            BEGIN
                -- La sesión conserva su máximo absoluto; la inactividad se cuenta desde esta rotación.
                SET @FechaExpiracionNueva = DATEADD(DAY, @DiasInactividad, @Ahora);
                IF @FechaExpiracionNueva > @FechaExpiracionSesion
                    SET @FechaExpiracionNueva = @FechaExpiracionSesion;

                INSERT INTO dbo.RefreshToken (IDUsuario, TokenHash, Familia, FechaCreacion, FechaExpiracion,
                                              FechaExpiracionSesion, DireccionIP, AgenteUsuario)
                VALUES (@IDUsuario, @TokenHashNuevo, @Familia, @Ahora, @FechaExpiracionNueva,
                        @FechaExpiracionSesion, @DireccionIP, LEFT(@AgenteUsuario, 400));
                SET @IDRefreshTokenNuevo = SCOPE_IDENTITY();

                UPDATE dbo.RefreshToken
                SET FechaRevocacion         = @Ahora,
                    MotivoRevocacion        = 'ROTACION',
                    IDRefreshTokenReemplazo = @IDRefreshTokenNuevo
                WHERE IDRefreshToken = @IDRefreshToken;

                UPDATE dbo.Usuario SET UltimoAcceso = @Ahora WHERE IDUsuario = @IDUsuario;
            END;

            COMMIT TRANSACTION;
        END TRY
        BEGIN CATCH
            IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
            THROW;
        END CATCH;
    END;

    SELECT @Resultado AS Resultado,
           d.IDUsuario, d.Correo, d.Nombre, d.Apellido, d.CodigoRol,
           @FechaExpiracionNueva AS FechaExpiracion,
           CASE WHEN @Resultado = 'ROTADO' THEN @FechaExpiracionSesion END AS FechaExpiracionSesion
    FROM (VALUES (1)) AS f (Fila)
    LEFT JOIN dbo.VW_Usuarios_Detalle AS d
           ON d.IDUsuario = @IDUsuario AND @Resultado = 'ROTADO';
END;
GO

/*
    Cierre de sesión. Revoca todos los tokens vigentes de la familia (también el que otra
    pestaña haya obtenido por rotación). Siempre termina bien: un token desconocido o ya
    revocado no es un error para quien quiere salir.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Seguridad_CerrarSesion
    @TokenHash VARBINARY(64)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Familia UNIQUEIDENTIFIER, @SesionesCerradas INT = 0;

    IF DATALENGTH(@TokenHash) = 32
        SELECT @Familia = t.Familia FROM dbo.RefreshToken AS t WHERE t.TokenHash = @TokenHash;

    IF @Familia IS NOT NULL
    BEGIN
        UPDATE dbo.RefreshToken
        SET FechaRevocacion = SYSUTCDATETIME(), MotivoRevocacion = 'CIERRE_SESION'
        WHERE Familia = @Familia AND FechaRevocacion IS NULL;
        SET @SesionesCerradas = @@ROWCOUNT;
    END;

    SELECT @SesionesCerradas AS SesionesCerradas;
END;
GO

/*
    Cambio de contraseña del propio usuario, después de que la API verificó la actual.
    Cierra las demás sesiones; la sesión desde la que se hace el cambio sigue abierta si se
    envía su token.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Seguridad_CambiarContrasena
    @IDUsuarioSolicitante INT,
    @HashContrasena       VARCHAR(256),
    @TokenHashActual      VARBINARY(64) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @NumeroError INT, @MensajeError NVARCHAR(200), @FamiliaActual UNIQUEIDENTIFIER, @SesionesCerradas INT;
    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME();

    SET @HashContrasena = ISNULL(@HashContrasena, '');
    SELECT @NumeroError = v.NumeroError, @MensajeError = v.MensajeError
    FROM dbo.FU_Usuarios_ValidarDatos(NULL, @HashContrasena, NULL, NULL, NULL) AS v;
    IF @NumeroError IS NOT NULL
        THROW @NumeroError, @MensajeError, 1;

    IF DATALENGTH(@TokenHashActual) = 32
        SELECT @FamiliaActual = t.Familia
        FROM dbo.RefreshToken AS t
        WHERE t.TokenHash = @TokenHashActual AND t.IDUsuario = @IDUsuarioSolicitante;

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE dbo.Usuario
        SET HashContrasena = @HashContrasena, FechaModificacion = @Ahora
        WHERE IDUsuario = @IDUsuarioSolicitante AND Activo = 1 AND EsSistema = 0;

        IF @@ROWCOUNT = 0
            THROW 50101, N'USUARIO_NO_ENCONTRADO: el usuario no existe o está desactivado.', 1;

        UPDATE dbo.RefreshToken
        SET FechaRevocacion = @Ahora, MotivoRevocacion = 'CAMBIO_CONTRASENA'
        WHERE IDUsuario = @IDUsuarioSolicitante
          AND FechaRevocacion IS NULL
          AND (@FamiliaActual IS NULL OR Familia <> @FamiliaActual);
        SET @SesionesCerradas = @@ROWCOUNT;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    SELECT @SesionesCerradas AS SesionesCerradas;
END;
GO
