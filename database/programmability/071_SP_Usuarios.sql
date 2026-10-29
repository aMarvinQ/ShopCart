/*
    071_SP_Usuarios.sql
    Perfil del propio usuario y administración de usuarios internos (RF-01).

    - @IDUsuarioSolicitante: el propio usuario, tomado del JWT por la API (nunca del body).
    - @IDUsuarioAccion: el administrador que ejecuta la acción. El SP vuelve a validar que sea
      ADMIN activo aunque la API ya lo haya hecho (defensa en profundidad).
    - Los cambios administrativos quedan en Bitacora (módulo USUARIOS). El hash de la
      contraseña nunca se registra.
    - Errores: ver docs/errores.md.
*/
:on error exit
SET NOCOUNT ON;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_ObtenerPerfil
    @IDUsuarioSolicitante INT
AS
BEGIN
    SET NOCOUNT ON;

    -- Se valida antes de consultar para no devolver un conjunto vacío seguido del error.
    IF NOT EXISTS (SELECT 1 FROM dbo.VW_Usuarios_Detalle AS d WHERE d.IDUsuario = @IDUsuarioSolicitante AND d.Activo = 1)
        THROW 50101, N'USUARIO_NO_ENCONTRADO: el usuario no existe o está desactivado.', 1;

    SELECT d.IDUsuario, d.Correo, d.Nombre, d.Apellido, d.Telefono, d.CodigoRol, d.NombreRol,
           d.UltimoAcceso, d.FechaCreacion
    FROM dbo.VW_Usuarios_Detalle AS d
    WHERE d.IDUsuario = @IDUsuarioSolicitante AND d.Activo = 1;
END;
GO

/* El correo no se modifica: identifica la cuenta y el historial de pedidos. */
CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_ActualizarPerfil
    @IDUsuarioSolicitante INT,
    @Nombre               NVARCHAR(101),
    @Apellido             NVARCHAR(101),
    @Telefono             NVARCHAR(21) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @NumeroError INT, @MensajeError NVARCHAR(200);

    SELECT @Nombre   = TRIM(ISNULL(@Nombre, N'')),
           @Apellido = TRIM(ISNULL(@Apellido, N'')),
           @Telefono = NULLIF(TRIM(@Telefono), N'');

    SELECT @NumeroError = v.NumeroError, @MensajeError = v.MensajeError
    FROM dbo.FU_Usuarios_ValidarDatos(NULL, NULL, @Nombre, @Apellido, @Telefono) AS v;
    IF @NumeroError IS NOT NULL
        THROW @NumeroError, @MensajeError, 1;

    UPDATE dbo.Usuario
    SET Nombre = @Nombre, Apellido = @Apellido, Telefono = @Telefono, FechaModificacion = SYSUTCDATETIME()
    WHERE IDUsuario = @IDUsuarioSolicitante AND Activo = 1 AND EsSistema = 0;

    IF @@ROWCOUNT = 0
        THROW 50101, N'USUARIO_NO_ENCONTRADO: el usuario no existe o está desactivado.', 1;

    EXEC dbo.SP_Usuarios_ObtenerPerfil @IDUsuarioSolicitante = @IDUsuarioSolicitante;
END;
GO

/* Alta de operadores y administradores. Los clientes se registran solos (SP_Seguridad_RegistrarCliente). */
CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_CrearInterno
    @IDUsuarioAccion INT,
    @Correo          NVARCHAR(255),
    @HashContrasena  VARCHAR(256),
    @Nombre          NVARCHAR(101),
    @Apellido        NVARCHAR(101),
    @Telefono        NVARCHAR(21) = NULL,
    @CodigoRol       VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @NumeroError INT, @MensajeError NVARCHAR(200), @IDRol TINYINT, @IDUsuario INT;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede crear usuarios internos.', 1;

    SELECT @Correo         = LOWER(TRIM(ISNULL(@Correo, N''))),
           @HashContrasena = ISNULL(@HashContrasena, ''),
           @Nombre         = TRIM(ISNULL(@Nombre, N'')),
           @Apellido       = TRIM(ISNULL(@Apellido, N'')),
           @Telefono       = NULLIF(TRIM(@Telefono), N'');

    SELECT @NumeroError = v.NumeroError, @MensajeError = v.MensajeError
    FROM dbo.FU_Usuarios_ValidarDatos(@Correo, @HashContrasena, @Nombre, @Apellido, @Telefono) AS v;
    IF @NumeroError IS NOT NULL
        THROW @NumeroError, @MensajeError, 1;

    SELECT @IDRol = r.IDRol FROM dbo.Rol AS r WHERE r.Codigo = @CodigoRol AND r.Codigo IN ('OPERADOR', 'ADMIN');
    IF @IDRol IS NULL
        THROW 50005, N'ROL_INVALIDO: un usuario interno debe ser OPERADOR o ADMIN.', 1;

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido, Telefono)
        VALUES (@IDRol, @Correo, @HashContrasena, @Nombre, @Apellido, @Telefono);
        SET @IDUsuario = SCOPE_IDENTITY();

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorNuevo)
        SELECT @IDUsuarioAccion, 'USUARIOS', 'Usuario', CAST(@IDUsuario AS VARCHAR(50)), 'CREAR',
               (SELECT d.IDUsuario, d.Correo, d.Nombre, d.Apellido, d.Telefono, d.CodigoRol, d.Activo
                FROM dbo.VW_Usuarios_Detalle AS d
                WHERE d.IDUsuario = @IDUsuario
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() IN (2601, 2627) AND ERROR_MESSAGE() LIKE N'%UQ_Usuario_Correo%'
            THROW 51101, N'CORREO_REGISTRADO: ya existe una cuenta con ese correo.', 1;
        THROW;
    END CATCH;

    SELECT d.IDUsuario, d.Correo, d.Nombre, d.Apellido, d.Telefono, d.CodigoRol, d.NombreRol,
           d.Activo, d.UltimoAcceso, d.FechaCreacion
    FROM dbo.VW_Usuarios_Detalle AS d
    WHERE d.IDUsuario = @IDUsuario;
END;
GO

/*
    Activa o desactiva un usuario (nunca se elimina). Al desactivar revoca todas sus sesiones
    (D8); el access token ya emitido deja de servir cuando vence (máximo 15 minutos).
    Repetir el estado actual no es un error ni genera bitácora.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_CambiarEstado
    @IDUsuarioAccion INT,
    @IDUsuario       INT,
    @Activo          BIT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @EsSistema BIT, @Cambio INT = 0, @SesionesRevocadas INT = 0;

    IF @IDUsuario IS NULL OR @Activo IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el usuario y el estado.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede cambiar el estado de un usuario.', 1;

    SELECT @EsSistema = u.EsSistema FROM dbo.Usuario AS u WHERE u.IDUsuario = @IDUsuario;
    IF @EsSistema IS NULL
        THROW 50101, N'USUARIO_NO_ENCONTRADO: el usuario no existe.', 1;
    IF @EsSistema = 1
        THROW 51102, N'USUARIO_SISTEMA_PROTEGIDO: el usuario de sistema no se puede modificar.', 1;
    IF @IDUsuario = @IDUsuarioAccion AND @Activo = 0
        THROW 51103, N'AUTODESACTIVACION_NO_PERMITIDA: un administrador no puede desactivarse a sí mismo.', 1;

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        -- Primero el usuario y después sus tokens (orden de bloqueo del módulo).
        UPDATE dbo.Usuario
        SET Activo = @Activo, FechaModificacion = @Ahora
        WHERE IDUsuario = @IDUsuario AND Activo <> @Activo;
        SET @Cambio = @@ROWCOUNT;

        IF @Cambio = 1
        BEGIN
            IF @Activo = 0
            BEGIN
                UPDATE dbo.RefreshToken
                SET FechaRevocacion = @Ahora, MotivoRevocacion = 'USUARIO_DESACTIVADO'
                WHERE IDUsuario = @IDUsuario AND FechaRevocacion IS NULL;
                SET @SesionesRevocadas = @@ROWCOUNT;
            END;

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioAccion, 'USUARIOS', 'Usuario', CAST(@IDUsuario AS VARCHAR(50)),
                    CASE @Activo WHEN 1 THEN 'ACTIVAR' ELSE 'DESACTIVAR' END,
                    (SELECT CAST(1 - @Activo AS BIT) AS Activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                    (SELECT @Activo AS Activo, @SesionesRevocadas AS SesionesRevocadas FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    SELECT d.IDUsuario, d.Correo, d.Nombre, d.Apellido, d.Telefono, d.CodigoRol, d.NombreRol,
           d.Activo, d.UltimoAcceso, d.FechaCreacion,
           CAST(@Cambio AS BIT) AS EstadoCambiado, @SesionesRevocadas AS SesionesRevocadas
    FROM dbo.VW_Usuarios_Detalle AS d
    WHERE d.IDUsuario = @IDUsuario;
END;
GO

/*
    Listado paginado para el administrador. Filtros opcionales (NULL = sin filtro) y búsqueda
    por correo o nombre completo. Los comodines de LIKE que escriba el usuario (% _ [) se
    escapan: se buscan como texto. OPTION (RECOMPILE) arma el plan con los filtros que
    realmente llegaron, sin SQL dinámico.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_Listar
    @IDUsuarioAccion INT,
    @CodigoRol       VARCHAR(20) = NULL,
    @Activo          BIT = NULL,
    @Busqueda        NVARCHAR(101) = NULL,
    @Pagina          INT = 1,
    @TamanoPagina    INT = 20,
    @TotalRegistros  INT = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Patron NVARCHAR(410);

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede listar usuarios.', 1;

    IF @Pagina IS NULL OR @Pagina < 1 OR @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50007, N'PAGINACION_INVALIDA: la página inicia en 1 y el tamaño va de 1 a 100.', 1;

    SET @Busqueda = NULLIF(TRIM(@Busqueda), N'');
    IF LEN(@Busqueda) > 100
        THROW 50008, N'BUSQUEDA_INVALIDA: la búsqueda admite como máximo 100 caracteres.', 1;

    SET @Patron = N'%' + REPLACE(REPLACE(REPLACE(REPLACE(@Busqueda,
                      N'\', N'\\'), N'%', N'\%'), N'_', N'\_'), N'[', N'\[') + N'%';

    SELECT @TotalRegistros = COUNT(*)
    FROM dbo.VW_Usuarios_Detalle AS d
    WHERE (@CodigoRol IS NULL OR d.CodigoRol = @CodigoRol)
      AND (@Activo IS NULL OR d.Activo = @Activo)
      AND (@Patron IS NULL OR d.Correo LIKE @Patron ESCAPE N'\'
           OR CONCAT(d.Nombre, N' ', d.Apellido) LIKE @Patron ESCAPE N'\')
    OPTION (RECOMPILE);

    SELECT d.IDUsuario, d.Correo, d.Nombre, d.Apellido, d.Telefono, d.CodigoRol, d.NombreRol,
           d.Activo, d.UltimoAcceso, d.FechaCreacion
    FROM dbo.VW_Usuarios_Detalle AS d
    WHERE (@CodigoRol IS NULL OR d.CodigoRol = @CodigoRol)
      AND (@Activo IS NULL OR d.Activo = @Activo)
      AND (@Patron IS NULL OR d.Correo LIKE @Patron ESCAPE N'\'
           OR CONCAT(d.Nombre, N' ', d.Apellido) LIKE @Patron ESCAPE N'\')
    ORDER BY d.FechaCreacion DESC, d.IDUsuario DESC
    OFFSET CAST(@Pagina - 1 AS BIGINT) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY
    OPTION (RECOMPILE);
END;
GO
