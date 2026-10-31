/*
    049_Funciones_Reportes.sql
    - FU_Reportes_Configuracion: horas para considerar abandonado un carrito y existencia
      mínima, leídas de Parametro.
    - FU_Reportes_RangoUtc: convierte un rango de días de Guatemala al rango UTC equivalente.
    - FU_Reportes_CarritosAbandonados: carritos abandonados con su valor.
*/
:on error exit
SET NOCOUNT ON;
GO

/*
    Siempre devuelve una fila. Un valor es NULL si su parámetro falta o está fuera de rango:
    el SP lo rechaza en lugar de inventar un valor.
    - HORAS_CARRITO_ABANDONADO (1–720): horas sin actividad para considerar abandonado un
      carrito con productos.
    - EXISTENCIA_MINIMA (0–999): una variante en venta con esta disponibilidad o menos tiene
      existencia baja (0 = solo las agotadas).
*/
CREATE OR ALTER FUNCTION dbo.FU_Reportes_Configuracion ()
RETURNS TABLE
AS
RETURN
    SELECT CASE WHEN v.HorasCarritoAbandonado BETWEEN 1 AND 720 THEN v.HorasCarritoAbandonado END AS HorasCarritoAbandonado,
           CASE WHEN v.ExistenciaMinima BETWEEN 0 AND 999 THEN v.ExistenciaMinima END AS ExistenciaMinima
    FROM (
        SELECT (SELECT TRY_CAST(p.Valor AS INT) FROM dbo.Parametro AS p WHERE p.Clave = 'HORAS_CARRITO_ABANDONADO') AS HorasCarritoAbandonado,
               (SELECT TRY_CAST(p.Valor AS INT) FROM dbo.Parametro AS p WHERE p.Clave = 'EXISTENCIA_MINIMA') AS ExistenciaMinima
    ) AS v;
GO

/*
    Los reportes reciben días de Guatemala, ambos incluidos; las fechas se guardan en UTC.
    Devuelve [DesdeUtc, HastaUtc): del inicio del primer día al inicio del día siguiente al
    último. Los SPs filtran con este rango la columna UTC indexada; filtrar por la fecha local
    impediría usar el índice.
*/
CREATE OR ALTER FUNCTION dbo.FU_Reportes_RangoUtc (@FechaDesde DATE, @FechaHasta DATE)
RETURNS TABLE
AS
RETURN
    SELECT CAST(CAST(@FechaDesde AS DATETIME2(3)) AT TIME ZONE 'Central America Standard Time' AT TIME ZONE 'UTC' AS DATETIME2(3)) AS DesdeUtc,
           CAST(CAST(DATEADD(DAY, 1, @FechaHasta) AS DATETIME2(3)) AT TIME ZONE 'Central America Standard Time' AT TIME ZONE 'UTC' AS DATETIME2(3)) AS HastaUtc;
GO

/*
    Carrito abandonado (glosario del enunciado): ACTIVO, con productos y sin actividad en las
    últimas @HorasCarritoAbandonado horas. No es un estado guardado: se calcula al consultar,
    así un carrito deja de estar abandonado en cuanto el cliente vuelve, y un cambio del
    parámetro se refleja de inmediato. Incluye los de invitados (también son ventas perdidas).
    Valor: mercadería al precio vigente (FU_Carrito_Lineas, la misma fuente que el carrito),
    sin el descuento del cupón.
*/
CREATE OR ALTER FUNCTION dbo.FU_Reportes_CarritosAbandonados (@Ahora DATETIME2(3), @HorasCarritoAbandonado INT)
RETURNS TABLE
AS
RETURN
    SELECT c.IDCarrito, c.IDUsuario, c.IDCupon, c.FechaUltimaActividad, l.Articulos, l.Valor
    FROM dbo.Carrito AS c
    CROSS APPLY (
        SELECT SUM(fl.Cantidad) AS Articulos, CAST(SUM(fl.Importe) AS DECIMAL(12, 2)) AS Valor
        FROM dbo.FU_Carrito_Lineas(c.IDCarrito) AS fl
    ) AS l
    WHERE c.Estado = 'ACTIVO'
      AND c.FechaUltimaActividad < DATEADD(HOUR, -@HorasCarritoAbandonado, @Ahora)
      -- EXISTS y no "l.Articulos IS NOT NULL": así el filtro no depende del cálculo del valor, y
      -- un listado paginado o un conteo lo calculan solo para las filas que devuelven.
      AND EXISTS (SELECT 1 FROM dbo.CarritoItem AS ci WHERE ci.IDCarrito = c.IDCarrito);
GO
