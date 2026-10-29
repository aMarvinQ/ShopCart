/*
    044_Funciones_Pedidos.sql
    FU_Pedidos_DesgloseIVA: base imponible e IVA de un total que ya incluye IVA.

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
