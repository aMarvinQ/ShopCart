/*
    041_Funciones_Catalogo.sql
    FU_Catalogo_OrdenVariantes: orden lógico de las variantes de cada producto y variante de
    selección inicial (D13). De la selección inicial salen el precio único del listado y el
    filtro/orden por precio (D18).
*/
:on error exit
SET NOCOUNT ON;
GO

/*
    ClaveOrden: por cada atributo de la variante (en el orden que define su categoría en
    CategoriaAtributo.Orden), el Orden del valor y su ID con ancho fijo, concatenados.
    Al comparar el texto se ordena primero por el primer selector (p. ej. Color) y luego por
    el siguiente (Talla: S < M < L), sin importar cuántos atributos tenga el producto y con
    SQL estático. Variante sin atributos = ''.

    PosicionInicial (por producto): activas primero, luego las que tienen existencia
    disponible, luego ClaveOrden. EsSeleccionInicial = la primera activa: la primera
    disponible o, si todas están agotadas, la primera combinación.

    Función en línea: un filtro por IDProducto en el SP llega hasta los índices (la
    numeración es por producto), así que el detalle de un producto no calcula todo el catálogo.
*/
CREATE OR ALTER FUNCTION dbo.FU_Catalogo_OrdenVariantes (@Ahora DATETIME2(3))
RETURNS TABLE
AS
RETURN
    WITH Claves AS
    (
        SELECT
            v.IDVariante,
            v.IDProducto,
            v.SKU,
            v.Precio,
            v.Activo,
            d.ExistenciaFisica,
            d.Disponible,
            ISNULL(k.ClaveOrden, '') AS ClaveOrden
        FROM dbo.Variante AS v
        INNER JOIN dbo.Producto AS p ON p.IDProducto = v.IDProducto
        INNER JOIN dbo.FU_Inventario_Disponibilidad(@Ahora) AS d ON d.IDVariante = v.IDVariante
        OUTER APPLY (
            SELECT STRING_AGG(
                       CAST(RIGHT(CONCAT('000', ISNULL(ca.Orden, 255)), 3)
                            + RIGHT(CONCAT('000', av.Orden), 3)
                            + RIGHT(CONCAT('0000000000', av.IDAtributoValor), 10) AS VARCHAR(MAX)),
                       '|'
                   ) WITHIN GROUP (ORDER BY ISNULL(ca.Orden, 255), vav.IDAtributo) AS ClaveOrden
            FROM dbo.VarianteAtributoValor AS vav
            INNER JOIN dbo.AtributoValor AS av ON av.IDAtributoValor = vav.IDAtributoValor
            LEFT JOIN dbo.CategoriaAtributo AS ca
                ON ca.IDCategoria = p.IDCategoria
               AND ca.IDAtributo = vav.IDAtributo
            WHERE vav.IDVariante = v.IDVariante
        ) AS k
    ),
    Posiciones AS
    (
        SELECT
            c.IDVariante, c.IDProducto, c.SKU, c.Precio, c.Activo, c.ExistenciaFisica, c.Disponible, c.ClaveOrden,
            ROW_NUMBER() OVER (
                PARTITION BY c.IDProducto
                ORDER BY c.Activo DESC,
                         CASE WHEN c.Disponible > 0 THEN 0 ELSE 1 END,
                         c.ClaveOrden,
                         c.IDVariante
            ) AS PosicionInicial
        FROM Claves AS c
    )
    SELECT
        IDVariante,
        IDProducto,
        SKU,
        Precio,
        Activo,
        ExistenciaFisica,
        Disponible,
        ClaveOrden,
        PosicionInicial,
        CAST(CASE WHEN PosicionInicial = 1 AND Activo = 1 THEN 1 ELSE 0 END AS BIT) AS EsSeleccionInicial
    FROM Posiciones;
GO
