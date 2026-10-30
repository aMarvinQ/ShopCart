/*
    078_SP_Envios.sql
    Envíos y direcciones (RF-06):
    - Catálogos para los formularios: departamentos, municipios de un departamento y métodos
      de envío activos (públicos, sin sesión: también los usa el invitado).
    - Libreta de direcciones del cliente: listar, crear, editar, marcar predeterminada y eliminar.
    - Métodos de envío: administración (solo administradores).

    Libreta:
    - Solo el dueño ve y modifica sus direcciones; una dirección ajena responde igual que una
      inexistente (DIRECCION_NO_ENCONTRADA), para no revelar que existe.
    - Máximo 5 direcciones activas. La primera queda predeterminada; si se elimina la
      predeterminada, la más reciente de las restantes pasa a serlo.
    - "Eliminar" desactiva: un checkout puede referenciar la dirección. Los pedidos guardan una
      copia, así que editar o eliminar una dirección no altera pedidos ya realizados.
    - Cada operación bloquea primero al usuario (UPDLOCK): dos peticiones simultáneas del mismo
      cliente no superan el máximo ni dejan dos predeterminadas. Orden: Usuario → Direccion.
    - Las operaciones devuelven la libreta completa (mismo resultado que SP_Direcciones_Listar).

    Métodos de envío: nada se elimina (los pedidos los referencian); no se puede desactivar el
    último activo, porque la tienda no podría vender. Los cambios quedan en Bitacora (ENVIOS).
    Errores: ver docs/errores.md.
*/
:on error exit
SET NOCOUNT ON;
GO

/* === Catálogos ============================================================================ */

CREATE OR ALTER PROCEDURE dbo.SP_Envios_ListarDepartamentos
AS
BEGIN
    SET NOCOUNT ON;

    SELECT d.IDDepartamento, d.Nombre
    FROM dbo.Departamento AS d
    ORDER BY d.Nombre;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Envios_ListarMunicipios
    @IDDepartamento TINYINT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Departamento AS d WHERE d.IDDepartamento = @IDDepartamento)
        THROW 50112, N'DEPARTAMENTO_NO_ENCONTRADO: el departamento no existe.', 1;

    SELECT m.IDMunicipio, m.Nombre
    FROM dbo.Municipio AS m
    WHERE m.IDDepartamento = @IDDepartamento
    ORDER BY m.Nombre;
END;
GO

/* Métodos de envío que el cliente puede elegir, del más barato al más caro. */
CREATE OR ALTER PROCEDURE dbo.SP_Envios_ListarMetodosTienda
AS
BEGIN
    SET NOCOUNT ON;

    SELECT me.IDMetodoEnvio, me.Nombre, me.Descripcion, me.Costo, me.DiasEstimadosMin, me.DiasEstimadosMax
    FROM dbo.MetodoEnvio AS me
    WHERE me.Activo = 1
    ORDER BY me.Costo, me.Nombre;
END;
GO

/* === Libreta de direcciones =============================================================== */

/* Direcciones activas del cliente: la predeterminada primero y después de la más reciente a la más antigua. */
CREATE OR ALTER PROCEDURE dbo.SP_Direcciones_Listar
    @IDUsuario INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuario) AS a WHERE a.CodigoRol = 'CLIENTE')
        THROW 50201, N'PERMISO_DENEGADO: solo un cliente activo tiene libreta de direcciones.', 1;

    SELECT d.IDDireccion, d.Alias, d.NombreDestinatario, d.Telefono, d.Linea1, d.Linea2, d.IDMunicipio, m.Nombre AS Municipio,
           m.IDDepartamento, dep.Nombre AS Departamento, d.CodigoPostal, d.Referencias, d.EsPredeterminada,
           d.FechaCreacion, d.FechaModificacion
    FROM dbo.Direccion AS d
    JOIN dbo.Municipio AS m ON m.IDMunicipio = d.IDMunicipio
    JOIN dbo.Departamento AS dep ON dep.IDDepartamento = m.IDDepartamento
    WHERE d.IDUsuario = @IDUsuario AND d.Activo = 1
    ORDER BY d.EsPredeterminada DESC, d.FechaCreacion DESC, d.IDDireccion DESC;
END;
GO

/*
    Agrega una dirección a la libreta (desde el perfil o desde el checkout, con el mismo
    diálogo). @IDDireccion devuelve la nueva, para que el checkout la deje seleccionada.
    La primera dirección queda predeterminada aunque no se pida; si se pide, la anterior deja
    de serlo.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Direcciones_Crear
    @IDUsuario          INT,
    @Alias              NVARCHAR(51),
    @NombreDestinatario NVARCHAR(151),
    @Telefono           NVARCHAR(21),
    @Linea1             NVARCHAR(201),
    @Linea2             NVARCHAR(201) = NULL,
    @IDMunicipio        SMALLINT,
    @CodigoPostal       NVARCHAR(6) = NULL,
    @Referencias        NVARCHAR(301) = NULL,
    @EsPredeterminada   BIT = 0,
    @IDDireccion        INT = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @NumeroError INT, @MensajeError NVARCHAR(400), @Activas INT;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuario) AS a WHERE a.CodigoRol = 'CLIENTE')
        THROW 50201, N'PERMISO_DENEGADO: solo un cliente activo tiene libreta de direcciones.', 1;

    SELECT @Alias              = TRIM(ISNULL(@Alias, N'')),
           @NombreDestinatario = TRIM(ISNULL(@NombreDestinatario, N'')),
           @Telefono           = TRIM(ISNULL(@Telefono, N'')),
           @Linea1             = TRIM(ISNULL(@Linea1, N'')),
           @Linea2             = NULLIF(TRIM(@Linea2), N''),
           @CodigoPostal       = NULLIF(TRIM(@CodigoPostal), N''),
           @Referencias        = NULLIF(TRIM(@Referencias), N''),
           @EsPredeterminada   = ISNULL(@EsPredeterminada, 0);

    SELECT @NumeroError = v.NumeroError, @MensajeError = v.MensajeError
    FROM dbo.FU_Envios_ValidarDireccion(@Alias, @NombreDestinatario, @Telefono, @Linea1, @Linea2, @CodigoPostal, @Referencias) AS v;
    IF @NumeroError IS NOT NULL
        THROW @NumeroError, @MensajeError, 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.Municipio AS m WHERE m.IDMunicipio = @IDMunicipio)
        THROW 50111, N'MUNICIPIO_NO_ENCONTRADO: el municipio no existe.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        SELECT @Activas = (SELECT COUNT(*) FROM dbo.Direccion AS d WHERE d.IDUsuario = u.IDUsuario AND d.Activo = 1)
        FROM dbo.Usuario AS u WITH (UPDLOCK)
        WHERE u.IDUsuario = @IDUsuario;

        IF @Activas >= 5
            THROW 51501, N'LIMITE_DIRECCIONES: se permiten como máximo 5 direcciones; elimine una para agregar otra.', 1;

        IF @Activas = 0
            SET @EsPredeterminada = 1;
        ELSE IF @EsPredeterminada = 1
            UPDATE dbo.Direccion SET EsPredeterminada = 0, FechaModificacion = SYSUTCDATETIME()
            WHERE IDUsuario = @IDUsuario AND EsPredeterminada = 1;

        INSERT INTO dbo.Direccion (IDUsuario, Alias, NombreDestinatario, Telefono, Linea1, Linea2, IDMunicipio, CodigoPostal,
                                   Referencias, EsPredeterminada)
        VALUES (@IDUsuario, @Alias, @NombreDestinatario, @Telefono, @Linea1, @Linea2, @IDMunicipio, @CodigoPostal,
                @Referencias, @EsPredeterminada);
        SET @IDDireccion = SCOPE_IDENTITY();

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    EXEC dbo.SP_Direcciones_Listar @IDUsuario = @IDUsuario;
END;
GO

/*
    Edita los datos de una dirección propia y activa (la predeterminada se cambia con
    SP_Direcciones_MarcarPredeterminada). Los pedidos ya realizados conservan su copia.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Direcciones_Actualizar
    @IDUsuario          INT,
    @IDDireccion        INT,
    @Alias              NVARCHAR(51),
    @NombreDestinatario NVARCHAR(151),
    @Telefono           NVARCHAR(21),
    @Linea1             NVARCHAR(201),
    @Linea2             NVARCHAR(201) = NULL,
    @IDMunicipio        SMALLINT,
    @CodigoPostal       NVARCHAR(6) = NULL,
    @Referencias        NVARCHAR(301) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @NumeroError INT, @MensajeError NVARCHAR(400);

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuario) AS a WHERE a.CodigoRol = 'CLIENTE')
        THROW 50201, N'PERMISO_DENEGADO: solo un cliente activo tiene libreta de direcciones.', 1;

    SELECT @Alias              = TRIM(ISNULL(@Alias, N'')),
           @NombreDestinatario = TRIM(ISNULL(@NombreDestinatario, N'')),
           @Telefono           = TRIM(ISNULL(@Telefono, N'')),
           @Linea1             = TRIM(ISNULL(@Linea1, N'')),
           @Linea2             = NULLIF(TRIM(@Linea2), N''),
           @CodigoPostal       = NULLIF(TRIM(@CodigoPostal), N''),
           @Referencias        = NULLIF(TRIM(@Referencias), N'');

    SELECT @NumeroError = v.NumeroError, @MensajeError = v.MensajeError
    FROM dbo.FU_Envios_ValidarDireccion(@Alias, @NombreDestinatario, @Telefono, @Linea1, @Linea2, @CodigoPostal, @Referencias) AS v;
    IF @NumeroError IS NOT NULL
        THROW @NumeroError, @MensajeError, 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.Municipio AS m WHERE m.IDMunicipio = @IDMunicipio)
        THROW 50111, N'MUNICIPIO_NO_ENCONTRADO: el municipio no existe.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE dbo.Direccion
        SET Alias = @Alias, NombreDestinatario = @NombreDestinatario, Telefono = @Telefono, Linea1 = @Linea1, Linea2 = @Linea2,
            IDMunicipio = @IDMunicipio, CodigoPostal = @CodigoPostal, Referencias = @Referencias, FechaModificacion = SYSUTCDATETIME()
        WHERE IDDireccion = @IDDireccion AND IDUsuario = @IDUsuario AND Activo = 1;

        IF @@ROWCOUNT = 0
            THROW 50113, N'DIRECCION_NO_ENCONTRADA: la dirección no existe.', 1;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    EXEC dbo.SP_Direcciones_Listar @IDUsuario = @IDUsuario;
END;
GO

/* Marca una dirección propia y activa como predeterminada; la anterior deja de serlo. Idempotente. */
CREATE OR ALTER PROCEDURE dbo.SP_Direcciones_MarcarPredeterminada
    @IDUsuario   INT,
    @IDDireccion INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuario) AS a WHERE a.CodigoRol = 'CLIENTE')
        THROW 50201, N'PERMISO_DENEGADO: solo un cliente activo tiene libreta de direcciones.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        SELECT @IDUsuario = u.IDUsuario FROM dbo.Usuario AS u WITH (UPDLOCK) WHERE u.IDUsuario = @IDUsuario;

        IF NOT EXISTS (SELECT 1 FROM dbo.Direccion AS d WHERE d.IDDireccion = @IDDireccion AND d.IDUsuario = @IDUsuario AND d.Activo = 1)
            THROW 50113, N'DIRECCION_NO_ENCONTRADA: la dirección no existe.', 1;

        IF NOT EXISTS (SELECT 1 FROM dbo.Direccion AS d WHERE d.IDDireccion = @IDDireccion AND d.EsPredeterminada = 1)
        BEGIN
            UPDATE dbo.Direccion SET EsPredeterminada = 0, FechaModificacion = SYSUTCDATETIME()
            WHERE IDUsuario = @IDUsuario AND EsPredeterminada = 1;

            UPDATE dbo.Direccion SET EsPredeterminada = 1, FechaModificacion = SYSUTCDATETIME()
            WHERE IDDireccion = @IDDireccion;
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    EXEC dbo.SP_Direcciones_Listar @IDUsuario = @IDUsuario;
END;
GO

/*
    Elimina (desactiva) una dirección propia. Si era la predeterminada, la más reciente de las
    restantes pasa a serlo. Idempotente: una dirección propia ya eliminada no es error.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Direcciones_Eliminar
    @IDUsuario   INT,
    @IDDireccion INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @EraPredeterminada BIT;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuario) AS a WHERE a.CodigoRol = 'CLIENTE')
        THROW 50201, N'PERMISO_DENEGADO: solo un cliente activo tiene libreta de direcciones.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        SELECT @IDUsuario = u.IDUsuario FROM dbo.Usuario AS u WITH (UPDLOCK) WHERE u.IDUsuario = @IDUsuario;

        SELECT @EraPredeterminada = d.EsPredeterminada
        FROM dbo.Direccion AS d
        WHERE d.IDDireccion = @IDDireccion AND d.IDUsuario = @IDUsuario;

        IF @EraPredeterminada IS NULL
            THROW 50113, N'DIRECCION_NO_ENCONTRADA: la dirección no existe.', 1;

        UPDATE dbo.Direccion SET Activo = 0, EsPredeterminada = 0, FechaModificacion = SYSUTCDATETIME()
        WHERE IDDireccion = @IDDireccion AND Activo = 1;

        IF @EraPredeterminada = 1
            UPDATE dbo.Direccion SET EsPredeterminada = 1, FechaModificacion = SYSUTCDATETIME()
            WHERE IDDireccion = (SELECT TOP (1) d.IDDireccion
                                 FROM dbo.Direccion AS d
                                 WHERE d.IDUsuario = @IDUsuario AND d.Activo = 1
                                 ORDER BY d.FechaCreacion DESC, d.IDDireccion DESC);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    EXEC dbo.SP_Direcciones_Listar @IDUsuario = @IDUsuario;
END;
GO

/* === Métodos de envío (administración) ==================================================== */

/* Detalle para el formulario de edición, con VersionFila y los pedidos que lo usaron. */
CREATE OR ALTER PROCEDURE dbo.SP_Envios_ObtenerMetodo
    @IDUsuarioAccion INT,
    @IDMetodoEnvio   INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar los métodos de envío.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.MetodoEnvio AS me WHERE me.IDMetodoEnvio = @IDMetodoEnvio)
        THROW 50114, N'METODO_ENVIO_NO_ENCONTRADO: el método de envío no existe.', 1;

    SELECT me.IDMetodoEnvio, me.Nombre, me.Descripcion, me.Costo, me.DiasEstimadosMin, me.DiasEstimadosMax, me.Activo,
           (SELECT COUNT(*) FROM dbo.Pedido AS p WHERE p.IDMetodoEnvio = me.IDMetodoEnvio) AS Pedidos,
           me.FechaCreacion, me.FechaModificacion, me.VersionFila
    FROM dbo.MetodoEnvio AS me
    WHERE me.IDMetodoEnvio = @IDMetodoEnvio;
END;
GO

/* Todos los métodos (activos e inactivos). Sin paginación: son pocos. */
CREATE OR ALTER PROCEDURE dbo.SP_Envios_ListarMetodos
    @IDUsuarioAccion INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar los métodos de envío.', 1;

    SELECT me.IDMetodoEnvio, me.Nombre, me.Descripcion, me.Costo, me.DiasEstimadosMin, me.DiasEstimadosMax, me.Activo,
           me.FechaCreacion, me.FechaModificacion
    FROM dbo.MetodoEnvio AS me
    ORDER BY me.Activo DESC, me.Costo, me.Nombre;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Envios_CrearMetodo
    @IDUsuarioAccion  INT,
    @Nombre           NVARCHAR(101),
    @Descripcion      NVARCHAR(301) = NULL,
    @Costo            DECIMAL(12, 2),
    @DiasEstimadosMin INT,
    @DiasEstimadosMax INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @NumeroError INT, @MensajeError NVARCHAR(400), @IDMetodoEnvio INT;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar los métodos de envío.', 1;

    SELECT @Nombre = TRIM(ISNULL(@Nombre, N'')), @Descripcion = NULLIF(TRIM(@Descripcion), N'');

    SELECT @NumeroError = v.NumeroError, @MensajeError = v.MensajeError
    FROM dbo.FU_Envios_ValidarMetodo(@Nombre, @Descripcion, @Costo, @DiasEstimadosMin, @DiasEstimadosMax) AS v;
    IF @NumeroError IS NOT NULL
        THROW @NumeroError, @MensajeError, 1;

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        INSERT INTO dbo.MetodoEnvio (Nombre, Descripcion, Costo, DiasEstimadosMin, DiasEstimadosMax)
        VALUES (@Nombre, @Descripcion, @Costo, @DiasEstimadosMin, @DiasEstimadosMax);
        SET @IDMetodoEnvio = SCOPE_IDENTITY();

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorNuevo)
        SELECT @IDUsuarioAccion, 'ENVIOS', 'MetodoEnvio', CAST(@IDMetodoEnvio AS VARCHAR(50)), 'CREAR',
               (SELECT me.IDMetodoEnvio, me.Nombre, me.Descripcion, me.Costo, me.DiasEstimadosMin, me.DiasEstimadosMax, me.Activo
                FROM dbo.MetodoEnvio AS me
                WHERE me.IDMetodoEnvio = @IDMetodoEnvio
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() IN (2601, 2627) AND ERROR_MESSAGE() LIKE N'%UQ_MetodoEnvio_Nombre%'
            THROW 51201, N'NOMBRE_REGISTRADO: ya existe un método de envío con ese nombre.', 1;
        THROW;
    END CATCH;

    EXEC dbo.SP_Envios_ObtenerMetodo @IDUsuarioAccion = @IDUsuarioAccion, @IDMetodoEnvio = @IDMetodoEnvio;
END;
GO

/*
    Control de edición concurrente con @VersionFila. Un nuevo costo aplica a los checkouts que
    se inicien después; los pedidos ya realizados conservan el costo que pagaron.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Envios_ActualizarMetodo
    @IDUsuarioAccion  INT,
    @IDMetodoEnvio    INT,
    @Nombre           NVARCHAR(101),
    @Descripcion      NVARCHAR(301) = NULL,
    @Costo            DECIMAL(12, 2),
    @DiasEstimadosMin INT,
    @DiasEstimadosMax INT,
    @VersionFila      BINARY(8)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @NumeroError INT, @MensajeError NVARCHAR(400), @VersionActual BINARY(8), @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX);

    IF @IDMetodoEnvio IS NULL OR @VersionFila IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el método de envío y su versión.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar los métodos de envío.', 1;

    SELECT @Nombre = TRIM(ISNULL(@Nombre, N'')), @Descripcion = NULLIF(TRIM(@Descripcion), N'');

    SELECT @NumeroError = v.NumeroError, @MensajeError = v.MensajeError
    FROM dbo.FU_Envios_ValidarMetodo(@Nombre, @Descripcion, @Costo, @DiasEstimadosMin, @DiasEstimadosMax) AS v;
    IF @NumeroError IS NOT NULL
        THROW @NumeroError, @MensajeError, 1;

    SET @Nuevo = (SELECT @Nombre AS Nombre, @Descripcion AS Descripcion, @Costo AS Costo,
                         CAST(@DiasEstimadosMin AS TINYINT) AS DiasEstimadosMin, CAST(@DiasEstimadosMax AS TINYINT) AS DiasEstimadosMax
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        SELECT @VersionActual = me.VersionFila,
               @Anterior = (SELECT me.Nombre, me.Descripcion, me.Costo, me.DiasEstimadosMin, me.DiasEstimadosMax
                            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES)
        FROM dbo.MetodoEnvio AS me WITH (UPDLOCK)
        WHERE me.IDMetodoEnvio = @IDMetodoEnvio;

        IF @VersionActual IS NULL
            THROW 50114, N'METODO_ENVIO_NO_ENCONTRADO: el método de envío no existe.', 1;
        IF @VersionActual <> @VersionFila
            THROW 51203, N'EDICION_CONCURRENTE: otro usuario modificó el registro; vuelva a cargarlo.', 1;

        -- Comparación binaria: un cambio solo de mayúsculas o tildes también es un cambio.
        IF @Anterior COLLATE Latin1_General_100_BIN2 <> @Nuevo
        BEGIN
            UPDATE dbo.MetodoEnvio
            SET Nombre = @Nombre, Descripcion = @Descripcion, Costo = @Costo, DiasEstimadosMin = @DiasEstimadosMin,
                DiasEstimadosMax = @DiasEstimadosMax, FechaModificacion = SYSUTCDATETIME()
            WHERE IDMetodoEnvio = @IDMetodoEnvio;

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioAccion, 'ENVIOS', 'MetodoEnvio', CAST(@IDMetodoEnvio AS VARCHAR(50)), 'MODIFICAR', @Anterior, @Nuevo);
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() IN (2601, 2627) AND ERROR_MESSAGE() LIKE N'%UQ_MetodoEnvio_Nombre%'
            THROW 51201, N'NOMBRE_REGISTRADO: ya existe un método de envío con ese nombre.', 1;
        THROW;
    END CATCH;

    EXEC dbo.SP_Envios_ObtenerMetodo @IDUsuarioAccion = @IDUsuarioAccion, @IDMetodoEnvio = @IDMetodoEnvio;
END;
GO

/*
    Activar o desactivar. Un método desactivado deja de ofrecerse en la tienda; no se puede
    desactivar el último activo. Los métodos se bloquean en orden de ID para que dos
    desactivaciones simultáneas no dejen la tienda sin ninguno.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Envios_CambiarEstadoMetodo
    @IDUsuarioAccion INT,
    @IDMetodoEnvio   INT,
    @Activo          BIT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ActivoActual BIT, @OtrosActivos INT;

    IF @IDMetodoEnvio IS NULL OR @Activo IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el método de envío y el estado.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar los métodos de envío.', 1;

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        SELECT @OtrosActivos = SUM(CASE WHEN me.IDMetodoEnvio <> @IDMetodoEnvio AND me.Activo = 1 THEN 1 ELSE 0 END)
        FROM dbo.MetodoEnvio AS me WITH (UPDLOCK, HOLDLOCK);

        SELECT @ActivoActual = me.Activo FROM dbo.MetodoEnvio AS me WHERE me.IDMetodoEnvio = @IDMetodoEnvio;

        IF @ActivoActual IS NULL
            THROW 50114, N'METODO_ENVIO_NO_ENCONTRADO: el método de envío no existe.', 1;
        IF @Activo = 0 AND @ActivoActual = 1 AND @OtrosActivos = 0
            THROW 51502, N'ULTIMO_METODO_ENVIO: es el único método de envío activo; active otro antes de desactivarlo.', 1;

        IF @ActivoActual <> @Activo
        BEGIN
            UPDATE dbo.MetodoEnvio SET Activo = @Activo, FechaModificacion = SYSUTCDATETIME() WHERE IDMetodoEnvio = @IDMetodoEnvio;

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioAccion, 'ENVIOS', 'MetodoEnvio', CAST(@IDMetodoEnvio AS VARCHAR(50)),
                    CASE @Activo WHEN 1 THEN 'ACTIVAR' ELSE 'DESACTIVAR' END,
                    (SELECT CAST(1 - @Activo AS BIT) AS Activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                    (SELECT @Activo AS Activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    EXEC dbo.SP_Envios_ObtenerMetodo @IDUsuarioAccion = @IDUsuarioAccion, @IDMetodoEnvio = @IDMetodoEnvio;
END;
GO
