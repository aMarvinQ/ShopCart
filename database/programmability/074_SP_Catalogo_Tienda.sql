/*
    074_SP_Catalogo_Tienda.sql
    Catálogo público de la tienda (RF-02): categorías, búsqueda y detalle de un producto.
    No requieren usuario: los usa cualquier visitante.

    - Visible = producto activo, de una categoría activa, con al menos una variante activa.
      Desactivar una categoría oculta sus productos sin cambiar el estado de cada uno.
    - Precio mostrado (D18): el de la variante de selección inicial (FU_Catalogo_OrdenVariantes),
      la primera disponible en el orden lógico o, si todas están agotadas, la primera. El filtro
      y el orden por precio usan ese mismo precio: una tarjeta nunca queda fuera del rango que
      pidió el cliente, y la tarjeta y el detalle coinciden al abrir el producto.
    - Un producto con todas sus variantes agotadas se sigue mostrando, como no disponible.
    - Un solo conjunto de resultados por SP; listas hijas en JSON. Errores: ver docs/errores.md.
*/
:on error exit
SET NOCOUNT ON;
GO

/* Categorías del menú y de los filtros: activas y con al menos un producto visible. */
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ListarCategoriasTienda
AS
BEGIN
    SET NOCOUNT ON;

    SELECT c.IDCategoria, c.Nombre, c.Slug, c.Descripcion, v.ProductosVisibles
    FROM dbo.Categoria AS c
    CROSS APPLY (
        SELECT COUNT(*) AS ProductosVisibles
        FROM dbo.Producto AS p
        WHERE p.IDCategoria = c.IDCategoria
          AND p.Activo = 1
          AND EXISTS (SELECT 1 FROM dbo.Variante AS va WHERE va.IDProducto = p.IDProducto AND va.Activo = 1)
    ) AS v
    WHERE c.Activo = 1 AND v.ProductosVisibles > 0
    ORDER BY c.Nombre;
END;
GO

/*
    Búsqueda paginada de la tienda. Filtros opcionales (NULL = sin filtro):
    - @Texto: busca en nombre y descripción; los comodines de LIKE se buscan como texto.
    - @SlugCategoria: la categoría de la URL; si no existe o está inactiva, CATEGORIA_NO_ENCONTRADA.
    - @PrecioMinimo / @PrecioMaximo: sobre el precio mostrado.
    - @SoloDisponibles: oculta los productos agotados.
    - @OrdenarPor (lista blanca): RECIENTES, NOMBRE o PRECIO; @Direccion: ASC o DESC.
    Las coincidencias se materializan una vez (ID, precio y claves de orden) para contar y
    paginar sin recalcular la disponibilidad; la imagen se busca solo para la página devuelta.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_BuscarProductos
    @Texto           NVARCHAR(101) = NULL,
    @SlugCategoria   VARCHAR(121) = NULL,
    @PrecioMinimo    DECIMAL(12, 2) = NULL,
    @PrecioMaximo    DECIMAL(12, 2) = NULL,
    @SoloDisponibles BIT = 0,
    @OrdenarPor      VARCHAR(20) = 'RECIENTES',
    @Direccion       VARCHAR(4) = 'DESC',
    @Pagina          INT = 1,
    @TamanoPagina    INT = 20,
    @TotalRegistros  INT = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME(), @Patron NVARCHAR(410), @IDCategoria INT;

    IF @Pagina IS NULL OR @Pagina < 1 OR @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50007, N'PAGINACION_INVALIDA: la página inicia en 1 y el tamaño va de 1 a 100.', 1;

    SET @Texto = NULLIF(TRIM(@Texto), N'');
    IF LEN(@Texto) > 100
        THROW 50008, N'BUSQUEDA_INVALIDA: la búsqueda admite como máximo 100 caracteres.', 1;

    IF @PrecioMinimo < 0 OR @PrecioMaximo < 0 OR @PrecioMinimo > @PrecioMaximo
        THROW 50021, N'RANGO_PRECIO_INVALIDO: los precios no pueden ser negativos y el mínimo no puede superar al máximo.', 1;

    SELECT @OrdenarPor = UPPER(TRIM(ISNULL(@OrdenarPor, 'RECIENTES'))), @Direccion = UPPER(TRIM(ISNULL(@Direccion, 'DESC')));
    IF @OrdenarPor NOT IN ('RECIENTES', 'NOMBRE', 'PRECIO') OR @Direccion NOT IN ('ASC', 'DESC')
        THROW 50022, N'ORDENAMIENTO_INVALIDO: se ordena por RECIENTES, NOMBRE o PRECIO, en dirección ASC o DESC.', 1;

    SET @SlugCategoria = NULLIF(LOWER(TRIM(@SlugCategoria)), '');
    IF @SlugCategoria IS NOT NULL
    BEGIN
        SELECT @IDCategoria = c.IDCategoria FROM dbo.Categoria AS c WHERE c.Slug = @SlugCategoria AND c.Activo = 1;
        IF @IDCategoria IS NULL
            THROW 50102, N'CATEGORIA_NO_ENCONTRADA: la categoría no existe.', 1;
    END;

    SET @Patron = N'%' + REPLACE(REPLACE(REPLACE(REPLACE(@Texto,
                      N'\', N'\\'), N'%', N'\%'), N'_', N'\_'), N'[', N'\[') + N'%';

    CREATE TABLE #Coincidencias
    (
        IDProducto    INT            NOT NULL PRIMARY KEY,
        IDVariante    INT            NOT NULL,
        Nombre        NVARCHAR(200)  NOT NULL,
        Precio        DECIMAL(12, 2) NOT NULL,
        Disponible    BIT            NOT NULL,
        FechaCreacion DATETIME2(3)   NOT NULL
    );

    INSERT INTO #Coincidencias (IDProducto, IDVariante, Nombre, Precio, Disponible, FechaCreacion)
    SELECT p.IDProducto, o.IDVariante, p.Nombre, o.Precio, CASE WHEN o.Disponible > 0 THEN 1 ELSE 0 END, p.FechaCreacion
    FROM dbo.Producto AS p
    JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
    JOIN dbo.FU_Catalogo_OrdenVariantes(@Ahora) AS o ON o.IDProducto = p.IDProducto AND o.EsSeleccionInicial = 1
    WHERE p.Activo = 1
      AND c.Activo = 1
      AND (@IDCategoria IS NULL OR p.IDCategoria = @IDCategoria)
      AND (@Patron IS NULL OR p.Nombre LIKE @Patron ESCAPE N'\' OR p.Descripcion LIKE @Patron ESCAPE N'\')
      AND (@PrecioMinimo IS NULL OR o.Precio >= @PrecioMinimo)
      AND (@PrecioMaximo IS NULL OR o.Precio <= @PrecioMaximo)
      AND (@SoloDisponibles = 0 OR o.Disponible > 0)
    OPTION (RECOMPILE);

    SET @TotalRegistros = (SELECT COUNT(*) FROM #Coincidencias);

    SELECT k.IDProducto, p.Nombre, p.Slug, c.Nombre AS Categoria, c.Slug AS SlugCategoria,
           k.Precio, k.Disponible, i.RutaImagen AS ImagenPrincipal, i.TextoAlternativo
    FROM #Coincidencias AS k
    JOIN dbo.Producto AS p ON p.IDProducto = k.IDProducto
    JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
    -- Imagen de la tarjeta: la principal del valor de la selección inicial (su color) o la general.
    OUTER APPLY (
        SELECT TOP (1) pi.RutaImagen, pi.TextoAlternativo
        FROM dbo.ProductoImagen AS pi
        WHERE pi.IDProducto = k.IDProducto AND pi.EsPrincipal = 1
        ORDER BY CASE WHEN EXISTS (SELECT 1 FROM dbo.VarianteAtributoValor AS vav
                                   WHERE vav.IDVariante = k.IDVariante AND vav.IDAtributoValor = pi.IDAtributoValor) THEN 0
                      WHEN pi.IDAtributoValor IS NULL THEN 1
                      ELSE 2 END,
                 pi.IDProductoImagen
    ) AS i
    ORDER BY
        CASE WHEN @OrdenarPor = 'PRECIO'    AND @Direccion = 'ASC'  THEN k.Precio END ASC,
        CASE WHEN @OrdenarPor = 'PRECIO'    AND @Direccion = 'DESC' THEN k.Precio END DESC,
        CASE WHEN @OrdenarPor = 'NOMBRE'    AND @Direccion = 'ASC'  THEN k.Nombre END ASC,
        CASE WHEN @OrdenarPor = 'NOMBRE'    AND @Direccion = 'DESC' THEN k.Nombre END DESC,
        CASE WHEN @OrdenarPor = 'RECIENTES' AND @Direccion = 'ASC'  THEN k.FechaCreacion END ASC,
        CASE WHEN @OrdenarPor = 'RECIENTES' AND @Direccion = 'DESC' THEN k.FechaCreacion END DESC,
        k.IDProducto DESC
    OFFSET CAST(@Pagina - 1 AS BIGINT) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY;
END;
GO

/*
    Detalle de un producto visible por su slug, en una fila:
    - Variantes (solo activas) en JSON, en el orden de selección: la primera es la selección
      inicial; las disponibles antes que las agotadas. Cada una con sus atributos (orden del
      atributo y del valor, y color) para armar los selectores sin otra petición.
    - Imágenes en JSON: IDAtributoValor NULL = generales; con valor = las de ese color.
    El carrito solo recibe IDVariante.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ObtenerProducto
    @Slug VARCHAR(221)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME(), @IDProducto INT;

    SET @Slug = LOWER(TRIM(@Slug));

    SELECT @IDProducto = p.IDProducto
    FROM dbo.Producto AS p
    JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
    WHERE p.Slug = @Slug
      AND p.Activo = 1
      AND c.Activo = 1
      AND EXISTS (SELECT 1 FROM dbo.Variante AS v WHERE v.IDProducto = p.IDProducto AND v.Activo = 1);

    IF @IDProducto IS NULL
        THROW 50105, N'PRODUCTO_NO_ENCONTRADO: el producto no existe o no está disponible en la tienda.', 1;

    SELECT p.IDProducto, p.Nombre, p.Slug, p.Descripcion, c.IDCategoria, c.Nombre AS Categoria, c.Slug AS SlugCategoria,
           ISNULL((SELECT o.IDVariante, o.SKU, o.Precio, o.Disponible, o.EsSeleccionInicial,
                          JSON_QUERY(ISNULL((
                              SELECT vav.IDAtributo, at.Nombre AS Atributo, ISNULL(ca.Orden, 255) AS OrdenAtributo,
                                     vav.IDAtributoValor, av.Valor, av.Orden AS OrdenValor, av.CodigoHex
                              FROM dbo.VarianteAtributoValor AS vav
                              JOIN dbo.Atributo AS at ON at.IDAtributo = vav.IDAtributo
                              JOIN dbo.AtributoValor AS av ON av.IDAtributoValor = vav.IDAtributoValor
                              LEFT JOIN dbo.CategoriaAtributo AS ca ON ca.IDCategoria = p.IDCategoria AND ca.IDAtributo = vav.IDAtributo
                              WHERE vav.IDVariante = o.IDVariante
                              ORDER BY ISNULL(ca.Orden, 255), vav.IDAtributo
                              FOR JSON PATH, INCLUDE_NULL_VALUES), N'[]')) AS Atributos
                   FROM dbo.FU_Catalogo_OrdenVariantes(@Ahora) AS o
                   WHERE o.IDProducto = p.IDProducto AND o.Activo = 1
                   ORDER BY o.PosicionInicial
                   FOR JSON PATH, INCLUDE_NULL_VALUES), N'[]') AS Variantes,
           ISNULL((SELECT pi.IDAtributoValor, pi.RutaImagen, pi.TextoAlternativo, pi.Orden, pi.EsPrincipal
                   FROM dbo.ProductoImagen AS pi
                   LEFT JOIN dbo.AtributoValor AS av ON av.IDAtributoValor = pi.IDAtributoValor
                   WHERE pi.IDProducto = p.IDProducto
                   ORDER BY CASE WHEN pi.IDAtributoValor IS NULL THEN 0 ELSE 1 END, av.Orden, pi.IDAtributoValor,
                            pi.EsPrincipal DESC, pi.Orden, pi.IDProductoImagen
                   FOR JSON PATH, INCLUDE_NULL_VALUES), N'[]') AS Imagenes
    FROM dbo.Producto AS p
    JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
    WHERE p.IDProducto = @IDProducto;
END;
GO
