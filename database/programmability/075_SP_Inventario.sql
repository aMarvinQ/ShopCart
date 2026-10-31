/*
    075_SP_Inventario.sql
    Inventario (RF-03): entradas y ajustes manuales, existencias, kardex y conciliación.
    Operadores y administradores.

    - La existencia solo cambia junto con su movimiento de kardex, en la misma transacción y
      con la variante bloqueada: ExistenciaFisica = suma del kardex siempre.
    - Aquí solo se registran los tipos marcados como manuales (TipoMovimiento.PermiteRegistroManual:
      entrada por compra, ajuste de entrada, ajuste de salida). Ventas, cancelaciones y
      devoluciones las registran sus propios módulos con el mismo mecanismo.
    - Una salida solo puede tomar unidades disponibles: las reservadas por un checkout en curso
      no se tocan, así quien está pagando no se queda sin la unidad que apartó.
    - Orden de bloqueo: variantes por IDVariante ascendente, el mismo que usa el checkout.
    - Errores: ver docs/errores.md.
*/
:on error exit
SET NOCOUNT ON;
GO

/*
    Registra un movimiento manual con una o varias variantes (p. ej. una compra con varias
    líneas). Las cantidades llegan positivas; el signo lo pone el tipo de movimiento. El motivo
    es obligatorio si el tipo lo exige (ajustes) y se guarda en cada línea del kardex.
    Devuelve una fila por línea con los saldos resultantes.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_RegistrarMovimiento
    @IDUsuarioAccion INT,
    @CodigoTipo      VARCHAR(31),
    @Motivo          NVARCHAR(301) = NULL,
    @Lineas          dbo.TT_Inventario_Movimiento READONLY
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME(), @IDTipo TINYINT, @Signo SMALLINT, @RequiereMotivo BIT,
            @MensajeError NVARCHAR(400), @Bloqueadas INT;
    DECLARE @Movimientos TABLE (IDMovimientoInventario BIGINT, IDVariante INT, Cantidad INT, SaldoAnterior INT, SaldoNuevo INT);

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol IN ('OPERADOR', 'ADMIN'))
        THROW 50201, N'PERMISO_DENEGADO: solo un operador o administrador activo puede registrar movimientos de inventario.', 1;

    SELECT @CodigoTipo = UPPER(TRIM(@CodigoTipo)), @Motivo = NULLIF(TRIM(@Motivo), N'');

    SELECT @IDTipo = t.IDTipoMovimiento, @Signo = t.Signo, @RequiereMotivo = t.RequiereMotivo
    FROM dbo.TipoMovimiento AS t
    WHERE t.Codigo = @CodigoTipo AND t.PermiteRegistroManual = 1;
    IF @IDTipo IS NULL
        THROW 50023, N'TIPO_MOVIMIENTO_INVALIDO: el tipo de movimiento no existe o no se puede registrar manualmente.', 1;

    IF @RequiereMotivo = 1 AND @Motivo IS NULL
        THROW 50024, N'MOTIVO_INVALIDO: este tipo de movimiento exige un motivo.', 1;
    IF LEN(@Motivo) > 300
        THROW 50024, N'MOTIVO_INVALIDO: el motivo admite como máximo 300 caracteres.', 1;

    IF NOT EXISTS (SELECT 1 FROM @Lineas)
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere al menos una línea.', 1;
    IF EXISTS (SELECT 1 FROM @Lineas AS l WHERE l.Cantidad <= 0)
        THROW 50025, N'CANTIDAD_INVALIDA: las cantidades deben ser mayores que cero.', 1;

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        -- Bloquea las variantes recorriendo la llave primaria de @Lineas (IDVariante ascendente):
        -- FORCE ORDER + LOOP JOIN fijan ese recorrido y por lo tanto el orden de los bloqueos.
        SELECT @Bloqueadas = COUNT(*)
        FROM @Lineas AS l
        JOIN dbo.Variante AS v WITH (UPDLOCK, ROWLOCK) ON v.IDVariante = l.IDVariante
        OPTION (FORCE ORDER, LOOP JOIN);

        IF @Bloqueadas <> (SELECT COUNT(*) FROM @Lineas)
            THROW 50106, N'VARIANTE_NO_ENCONTRADA: una variante no existe.', 1;

        -- Con las variantes bloqueadas, la disponibilidad ya incluye las reservas de quien bloqueó antes.
        IF @Signo = -1
        BEGIN
            SELECT TOP (1) @MensajeError = CONCAT(N'STOCK_INSUFICIENTE: el SKU ', v.SKU, N' tiene ', d.Disponible,
                                                  N' unidades disponibles (las reservadas por un checkout en curso no se pueden retirar).')
            FROM @Lineas AS l
            JOIN dbo.Variante AS v ON v.IDVariante = l.IDVariante
            JOIN dbo.FU_Inventario_Disponibilidad(@Ahora) AS d ON d.IDVariante = l.IDVariante
            WHERE l.Cantidad > d.Disponible
            ORDER BY l.IDVariante;

            IF @MensajeError IS NOT NULL
                THROW 51301, @MensajeError, 1;
        END;

        INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimiento, Signo, Cantidad, SaldoAnterior, SaldoNuevo, Motivo, IDUsuario)
        OUTPUT inserted.IDMovimientoInventario, inserted.IDVariante, inserted.Cantidad, inserted.SaldoAnterior, inserted.SaldoNuevo
        INTO @Movimientos (IDMovimientoInventario, IDVariante, Cantidad, SaldoAnterior, SaldoNuevo)
        SELECT v.IDVariante, @IDTipo, @Signo, @Signo * l.Cantidad, v.ExistenciaFisica, v.ExistenciaFisica + @Signo * l.Cantidad,
               @Motivo, @IDUsuarioAccion
        FROM @Lineas AS l
        JOIN dbo.Variante AS v ON v.IDVariante = l.IDVariante;

        UPDATE v
        SET ExistenciaFisica = m.SaldoNuevo
        FROM dbo.Variante AS v
        JOIN @Movimientos AS m ON m.IDVariante = v.IDVariante;

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo)
        SELECT @IDUsuarioAccion, 'INVENTARIO', 'Variante', CAST(m.IDVariante AS VARCHAR(50)), 'MODIFICAR',
               (SELECT m.SaldoAnterior AS Existencia FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
               (SELECT m.SaldoNuevo AS Existencia, @CodigoTipo AS TipoMovimiento, m.Cantidad, @Motivo AS Motivo,
                       m.IDMovimientoInventario
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES)
        FROM @Movimientos AS m;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    SELECT m.IDMovimientoInventario, m.IDVariante, v.SKU, p.Nombre AS Producto, @CodigoTipo AS CodigoTipo,
           m.Cantidad, m.SaldoAnterior, m.SaldoNuevo, d.Disponible
    FROM @Movimientos AS m
    JOIN dbo.Variante AS v ON v.IDVariante = m.IDVariante
    JOIN dbo.Producto AS p ON p.IDProducto = v.IDProducto
    JOIN dbo.FU_Inventario_Disponibilidad(SYSUTCDATETIME()) AS d ON d.IDVariante = m.IDVariante
    ORDER BY m.IDVariante;
END;
GO

/*
    Existencias por variante para el panel: física, reservada y disponible. Filtros opcionales
    (NULL = sin filtro): búsqueda por producto o SKU (comodines escapados), categoría y solo
    agotadas (disponible = 0). Incluye variantes y productos inactivos, con su estado.
    @SoloExistenciaBaja: solo variantes en venta (variante y producto activos) con
    disponibilidad igual o menor que EXISTENCIA_MINIMA (el mismo criterio del dashboard).
*/
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_ListarExistencias
    @IDUsuarioAccion INT,
    @Busqueda        NVARCHAR(101) = NULL,
    @IDCategoria     INT = NULL,
    @SoloAgotadas    BIT = 0,
    @Pagina          INT = 1,
    @TamanoPagina    INT = 20,
    @TotalRegistros  INT = NULL OUTPUT,
    @SoloExistenciaBaja BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME(), @Patron NVARCHAR(410), @ExistenciaMinima INT;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol IN ('OPERADOR', 'ADMIN'))
        THROW 50201, N'PERMISO_DENEGADO: solo un operador o administrador activo puede consultar el inventario.', 1;

    IF @Pagina IS NULL OR @Pagina < 1 OR @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50007, N'PAGINACION_INVALIDA: la página inicia en 1 y el tamaño va de 1 a 100.', 1;

    SET @Busqueda = NULLIF(TRIM(@Busqueda), N'');
    IF LEN(@Busqueda) > 100
        THROW 50008, N'BUSQUEDA_INVALIDA: la búsqueda admite como máximo 100 caracteres.', 1;

    SET @Patron = N'%' + REPLACE(REPLACE(REPLACE(REPLACE(@Busqueda,
                      N'\', N'\\'), N'%', N'\%'), N'_', N'\_'), N'[', N'\[') + N'%';

    IF @SoloExistenciaBaja = 1
    BEGIN
        SET @ExistenciaMinima = (SELECT c.ExistenciaMinima FROM dbo.FU_Reportes_Configuracion() AS c);
        IF @ExistenciaMinima IS NULL
            THROW 59001, N'CONFIGURACION_INCOMPLETA: falta EXISTENCIA_MINIMA (0–999).', 1;
    END;

    SELECT @TotalRegistros = COUNT(*)
    FROM dbo.Variante AS v
    JOIN dbo.Producto AS p ON p.IDProducto = v.IDProducto
    JOIN dbo.FU_Inventario_Disponibilidad(@Ahora) AS d ON d.IDVariante = v.IDVariante
    WHERE (@IDCategoria IS NULL OR p.IDCategoria = @IDCategoria)
      AND (@Patron IS NULL OR p.Nombre LIKE @Patron ESCAPE N'\' OR v.SKU LIKE @Patron ESCAPE N'\')
      AND (@SoloAgotadas = 0 OR d.Disponible = 0)
      AND (@ExistenciaMinima IS NULL OR (v.Activo = 1 AND p.Activo = 1 AND d.Disponible <= @ExistenciaMinima))
    OPTION (RECOMPILE);

    SELECT v.IDVariante, v.SKU, p.IDProducto, p.Nombre AS Producto,
           ISNULL((SELECT STRING_AGG(av.Valor, N' / ') WITHIN GROUP (ORDER BY ISNULL(ca.Orden, 255), vav.IDAtributo)
                   FROM dbo.VarianteAtributoValor AS vav
                   JOIN dbo.AtributoValor AS av ON av.IDAtributoValor = vav.IDAtributoValor
                   LEFT JOIN dbo.CategoriaAtributo AS ca ON ca.IDCategoria = p.IDCategoria AND ca.IDAtributo = vav.IDAtributo
                   WHERE vav.IDVariante = v.IDVariante), N'') AS Descripcion,
           c.Nombre AS Categoria, d.ExistenciaFisica, d.Reservado, d.Disponible, v.Activo, p.Activo AS ProductoActivo
    FROM dbo.Variante AS v
    JOIN dbo.Producto AS p ON p.IDProducto = v.IDProducto
    JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
    JOIN dbo.FU_Inventario_Disponibilidad(@Ahora) AS d ON d.IDVariante = v.IDVariante
    WHERE (@IDCategoria IS NULL OR p.IDCategoria = @IDCategoria)
      AND (@Patron IS NULL OR p.Nombre LIKE @Patron ESCAPE N'\' OR v.SKU LIKE @Patron ESCAPE N'\')
      AND (@SoloAgotadas = 0 OR d.Disponible = 0)
      AND (@ExistenciaMinima IS NULL OR (v.Activo = 1 AND p.Activo = 1 AND d.Disponible <= @ExistenciaMinima))
    ORDER BY p.Nombre, v.SKU
    OFFSET CAST(@Pagina - 1 AS BIGINT) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY
    OPTION (RECOMPILE);
END;
GO

/*
    Kardex: movimientos del más reciente al más antiguo, con quién, cuándo, por qué y el
    documento que lo originó (pedido o devolución). Filtros opcionales: variante, tipo y
    rango de fechas en UTC, [desde, hasta) (la API convierte desde la hora de Guatemala).
*/
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_ListarKardex
    @IDUsuarioAccion INT,
    @IDVariante      INT = NULL,
    @CodigoTipo      VARCHAR(31) = NULL,
    @FechaDesde      DATETIME2(3) = NULL,
    @FechaHasta      DATETIME2(3) = NULL,
    @Pagina          INT = 1,
    @TamanoPagina    INT = 50,
    @TotalRegistros  INT = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @IDTipo TINYINT;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol IN ('OPERADOR', 'ADMIN'))
        THROW 50201, N'PERMISO_DENEGADO: solo un operador o administrador activo puede consultar el inventario.', 1;

    IF @Pagina IS NULL OR @Pagina < 1 OR @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50007, N'PAGINACION_INVALIDA: la página inicia en 1 y el tamaño va de 1 a 100.', 1;

    IF @FechaDesde >= @FechaHasta
        THROW 50026, N'RANGO_FECHAS_INVALIDO: la fecha inicial debe ser anterior a la final.', 1;

    SET @CodigoTipo = NULLIF(UPPER(TRIM(@CodigoTipo)), '');
    IF @CodigoTipo IS NOT NULL
    BEGIN
        SELECT @IDTipo = t.IDTipoMovimiento FROM dbo.TipoMovimiento AS t WHERE t.Codigo = @CodigoTipo;
        IF @IDTipo IS NULL
            THROW 50023, N'TIPO_MOVIMIENTO_INVALIDO: el tipo de movimiento no existe.', 1;
    END;

    IF @IDVariante IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Variante AS v WHERE v.IDVariante = @IDVariante)
        THROW 50106, N'VARIANTE_NO_ENCONTRADA: la variante no existe.', 1;

    SELECT @TotalRegistros = COUNT(*)
    FROM dbo.MovimientoInventario AS m
    WHERE (@IDVariante IS NULL OR m.IDVariante = @IDVariante)
      AND (@IDTipo IS NULL OR m.IDTipoMovimiento = @IDTipo)
      AND (@FechaDesde IS NULL OR m.Fecha >= @FechaDesde)
      AND (@FechaHasta IS NULL OR m.Fecha < @FechaHasta)
    OPTION (RECOMPILE);

    SELECT m.IDMovimientoInventario, m.Fecha, m.IDVariante, v.SKU, p.Nombre AS Producto, t.Codigo AS CodigoTipo,
           t.Nombre AS Tipo, m.Cantidad, m.SaldoAnterior, m.SaldoNuevo, m.Motivo, m.IDPedido, m.IDDevolucion,
           m.IDUsuario, CONCAT(u.Nombre, N' ', u.Apellido) AS Usuario
    FROM dbo.MovimientoInventario AS m
    JOIN dbo.Variante AS v ON v.IDVariante = m.IDVariante
    JOIN dbo.Producto AS p ON p.IDProducto = v.IDProducto
    JOIN dbo.TipoMovimiento AS t ON t.IDTipoMovimiento = m.IDTipoMovimiento
    JOIN dbo.Usuario AS u ON u.IDUsuario = m.IDUsuario
    WHERE (@IDVariante IS NULL OR m.IDVariante = @IDVariante)
      AND (@IDTipo IS NULL OR m.IDTipoMovimiento = @IDTipo)
      AND (@FechaDesde IS NULL OR m.Fecha >= @FechaDesde)
      AND (@FechaHasta IS NULL OR m.Fecha < @FechaHasta)
    ORDER BY m.IDMovimientoInventario DESC
    OFFSET CAST(@Pagina - 1 AS BIGINT) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY
    OPTION (RECOMPILE);
END;
GO

/*
    Conciliación (criterio de RF-03: la existencia coincide con la suma del kardex). Devuelve
    solo las variantes que no cuadran, con el detalle de cada comprobación; un resultado vacío
    significa que todo el inventario cuadra.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_Conciliar
    @IDUsuarioAccion INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol IN ('OPERADOR', 'ADMIN'))
        THROW 50201, N'PERMISO_DENEGADO: solo un operador o administrador activo puede consultar el inventario.', 1;

    SELECT k.IDVariante, k.SKU, p.Nombre AS Producto, k.ExistenciaFisica, k.SumaKardex, k.UltimoSaldo,
           k.Movimientos, k.Saltos, k.Diferencia
    FROM dbo.VW_Inventario_Conciliacion AS k
    JOIN dbo.Producto AS p ON p.IDProducto = k.IDProducto
    WHERE k.Cuadra = 0
    ORDER BY k.IDVariante;
END;
GO
