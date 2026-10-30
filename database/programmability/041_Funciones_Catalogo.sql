/*
    041_Funciones_Catalogo.sql
    FU_Catalogo_OrdenVariantes: orden lógico de las variantes de cada producto y variante de
    selección inicial (D13). De la selección inicial salen el precio único del listado y el
    filtro/orden por precio (D18).
    FU_Catalogo_ValidarDatos: reglas de los textos del catálogo para los SPs de administración.
    FU_Catalogo_ValidarVariantes / FU_Catalogo_ValidarImagenes: reglas de las variantes y de las
    imágenes de un producto, compartidas por el alta del producto y por los SPs
    que agregan variantes o imágenes a uno existente.
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

/*
    FU_Catalogo_ValidarVariantes: valida variantes nuevas de un producto. Devuelve el primer
    error en orden de prioridad, o ninguna fila.
    - @IDProducto NULL = producto nuevo; si no, las variantes nuevas se comparan también con las
      que ya tiene (activas o no).
    - Firma = IDs de los atributos de una variante; todas las variantes del producto deben tener
      la misma, y si hay más de una variante, ninguna puede quedar sin atributos.
    - Clave = IDs de los valores ordenados por IDAtributo (la misma ClaveCombinacion que guarda
      el SP): no puede repetirse en el producto.
    - Recibe el SKU ya normalizado por el SP (mayúsculas, sin espacios en los extremos).
    - Los atributos y valores desactivados no se pueden usar en variantes nuevas.
*/
CREATE OR ALTER FUNCTION dbo.FU_Catalogo_ValidarVariantes
(
    @IDProducto  INT,
    @IDCategoria INT,
    @Variantes   dbo.TT_Catalogo_Variante READONLY,
    @Atributos   dbo.TT_Catalogo_VarianteAtributo READONLY
)
RETURNS TABLE
AS
RETURN
    WITH Nuevas AS
    (
        SELECT
            v.NumeroLinea,
            ISNULL((SELECT STRING_AGG(CAST(a.IDAtributo AS VARCHAR(12)), '|') WITHIN GROUP (ORDER BY a.IDAtributo)
                    FROM @Atributos AS a WHERE a.NumeroLinea = v.NumeroLinea), '') AS Firma,
            ISNULL((SELECT STRING_AGG(CAST(a.IDAtributoValor AS VARCHAR(12)), '|') WITHIN GROUP (ORDER BY a.IDAtributo)
                    FROM @Atributos AS a WHERE a.NumeroLinea = v.NumeroLinea), '') AS Clave
        FROM @Variantes AS v
    ),
    Existentes AS
    (
        SELECT
            ve.IDVariante,
            CAST(ve.ClaveCombinacion AS VARCHAR(8000)) AS Clave,
            ISNULL((SELECT STRING_AGG(CAST(vav.IDAtributo AS VARCHAR(12)), '|') WITHIN GROUP (ORDER BY vav.IDAtributo)
                    FROM dbo.VarianteAtributoValor AS vav WHERE vav.IDVariante = ve.IDVariante), '') AS Firma
        FROM dbo.Variante AS ve
        WHERE ve.IDProducto = @IDProducto
    ),
    Todas AS
    (
        SELECT Firma, Clave FROM Nuevas
        UNION ALL
        SELECT Firma, Clave FROM Existentes
    )
    SELECT TOP (1) r.NumeroError, r.MensajeError
    FROM (VALUES
        (1, 50013, N'VARIANTES_REQUERIDAS: el producto debe tener al menos una variante.',
            CASE WHEN NOT EXISTS (SELECT 1 FROM @Variantes) THEN 1 ELSE 0 END),
        (2, 50014, N'SKU_INVALIDO: el SKU admite mayúsculas, dígitos y guiones (de 3 a 50 caracteres).',
            CASE WHEN EXISTS (SELECT 1 FROM @Variantes AS v
                              WHERE LEN(v.SKU) < 3 OR v.SKU COLLATE Latin1_General_100_BIN2 LIKE '%[^-A-Z0-9]%')
                 THEN 1 ELSE 0 END),
        (3, 50015, N'PRECIO_INVALIDO: el precio debe ser mayor que cero.',
            CASE WHEN EXISTS (SELECT 1 FROM @Variantes AS v WHERE v.Precio <= 0) THEN 1 ELSE 0 END),
        (4, 50016, N'EXISTENCIA_INVALIDA: la existencia inicial no puede ser negativa.',
            CASE WHEN EXISTS (SELECT 1 FROM @Variantes AS v WHERE v.ExistenciaInicial < 0) THEN 1 ELSE 0 END),
        (5, 50019, N'COMBINACION_INCOMPLETA: hay atributos para una línea de variante que no existe.',
            CASE WHEN EXISTS (SELECT 1 FROM @Atributos AS a
                              WHERE NOT EXISTS (SELECT 1 FROM @Variantes AS v WHERE v.NumeroLinea = a.NumeroLinea))
                 THEN 1 ELSE 0 END),
        (6, 50017, N'ATRIBUTO_NO_PERMITIDO: un atributo no está asignado a la categoría del producto o está desactivado.',
            CASE WHEN EXISTS (SELECT 1
                              FROM @Atributos AS a
                              LEFT JOIN dbo.CategoriaAtributo AS ca ON ca.IDCategoria = @IDCategoria AND ca.IDAtributo = a.IDAtributo
                              LEFT JOIN dbo.Atributo AS at ON at.IDAtributo = a.IDAtributo
                              WHERE ca.IDAtributo IS NULL OR at.Activo = 0)
                 THEN 1 ELSE 0 END),
        (7, 50018, N'VALOR_INVALIDO: un valor no existe, no pertenece a su atributo o está desactivado.',
            CASE WHEN EXISTS (SELECT 1
                              FROM @Atributos AS a
                              LEFT JOIN dbo.AtributoValor AS av ON av.IDAtributoValor = a.IDAtributoValor
                                                               AND av.IDAtributo = a.IDAtributo
                              WHERE av.IDAtributoValor IS NULL OR av.Activo = 0)
                 THEN 1 ELSE 0 END),
        (8, 50019, N'COMBINACION_INCOMPLETA: todas las variantes deben usar los mismos atributos y, si hay más de una, tener atributos.',
            CASE WHEN (SELECT COUNT(DISTINCT t.Firma) FROM Todas AS t) > 1
                       OR ((SELECT COUNT(*) FROM Todas) > 1 AND EXISTS (SELECT 1 FROM Todas AS t WHERE t.Firma = ''))
                 THEN 1 ELSE 0 END),
        (9, 51205, N'SKU_REGISTRADO: un SKU está repetido o ya existe.',
            CASE WHEN (SELECT COUNT(DISTINCT v.SKU) FROM @Variantes AS v) < (SELECT COUNT(*) FROM @Variantes)
                       OR EXISTS (SELECT 1 FROM @Variantes AS v JOIN dbo.Variante AS ve ON ve.SKU = v.SKU)
                 THEN 1 ELSE 0 END),
        (10, 51206, N'COMBINACION_REPETIDA: dos variantes del producto tienen la misma combinación de valores.',
            CASE WHEN (SELECT COUNT(DISTINCT t.Clave) FROM Todas AS t) < (SELECT COUNT(*) FROM Todas)
                 THEN 1 ELSE 0 END)
    ) AS r (Prioridad, NumeroError, MensajeError, Falla)
    WHERE r.Falla = 1
    ORDER BY r.Prioridad;
GO

/*
    FU_Catalogo_ValidarImagenes: valida imágenes nuevas de un producto contra su estado actual
    en la base (el alta del producto la consulta después de insertar las variantes, dentro de
    su transacción).
    - Una imagen por valor (p. ej. por color) debe usar un valor que tenga alguna variante del
      producto, y todas las imágenes por valor del producto pertenecen al mismo atributo.
    - En cada grupo (generales o de un mismo valor) se marca como máximo una principal.
    - Recibe el texto alternativo ya recortado por el SP.
*/
CREATE OR ALTER FUNCTION dbo.FU_Catalogo_ValidarImagenes
(
    @IDProducto INT,
    @Imagenes   dbo.TT_Catalogo_ProductoImagen READONLY
)
RETURNS TABLE
AS
RETURN
    SELECT TOP (1) r.NumeroError, r.MensajeError
    FROM (VALUES
        (1, 50020, N'IMAGEN_INVALIDA: la ruta debe estar dentro de /uploads/ y el texto alternativo es obligatorio.',
            CASE WHEN EXISTS (SELECT 1 FROM @Imagenes AS i
                              WHERE i.RutaImagen NOT LIKE N'/uploads/_%' OR i.RutaImagen LIKE N'%..%'
                                 OR LEN(i.TextoAlternativo) = 0)
                 THEN 1 ELSE 0 END),
        (2, 50020, N'IMAGEN_INVALIDA: una imagen usa un valor que no tiene ninguna variante del producto.',
            CASE WHEN EXISTS (SELECT 1 FROM @Imagenes AS i
                              WHERE i.IDAtributoValor IS NOT NULL
                                AND NOT EXISTS (SELECT 1
                                                FROM dbo.Variante AS v
                                                JOIN dbo.VarianteAtributoValor AS vav ON vav.IDVariante = v.IDVariante
                                                WHERE v.IDProducto = @IDProducto AND vav.IDAtributoValor = i.IDAtributoValor))
                 THEN 1 ELSE 0 END),
        (3, 50020, N'IMAGEN_INVALIDA: las imágenes por valor de un producto deben ser todas del mismo atributo.',
            CASE WHEN (SELECT COUNT(DISTINCT av.IDAtributo)
                       FROM (SELECT i.IDAtributoValor FROM @Imagenes AS i
                             UNION
                             SELECT pi.IDAtributoValor FROM dbo.ProductoImagen AS pi WHERE pi.IDProducto = @IDProducto) AS g
                       JOIN dbo.AtributoValor AS av ON av.IDAtributoValor = g.IDAtributoValor) > 1
                 THEN 1 ELSE 0 END),
        (4, 50020, N'IMAGEN_INVALIDA: solo puede haber una imagen principal por grupo.',
            CASE WHEN EXISTS (SELECT 1 FROM @Imagenes AS i WHERE i.EsPrincipal = 1
                              GROUP BY i.IDAtributoValor HAVING COUNT(*) > 1)
                 THEN 1 ELSE 0 END),
        (5, 51210, N'IMAGEN_REGISTRADA: una ruta de imagen está repetida o ya existe.',
            CASE WHEN (SELECT COUNT(DISTINCT i.RutaImagen) FROM @Imagenes AS i) < (SELECT COUNT(*) FROM @Imagenes)
                       OR EXISTS (SELECT 1 FROM @Imagenes AS i JOIN dbo.ProductoImagen AS pi ON pi.RutaImagen = i.RutaImagen)
                 THEN 1 ELSE 0 END)
    ) AS r (Prioridad, NumeroError, MensajeError, Falla)
    WHERE r.Falla = 1
    ORDER BY r.Prioridad;
GO
