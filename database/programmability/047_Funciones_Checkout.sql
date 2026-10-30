/*
    047_Funciones_Checkout.sql
    - FU_Checkout_Configuracion: minutos que dura la reserva de un checkout, leídos de Parametro.
    - FU_Checkout_Estado: si un checkout se puede pagar ahora y, si no, por qué.
*/
:on error exit
SET NOCOUNT ON;
GO

/*
    Siempre devuelve una fila. MinutosReserva es NULL si MINUTOS_RESERVA falta o está fuera de
    1–120: el SP lo rechaza en lugar de inventar una vigencia.
*/
CREATE OR ALTER FUNCTION dbo.FU_Checkout_Configuracion ()
RETURNS TABLE
AS
RETURN
    SELECT CASE WHEN v.MinutosReserva BETWEEN 1 AND 120 THEN v.MinutosReserva END AS MinutosReserva
    FROM (
        SELECT (SELECT TRY_CAST(p.Valor AS INT) FROM dbo.Parametro AS p WHERE p.Clave = 'MINUTOS_RESERVA') AS MinutosReserva
    ) AS v;
GO

/*
    Estado efectivo de un checkout en @Ahora:
    - COMPLETADO, EXPIRADO o CANCELADO: el guardado.
    - EXPIRADO también si sigue PENDIENTE pero ya venció (el job aún no lo marcó).
    - CARRITO_MODIFICADO: sigue PENDIENTE, pero el carrito ya no coincide con lo que se iba a
      pagar (otras líneas o cantidades, otro cupón, o el carrito ya no está activo, p. ej. se
      fusionó). Pagarlo compraría algo distinto de lo que el cliente tiene en el carrito.
    - PENDIENTE: se puede pagar.
    Los precios no se comparan: el checkout los congeló y son los que el cliente vio al pagar.
*/
CREATE OR ALTER FUNCTION dbo.FU_Checkout_Estado (@IDCheckout BIGINT, @Ahora DATETIME2(3))
RETURNS TABLE
AS
RETURN
    SELECT
        ch.IDCheckout,
        CASE
            WHEN ch.Estado <> 'PENDIENTE'    THEN ch.Estado
            WHEN ch.FechaExpiracion <= @Ahora THEN 'EXPIRADO'
            WHEN c.Estado <> 'ACTIVO'
              OR ISNULL(c.IDCupon, 0) <> ISNULL(ch.IDCupon, 0)
              OR EXISTS (
                     SELECT 1
                     FROM (SELECT d.IDVariante, d.Cantidad FROM dbo.CheckoutDetalle AS d WHERE d.IDCheckout = ch.IDCheckout) AS d
                     FULL JOIN (SELECT i.IDVariante, i.Cantidad FROM dbo.CarritoItem AS i WHERE i.IDCarrito = ch.IDCarrito) AS i
                          ON i.IDVariante = d.IDVariante
                     WHERE d.IDVariante IS NULL OR i.IDVariante IS NULL OR d.Cantidad <> i.Cantidad
                 )                         THEN 'CARRITO_MODIFICADO'
            ELSE 'PENDIENTE'
        END AS EstadoEfectivo
    FROM dbo.Checkout AS ch
    JOIN dbo.Carrito AS c ON c.IDCarrito = ch.IDCarrito
    WHERE ch.IDCheckout = @IDCheckout;
GO
