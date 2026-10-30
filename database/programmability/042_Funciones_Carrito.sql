/*
    042_Funciones_Carrito.sql
    - FU_Carrito_Lineas: líneas de un carrito con el precio vigente de cada variante.
    - FU_Carrito_Configuracion: límite de unidades por línea, leído de Parametro.

    El carrito no guarda precios: FU_Carrito_Lineas es la única fuente del importe de cada línea,
    así el carrito, el cálculo del cupón y el checkout usan exactamente los mismos números.
*/
:on error exit
SET NOCOUNT ON;
GO

/*
    Incluye variantes y productos inactivos (con sus banderas): el carrito los muestra como
    "no disponible" y el checkout los rechaza; no desaparecen en silencio.
    EnVenta = variante, producto y categoría activos (la misma regla de visibilidad de la tienda).
*/
CREATE OR ALTER FUNCTION dbo.FU_Carrito_Lineas (@IDCarrito INT)
RETURNS TABLE
AS
RETURN
    SELECT
        ci.IDCarritoItem,
        ci.IDVariante,
        v.IDProducto,
        p.IDCategoria,
        ci.Cantidad,
        v.Precio AS PrecioUnitario,
        CAST(ci.Cantidad * v.Precio AS DECIMAL(12, 2)) AS Importe,
        v.Activo AS VarianteActiva,
        p.Activo AS ProductoActivo,
        c.Activo AS CategoriaActiva,
        CAST(CASE WHEN v.Activo = 1 AND p.Activo = 1 AND c.Activo = 1 THEN 1 ELSE 0 END AS BIT) AS EnVenta
    FROM dbo.CarritoItem AS ci
    INNER JOIN dbo.Variante AS v ON v.IDVariante = ci.IDVariante
    INNER JOIN dbo.Producto AS p ON p.IDProducto = v.IDProducto
    INNER JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
    WHERE ci.IDCarrito = @IDCarrito;
GO

/*
    Siempre devuelve una fila. MaximoPorLinea es NULL si el parámetro falta o está fuera de
    1–999 (el máximo que admite CarritoItem): el SP lo rechaza en lugar de inventar un límite.
    - MAXIMO_UNIDADES_POR_LINEA: unidades máximas de una misma variante en un carrito. El tope
      real de cada línea es el menor entre este límite y lo disponible.
*/
CREATE OR ALTER FUNCTION dbo.FU_Carrito_Configuracion ()
RETURNS TABLE
AS
RETURN
    SELECT CASE WHEN v.MaximoPorLinea BETWEEN 1 AND 999 THEN v.MaximoPorLinea END AS MaximoPorLinea
    FROM (
        SELECT (SELECT TRY_CAST(p.Valor AS INT) FROM dbo.Parametro AS p WHERE p.Clave = 'MAXIMO_UNIDADES_POR_LINEA') AS MaximoPorLinea
    ) AS v;
GO
