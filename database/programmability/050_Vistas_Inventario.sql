/*
    050_Vistas_Inventario.sql
    VW_Inventario_Conciliacion: demuestra por variante que la existencia física coincide con
    el kardex (RF-03).
*/
:on error exit
SET NOCOUNT ON;
GO

/*
    Por variante compara Variante.ExistenciaFisica con:
    - SumaKardex: suma de todas las cantidades (con signo).
    - UltimoSaldo: SaldoNuevo del último movimiento.
    - Saltos: movimientos que no parten del saldo con que terminó el anterior (el primero
      debe partir de 0). Detecta un movimiento faltante o fuera de orden, que la suma sola
      no revela. Se calcula como SaldoNuevo − Cantidad (= SaldoAnterior por CHECK) para
      leer solo columnas del índice IX_MovimientoInventario_IDVariante.
    Cuadra = 1 si las tres comprobaciones coinciden. Una variante sin movimientos cuadra si
    su existencia es 0.
*/
CREATE OR ALTER VIEW dbo.VW_Inventario_Conciliacion
AS
SELECT
    v.IDVariante,
    v.IDProducto,
    v.SKU,
    v.ExistenciaFisica,
    ISNULL(k.Movimientos, 0) AS Movimientos,
    ISNULL(k.SumaKardex, 0) AS SumaKardex,
    ISNULL(k.UltimoSaldo, 0) AS UltimoSaldo,
    ISNULL(k.Saltos, 0) AS Saltos,
    v.ExistenciaFisica - ISNULL(k.SumaKardex, 0) AS Diferencia,
    CAST(CASE
             WHEN v.ExistenciaFisica = ISNULL(k.SumaKardex, 0)
              AND v.ExistenciaFisica = ISNULL(k.UltimoSaldo, 0)
              AND ISNULL(k.Saltos, 0) = 0
             THEN 1 ELSE 0
         END AS BIT) AS Cuadra
FROM dbo.Variante AS v
OUTER APPLY (
    SELECT
        COUNT(*) AS Movimientos,
        SUM(m.Cantidad) AS SumaKardex,
        SUM(CASE WHEN m.Siguiente IS NULL THEN m.SaldoNuevo ELSE 0 END) AS UltimoSaldo,  -- solo una fila es la última
        SUM(CASE WHEN m.SaldoNuevo - m.Cantidad <> m.SaldoPrevio THEN 1 ELSE 0 END) AS Saltos
    FROM (
        SELECT
            mi.Cantidad,
            mi.SaldoNuevo,
            LAG(mi.SaldoNuevo, 1, 0) OVER (ORDER BY mi.IDMovimientoInventario) AS SaldoPrevio,
            LEAD(mi.IDMovimientoInventario) OVER (ORDER BY mi.IDMovimientoInventario) AS Siguiente
        FROM dbo.MovimientoInventario AS mi
        WHERE mi.IDVariante = v.IDVariante
    ) AS m
) AS k;
GO
