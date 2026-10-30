/*
    077_SP_Cupones.sql
    Administración de cupones (RF-05): crear, editar, activar o desactivar, listar y detalle.
    Solo administradores. Aplicar un cupón al carrito está en 076_SP_Carrito.sql.

    - Nada se elimina: un cupón se desactiva (hay pedidos que lo referencian).
    - Tras el primer uso quedan fijos código, tipo, valor y categoría: para cambiar la
      promoción se crea otro cupón, así los reportes por cupón no mezclan dos promociones.
      Descripción, vigencia, monto mínimo, límites y "solo registrados" siguen editables;
      el límite total nunca baja de los usos que ya tiene.
    - Aplicar un cupón no consume usos: se consumen al pagar (módulo de pedidos).
    - Los cambios quedan en Bitacora (módulo CUPONES). Repetir los valores actuales no es un
      error ni genera bitácora.
    - Fechas en UTC: la API convierte desde la hora de Guatemala.
    - Errores: ver docs/errores.md.
*/
:on error exit
SET NOCOUNT ON;
GO

/*
    Detalle para el formulario de edición, con VersionFila (control de edición concurrente),
    la situación actual, el monto descontado en pedidos no cancelados y TerminosBloqueados
    (ya se usó: código, tipo, valor y categoría no se pueden cambiar).
*/
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_Obtener
    @IDUsuarioAccion INT,
    @IDCupon         INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar cupones.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.Cupon AS c WHERE c.IDCupon = @IDCupon)
        THROW 50110, N'CUPON_NO_ENCONTRADO: el cupón no existe.', 1;

    SELECT c.IDCupon, c.Codigo, c.Descripcion, c.TipoDescuento, c.Valor, c.MontoMinimo, c.FechaInicio, c.FechaFin,
           c.LimiteUsosTotal, c.LimiteUsosPorCliente, c.UsosActuales, c.IDCategoria, cat.Nombre AS Categoria,
           c.SoloRegistrados, c.Activo, s.Situacion, ISNULL(u.MontoDescontado, 0) AS MontoDescontado,
           CAST(CASE WHEN u.Usos > 0 THEN 1 ELSE 0 END AS BIT) AS TerminosBloqueados,
           c.FechaCreacion, c.FechaModificacion, c.VersionFila
    FROM dbo.Cupon AS c
    JOIN dbo.FU_Cupones_Situacion(SYSUTCDATETIME()) AS s ON s.IDCupon = c.IDCupon
    LEFT JOIN dbo.Categoria AS cat ON cat.IDCategoria = c.IDCategoria
    OUTER APPLY (
        SELECT COUNT(*) AS Usos,
               SUM(CASE WHEN cu.FechaReversion IS NULL THEN cu.MontoDescontado ELSE 0 END) AS MontoDescontado
        FROM dbo.CuponUso AS cu
        WHERE cu.IDCupon = c.IDCupon
    ) AS u
    WHERE c.IDCupon = @IDCupon;
END;
GO

/*
    Listado para el panel, del más reciente al más antiguo. Filtros opcionales (NULL = sin
    filtro): búsqueda en código o descripción (comodines escapados) y situación
    (VIGENTE, PROGRAMADO, VENCIDO, AGOTADO, INACTIVO).
*/
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_Listar
    @IDUsuarioAccion INT,
    @Busqueda        NVARCHAR(101) = NULL,
    @Situacion       VARCHAR(11) = NULL,
    @Pagina          INT = 1,
    @TamanoPagina    INT = 20,
    @TotalRegistros  INT = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME(), @Patron NVARCHAR(410);

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar cupones.', 1;

    IF @Pagina IS NULL OR @Pagina < 1 OR @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50007, N'PAGINACION_INVALIDA: la página inicia en 1 y el tamaño va de 1 a 100.', 1;

    SET @Busqueda = NULLIF(TRIM(@Busqueda), N'');
    IF LEN(@Busqueda) > 100
        THROW 50008, N'BUSQUEDA_INVALIDA: la búsqueda admite como máximo 100 caracteres.', 1;

    SET @Situacion = NULLIF(UPPER(TRIM(@Situacion)), '');
    IF @Situacion NOT IN ('VIGENTE', 'PROGRAMADO', 'VENCIDO', 'AGOTADO', 'INACTIVO')
        THROW 50033, N'SITUACION_INVALIDA: la situación es VIGENTE, PROGRAMADO, VENCIDO, AGOTADO o INACTIVO.', 1;

    SET @Patron = N'%' + REPLACE(REPLACE(REPLACE(REPLACE(@Busqueda,
                      N'\', N'\\'), N'%', N'\%'), N'_', N'\_'), N'[', N'\[') + N'%';

    SELECT @TotalRegistros = COUNT(*)
    FROM dbo.Cupon AS c
    JOIN dbo.FU_Cupones_Situacion(@Ahora) AS s ON s.IDCupon = c.IDCupon
    WHERE (@Patron IS NULL OR c.Codigo LIKE @Patron ESCAPE N'\' OR c.Descripcion LIKE @Patron ESCAPE N'\')
      AND (@Situacion IS NULL OR s.Situacion = @Situacion)
    OPTION (RECOMPILE);

    SELECT c.IDCupon, c.Codigo, c.Descripcion, c.TipoDescuento, c.Valor, c.MontoMinimo, c.FechaInicio, c.FechaFin,
           c.LimiteUsosTotal, c.LimiteUsosPorCliente, c.UsosActuales, c.IDCategoria, cat.Nombre AS Categoria,
           c.SoloRegistrados, c.Activo, s.Situacion
    FROM dbo.Cupon AS c
    JOIN dbo.FU_Cupones_Situacion(@Ahora) AS s ON s.IDCupon = c.IDCupon
    LEFT JOIN dbo.Categoria AS cat ON cat.IDCategoria = c.IDCategoria
    WHERE (@Patron IS NULL OR c.Codigo LIKE @Patron ESCAPE N'\' OR c.Descripcion LIKE @Patron ESCAPE N'\')
      AND (@Situacion IS NULL OR s.Situacion = @Situacion)
    ORDER BY c.IDCupon DESC
    OFFSET CAST(@Pagina - 1 AS BIGINT) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY
    OPTION (RECOMPILE);
END;
GO

/*
    Crea un cupón activo. El código se guarda en mayúsculas (la tienda normaliza lo que
    escribe el cliente). No se crea un cupón que ya venció. La categoría (opcional) debe
    existir y estar activa.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_Crear
    @IDUsuarioAccion      INT,
    @Codigo               VARCHAR(31),
    @Descripcion          NVARCHAR(301),
    @TipoDescuento        VARCHAR(13),
    @Valor                DECIMAL(12, 2),
    @MontoMinimo          DECIMAL(12, 2) = 0,
    @FechaInicio          DATETIME2(3),
    @FechaFin             DATETIME2(3),
    @LimiteUsosTotal      INT = NULL,
    @LimiteUsosPorCliente INT = NULL,
    @IDCategoria          INT = NULL,
    @SoloRegistrados      BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @NumeroError INT, @MensajeError NVARCHAR(400), @IDCupon INT;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar cupones.', 1;

    SELECT @Codigo          = UPPER(TRIM(ISNULL(@Codigo, ''))),
           @Descripcion     = TRIM(ISNULL(@Descripcion, N'')),
           @TipoDescuento   = UPPER(TRIM(ISNULL(@TipoDescuento, ''))),
           @SoloRegistrados = ISNULL(@SoloRegistrados, 0);

    SELECT @NumeroError = v.NumeroError, @MensajeError = v.MensajeError
    FROM dbo.FU_Cupones_ValidarDatos(@Codigo, @Descripcion, @TipoDescuento, @Valor, @MontoMinimo, @FechaInicio, @FechaFin,
                                     @LimiteUsosTotal, @LimiteUsosPorCliente) AS v;
    IF @NumeroError IS NOT NULL
        THROW @NumeroError, @MensajeError, 1;

    IF @FechaFin <= SYSUTCDATETIME()
        THROW 50026, N'RANGO_FECHAS_INVALIDO: la fecha de fin ya pasó.', 1;

    IF @IDCategoria IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Categoria AS c WHERE c.IDCategoria = @IDCategoria AND c.Activo = 1)
        THROW 50102, N'CATEGORIA_NO_ENCONTRADA: la categoría no existe o está inactiva.', 1;

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        INSERT INTO dbo.Cupon (Codigo, Descripcion, TipoDescuento, Valor, MontoMinimo, FechaInicio, FechaFin,
                               LimiteUsosTotal, LimiteUsosPorCliente, IDCategoria, SoloRegistrados)
        VALUES (@Codigo, @Descripcion, @TipoDescuento, @Valor, @MontoMinimo, @FechaInicio, @FechaFin,
                @LimiteUsosTotal, @LimiteUsosPorCliente, @IDCategoria, @SoloRegistrados);
        SET @IDCupon = SCOPE_IDENTITY();

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorNuevo)
        SELECT @IDUsuarioAccion, 'CUPONES', 'Cupon', CAST(@IDCupon AS VARCHAR(50)), 'CREAR',
               (SELECT c.IDCupon, c.Codigo, c.Descripcion, c.TipoDescuento, c.Valor, c.MontoMinimo, c.FechaInicio, c.FechaFin,
                       c.LimiteUsosTotal, c.LimiteUsosPorCliente, c.IDCategoria, c.SoloRegistrados, c.Activo
                FROM dbo.Cupon AS c
                WHERE c.IDCupon = @IDCupon
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() IN (2601, 2627) AND ERROR_MESSAGE() LIKE N'%UQ_Cupon_Codigo%'
            THROW 51410, N'CODIGO_REGISTRADO: ya existe un cupón con ese código.', 1;
        THROW;
    END CATCH;

    EXEC dbo.SP_Cupones_Obtener @IDUsuarioAccion = @IDUsuarioAccion, @IDCupon = @IDCupon;
END;
GO

/*
    Control de edición concurrente: @VersionFila es la que recibió el formulario. Recibe todos
    los datos editables. Un cupón con usos rechaza cambios de código, tipo, valor o
    categoría (CUPON_CON_USOS); el límite total no puede quedar por debajo de los usos. El
    cupón se bloquea antes de comparar: el pago que consume un uso también lo bloquea.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_Actualizar
    @IDUsuarioAccion      INT,
    @IDCupon              INT,
    @Codigo               VARCHAR(31),
    @Descripcion          NVARCHAR(301),
    @TipoDescuento        VARCHAR(13),
    @Valor                DECIMAL(12, 2),
    @MontoMinimo          DECIMAL(12, 2),
    @FechaInicio          DATETIME2(3),
    @FechaFin             DATETIME2(3),
    @LimiteUsosTotal      INT = NULL,
    @LimiteUsosPorCliente INT = NULL,
    @IDCategoria          INT = NULL,
    @SoloRegistrados      BIT,
    @VersionFila          BINARY(8)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @NumeroError INT, @MensajeError NVARCHAR(400), @VersionActual BINARY(8), @UsosActuales INT, @IDCategoriaAnterior INT,
            @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX), @TerminosAnteriores NVARCHAR(MAX), @TerminosNuevos NVARCHAR(MAX);

    IF @IDCupon IS NULL OR @VersionFila IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el cupón y su versión.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar cupones.', 1;

    SELECT @Codigo          = UPPER(TRIM(ISNULL(@Codigo, ''))),
           @Descripcion     = TRIM(ISNULL(@Descripcion, N'')),
           @TipoDescuento   = UPPER(TRIM(ISNULL(@TipoDescuento, ''))),
           @SoloRegistrados = ISNULL(@SoloRegistrados, 0);

    SELECT @NumeroError = v.NumeroError, @MensajeError = v.MensajeError
    FROM dbo.FU_Cupones_ValidarDatos(@Codigo, @Descripcion, @TipoDescuento, @Valor, @MontoMinimo, @FechaInicio, @FechaFin,
                                     @LimiteUsosTotal, @LimiteUsosPorCliente) AS v;
    IF @NumeroError IS NOT NULL
        THROW @NumeroError, @MensajeError, 1;

    SET @TerminosNuevos = (SELECT @Codigo AS Codigo, @TipoDescuento AS TipoDescuento, @Valor AS Valor, @IDCategoria AS IDCategoria
                           FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);
    SET @Nuevo = (SELECT @Codigo AS Codigo, @Descripcion AS Descripcion, @TipoDescuento AS TipoDescuento, @Valor AS Valor,
                         @MontoMinimo AS MontoMinimo, @FechaInicio AS FechaInicio, @FechaFin AS FechaFin,
                         @LimiteUsosTotal AS LimiteUsosTotal, @LimiteUsosPorCliente AS LimiteUsosPorCliente,
                         @IDCategoria AS IDCategoria, @SoloRegistrados AS SoloRegistrados
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        SELECT @VersionActual = c.VersionFila, @UsosActuales = c.UsosActuales, @IDCategoriaAnterior = c.IDCategoria,
               @TerminosAnteriores = (SELECT c.Codigo, c.TipoDescuento, c.Valor, c.IDCategoria
                                      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES),
               @Anterior = (SELECT c.Codigo, c.Descripcion, c.TipoDescuento, c.Valor, c.MontoMinimo, c.FechaInicio, c.FechaFin,
                                   c.LimiteUsosTotal, c.LimiteUsosPorCliente, c.IDCategoria, c.SoloRegistrados
                            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES)
        FROM dbo.Cupon AS c WITH (UPDLOCK)
        WHERE c.IDCupon = @IDCupon;

        IF @VersionActual IS NULL
            THROW 50110, N'CUPON_NO_ENCONTRADO: el cupón no existe.', 1;
        IF @VersionActual <> @VersionFila
            THROW 51203, N'EDICION_CONCURRENTE: otro usuario modificó el registro; vuelva a cargarlo.', 1;

        IF @TerminosAnteriores COLLATE Latin1_General_100_BIN2 <> @TerminosNuevos
           AND EXISTS (SELECT 1 FROM dbo.CuponUso AS cu WHERE cu.IDCupon = @IDCupon)
            THROW 51411, N'CUPON_CON_USOS: el cupón ya se usó; su código, tipo, valor y categoría no se pueden cambiar (cree otro cupón).', 1;

        IF @LimiteUsosTotal < @UsosActuales
        BEGIN
            SET @MensajeError = CONCAT(N'LIMITE_MENOR_QUE_USOS: el cupón ya tiene ', @UsosActuales, N' usos; el límite total no puede ser menor.');
            THROW 51412, @MensajeError, 1;
        END;

        IF @IDCategoria <> ISNULL(@IDCategoriaAnterior, -1)
           AND NOT EXISTS (SELECT 1 FROM dbo.Categoria AS c WHERE c.IDCategoria = @IDCategoria AND c.Activo = 1)
            THROW 50102, N'CATEGORIA_NO_ENCONTRADA: la categoría no existe o está inactiva.', 1;

        -- Comparación binaria: un cambio solo de mayúsculas o tildes también es un cambio.
        IF @Anterior COLLATE Latin1_General_100_BIN2 <> @Nuevo
        BEGIN
            UPDATE dbo.Cupon
            SET Codigo = @Codigo, Descripcion = @Descripcion, TipoDescuento = @TipoDescuento, Valor = @Valor,
                MontoMinimo = @MontoMinimo, FechaInicio = @FechaInicio, FechaFin = @FechaFin,
                LimiteUsosTotal = @LimiteUsosTotal, LimiteUsosPorCliente = @LimiteUsosPorCliente,
                IDCategoria = @IDCategoria, SoloRegistrados = @SoloRegistrados, FechaModificacion = SYSUTCDATETIME()
            WHERE IDCupon = @IDCupon;

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioAccion, 'CUPONES', 'Cupon', CAST(@IDCupon AS VARCHAR(50)), 'MODIFICAR', @Anterior, @Nuevo);
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() IN (2601, 2627) AND ERROR_MESSAGE() LIKE N'%UQ_Cupon_Codigo%'
            THROW 51410, N'CODIGO_REGISTRADO: ya existe un cupón con ese código.', 1;
        THROW;
    END CATCH;

    EXEC dbo.SP_Cupones_Obtener @IDUsuarioAccion = @IDUsuarioAccion, @IDCupon = @IDCupon;
END;
GO

/*
    Activar o desactivar. Un cupón desactivado deja de aplicarse: los carritos que lo tienen lo
    muestran como no válido y el checkout no avanza hasta quitarlo.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_CambiarEstado
    @IDUsuarioAccion INT,
    @IDCupon         INT,
    @Activo          BIT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @IDCupon IS NULL OR @Activo IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el cupón y el estado.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar cupones.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.Cupon AS c WHERE c.IDCupon = @IDCupon)
        THROW 50110, N'CUPON_NO_ENCONTRADO: el cupón no existe.', 1;

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        UPDATE dbo.Cupon
        SET Activo = @Activo, FechaModificacion = SYSUTCDATETIME()
        WHERE IDCupon = @IDCupon AND Activo <> @Activo;

        IF @@ROWCOUNT = 1
            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioAccion, 'CUPONES', 'Cupon', CAST(@IDCupon AS VARCHAR(50)),
                    CASE @Activo WHEN 1 THEN 'ACTIVAR' ELSE 'DESACTIVAR' END,
                    (SELECT CAST(1 - @Activo AS BIT) AS Activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                    (SELECT @Activo AS Activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    EXEC dbo.SP_Cupones_Obtener @IDUsuarioAccion = @IDUsuarioAccion, @IDCupon = @IDCupon;
END;
GO
