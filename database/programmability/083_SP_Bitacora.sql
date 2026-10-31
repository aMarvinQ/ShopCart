/*
    083_SP_Bitacora.sql
    Consulta de la bitácora (RF-09), solo para el administrador.

    - La bitácora la escriben los SPs de cada módulo en la misma transacción que el cambio; es
      inmutable (TR_Bitacora_Inmutable y DENY a la API). Aquí solo se consulta.
    - Filtros opcionales: módulo, acción, autor, entidad (y su ID) y rango de días de Guatemala,
      ambos incluidos, entre 2000 y 2099 (mismo criterio que los reportes).
    - Errores: ver docs/errores.md.
*/
:on error exit
SET NOCOUNT ON;
GO

/*
    Del más reciente al más antiguo, paginado. Devuelve los valores anterior y nuevo tal como
    se guardaron (JSON); la API los entrega como objetos. OPTION (RECOMPILE): con filtros
    opcionales, cada combinación usa el índice que le corresponde (módulo + fecha, fecha,
    entidad o autor).
*/
CREATE OR ALTER PROCEDURE dbo.SP_Bitacora_Listar
    @IDUsuarioAccion INT,
    @Modulo          VARCHAR(21) = NULL,
    @Accion          VARCHAR(21) = NULL,
    @IDUsuario       INT = NULL,
    @Entidad         VARCHAR(51) = NULL,
    @IDEntidad       VARCHAR(51) = NULL,
    @FechaDesde      DATE = NULL,
    @FechaHasta      DATE = NULL,
    @Pagina          INT = 1,
    @TamanoPagina    INT = 20,
    @TotalRegistros  INT = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @DesdeUtc DATETIME2(3), @HastaUtc DATETIME2(3);

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede consultar la bitácora.', 1;

    IF @Pagina IS NULL OR @Pagina < 1 OR @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50007, N'PAGINACION_INVALIDA: la página inicia en 1 y el tamaño va de 1 a 100.', 1;

    SELECT @Modulo = NULLIF(TRIM(@Modulo), ''), @Accion = NULLIF(TRIM(@Accion), ''),
           @Entidad = NULLIF(TRIM(@Entidad), ''), @IDEntidad = NULLIF(TRIM(@IDEntidad), '');

    -- Mismas listas que CK_Bitacora_Modulo y CK_Bitacora_Accion.
    IF @Modulo NOT IN ('CATALOGO', 'INVENTARIO', 'CUPONES', 'PEDIDOS', 'USUARIOS', 'ENVIOS', 'CONFIGURACION')
        THROW 50042, N'MODULO_INVALIDO: el módulo debe ser CATALOGO, INVENTARIO, CUPONES, PEDIDOS, USUARIOS, ENVIOS o CONFIGURACION.', 1;
    IF @Accion NOT IN ('CREAR', 'MODIFICAR', 'ACTIVAR', 'DESACTIVAR', 'CAMBIAR_ESTADO')
        THROW 50043, N'ACCION_INVALIDA: la acción debe ser CREAR, MODIFICAR, ACTIVAR, DESACTIVAR o CAMBIAR_ESTADO.', 1;

    -- Un ID solo identifica un registro dentro de su entidad (p. ej. el 5 de Producto).
    IF @IDEntidad IS NOT NULL AND @Entidad IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: para filtrar por ID se requiere la entidad.', 1;

    IF @FechaDesde > @FechaHasta OR @FechaDesde < '20000101' OR @FechaHasta > '20991231'
        THROW 50026, N'RANGO_FECHAS_INVALIDO: la fecha inicial no puede ser posterior a la final; las fechas van de 2000 a 2099.', 1;

    SELECT @DesdeUtc = r.DesdeUtc FROM dbo.FU_Reportes_RangoUtc(@FechaDesde, @FechaDesde) AS r;
    SELECT @HastaUtc = r.HastaUtc FROM dbo.FU_Reportes_RangoUtc(@FechaHasta, @FechaHasta) AS r;

    SELECT @TotalRegistros = COUNT(*)
    FROM dbo.Bitacora AS b
    WHERE (@Modulo IS NULL OR b.Modulo = @Modulo)
      AND (@Accion IS NULL OR b.Accion = @Accion)
      AND (@IDUsuario IS NULL OR b.IDUsuario = @IDUsuario)
      AND (@Entidad IS NULL OR b.Entidad = @Entidad)
      AND (@IDEntidad IS NULL OR b.IDEntidad = @IDEntidad)
      AND (@DesdeUtc IS NULL OR b.Fecha >= @DesdeUtc)
      AND (@HastaUtc IS NULL OR b.Fecha < @HastaUtc)
    OPTION (RECOMPILE);

    SELECT b.IDBitacora, b.Fecha, b.IDUsuario, CONCAT(u.Nombre, N' ', u.Apellido) AS Usuario, u.Correo, r.Codigo AS CodigoRol,
           b.Modulo, b.Entidad, b.IDEntidad, b.Accion, b.ValorAnterior, b.ValorNuevo
    FROM dbo.Bitacora AS b
    JOIN dbo.Usuario AS u ON u.IDUsuario = b.IDUsuario
    JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
    WHERE (@Modulo IS NULL OR b.Modulo = @Modulo)
      AND (@Accion IS NULL OR b.Accion = @Accion)
      AND (@IDUsuario IS NULL OR b.IDUsuario = @IDUsuario)
      AND (@Entidad IS NULL OR b.Entidad = @Entidad)
      AND (@IDEntidad IS NULL OR b.IDEntidad = @IDEntidad)
      AND (@DesdeUtc IS NULL OR b.Fecha >= @DesdeUtc)
      AND (@HastaUtc IS NULL OR b.Fecha < @HastaUtc)
    ORDER BY b.Fecha DESC, b.IDBitacora DESC
    OFFSET CAST(@Pagina - 1 AS BIGINT) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY
    OPTION (RECOMPILE);
END;
GO
