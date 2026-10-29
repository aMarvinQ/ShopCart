/*
    040_Funciones_Inventario.sql
    FU_Inventario_Disponibilidad: existencia disponible por variante (RF-03).

    Disponible = ExistenciaFisica − unidades en reservas ACTIVA que no han vencido.
    Una reserva vencida deja de restar en el mismo instante en que vence, aunque el job
    todavía no la haya marcado como LIBERADA.

    Contrato de concurrencia: un SP que decide una escritura con este dato (reservar, ajustar
    a la baja) primero bloquea las filas de Variante con UPDLOCK en orden de IDVariante y
    consulta esta función en una sentencia posterior. Con READ_COMMITTED_SNAPSHOT cada
    sentencia lee lo confirmado al iniciar, así que la lectura ya incluye las reservas de
    quien tuvo el bloqueo antes.
*/
:on error exit
SET NOCOUNT ON;
GO

/*
    @Ahora: el SP lo calcula una sola vez (SYSUTCDATETIME()) y lo pasa a todas sus consultas,
    para que todas usen el mismo instante; también permite probar con fechas controladas.
    Función en línea: el optimizador la integra a la consulta que la usa, así un filtro por
    IDVariante en el SP llega hasta el índice (no calcula todas las variantes).
    La reserva se suma con el índice filtrado IX_ReservaInventario_ActivasPorVariante.
    Disponible nunca se reporta negativo (una salida no puede dejar menos de lo reservado,
    pero si ocurriera, la tienda vería 0 y la conciliación mostraría la diferencia).
*/
CREATE OR ALTER FUNCTION dbo.FU_Inventario_Disponibilidad (@Ahora DATETIME2(3))
RETURNS TABLE
AS
RETURN
    SELECT
        v.IDVariante,
        v.IDProducto,
        v.ExistenciaFisica,
        ISNULL(r.Reservado, 0) AS Reservado,
        CASE
            WHEN v.ExistenciaFisica - ISNULL(r.Reservado, 0) > 0 THEN v.ExistenciaFisica - ISNULL(r.Reservado, 0)
            ELSE 0
        END AS Disponible
    FROM dbo.Variante AS v
    OUTER APPLY (
        SELECT SUM(ri.Cantidad) AS Reservado
        FROM dbo.ReservaInventario AS ri
        WHERE ri.IDVariante = v.IDVariante
          AND ri.Estado = 'ACTIVA'
          AND ri.FechaExpiracion > @Ahora
    ) AS r;
GO
