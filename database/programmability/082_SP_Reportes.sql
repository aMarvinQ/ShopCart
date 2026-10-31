/*
    082_SP_Reportes.sql
    Dashboard y reportes (RF-08), solo para el administrador (RF-01).

    - Qué es venta lo definen una sola vez VW_Reportes_VentasNetas y VW_Reportes_LineasVendidas
      (051): pedidos que cuentan como venta, mercadería neta de devoluciones, sin envío. Por
      eso el resumen, los periodos, las categorías y el top 10 siempre suman lo mismo.
    - Las fechas de los filtros son días de Guatemala, ambos incluidos, entre 2000 y 2099; se
      convierten al rango UTC con FU_Reportes_RangoUtc para filtrar FechaPedido por su índice.
    - Semana: de lunes a domingo, calculada sin depender de SET DATEFIRST.
    - El listado de pedidos con filtros es SP_Pedidos_Listar (080); las existencias bajas se
      listan con SP_Inventario_ListarExistencias (075).
    - Errores: ver docs/errores.md.
*/
:on error exit
SET NOCOUNT ON;
GO

/*
    Indicadores del dashboard. Del periodo: ventas netas, pedidos, ticket promedio (ventas
    netas / pedidos), unidades netas, monto devuelto de los pedidos del periodo y carritos
    abandonados cuya última actividad cae en el periodo. Del momento: variantes en venta con
    existencia baja. Devuelve también los dos parámetros usados.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Reportes_Resumen
    @IDUsuarioAccion INT,
    @FechaDesde      DATE,
    @FechaHasta      DATE
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME(), @DesdeUtc DATETIME2(3), @HastaUtc DATETIME2(3),
            @HorasCarritoAbandonado INT, @ExistenciaMinima INT;
    DECLARE @VentaNeta DECIMAL(14, 2), @Pedidos INT, @Unidades INT, @MontoDevuelto DECIMAL(14, 2),
            @CarritosAbandonados INT, @ValorCarritosAbandonados DECIMAL(14, 2), @VariantesExistenciaBaja INT;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede consultar los reportes.', 1;

    IF @FechaDesde IS NULL OR @FechaHasta IS NULL OR @FechaDesde > @FechaHasta OR @FechaDesde < '20000101' OR @FechaHasta > '20991231'
        THROW 50026, N'RANGO_FECHAS_INVALIDO: indique las dos fechas, la inicial no posterior a la final, entre 2000 y 2099.', 1;

    SELECT @HorasCarritoAbandonado = c.HorasCarritoAbandonado, @ExistenciaMinima = c.ExistenciaMinima
    FROM dbo.FU_Reportes_Configuracion() AS c;
    IF @HorasCarritoAbandonado IS NULL OR @ExistenciaMinima IS NULL
        THROW 59001, N'CONFIGURACION_INCOMPLETA: falta HORAS_CARRITO_ABANDONADO (1–720) o EXISTENCIA_MINIMA (0–999).', 1;

    SELECT @DesdeUtc = r.DesdeUtc, @HastaUtc = r.HastaUtc FROM dbo.FU_Reportes_RangoUtc(@FechaDesde, @FechaHasta) AS r;

    SELECT @VentaNeta = ISNULL(SUM(vn.VentaNeta), 0), @Pedidos = COUNT(*)
    FROM dbo.VW_Reportes_VentasNetas AS vn
    WHERE vn.FechaPedido >= @DesdeUtc AND vn.FechaPedido < @HastaUtc;

    SELECT @Unidades = ISNULL(SUM(l.CantidadNeta), 0)
    FROM dbo.VW_Reportes_LineasVendidas AS l
    WHERE l.FechaPedido >= @DesdeUtc AND l.FechaPedido < @HastaUtc;

    -- Todas las devoluciones de los pedidos del periodo, incluidas las de pedidos devueltos por
    -- completo (que ya no cuentan como venta).
    SELECT @MontoDevuelto = ISNULL(SUM(dd.MontoReembolso), 0)
    FROM dbo.Pedido AS p
    JOIN dbo.DevolucionDetalle AS dd ON dd.IDPedido = p.IDPedido
    WHERE p.FechaPedido >= @DesdeUtc AND p.FechaPedido < @HastaUtc;

    SELECT @CarritosAbandonados = COUNT(*), @ValorCarritosAbandonados = ISNULL(SUM(ca.Valor), 0)
    FROM dbo.FU_Reportes_CarritosAbandonados(@Ahora, @HorasCarritoAbandonado) AS ca
    WHERE ca.FechaUltimaActividad >= @DesdeUtc AND ca.FechaUltimaActividad < @HastaUtc;

    SELECT @VariantesExistenciaBaja = COUNT(*)
    FROM dbo.FU_Inventario_Disponibilidad(@Ahora) AS d
    JOIN dbo.Variante AS v ON v.IDVariante = d.IDVariante
    JOIN dbo.Producto AS p ON p.IDProducto = v.IDProducto
    WHERE v.Activo = 1 AND p.Activo = 1 AND d.Disponible <= @ExistenciaMinima;

    SELECT @FechaDesde AS FechaDesde, @FechaHasta AS FechaHasta,
           CAST(@VentaNeta AS DECIMAL(14, 2)) AS VentaNeta, @Pedidos AS Pedidos,
           CAST(ISNULL(ROUND(@VentaNeta / NULLIF(@Pedidos, 0), 2), 0) AS DECIMAL(12, 2)) AS TicketPromedio,
           @Unidades AS Unidades, @MontoDevuelto AS MontoDevuelto,
           @CarritosAbandonados AS CarritosAbandonados, @ValorCarritosAbandonados AS ValorCarritosAbandonados,
           @VariantesExistenciaBaja AS VariantesExistenciaBaja,
           @HorasCarritoAbandonado AS HorasCarritoAbandonado, @ExistenciaMinima AS ExistenciaMinima;
END;
GO

/*
    Ventas por DIA, SEMANA (lunes a domingo) o MES: una fila por periodo, incluidos los que no
    tienen ventas (en 0), para que la gráfica no tenga huecos. Periodo es el primer día del
    periodo; Desde y Hasta, la parte del periodo dentro del rango pedido (la primera y la última
    semana o mes pueden quedar recortados).
    Rango máximo: 366 días por día y 10 años por semana o mes.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Reportes_VentasPorPeriodo
    @IDUsuarioAccion INT,
    @Agrupacion      VARCHAR(7),
    @FechaDesde      DATE,
    @FechaHasta      DATE
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @DesdeUtc DATETIME2(3), @HastaUtc DATETIME2(3), @Inicio DATE, @Periodos INT;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede consultar los reportes.', 1;

    SET @Agrupacion = UPPER(TRIM(@Agrupacion));
    IF @Agrupacion IS NULL OR @Agrupacion NOT IN ('DIA', 'SEMANA', 'MES')
        THROW 50039, N'AGRUPACION_INVALIDA: la agrupación debe ser DIA, SEMANA o MES.', 1;

    IF @FechaDesde IS NULL OR @FechaHasta IS NULL OR @FechaDesde > @FechaHasta OR @FechaDesde < '20000101' OR @FechaHasta > '20991231'
        THROW 50026, N'RANGO_FECHAS_INVALIDO: indique las dos fechas, la inicial no posterior a la final, entre 2000 y 2099.', 1;

    IF (@Agrupacion = 'DIA' AND DATEDIFF(DAY, @FechaDesde, @FechaHasta) >= 366)
       OR (@Agrupacion <> 'DIA' AND DATEADD(YEAR, 10, @FechaDesde) <= @FechaHasta)
        THROW 50040, N'RANGO_FECHAS_EXCEDIDO: por día se consultan como máximo 366 días; por semana o mes, 10 años.', 1;

    SELECT @DesdeUtc = r.DesdeUtc, @HastaUtc = r.HastaUtc FROM dbo.FU_Reportes_RangoUtc(@FechaDesde, @FechaHasta) AS r;

    -- Primer periodo y cantidad de periodos. 1900-01-01 fue lunes: los días desde esa fecha,
    -- módulo 7, son los días transcurridos desde el lunes de la semana.
    SET @Inicio = CASE @Agrupacion
                      WHEN 'DIA' THEN @FechaDesde
                      WHEN 'SEMANA' THEN DATEADD(DAY, -(DATEDIFF(DAY, '19000101', @FechaDesde) % 7), @FechaDesde)
                      ELSE DATEFROMPARTS(YEAR(@FechaDesde), MONTH(@FechaDesde), 1)
                  END;
    SET @Periodos = CASE @Agrupacion
                        WHEN 'DIA' THEN DATEDIFF(DAY, @Inicio, @FechaHasta) + 1
                        WHEN 'SEMANA' THEN DATEDIFF(DAY, @Inicio, @FechaHasta) / 7 + 1
                        ELSE DATEDIFF(MONTH, @Inicio, @FechaHasta) + 1
                    END;

    WITH Ventas AS (
        SELECT CASE @Agrupacion
                   WHEN 'DIA' THEN vn.DiaLocal
                   WHEN 'SEMANA' THEN DATEADD(DAY, -(DATEDIFF(DAY, '19000101', vn.DiaLocal) % 7), vn.DiaLocal)
                   ELSE DATEFROMPARTS(YEAR(vn.DiaLocal), MONTH(vn.DiaLocal), 1)
               END AS Periodo,
               vn.VentaNeta
        FROM dbo.VW_Reportes_VentasNetas AS vn
        WHERE vn.FechaPedido >= @DesdeUtc AND vn.FechaPedido < @HastaUtc
    ),
    Agrupado AS (
        SELECT v.Periodo, SUM(v.VentaNeta) AS VentaNeta, COUNT(*) AS Pedidos
        FROM Ventas AS v
        GROUP BY v.Periodo
    ),
    -- 0–9 999 sin tablas del sistema (la API no tiene permiso de verlas); el rango máximo
    -- produce como mucho 523 semanas.
    Digitos AS (
        SELECT d.n FROM (VALUES (0), (1), (2), (3), (4), (5), (6), (7), (8), (9)) AS d (n)
    ),
    Numeros AS (
        SELECT u.n + 10 * de.n + 100 * c.n + 1000 * m.n AS n
        FROM Digitos AS u CROSS JOIN Digitos AS de CROSS JOIN Digitos AS c CROSS JOIN Digitos AS m
    ),
    Periodos AS (
        SELECT CASE @Agrupacion
                   WHEN 'DIA' THEN DATEADD(DAY, n.n, @Inicio)
                   WHEN 'SEMANA' THEN DATEADD(WEEK, n.n, @Inicio)
                   ELSE DATEADD(MONTH, n.n, @Inicio)
               END AS Periodo
        FROM Numeros AS n
        WHERE n.n < @Periodos
    )
    SELECT p.Periodo,
           CASE WHEN p.Periodo < @FechaDesde THEN @FechaDesde ELSE p.Periodo END AS Desde,
           f.Fin AS Hasta,
           CAST(ISNULL(a.VentaNeta, 0) AS DECIMAL(14, 2)) AS VentaNeta,
           ISNULL(a.Pedidos, 0) AS Pedidos
    FROM Periodos AS p
    CROSS APPLY (
        SELECT CASE WHEN x.Fin > @FechaHasta THEN @FechaHasta ELSE x.Fin END AS Fin
        FROM (SELECT CASE @Agrupacion
                         WHEN 'DIA' THEN p.Periodo
                         WHEN 'SEMANA' THEN DATEADD(DAY, 6, p.Periodo)
                         ELSE EOMONTH(p.Periodo)
                     END AS Fin) AS x
    ) AS f
    LEFT JOIN Agrupado AS a ON a.Periodo = p.Periodo
    ORDER BY p.Periodo;
END;
GO

/*
    Ventas netas y unidades netas por categoría, con su porcentaje del total, de mayor a menor.
    La categoría es la que tenía el producto al venderse (PedidoDetalle.IDCategoria), con su
    nombre actual. Solo categorías con unidades vendidas netas.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Reportes_VentasPorCategoria
    @IDUsuarioAccion INT,
    @FechaDesde      DATE,
    @FechaHasta      DATE
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @DesdeUtc DATETIME2(3), @HastaUtc DATETIME2(3);

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede consultar los reportes.', 1;

    IF @FechaDesde IS NULL OR @FechaHasta IS NULL OR @FechaDesde > @FechaHasta OR @FechaDesde < '20000101' OR @FechaHasta > '20991231'
        THROW 50026, N'RANGO_FECHAS_INVALIDO: indique las dos fechas, la inicial no posterior a la final, entre 2000 y 2099.', 1;

    SELECT @DesdeUtc = r.DesdeUtc, @HastaUtc = r.HastaUtc FROM dbo.FU_Reportes_RangoUtc(@FechaDesde, @FechaHasta) AS r;

    SELECT g.IDCategoria, c.Nombre AS Categoria, g.Unidades, g.VentaNeta,
           CAST(ISNULL(ROUND(100.0 * g.VentaNeta / NULLIF(SUM(g.VentaNeta) OVER (), 0), 2), 0) AS DECIMAL(5, 2)) AS Porcentaje
    FROM (
        SELECT l.IDCategoria, SUM(l.CantidadNeta) AS Unidades, CAST(SUM(l.VentaNeta) AS DECIMAL(14, 2)) AS VentaNeta
        FROM dbo.VW_Reportes_LineasVendidas AS l
        WHERE l.FechaPedido >= @DesdeUtc AND l.FechaPedido < @HastaUtc
        GROUP BY l.IDCategoria
        HAVING SUM(l.CantidadNeta) > 0
    ) AS g
    JOIN dbo.Categoria AS c ON c.IDCategoria = g.IDCategoria
    ORDER BY g.VentaNeta DESC, c.Nombre;
END;
GO

/*
    Los 10 productos más vendidos: suma de sus variantes, por unidades netas y, a igual
    cantidad, por ventas netas. Nombre y categoría actuales del producto.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Reportes_TopProductos
    @IDUsuarioAccion INT,
    @FechaDesde      DATE,
    @FechaHasta      DATE
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @DesdeUtc DATETIME2(3), @HastaUtc DATETIME2(3);

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede consultar los reportes.', 1;

    IF @FechaDesde IS NULL OR @FechaHasta IS NULL OR @FechaDesde > @FechaHasta OR @FechaDesde < '20000101' OR @FechaHasta > '20991231'
        THROW 50026, N'RANGO_FECHAS_INVALIDO: indique las dos fechas, la inicial no posterior a la final, entre 2000 y 2099.', 1;

    SELECT @DesdeUtc = r.DesdeUtc, @HastaUtc = r.HastaUtc FROM dbo.FU_Reportes_RangoUtc(@FechaDesde, @FechaHasta) AS r;

    SELECT TOP (10)
           CAST(ROW_NUMBER() OVER (ORDER BY g.Unidades DESC, g.VentaNeta DESC, g.IDProducto) AS TINYINT) AS Posicion,
           g.IDProducto, p.Nombre AS Producto, c.Nombre AS Categoria, g.Unidades, g.VentaNeta
    FROM (
        SELECT l.IDProducto, SUM(l.CantidadNeta) AS Unidades, CAST(SUM(l.VentaNeta) AS DECIMAL(14, 2)) AS VentaNeta
        FROM dbo.VW_Reportes_LineasVendidas AS l
        WHERE l.FechaPedido >= @DesdeUtc AND l.FechaPedido < @HastaUtc
        GROUP BY l.IDProducto
        HAVING SUM(l.CantidadNeta) > 0
    ) AS g
    JOIN dbo.Producto AS p ON p.IDProducto = g.IDProducto
    JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
    ORDER BY Posicion;
END;
GO

/*
    Carritos abandonados (FU_Reportes_CarritosAbandonados), del de actividad más reciente al
    más antiguo. Filtro opcional por la fecha de su última actividad (días de Guatemala, NULL =
    sin límite). Del invitado no hay nombre ni correo.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Reportes_CarritosAbandonados
    @IDUsuarioAccion INT,
    @FechaDesde      DATE = NULL,
    @FechaHasta      DATE = NULL,
    @Pagina          INT = 1,
    @TamanoPagina    INT = 20,
    @TotalRegistros  INT = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME(), @DesdeUtc DATETIME2(3), @HastaUtc DATETIME2(3), @HorasCarritoAbandonado INT;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede consultar los reportes.', 1;

    IF @Pagina IS NULL OR @Pagina < 1 OR @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50007, N'PAGINACION_INVALIDA: la página inicia en 1 y el tamaño va de 1 a 100.', 1;

    IF @FechaDesde > @FechaHasta OR @FechaDesde < '20000101' OR @FechaHasta > '20991231'
        THROW 50026, N'RANGO_FECHAS_INVALIDO: la fecha inicial no puede ser posterior a la final; las fechas van de 2000 a 2099.', 1;

    SET @HorasCarritoAbandonado = (SELECT c.HorasCarritoAbandonado FROM dbo.FU_Reportes_Configuracion() AS c);
    IF @HorasCarritoAbandonado IS NULL
        THROW 59001, N'CONFIGURACION_INCOMPLETA: falta HORAS_CARRITO_ABANDONADO (1–720).', 1;

    SELECT @DesdeUtc = r.DesdeUtc FROM dbo.FU_Reportes_RangoUtc(@FechaDesde, @FechaDesde) AS r;
    SELECT @HastaUtc = r.HastaUtc FROM dbo.FU_Reportes_RangoUtc(@FechaHasta, @FechaHasta) AS r;

    SELECT @TotalRegistros = COUNT(*)
    FROM dbo.FU_Reportes_CarritosAbandonados(@Ahora, @HorasCarritoAbandonado) AS ca
    WHERE (@DesdeUtc IS NULL OR ca.FechaUltimaActividad >= @DesdeUtc)
      AND (@HastaUtc IS NULL OR ca.FechaUltimaActividad < @HastaUtc)
    OPTION (RECOMPILE);

    SELECT ca.IDCarrito, CAST(CASE WHEN ca.IDUsuario IS NULL THEN 1 ELSE 0 END AS BIT) AS EsInvitado,
           CASE WHEN u.IDUsuario IS NOT NULL THEN CONCAT(u.Nombre, N' ', u.Apellido) END AS Cliente, u.Correo,
           ca.FechaUltimaActividad, DATEDIFF(HOUR, ca.FechaUltimaActividad, @Ahora) AS HorasInactivo,
           ca.Articulos, ca.Valor, cu.Codigo AS CodigoCupon
    FROM dbo.FU_Reportes_CarritosAbandonados(@Ahora, @HorasCarritoAbandonado) AS ca
    LEFT JOIN dbo.Usuario AS u ON u.IDUsuario = ca.IDUsuario
    LEFT JOIN dbo.Cupon AS cu ON cu.IDCupon = ca.IDCupon
    WHERE (@DesdeUtc IS NULL OR ca.FechaUltimaActividad >= @DesdeUtc)
      AND (@HastaUtc IS NULL OR ca.FechaUltimaActividad < @HastaUtc)
    ORDER BY ca.FechaUltimaActividad DESC, ca.IDCarrito DESC
    OFFSET CAST(@Pagina - 1 AS BIGINT) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY
    OPTION (RECOMPILE);
END;
GO
