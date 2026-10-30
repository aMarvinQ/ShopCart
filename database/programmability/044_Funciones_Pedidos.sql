/*
    044_Funciones_Pedidos.sql
    - FU_Pedidos_DesgloseIVA: base imponible e IVA de un total que ya incluye IVA.
    - FU_Pedidos_Detalle: un pedido completo (líneas, historial de estados y pagos en JSON),
      la misma fuente para el cliente, el invitado y el panel.
    - FU_Pedidos_DetalleCliente: lo que ve el cliente o el invitado.

    BaseImponible = ROUND(Total / (1 + TASA_IVA), 2) e IVA = Total − BaseImponible: el IVA se
    obtiene por diferencia, así Base + IVA = Total siempre (CK_Pedido_Impuestos).
    La tasa se lee de Parametro (TASA_IVA, p. ej. 0.12). Sin ese parámetro no devuelve fila:
    el SP lo detecta y no crea un pedido con impuestos inventados.
*/
:on error exit
SET NOCOUNT ON;
GO

CREATE OR ALTER FUNCTION dbo.FU_Pedidos_DesgloseIVA (@Total DECIMAL(12, 2))
RETURNS TABLE
AS
RETURN
    SELECT
        t.TasaIVA,
        b.BaseImponible,
        CAST(@Total - b.BaseImponible AS DECIMAL(12, 2)) AS IVA
    FROM dbo.Parametro AS p
    -- TRY_CAST: SQL Server no garantiza filtrar por Clave antes de convertir, y otros
    -- parámetros pueden ser texto.
    CROSS APPLY (SELECT TRY_CAST(p.Valor AS DECIMAL(9, 6)) AS TasaIVA) AS t
    CROSS APPLY (SELECT CAST(ROUND(@Total / (1 + t.TasaIVA), 2) AS DECIMAL(12, 2)) AS BaseImponible) AS b
    WHERE p.Clave = 'TASA_IVA'
      AND t.TasaIVA IS NOT NULL;
GO

/*
    Un pedido con sus datos copiados (contacto, dirección, envío, cupón y montos), el estado
    actual y, en JSON: Lineas (con lo devuelto), Historial (cada cambio de estado con su
    comentario; con @ConUsuarios = 1 también quién lo hizo) y Pagos (aprobado, rechazos y
    reembolso; solo marca y últimos 4).
    - PuedeCancelar: el estado actual permite pasar a CANCELADO (operador).
    - PuedeCancelarCliente: además la transición la puede hacer el cliente y el pedido es de un
      cliente registrado (el invitado pide la cancelación a la tienda).
*/
CREATE OR ALTER FUNCTION dbo.FU_Pedidos_Detalle (@IDPedido INT, @ConUsuarios BIT)
RETURNS TABLE
AS
RETURN
    SELECT
        p.IDPedido, p.NumeroPedido, p.FechaPedido, e.Codigo AS CodigoEstado, e.Nombre AS Estado, p.IDUsuario,
        p.CorreoContacto, p.NombreContacto, p.TelefonoContacto,
        p.EnvioNombre, p.EnvioTelefono, p.EnvioLinea1, p.EnvioLinea2, p.EnvioMunicipio, p.IDDepartamento, d.Nombre AS Departamento,
        p.EnvioCodigoPostal, p.EnvioReferencias, p.NombreMetodoEnvio, p.CodigoCupon,
        p.Subtotal, p.Descuento, p.CostoEnvio, p.Total, p.BaseImponible, p.IVA,
        CAST(CASE WHEN c.IDEstadoOrigen IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS PuedeCancelar,
        CAST(CASE WHEN c.PermiteCliente = 1 AND p.IDUsuario IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS PuedeCancelarCliente,
        ISNULL((SELECT pd.IDPedidoDetalle, pd.IDVariante, pd.SKU, pd.NombreProducto, pd.DescripcionVariante, pd.Cantidad,
                       pd.PrecioUnitario, pd.DescuentoLinea, pd.TotalLinea, pd.CantidadDevuelta
                FROM dbo.PedidoDetalle AS pd
                WHERE pd.IDPedido = p.IDPedido
                ORDER BY pd.IDPedidoDetalle
                FOR JSON PATH, INCLUDE_NULL_VALUES), N'[]') AS Lineas,
        -- Sin INCLUDE_NULL_VALUES: para el cliente no aparecen las claves del usuario.
        ISNULL((SELECT ea.Codigo AS CodigoEstadoAnterior, en.Codigo AS CodigoEstado, en.Nombre AS Estado, h.Fecha, h.Comentario,
                       CASE WHEN @ConUsuarios = 1 THEN h.IDUsuario END AS IDUsuario,
                       CASE WHEN @ConUsuarios = 1 THEN CONCAT(u.Nombre, N' ', u.Apellido) END AS Usuario
                FROM dbo.PedidoHistorialEstado AS h
                JOIN dbo.EstadoPedido AS en ON en.IDEstadoPedido = h.IDEstadoNuevo
                LEFT JOIN dbo.EstadoPedido AS ea ON ea.IDEstadoPedido = h.IDEstadoAnterior
                LEFT JOIN dbo.Usuario AS u ON u.IDUsuario = h.IDUsuario
                WHERE h.IDPedido = p.IDPedido
                ORDER BY h.IDPedidoHistorialEstado
                FOR JSON PATH), N'[]') AS Historial,
        ISNULL((SELECT pg.IDPago, pg.Estado, pg.Marca, pg.Ultimos4, pg.CodigoAutorizacion, pg.MotivoRechazo, pg.Monto,
                       pg.ReferenciaExterna, pg.Fecha
                FROM dbo.Pago AS pg
                WHERE pg.IDCheckout = p.IDCheckout
                ORDER BY pg.IDPago
                FOR JSON PATH, INCLUDE_NULL_VALUES), N'[]') AS Pagos
    FROM dbo.Pedido AS p
    JOIN dbo.EstadoPedido AS e ON e.IDEstadoPedido = p.IDEstadoPedido
    JOIN dbo.Departamento AS d ON d.IDDepartamento = p.IDDepartamento
    OUTER APPLY (
        SELECT t.IDEstadoOrigen, t.PermiteCliente
        FROM dbo.TransicionEstadoPedido AS t
        JOIN dbo.EstadoPedido AS ec ON ec.IDEstadoPedido = t.IDEstadoDestino
        WHERE t.IDEstadoOrigen = p.IDEstadoPedido AND ec.Codigo = 'CANCELADO'
    ) AS c
    WHERE p.IDPedido = @IDPedido;
GO

/* Lo que ve el cliente o el invitado de su pedido: sin quién cambió el estado. */
CREATE OR ALTER FUNCTION dbo.FU_Pedidos_DetalleCliente (@IDPedido INT)
RETURNS TABLE
AS
RETURN
    SELECT
        d.IDPedido, d.NumeroPedido, d.FechaPedido, d.CodigoEstado, d.Estado, d.CorreoContacto, d.NombreContacto, d.TelefonoContacto,
        d.EnvioNombre, d.EnvioTelefono, d.EnvioLinea1, d.EnvioLinea2, d.EnvioMunicipio, d.Departamento, d.EnvioCodigoPostal,
        d.EnvioReferencias, d.NombreMetodoEnvio, d.CodigoCupon, d.Subtotal, d.Descuento, d.CostoEnvio, d.Total, d.BaseImponible,
        d.IVA, d.PuedeCancelarCliente AS PuedeCancelar, d.Lineas, d.Historial, d.Pagos
    FROM dbo.FU_Pedidos_Detalle(@IDPedido, 0) AS d;
GO
