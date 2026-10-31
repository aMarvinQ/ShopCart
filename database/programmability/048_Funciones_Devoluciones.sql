/*
    048_Funciones_Devoluciones.sql
    FU_Devoluciones_Configuracion: plazo para devolver, leído de Parametro.
*/
:on error exit
SET NOCOUNT ON;
GO

/*
    Siempre devuelve una fila. DiasDevolucion es NULL si DIAS_DEVOLUCION falta o está fuera de
    1–365: el SP lo rechaza en lugar de inventar un plazo.
    - DIAS_DEVOLUCION: días desde que el pedido pasó a ENTREGADO en los que se acepta una
      devolución (D43).
*/
CREATE OR ALTER FUNCTION dbo.FU_Devoluciones_Configuracion ()
RETURNS TABLE
AS
RETURN
    SELECT CASE WHEN v.DiasDevolucion BETWEEN 1 AND 365 THEN v.DiasDevolucion END AS DiasDevolucion
    FROM (
        SELECT (SELECT TRY_CAST(p.Valor AS INT) FROM dbo.Parametro AS p WHERE p.Clave = 'DIAS_DEVOLUCION') AS DiasDevolucion
    ) AS v;
GO
