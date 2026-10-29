/*
    042_Funciones_Carrito.sql
    FU_Carrito_Lineas: líneas de un carrito con el precio vigente de cada variante.

    El carrito no guarda precios: esta función es la única fuente del importe de cada línea,
    así el carrito, el cálculo del cupón y el checkout usan exactamente los mismos números.
*/
:on error exit
SET NOCOUNT ON;
GO

/*
    Incluye variantes y productos inactivos (con sus banderas): el carrito los muestra como
    "no disponible" y el checkout los rechaza; no desaparecen en silencio.
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
        p.Activo AS ProductoActivo
    FROM dbo.CarritoItem AS ci
    INNER JOIN dbo.Variante AS v ON v.IDVariante = ci.IDVariante
    INNER JOIN dbo.Producto AS p ON p.IDProducto = v.IDProducto
    WHERE ci.IDCarrito = @IDCarrito;
GO
