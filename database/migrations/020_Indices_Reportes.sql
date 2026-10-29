/*
    020_Indices_Reportes.sql
    Índices cubrientes para los reportes de ventas (VW_Reportes_VentasNetas y
    VW_Reportes_LineasVendidas). Sin ellos, consultar un mes recorría todas las filas de
    Pedido y PedidoDetalle; con ellos se leen solo las del periodo, así el costo depende del
    rango consultado y no del tamaño del historial.

    - IX_Pedido_FechaPedido: incluía Total, que los reportes no usan (D22: venta =
      Subtotal − Descuento; el envío aparte), y no incluía Subtotal.
    - IX_PedidoDetalle_Reportes: las líneas de los pedidos del periodo con las columnas del
      top 10 y de ventas por categoría. UQ_PedidoDetalle_Pedido_Variante se mantiene porque
      es una regla (no admite columnas incluidas).
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
GO

CREATE INDEX IX_Pedido_FechaPedido ON dbo.Pedido (FechaPedido)
    INCLUDE (IDEstadoPedido, Subtotal, Descuento, CostoEnvio)
    WITH (DROP_EXISTING = ON);

CREATE INDEX IX_PedidoDetalle_Reportes ON dbo.PedidoDetalle (IDPedido)
    INCLUDE (IDVariante, IDCategoria, Cantidad, CantidadDevuelta, TotalLinea);
GO

COMMIT TRANSACTION;
GO
