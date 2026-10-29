/*
    051_Vistas_Reportes.sql
    Bases del dashboard y los reportes (RF-08):
    - VW_Reportes_VentasNetas: una fila por pedido que cuenta como venta.
    - VW_Reportes_LineasVendidas: una fila por línea de esos pedidos.

    Reglas (decisiones D3, D21, D22), definidas una sola vez en VW_Reportes_VentasNetas:
    - Cuenta como venta: estado con CuentaComoVenta = 1 (PAGADO en adelante; excluye CANCELADO).
    - Venta = mercadería: Subtotal − Descuento. El envío no es venta.
    - Las devoluciones se restan en la fecha del pedido, por el monto de mercadería
      reembolsado (DevolucionDetalle.MontoReembolso).
    - Fecha local de Guatemala (UTC−6, sin horario de verano) para agrupar por día, semana y mes.

    Rendimiento: los SPs de reportes deben filtrar por FechaPedido (UTC, indexada),
    convirtiendo antes el rango local a UTC; filtrar por FechaLocal impediría usar el índice.
    IX_Pedido_FechaPedido cubre las columnas de las ventas (020_Indices_Reportes.sql).
*/
:on error exit
SET NOCOUNT ON;
GO

CREATE OR ALTER VIEW dbo.VW_Reportes_VentasNetas
AS
SELECT
    p.IDPedido,
    p.NumeroPedido,
    p.IDUsuario,
    p.IDEstadoPedido,
    p.IDCupon,
    p.FechaPedido,
    f.FechaLocal,
    CAST(f.FechaLocal AS DATE) AS DiaLocal,
    p.Subtotal,
    p.Descuento,
    CAST(p.Subtotal - p.Descuento AS DECIMAL(12, 2)) AS VentaBruta,
    ISNULL(d.MontoDevuelto, 0) AS MontoDevuelto,
    CAST(p.Subtotal - p.Descuento - ISNULL(d.MontoDevuelto, 0) AS DECIMAL(12, 2)) AS VentaNeta,
    p.CostoEnvio
FROM dbo.Pedido AS p
CROSS APPLY (
    SELECT CAST(p.FechaPedido AT TIME ZONE 'UTC' AT TIME ZONE 'Central America Standard Time' AS DATETIME2(3)) AS FechaLocal
) AS f
OUTER APPLY (
    SELECT SUM(dd.MontoReembolso) AS MontoDevuelto
    FROM dbo.PedidoDetalle AS pd
    INNER JOIN dbo.DevolucionDetalle AS dd ON dd.IDPedidoDetalle = pd.IDPedidoDetalle
    WHERE pd.IDPedido = p.IDPedido
) AS d
-- IN (no JOIN): los estados se resuelven una vez y luego se filtran los pedidos; con JOIN
-- el optimizador buscaba el estado por cada pedido (medido: 13 lecturas contra ~3 000 en un mes).
WHERE p.IDEstadoPedido IN (SELECT e.IDEstadoPedido FROM dbo.EstadoPedido AS e WHERE e.CuentaComoVenta = 1);
GO

/*
    Líneas de los pedidos de VW_Reportes_VentasNetas (mismo criterio y misma fecha local).
    IDCategoria es la del momento de la venta. CantidadNeta y VentaNeta descuentan lo devuelto:
    base de ventas por categoría y del top 10 de productos.
*/
CREATE OR ALTER VIEW dbo.VW_Reportes_LineasVendidas
AS
SELECT
    pd.IDPedidoDetalle,
    pd.IDPedido,
    vn.FechaPedido,
    vn.FechaLocal,
    vn.DiaLocal,
    pd.IDVariante,
    v.IDProducto,
    pd.IDCategoria,
    pd.SKU,
    pd.NombreProducto,
    pd.DescripcionVariante,
    pd.Cantidad,
    pd.CantidadDevuelta,
    pd.Cantidad - pd.CantidadDevuelta AS CantidadNeta,
    pd.TotalLinea,
    ISNULL(d.MontoDevuelto, 0) AS MontoDevuelto,
    CAST(pd.TotalLinea - ISNULL(d.MontoDevuelto, 0) AS DECIMAL(12, 2)) AS VentaNeta
FROM dbo.VW_Reportes_VentasNetas AS vn
INNER JOIN dbo.PedidoDetalle AS pd ON pd.IDPedido = vn.IDPedido
INNER JOIN dbo.Variante AS v ON v.IDVariante = pd.IDVariante
OUTER APPLY (
    SELECT SUM(dd.MontoReembolso) AS MontoDevuelto
    FROM dbo.DevolucionDetalle AS dd
    WHERE dd.IDPedidoDetalle = pd.IDPedidoDetalle
) AS d;
GO
