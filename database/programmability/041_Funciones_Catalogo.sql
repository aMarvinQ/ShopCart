/*
    041_Funciones_Catalogo.sql
    FU_Catalogo_OrdenVariantes: orden lógico de las variantes de cada producto y variante de
    selección inicial (D13). De la selección inicial salen el precio único del listado y el
    filtro/orden por precio (D18).
    FU_Catalogo_ValidarDatos: reglas de los textos del catálogo para los SPs de administración.
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

/*
    FU_Catalogo_ValidarDatos: reglas de los textos del catálogo (categorías, productos,
    atributos y sus valores) con su error estable. Mismo patrón que FU_Usuarios_ValidarDatos:
    un parámetro NULL no se valida, el SP envía '' para los obligatorios y declara los textos
    con un carácter más que la columna para detectar valores demasiado largos (la descripción
    del producto ocupa NVARCHAR(4000), el máximo con tamaño: ahí el SP usa NVARCHAR(MAX)).
    - Slug: minúsculas sin tildes, dígitos y guiones simples (mismo formato que el CHECK de la
      tabla). Lo genera la API a partir del nombre; aquí solo se valida.
    - CodigoHex: color #RRGGBB en mayúsculas (el SP las normaliza).
*/
CREATE OR ALTER FUNCTION dbo.FU_Catalogo_ValidarDatos
(
    @Nombre            NVARCHAR(201),
    @MaximoNombre      INT,
    @Slug              VARCHAR(221),
    @MaximoSlug        INT,
    @Descripcion       NVARCHAR(MAX),
    @MaximoDescripcion INT,
    @CodigoHex         VARCHAR(8)
)
RETURNS TABLE
AS
RETURN
    SELECT TOP (1) v.NumeroError, v.MensajeError
    FROM (VALUES
        (1, 50003, CONCAT(N'NOMBRE_INVALIDO: el nombre es obligatorio (máximo ', @MaximoNombre, N' caracteres).'),
            CASE WHEN @Nombre IS NOT NULL AND (LEN(@Nombre) = 0 OR LEN(@Nombre) > @MaximoNombre)
                 THEN 1 ELSE 0 END),
        (2, 50009, CONCAT(N'SLUG_INVALIDO: solo minúsculas sin tildes, dígitos y guiones simples (máximo ', @MaximoSlug, N' caracteres).'),
            CASE WHEN @Slug IS NOT NULL
                       AND (LEN(@Slug) = 0 OR LEN(@Slug) > @MaximoSlug
                            OR @Slug COLLATE Latin1_General_100_BIN2 LIKE '%[^-a-z0-9]%'
                            OR @Slug LIKE '-%' OR @Slug LIKE '%-' OR @Slug LIKE '%--%')
                 THEN 1 ELSE 0 END),
        (3, 50010, CONCAT(N'DESCRIPCION_INVALIDA: la descripción admite como máximo ', @MaximoDescripcion, N' caracteres.'),
            CASE WHEN @Descripcion IS NOT NULL AND LEN(@Descripcion) > @MaximoDescripcion
                 THEN 1 ELSE 0 END),
        (4, 50011, N'COLOR_INVALIDO: el color debe tener el formato #RRGGBB.',
            CASE WHEN @CodigoHex IS NOT NULL
                       AND (LEN(@CodigoHex) <> 7
                            OR @CodigoHex COLLATE Latin1_General_100_BIN2 NOT LIKE '#[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F]')
                 THEN 1 ELSE 0 END)
    ) AS v (Prioridad, NumeroError, MensajeError, Falla)
    WHERE v.Falla = 1
    ORDER BY v.Prioridad;
GO
