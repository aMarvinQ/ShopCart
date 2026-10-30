/*
    073_SP_Catalogo_Productos.sql
    Administración de productos, variantes, precios e imágenes (RF-02). Solo administradores.

    - Mismo contrato que 072: @IDUsuarioAccion validado como ADMIN activo, un solo conjunto de
      resultados (listas hijas en JSON), control de edición concurrente con VersionFila,
      bitácora en el módulo CATALOGO sin registros por guardar los mismos valores.
    - Un producto nace inactivo. Para activarlo necesita al menos una imagen y una variante
      activa; mientras esté activo no se puede quitar su última imagen ni desactivar su última
      variante activa (para retirarlo se desactiva el producto).
    - Agotada no es lo mismo que desactivada: una variante sin existencia se sigue mostrando
      como agotada; desactivarla la retira de la venta. La existencia solo cambia por el kardex.
    - Existencia inicial: movimiento INVENTARIO_INICIAL del kardex en la misma transacción del
      alta; el saldo de la variante se toma del movimiento. Precio inicial en HistorialPrecio.
    - Imagen principal: cada grupo de imágenes (las generales, o las de un mismo valor como un
      color) tiene siempre exactamente una. Si no se marca ninguna se toma la de menor orden, y
      si se elimina la principal se promueve la siguiente.
    - Orden de bloqueo: Categoria → Producto → Variante / ProductoImagen.
    - Errores: ver docs/errores.md.
*/
:on error exit
SET NOCOUNT ON;
GO

/* === Consultas =========================================================================== */

/*
    Detalle para el panel: el producto con VersionFila, sus variantes en JSON (activas e
    inactivas, en orden lógico, con disponibilidad, VersionFila en base64 y sus atributos) y
    sus imágenes en JSON (primero las generales).
*/
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ObtenerProductoAdmin
    @IDUsuarioAccion INT,
    @IDProducto      INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME();

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.Producto AS p WHERE p.IDProducto = @IDProducto)
        THROW 50105, N'PRODUCTO_NO_ENCONTRADO: el producto no existe.', 1;

    SELECT p.IDProducto, p.IDCategoria, c.Nombre AS Categoria, c.Activo AS CategoriaActiva,
           p.Nombre, p.Slug, p.Descripcion, p.Activo, p.FechaCreacion, p.FechaModificacion, p.VersionFila,
           ISNULL((SELECT o.IDVariante, o.SKU, o.Precio, o.Activo, o.ExistenciaFisica, o.Disponible,
                          o.EsSeleccionInicial, v.VersionFila,
                          JSON_QUERY(ISNULL((
                              SELECT vav.IDAtributo, at.Nombre AS Atributo, vav.IDAtributoValor, av.Valor, av.CodigoHex
                              FROM dbo.VarianteAtributoValor AS vav
                              JOIN dbo.Atributo AS at ON at.IDAtributo = vav.IDAtributo
                              JOIN dbo.AtributoValor AS av ON av.IDAtributoValor = vav.IDAtributoValor
                              LEFT JOIN dbo.CategoriaAtributo AS ca ON ca.IDCategoria = p.IDCategoria AND ca.IDAtributo = vav.IDAtributo
                              WHERE vav.IDVariante = o.IDVariante
                              ORDER BY ISNULL(ca.Orden, 255), vav.IDAtributo
                              FOR JSON PATH, INCLUDE_NULL_VALUES), N'[]')) AS Atributos
                   FROM dbo.FU_Catalogo_OrdenVariantes(@Ahora) AS o
                   JOIN dbo.Variante AS v ON v.IDVariante = o.IDVariante
                   WHERE o.IDProducto = p.IDProducto
                   ORDER BY o.ClaveOrden, o.IDVariante
                   FOR JSON PATH, INCLUDE_NULL_VALUES), N'[]') AS Variantes,
           ISNULL((SELECT pi.IDProductoImagen, pi.IDAtributoValor, av.Valor, pi.RutaImagen, pi.TextoAlternativo,
                          pi.Orden, pi.EsPrincipal
                   FROM dbo.ProductoImagen AS pi
                   LEFT JOIN dbo.AtributoValor AS av ON av.IDAtributoValor = pi.IDAtributoValor
                   WHERE pi.IDProducto = p.IDProducto
                   ORDER BY CASE WHEN pi.IDAtributoValor IS NULL THEN 0 ELSE 1 END, av.Orden, pi.IDAtributoValor,
                            pi.Orden, pi.IDProductoImagen
                   FOR JSON PATH, INCLUDE_NULL_VALUES), N'[]') AS Imagenes
    FROM dbo.Producto AS p
    JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
    WHERE p.IDProducto = @IDProducto;
END;
GO

/*
    Listado paginado para el panel (activos e inactivos). Filtros opcionales (NULL = sin
    filtro); la búsqueda compara nombre, slug y SKU de las variantes, con los comodines
    escapados. Precios y existencia se resumen sobre las variantes activas.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ListarProductos
    @IDUsuarioAccion INT,
    @IDCategoria     INT = NULL,
    @Activo          BIT = NULL,
    @Busqueda        NVARCHAR(101) = NULL,
    @Pagina          INT = 1,
    @TamanoPagina    INT = 20,
    @TotalRegistros  INT = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Patron NVARCHAR(410);

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    IF @Pagina IS NULL OR @Pagina < 1 OR @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50007, N'PAGINACION_INVALIDA: la página inicia en 1 y el tamaño va de 1 a 100.', 1;

    SET @Busqueda = NULLIF(TRIM(@Busqueda), N'');
    IF LEN(@Busqueda) > 100
        THROW 50008, N'BUSQUEDA_INVALIDA: la búsqueda admite como máximo 100 caracteres.', 1;

    SET @Patron = N'%' + REPLACE(REPLACE(REPLACE(REPLACE(@Busqueda,
                      N'\', N'\\'), N'%', N'\%'), N'_', N'\_'), N'[', N'\[') + N'%';

    SELECT @TotalRegistros = COUNT(*)
    FROM dbo.Producto AS p
    WHERE (@IDCategoria IS NULL OR p.IDCategoria = @IDCategoria)
      AND (@Activo IS NULL OR p.Activo = @Activo)
      AND (@Patron IS NULL OR p.Nombre LIKE @Patron ESCAPE N'\' OR p.Slug LIKE @Patron ESCAPE N'\'
           OR EXISTS (SELECT 1 FROM dbo.Variante AS v WHERE v.IDProducto = p.IDProducto AND v.SKU LIKE @Patron ESCAPE N'\'))
    OPTION (RECOMPILE);

    SELECT p.IDProducto, p.Nombre, p.Slug, p.IDCategoria, c.Nombre AS Categoria, p.Activo, c.Activo AS CategoriaActiva,
           r.VariantesTotales, r.VariantesActivas, va.PrecioMinimo, va.PrecioMaximo, ISNULL(va.ExistenciaTotal, 0) AS ExistenciaTotal,
           i.RutaImagen AS ImagenPrincipal, p.FechaModificacion
    FROM dbo.Producto AS p
    JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
    CROSS APPLY (
        SELECT COUNT(*) AS VariantesTotales, ISNULL(SUM(CAST(v.Activo AS INT)), 0) AS VariantesActivas
        FROM dbo.Variante AS v
        WHERE v.IDProducto = p.IDProducto
    ) AS r
    -- Filtrar en lugar de agregar CASE: un agregado que descarta NULL envía un aviso a la API.
    OUTER APPLY (
        SELECT MIN(v.Precio) AS PrecioMinimo, MAX(v.Precio) AS PrecioMaximo, SUM(v.ExistenciaFisica) AS ExistenciaTotal
        FROM dbo.Variante AS v
        WHERE v.IDProducto = p.IDProducto AND v.Activo = 1
    ) AS va
    OUTER APPLY (
        SELECT TOP (1) pi.RutaImagen
        FROM dbo.ProductoImagen AS pi
        WHERE pi.IDProducto = p.IDProducto AND pi.EsPrincipal = 1
        ORDER BY CASE WHEN pi.IDAtributoValor IS NULL THEN 0 ELSE 1 END, pi.IDProductoImagen
    ) AS i
    WHERE (@IDCategoria IS NULL OR p.IDCategoria = @IDCategoria)
      AND (@Activo IS NULL OR p.Activo = @Activo)
      AND (@Patron IS NULL OR p.Nombre LIKE @Patron ESCAPE N'\' OR p.Slug LIKE @Patron ESCAPE N'\'
           OR EXISTS (SELECT 1 FROM dbo.Variante AS v WHERE v.IDProducto = p.IDProducto AND v.SKU LIKE @Patron ESCAPE N'\'))
    ORDER BY p.FechaModificacion DESC, p.IDProducto DESC
    OFFSET CAST(@Pagina - 1 AS BIGINT) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY
    OPTION (RECOMPILE);
END;
GO

/* Historial de precios de una variante, del más reciente al más antiguo. */
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ListarHistorialPrecios
    @IDUsuarioAccion INT,
    @IDVariante      INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.Variante AS v WHERE v.IDVariante = @IDVariante)
        THROW 50106, N'VARIANTE_NO_ENCONTRADA: la variante no existe.', 1;

    SELECT h.IDHistorialPrecio, h.Fecha, h.PrecioAnterior, h.PrecioNuevo, h.IDUsuario,
           CONCAT(u.Nombre, N' ', u.Apellido) AS Usuario
    FROM dbo.HistorialPrecio AS h
    JOIN dbo.Usuario AS u ON u.IDUsuario = h.IDUsuario
    WHERE h.IDVariante = @IDVariante
    ORDER BY h.Fecha DESC, h.IDHistorialPrecio DESC;
END;
GO

/* === Productos =========================================================================== */

/*
    Alta completa en una llamada y una transacción: producto, variantes con sus atributos y,
    opcionalmente, imágenes. Las filas de los tipos tabla se enlazan por NumeroLinea; el SKU
    (único) enlaza después cada línea con su IDVariante.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_CrearProducto
    @IDUsuarioAccion INT,
    @IDCategoria     INT,
    @Nombre          NVARCHAR(201),
    @Slug            VARCHAR(221),
    @Descripcion     NVARCHAR(MAX) = NULL,
    @Variantes       dbo.TT_Catalogo_Variante READONLY,
    @Atributos       dbo.TT_Catalogo_VarianteAtributo READONLY,
    @Imagenes        dbo.TT_Catalogo_ProductoImagen READONLY
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @NumeroError INT, @MensajeError NVARCHAR(400), @IDProducto INT, @IDTipoInicial TINYINT;
    DECLARE @V dbo.TT_Catalogo_Variante, @I dbo.TT_Catalogo_ProductoImagen;

    IF @IDCategoria IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere la categoría.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    SELECT @Nombre      = TRIM(ISNULL(@Nombre, N'')),
           @Slug        = LOWER(TRIM(ISNULL(@Slug, ''))),
           @Descripcion = NULLIF(TRIM(@Descripcion), N'');

    SELECT @NumeroError = v.NumeroError, @MensajeError = v.MensajeError
    FROM dbo.FU_Catalogo_ValidarDatos(@Nombre, 200, @Slug, 220, @Descripcion, 4000, NULL) AS v;
    IF @NumeroError IS NOT NULL
        THROW @NumeroError, @MensajeError, 1;

    INSERT INTO @V (NumeroLinea, SKU, Precio, ExistenciaInicial)
    SELECT v.NumeroLinea, UPPER(TRIM(v.SKU)), v.Precio, v.ExistenciaInicial FROM @Variantes AS v;
    INSERT INTO @I (NumeroLinea, RutaImagen, TextoAlternativo, IDAtributoValor, Orden, EsPrincipal)
    SELECT i.NumeroLinea, TRIM(i.RutaImagen), TRIM(i.TextoAlternativo), i.IDAtributoValor, i.Orden, i.EsPrincipal FROM @Imagenes AS i;

    SELECT @IDTipoInicial = t.IDTipoMovimiento FROM dbo.TipoMovimiento AS t WHERE t.Codigo = 'INVENTARIO_INICIAL' AND t.Signo = 1;
    IF @IDTipoInicial IS NULL
        THROW 59001, N'CONFIGURACION_INCOMPLETA: falta el tipo de movimiento INVENTARIO_INICIAL.', 1;

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        -- Bloquea la categoría: sus atributos no cambian mientras se validan las variantes.
        IF NOT EXISTS (SELECT 1 FROM dbo.Categoria AS c WITH (UPDLOCK) WHERE c.IDCategoria = @IDCategoria)
            THROW 50102, N'CATEGORIA_NO_ENCONTRADA: la categoría no existe.', 1;

        SELECT @NumeroError = v.NumeroError, @MensajeError = v.MensajeError
        FROM dbo.FU_Catalogo_ValidarVariantes(NULL, @IDCategoria, @V, @Atributos) AS v;
        IF @NumeroError IS NOT NULL
            THROW @NumeroError, @MensajeError, 1;

        INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug, Descripcion)
        VALUES (@IDCategoria, @Nombre, @Slug, @Descripcion);
        SET @IDProducto = SCOPE_IDENTITY();

        -- Variantes (mismo bloque que SP_Catalogo_AgregarVariantes).
        INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ClaveCombinacion)
        SELECT @IDProducto, v.SKU, v.Precio,
               ISNULL((SELECT STRING_AGG(CAST(a.IDAtributoValor AS VARCHAR(12)), '|') WITHIN GROUP (ORDER BY a.IDAtributo)
                       FROM @Atributos AS a WHERE a.NumeroLinea = v.NumeroLinea), '')
        FROM @V AS v;

        INSERT INTO dbo.VarianteAtributoValor (IDVariante, IDAtributo, IDAtributoValor)
        SELECT ve.IDVariante, a.IDAtributo, a.IDAtributoValor
        FROM @V AS v
        JOIN dbo.Variante AS ve ON ve.SKU = v.SKU
        JOIN @Atributos AS a ON a.NumeroLinea = v.NumeroLinea;

        INSERT INTO dbo.HistorialPrecio (IDVariante, PrecioAnterior, PrecioNuevo, IDUsuario)
        SELECT ve.IDVariante, NULL, v.Precio, @IDUsuarioAccion
        FROM @V AS v JOIN dbo.Variante AS ve ON ve.SKU = v.SKU;

        INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimiento, Signo, Cantidad, SaldoAnterior, SaldoNuevo, IDUsuario)
        SELECT ve.IDVariante, @IDTipoInicial, 1, v.ExistenciaInicial, 0, v.ExistenciaInicial, @IDUsuarioAccion
        FROM @V AS v JOIN dbo.Variante AS ve ON ve.SKU = v.SKU
        WHERE v.ExistenciaInicial > 0;

        UPDATE ve
        SET ExistenciaFisica = m.SaldoNuevo
        FROM dbo.Variante AS ve
        JOIN @V AS v ON v.SKU = ve.SKU
        JOIN dbo.MovimientoInventario AS m ON m.IDVariante = ve.IDVariante;

        -- Imágenes (mismo bloque que SP_Catalogo_AgregarImagenes), validadas contra las variantes ya insertadas.
        IF EXISTS (SELECT 1 FROM @I)
        BEGIN
            SELECT @NumeroError = v.NumeroError, @MensajeError = v.MensajeError
            FROM dbo.FU_Catalogo_ValidarImagenes(@IDProducto, @I) AS v;
            IF @NumeroError IS NOT NULL
                THROW @NumeroError, @MensajeError, 1;

            INSERT INTO dbo.ProductoImagen (IDProducto, IDAtributoValor, RutaImagen, TextoAlternativo, Orden, EsPrincipal)
            SELECT @IDProducto, i.IDAtributoValor, i.RutaImagen, i.TextoAlternativo, i.Orden, i.EsPrincipal FROM @I AS i;

            -- Cada grupo sin principal toma la de menor orden.
            UPDATE pi
            SET EsPrincipal = 1
            FROM dbo.ProductoImagen AS pi
            JOIN (SELECT p2.IDProductoImagen,
                         ROW_NUMBER() OVER (PARTITION BY p2.IDAtributoValor ORDER BY p2.Orden, p2.IDProductoImagen) AS Posicion
                  FROM dbo.ProductoImagen AS p2
                  WHERE p2.IDProducto = @IDProducto
                    AND NOT EXISTS (SELECT 1 FROM dbo.ProductoImagen AS p3
                                    WHERE p3.IDProducto = @IDProducto AND p3.EsPrincipal = 1
                                      AND EXISTS (SELECT p3.IDAtributoValor INTERSECT SELECT p2.IDAtributoValor))) AS x
                ON x.IDProductoImagen = pi.IDProductoImagen AND x.Posicion = 1;
        END;

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorNuevo)
        SELECT @IDUsuarioAccion, 'CATALOGO', 'Producto', CAST(@IDProducto AS VARCHAR(50)), 'CREAR',
               (SELECT p.IDProducto, p.IDCategoria, p.Nombre, p.Slug, p.Descripcion, p.Activo,
                       (SELECT ve.IDVariante, ve.SKU, ve.Precio, ve.ExistenciaFisica, ve.ClaveCombinacion
                        FROM dbo.Variante AS ve WHERE ve.IDProducto = p.IDProducto
                        ORDER BY ve.IDVariante FOR JSON PATH) AS Variantes,
                       (SELECT pi.IDProductoImagen, pi.IDAtributoValor, pi.RutaImagen, pi.EsPrincipal
                        FROM dbo.ProductoImagen AS pi WHERE pi.IDProducto = p.IDProducto
                        ORDER BY pi.IDProductoImagen FOR JSON PATH) AS Imagenes
                FROM dbo.Producto AS p
                WHERE p.IDProducto = @IDProducto
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() IN (2601, 2627) AND ERROR_MESSAGE() LIKE N'%UQ_Producto_Slug%'
            THROW 51202, N'SLUG_REGISTRADO: ya existe un producto con ese slug.', 1;
        IF ERROR_NUMBER() IN (2601, 2627) AND ERROR_MESSAGE() LIKE N'%UQ_Variante_SKU%'
            THROW 51205, N'SKU_REGISTRADO: un SKU está repetido o ya existe.', 1;
        IF ERROR_NUMBER() IN (2601, 2627) AND ERROR_MESSAGE() LIKE N'%UQ_Variante_Producto_Combinacion%'
            THROW 51206, N'COMBINACION_REPETIDA: dos variantes del producto tienen la misma combinación de valores.', 1;
        IF ERROR_NUMBER() IN (2601, 2627) AND ERROR_MESSAGE() LIKE N'%UQ_ProductoImagen_RutaImagen%'
            THROW 51210, N'IMAGEN_REGISTRADA: una ruta de imagen está repetida o ya existe.', 1;
        THROW;
    END CATCH;

    EXEC dbo.SP_Catalogo_ObtenerProductoAdmin @IDUsuarioAccion = @IDUsuarioAccion, @IDProducto = @IDProducto;
END;
GO

/*
    Datos del producto (no toca variantes ni imágenes). Cambiar de categoría solo se permite si
    la nueva admite todos los atributos que usan sus variantes.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ActualizarProducto
    @IDUsuarioAccion INT,
    @IDProducto      INT,
    @IDCategoria     INT,
    @Nombre          NVARCHAR(201),
    @Slug            VARCHAR(221),
    @Descripcion     NVARCHAR(MAX) = NULL,
    @VersionFila     BINARY(8)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @NumeroError INT, @MensajeError NVARCHAR(400), @VersionActual BINARY(8), @CategoriaActual INT,
            @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX);

    IF @IDProducto IS NULL OR @IDCategoria IS NULL OR @VersionFila IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el producto, la categoría y la versión.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    SELECT @Nombre      = TRIM(ISNULL(@Nombre, N'')),
           @Slug        = LOWER(TRIM(ISNULL(@Slug, ''))),
           @Descripcion = NULLIF(TRIM(@Descripcion), N'');

    SELECT @NumeroError = v.NumeroError, @MensajeError = v.MensajeError
    FROM dbo.FU_Catalogo_ValidarDatos(@Nombre, 200, @Slug, 220, @Descripcion, 4000, NULL) AS v;
    IF @NumeroError IS NOT NULL
        THROW @NumeroError, @MensajeError, 1;

    SET @Nuevo = (SELECT @IDCategoria AS IDCategoria, @Nombre AS Nombre, @Slug AS Slug, @Descripcion AS Descripcion
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        IF NOT EXISTS (SELECT 1 FROM dbo.Categoria AS c WITH (UPDLOCK) WHERE c.IDCategoria = @IDCategoria)
            THROW 50102, N'CATEGORIA_NO_ENCONTRADA: la categoría no existe.', 1;

        SELECT @VersionActual = p.VersionFila, @CategoriaActual = p.IDCategoria
        FROM dbo.Producto AS p WITH (UPDLOCK)
        WHERE p.IDProducto = @IDProducto;

        IF @VersionActual IS NULL
            THROW 50105, N'PRODUCTO_NO_ENCONTRADO: el producto no existe.', 1;
        IF @VersionActual <> @VersionFila
            THROW 51203, N'EDICION_CONCURRENTE: otro usuario modificó el registro; vuelva a cargarlo.', 1;

        IF @CategoriaActual <> @IDCategoria
           AND EXISTS (SELECT 1
                       FROM dbo.Variante AS v
                       JOIN dbo.VarianteAtributoValor AS vav ON vav.IDVariante = v.IDVariante
                       WHERE v.IDProducto = @IDProducto
                         AND NOT EXISTS (SELECT 1 FROM dbo.CategoriaAtributo AS ca
                                         WHERE ca.IDCategoria = @IDCategoria AND ca.IDAtributo = vav.IDAtributo))
            THROW 51207, N'CATEGORIA_INCOMPATIBLE: la categoría nueva no admite los atributos que usan las variantes del producto.', 1;

        SET @Anterior = (SELECT p.IDCategoria, p.Nombre, p.Slug, p.Descripcion
                         FROM dbo.Producto AS p
                         WHERE p.IDProducto = @IDProducto
                         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        IF @Anterior COLLATE Latin1_General_100_BIN2 <> @Nuevo
        BEGIN
            UPDATE dbo.Producto
            SET IDCategoria = @IDCategoria, Nombre = @Nombre, Slug = @Slug, Descripcion = @Descripcion,
                FechaModificacion = SYSUTCDATETIME()
            WHERE IDProducto = @IDProducto;

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioAccion, 'CATALOGO', 'Producto', CAST(@IDProducto AS VARCHAR(50)), 'MODIFICAR', @Anterior, @Nuevo);
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() IN (2601, 2627) AND ERROR_MESSAGE() LIKE N'%UQ_Producto_Slug%'
            THROW 51202, N'SLUG_REGISTRADO: ya existe un producto con ese slug.', 1;
        THROW;
    END CATCH;

    EXEC dbo.SP_Catalogo_ObtenerProductoAdmin @IDUsuarioAccion = @IDUsuarioAccion, @IDProducto = @IDProducto;
END;
GO

/*
    Activar exige al menos una imagen y una variante activa (D17). Bloquea el producto: así no
    compite con quien elimina su última imagen o desactiva su última variante.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_CambiarEstadoProducto
    @IDUsuarioAccion INT,
    @IDProducto      INT,
    @Activo          BIT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ActivoActual BIT;

    IF @IDProducto IS NULL OR @Activo IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el producto y el estado.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        SELECT @ActivoActual = p.Activo FROM dbo.Producto AS p WITH (UPDLOCK) WHERE p.IDProducto = @IDProducto;
        IF @ActivoActual IS NULL
            THROW 50105, N'PRODUCTO_NO_ENCONTRADO: el producto no existe.', 1;

        IF @ActivoActual <> @Activo
        BEGIN
            IF @Activo = 1 AND NOT EXISTS (SELECT 1 FROM dbo.ProductoImagen AS pi WHERE pi.IDProducto = @IDProducto)
                THROW 51208, N'PRODUCTO_SIN_IMAGEN: el producto necesita al menos una imagen para estar activo.', 1;
            IF @Activo = 1 AND NOT EXISTS (SELECT 1 FROM dbo.Variante AS v WHERE v.IDProducto = @IDProducto AND v.Activo = 1)
                THROW 51209, N'PRODUCTO_SIN_VARIANTES: el producto necesita al menos una variante activa para estar activo.', 1;

            UPDATE dbo.Producto SET Activo = @Activo, FechaModificacion = SYSUTCDATETIME() WHERE IDProducto = @IDProducto;

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioAccion, 'CATALOGO', 'Producto', CAST(@IDProducto AS VARCHAR(50)),
                    CASE @Activo WHEN 1 THEN 'ACTIVAR' ELSE 'DESACTIVAR' END,
                    (SELECT @ActivoActual AS Activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                    (SELECT @Activo AS Activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    EXEC dbo.SP_Catalogo_ObtenerProductoAdmin @IDUsuarioAccion = @IDUsuarioAccion, @IDProducto = @IDProducto;
END;
GO

/* === Variantes y precios ================================================================= */

/*
    Agrega combinaciones a un producto existente con las mismas reglas del alta: los mismos
    atributos que sus variantes actuales y ninguna combinación repetida (aunque esté
    desactivada: para volver a venderla se reactiva).
*/
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_AgregarVariantes
    @IDUsuarioAccion INT,
    @IDProducto      INT,
    @Variantes       dbo.TT_Catalogo_Variante READONLY,
    @Atributos       dbo.TT_Catalogo_VarianteAtributo READONLY
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @NumeroError INT, @MensajeError NVARCHAR(400), @IDCategoria INT, @CategoriaBloqueada INT, @IDTipoInicial TINYINT;
    DECLARE @V dbo.TT_Catalogo_Variante;

    IF @IDProducto IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el producto.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    INSERT INTO @V (NumeroLinea, SKU, Precio, ExistenciaInicial)
    SELECT v.NumeroLinea, UPPER(TRIM(v.SKU)), v.Precio, v.ExistenciaInicial FROM @Variantes AS v;

    SELECT @IDTipoInicial = t.IDTipoMovimiento FROM dbo.TipoMovimiento AS t WHERE t.Codigo = 'INVENTARIO_INICIAL' AND t.Signo = 1;
    IF @IDTipoInicial IS NULL
        THROW 59001, N'CONFIGURACION_INCOMPLETA: falta el tipo de movimiento INVENTARIO_INICIAL.', 1;

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        -- Orden de bloqueo: primero la categoría del producto, después el producto.
        SELECT @IDCategoria = p.IDCategoria FROM dbo.Producto AS p WHERE p.IDProducto = @IDProducto;
        IF @IDCategoria IS NULL
            THROW 50105, N'PRODUCTO_NO_ENCONTRADO: el producto no existe.', 1;

        SELECT @CategoriaBloqueada = c.IDCategoria FROM dbo.Categoria AS c WITH (UPDLOCK) WHERE c.IDCategoria = @IDCategoria;
        IF NOT EXISTS (SELECT 1 FROM dbo.Producto AS p WITH (UPDLOCK)
                       WHERE p.IDProducto = @IDProducto AND p.IDCategoria = @CategoriaBloqueada)
            THROW 51203, N'EDICION_CONCURRENTE: otro usuario modificó el registro; vuelva a cargarlo.', 1;

        SELECT @NumeroError = v.NumeroError, @MensajeError = v.MensajeError
        FROM dbo.FU_Catalogo_ValidarVariantes(@IDProducto, @IDCategoria, @V, @Atributos) AS v;
        IF @NumeroError IS NOT NULL
            THROW @NumeroError, @MensajeError, 1;

        -- Variantes (mismo bloque que SP_Catalogo_CrearProducto).
        INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ClaveCombinacion)
        SELECT @IDProducto, v.SKU, v.Precio,
               ISNULL((SELECT STRING_AGG(CAST(a.IDAtributoValor AS VARCHAR(12)), '|') WITHIN GROUP (ORDER BY a.IDAtributo)
                       FROM @Atributos AS a WHERE a.NumeroLinea = v.NumeroLinea), '')
        FROM @V AS v;

        INSERT INTO dbo.VarianteAtributoValor (IDVariante, IDAtributo, IDAtributoValor)
        SELECT ve.IDVariante, a.IDAtributo, a.IDAtributoValor
        FROM @V AS v
        JOIN dbo.Variante AS ve ON ve.SKU = v.SKU
        JOIN @Atributos AS a ON a.NumeroLinea = v.NumeroLinea;

        INSERT INTO dbo.HistorialPrecio (IDVariante, PrecioAnterior, PrecioNuevo, IDUsuario)
        SELECT ve.IDVariante, NULL, v.Precio, @IDUsuarioAccion
        FROM @V AS v JOIN dbo.Variante AS ve ON ve.SKU = v.SKU;

        INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimiento, Signo, Cantidad, SaldoAnterior, SaldoNuevo, IDUsuario)
        SELECT ve.IDVariante, @IDTipoInicial, 1, v.ExistenciaInicial, 0, v.ExistenciaInicial, @IDUsuarioAccion
        FROM @V AS v JOIN dbo.Variante AS ve ON ve.SKU = v.SKU
        WHERE v.ExistenciaInicial > 0;

        UPDATE ve
        SET ExistenciaFisica = m.SaldoNuevo
        FROM dbo.Variante AS ve
        JOIN @V AS v ON v.SKU = ve.SKU
        JOIN dbo.MovimientoInventario AS m ON m.IDVariante = ve.IDVariante;

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorNuevo)
        SELECT @IDUsuarioAccion, 'CATALOGO', 'Variante', CAST(ve.IDVariante AS VARCHAR(50)), 'CREAR',
               (SELECT ve.IDVariante, ve.IDProducto, ve.SKU, ve.Precio, ve.ExistenciaFisica, ve.ClaveCombinacion
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
        FROM @V AS v JOIN dbo.Variante AS ve ON ve.SKU = v.SKU;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() IN (2601, 2627) AND ERROR_MESSAGE() LIKE N'%UQ_Variante_SKU%'
            THROW 51205, N'SKU_REGISTRADO: un SKU está repetido o ya existe.', 1;
        IF ERROR_NUMBER() IN (2601, 2627) AND ERROR_MESSAGE() LIKE N'%UQ_Variante_Producto_Combinacion%'
            THROW 51206, N'COMBINACION_REPETIDA: dos variantes del producto tienen la misma combinación de valores.', 1;
        THROW;
    END CATCH;

    EXEC dbo.SP_Catalogo_ObtenerProductoAdmin @IDUsuarioAccion = @IDUsuarioAccion, @IDProducto = @IDProducto;
END;
GO

/* SKU de una variante. Los pedidos ya guardaron el SKU con el que se vendió y no cambian. */
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ActualizarVariante
    @IDUsuarioAccion INT,
    @IDVariante      INT,
    @SKU             VARCHAR(51),
    @VersionFila     BINARY(8)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDProducto INT, @VersionActual BINARY(8), @Anterior VARCHAR(50);

    IF @IDVariante IS NULL OR @VersionFila IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere la variante y su versión.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    SET @SKU = UPPER(TRIM(ISNULL(@SKU, '')));
    IF LEN(@SKU) NOT BETWEEN 3 AND 50 OR @SKU COLLATE Latin1_General_100_BIN2 LIKE '%[^-A-Z0-9]%'
        THROW 50014, N'SKU_INVALIDO: el SKU admite mayúsculas, dígitos y guiones (de 3 a 50 caracteres).', 1;

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        SELECT @IDProducto = v.IDProducto, @VersionActual = v.VersionFila, @Anterior = v.SKU
        FROM dbo.Variante AS v WITH (UPDLOCK)
        WHERE v.IDVariante = @IDVariante;

        IF @VersionActual IS NULL
            THROW 50106, N'VARIANTE_NO_ENCONTRADA: la variante no existe.', 1;
        IF @VersionActual <> @VersionFila
            THROW 51203, N'EDICION_CONCURRENTE: otro usuario modificó el registro; vuelva a cargarlo.', 1;

        IF @Anterior <> @SKU
        BEGIN
            UPDATE dbo.Variante SET SKU = @SKU, FechaModificacion = SYSUTCDATETIME() WHERE IDVariante = @IDVariante;

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioAccion, 'CATALOGO', 'Variante', CAST(@IDVariante AS VARCHAR(50)), 'MODIFICAR',
                    (SELECT @Anterior AS SKU FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                    (SELECT @SKU AS SKU FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() IN (2601, 2627) AND ERROR_MESSAGE() LIKE N'%UQ_Variante_SKU%'
            THROW 51205, N'SKU_REGISTRADO: un SKU está repetido o ya existe.', 1;
        THROW;
    END CATCH;

    EXEC dbo.SP_Catalogo_ObtenerProductoAdmin @IDUsuarioAccion = @IDUsuarioAccion, @IDProducto = @IDProducto;
END;
GO

/*
    Retira (o devuelve) una variante de la venta. No es para variantes agotadas: esas se siguen
    mostrando como agotadas y vuelven solas cuando entra mercadería. No se puede desactivar la
    última variante activa de un producto activo.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_CambiarEstadoVariante
    @IDUsuarioAccion INT,
    @IDVariante      INT,
    @Activo          BIT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDProducto INT, @ProductoActivo BIT;

    IF @IDVariante IS NULL OR @Activo IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere la variante y el estado.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    SELECT @IDProducto = v.IDProducto FROM dbo.Variante AS v WHERE v.IDVariante = @IDVariante;
    IF @IDProducto IS NULL
        THROW 50106, N'VARIANTE_NO_ENCONTRADA: la variante no existe.', 1;

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        -- Primero el producto: serializa con su activación y con otras desactivaciones de variantes.
        SELECT @ProductoActivo = p.Activo FROM dbo.Producto AS p WITH (UPDLOCK) WHERE p.IDProducto = @IDProducto;

        IF @Activo = 0 AND @ProductoActivo = 1
           AND NOT EXISTS (SELECT 1 FROM dbo.Variante AS v
                           WHERE v.IDProducto = @IDProducto AND v.Activo = 1 AND v.IDVariante <> @IDVariante)
            THROW 51209, N'PRODUCTO_SIN_VARIANTES: es la última variante activa de un producto activo; desactive el producto.', 1;

        UPDATE dbo.Variante
        SET Activo = @Activo, FechaModificacion = SYSUTCDATETIME()
        WHERE IDVariante = @IDVariante AND Activo <> @Activo;

        IF @@ROWCOUNT = 1
            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioAccion, 'CATALOGO', 'Variante', CAST(@IDVariante AS VARCHAR(50)),
                    CASE @Activo WHEN 1 THEN 'ACTIVAR' ELSE 'DESACTIVAR' END,
                    (SELECT CAST(1 - @Activo AS BIT) AS Activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                    (SELECT @Activo AS Activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    EXEC dbo.SP_Catalogo_ObtenerProductoAdmin @IDUsuarioAccion = @IDUsuarioAccion, @IDProducto = @IDProducto;
END;
GO

/*
    Único camino para cambiar un precio: guarda HistorialPrecio y bitácora en la misma
    transacción. Los carritos muestran el precio vigente; los checkouts y pedidos ya
    congelaron el suyo.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_CambiarPrecio
    @IDUsuarioAccion INT,
    @IDVariante      INT,
    @Precio          DECIMAL(12, 2),
    @VersionFila     BINARY(8)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDProducto INT, @VersionActual BINARY(8), @PrecioAnterior DECIMAL(12, 2);

    IF @IDVariante IS NULL OR @VersionFila IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere la variante y su versión.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    IF @Precio IS NULL OR @Precio <= 0
        THROW 50015, N'PRECIO_INVALIDO: el precio debe ser mayor que cero.', 1;

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        SELECT @IDProducto = v.IDProducto, @VersionActual = v.VersionFila, @PrecioAnterior = v.Precio
        FROM dbo.Variante AS v WITH (UPDLOCK)
        WHERE v.IDVariante = @IDVariante;

        IF @VersionActual IS NULL
            THROW 50106, N'VARIANTE_NO_ENCONTRADA: la variante no existe.', 1;
        IF @VersionActual <> @VersionFila
            THROW 51203, N'EDICION_CONCURRENTE: otro usuario modificó el registro; vuelva a cargarlo.', 1;

        IF @PrecioAnterior <> @Precio
        BEGIN
            UPDATE dbo.Variante SET Precio = @Precio, FechaModificacion = SYSUTCDATETIME() WHERE IDVariante = @IDVariante;

            INSERT INTO dbo.HistorialPrecio (IDVariante, PrecioAnterior, PrecioNuevo, IDUsuario)
            VALUES (@IDVariante, @PrecioAnterior, @Precio, @IDUsuarioAccion);

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioAccion, 'CATALOGO', 'Variante', CAST(@IDVariante AS VARCHAR(50)), 'MODIFICAR',
                    (SELECT @PrecioAnterior AS Precio FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                    (SELECT @Precio AS Precio FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    EXEC dbo.SP_Catalogo_ObtenerProductoAdmin @IDUsuarioAccion = @IDUsuarioAccion, @IDProducto = @IDProducto;
END;
GO

/* === Imágenes ============================================================================ */

/*
    Imágenes ya subidas por la API (D9). Una imagen marcada como principal reemplaza a la
    principal actual de su grupo; los grupos sin principal toman la de menor orden.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_AgregarImagenes
    @IDUsuarioAccion INT,
    @IDProducto      INT,
    @Imagenes        dbo.TT_Catalogo_ProductoImagen READONLY
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @NumeroError INT, @MensajeError NVARCHAR(400);
    DECLARE @I dbo.TT_Catalogo_ProductoImagen;

    IF @IDProducto IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el producto.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    INSERT INTO @I (NumeroLinea, RutaImagen, TextoAlternativo, IDAtributoValor, Orden, EsPrincipal)
    SELECT i.NumeroLinea, TRIM(i.RutaImagen), TRIM(i.TextoAlternativo), i.IDAtributoValor, i.Orden, i.EsPrincipal FROM @Imagenes AS i;

    IF NOT EXISTS (SELECT 1 FROM @I)
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere al menos una imagen.', 1;

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        IF NOT EXISTS (SELECT 1 FROM dbo.Producto AS p WITH (UPDLOCK) WHERE p.IDProducto = @IDProducto)
            THROW 50105, N'PRODUCTO_NO_ENCONTRADO: el producto no existe.', 1;

        SELECT @NumeroError = v.NumeroError, @MensajeError = v.MensajeError
        FROM dbo.FU_Catalogo_ValidarImagenes(@IDProducto, @I) AS v;
        IF @NumeroError IS NOT NULL
            THROW @NumeroError, @MensajeError, 1;

        -- La nueva principal reemplaza a la actual de su grupo (primero se quita: índice único filtrado).
        UPDATE pi
        SET EsPrincipal = 0
        FROM dbo.ProductoImagen AS pi
        WHERE pi.IDProducto = @IDProducto AND pi.EsPrincipal = 1
          AND EXISTS (SELECT 1 FROM @I AS i
                      WHERE i.EsPrincipal = 1 AND EXISTS (SELECT i.IDAtributoValor INTERSECT SELECT pi.IDAtributoValor));

        -- Imágenes (mismo bloque que SP_Catalogo_CrearProducto).
        INSERT INTO dbo.ProductoImagen (IDProducto, IDAtributoValor, RutaImagen, TextoAlternativo, Orden, EsPrincipal)
        SELECT @IDProducto, i.IDAtributoValor, i.RutaImagen, i.TextoAlternativo, i.Orden, i.EsPrincipal FROM @I AS i;

        UPDATE pi
        SET EsPrincipal = 1
        FROM dbo.ProductoImagen AS pi
        JOIN (SELECT p2.IDProductoImagen,
                     ROW_NUMBER() OVER (PARTITION BY p2.IDAtributoValor ORDER BY p2.Orden, p2.IDProductoImagen) AS Posicion
              FROM dbo.ProductoImagen AS p2
              WHERE p2.IDProducto = @IDProducto
                AND NOT EXISTS (SELECT 1 FROM dbo.ProductoImagen AS p3
                                WHERE p3.IDProducto = @IDProducto AND p3.EsPrincipal = 1
                                  AND EXISTS (SELECT p3.IDAtributoValor INTERSECT SELECT p2.IDAtributoValor))) AS x
            ON x.IDProductoImagen = pi.IDProductoImagen AND x.Posicion = 1;

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorNuevo)
        SELECT @IDUsuarioAccion, 'CATALOGO', 'ProductoImagen', CAST(pi.IDProductoImagen AS VARCHAR(50)), 'CREAR',
               (SELECT pi.IDProductoImagen, pi.IDProducto, pi.IDAtributoValor, pi.RutaImagen, pi.TextoAlternativo, pi.Orden
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES)
        FROM @I AS i JOIN dbo.ProductoImagen AS pi ON pi.RutaImagen = i.RutaImagen;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() IN (2601, 2627) AND ERROR_MESSAGE() LIKE N'%UQ_ProductoImagen_RutaImagen%'
            THROW 51210, N'IMAGEN_REGISTRADA: una ruta de imagen está repetida o ya existe.', 1;
        THROW;
    END CATCH;

    EXEC dbo.SP_Catalogo_ObtenerProductoAdmin @IDUsuarioAccion = @IDUsuarioAccion, @IDProducto = @IDProducto;
END;
GO

/* Texto alternativo y orden de una imagen. La principal se cambia con SP_Catalogo_EstablecerImagenPrincipal. */
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ActualizarImagen
    @IDUsuarioAccion  INT,
    @IDProductoImagen INT,
    @TextoAlternativo NVARCHAR(201),
    @Orden            INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDProducto INT, @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX);

    IF @IDProductoImagen IS NULL OR @Orden IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere la imagen y su orden.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    SET @TextoAlternativo = TRIM(ISNULL(@TextoAlternativo, N''));
    IF LEN(@TextoAlternativo) NOT BETWEEN 1 AND 200
        THROW 50020, N'IMAGEN_INVALIDA: el texto alternativo es obligatorio (máximo 200 caracteres).', 1;
    IF @Orden NOT BETWEEN 0 AND 255
        THROW 50012, N'ORDEN_INVALIDO: el orden va de 0 a 255.', 1;

    SET @Nuevo = (SELECT @TextoAlternativo AS TextoAlternativo, @Orden AS Orden
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        SELECT @IDProducto = pi.IDProducto,
               @Anterior = (SELECT pi.TextoAlternativo, CAST(pi.Orden AS INT) AS Orden FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
        FROM dbo.ProductoImagen AS pi WITH (UPDLOCK)
        WHERE pi.IDProductoImagen = @IDProductoImagen;

        IF @IDProducto IS NULL
            THROW 50107, N'IMAGEN_NO_ENCONTRADA: la imagen no existe.', 1;

        IF @Anterior COLLATE Latin1_General_100_BIN2 <> @Nuevo
        BEGIN
            UPDATE dbo.ProductoImagen
            SET TextoAlternativo = @TextoAlternativo, Orden = @Orden
            WHERE IDProductoImagen = @IDProductoImagen;

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioAccion, 'CATALOGO', 'ProductoImagen', CAST(@IDProductoImagen AS VARCHAR(50)), 'MODIFICAR',
                    @Anterior, @Nuevo);
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    EXEC dbo.SP_Catalogo_ObtenerProductoAdmin @IDUsuarioAccion = @IDUsuarioAccion, @IDProducto = @IDProducto;
END;
GO

/* La imagen pasa a ser la principal de su grupo (las generales o las de su mismo valor). */
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_EstablecerImagenPrincipal
    @IDUsuarioAccion  INT,
    @IDProductoImagen INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDProducto INT, @IDAtributoValor INT, @EsPrincipal BIT;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    SELECT @IDProducto = pi.IDProducto FROM dbo.ProductoImagen AS pi WHERE pi.IDProductoImagen = @IDProductoImagen;
    IF @IDProducto IS NULL
        THROW 50107, N'IMAGEN_NO_ENCONTRADA: la imagen no existe.', 1;

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        -- Primero el producto: serializa todos los cambios de imágenes del producto.
        IF NOT EXISTS (SELECT 1 FROM dbo.Producto AS p WITH (UPDLOCK) WHERE p.IDProducto = @IDProducto)
            THROW 50105, N'PRODUCTO_NO_ENCONTRADO: el producto no existe.', 1;

        SELECT @IDAtributoValor = pi.IDAtributoValor, @EsPrincipal = pi.EsPrincipal
        FROM dbo.ProductoImagen AS pi
        WHERE pi.IDProductoImagen = @IDProductoImagen;

        IF @EsPrincipal IS NULL
            THROW 50107, N'IMAGEN_NO_ENCONTRADA: la imagen no existe.', 1;

        IF @EsPrincipal = 0
        BEGIN
            UPDATE dbo.ProductoImagen
            SET EsPrincipal = 0
            WHERE IDProducto = @IDProducto AND EsPrincipal = 1
              AND EXISTS (SELECT IDAtributoValor INTERSECT SELECT @IDAtributoValor);

            UPDATE dbo.ProductoImagen SET EsPrincipal = 1 WHERE IDProductoImagen = @IDProductoImagen;

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioAccion, 'CATALOGO', 'ProductoImagen', CAST(@IDProductoImagen AS VARCHAR(50)), 'MODIFICAR',
                    N'{"EsPrincipal":false}', N'{"EsPrincipal":true}');
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    EXEC dbo.SP_Catalogo_ObtenerProductoAdmin @IDUsuarioAccion = @IDUsuarioAccion, @IDProducto = @IDProducto;
END;
GO

/*
    Elimina una imagen (no es historial) y devuelve su ruta para que la API borre el archivo
    después de confirmar. Si era la principal, su grupo promueve la siguiente. La bitácora no
    tiene una acción de eliminar (nada más se elimina): se registra como modificación del
    producto, con la imagen en ValorAnterior.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_EliminarImagen
    @IDUsuarioAccion  INT,
    @IDProductoImagen INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDProducto INT, @ProductoActivo BIT, @RutaImagen NVARCHAR(500), @Anterior NVARCHAR(MAX);

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    SELECT @IDProducto = pi.IDProducto FROM dbo.ProductoImagen AS pi WHERE pi.IDProductoImagen = @IDProductoImagen;
    IF @IDProducto IS NULL
        THROW 50107, N'IMAGEN_NO_ENCONTRADA: la imagen no existe.', 1;

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        SELECT @ProductoActivo = p.Activo FROM dbo.Producto AS p WITH (UPDLOCK) WHERE p.IDProducto = @IDProducto;

        SELECT @RutaImagen = pi.RutaImagen,
               @Anterior = (SELECT pi.IDProductoImagen, pi.IDAtributoValor, pi.RutaImagen, pi.TextoAlternativo,
                                   pi.Orden, pi.EsPrincipal
                            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES)
        FROM dbo.ProductoImagen AS pi
        WHERE pi.IDProductoImagen = @IDProductoImagen;

        IF @RutaImagen IS NULL
            THROW 50107, N'IMAGEN_NO_ENCONTRADA: la imagen no existe.', 1;

        IF @ProductoActivo = 1
           AND NOT EXISTS (SELECT 1 FROM dbo.ProductoImagen AS pi
                           WHERE pi.IDProducto = @IDProducto AND pi.IDProductoImagen <> @IDProductoImagen)
            THROW 51208, N'PRODUCTO_SIN_IMAGEN: es la última imagen de un producto activo; desactive el producto.', 1;

        DELETE FROM dbo.ProductoImagen WHERE IDProductoImagen = @IDProductoImagen;

        UPDATE pi
        SET EsPrincipal = 1
        FROM dbo.ProductoImagen AS pi
        JOIN (SELECT p2.IDProductoImagen,
                     ROW_NUMBER() OVER (PARTITION BY p2.IDAtributoValor ORDER BY p2.Orden, p2.IDProductoImagen) AS Posicion
              FROM dbo.ProductoImagen AS p2
              WHERE p2.IDProducto = @IDProducto
                AND NOT EXISTS (SELECT 1 FROM dbo.ProductoImagen AS p3
                                WHERE p3.IDProducto = @IDProducto AND p3.EsPrincipal = 1
                                  AND EXISTS (SELECT p3.IDAtributoValor INTERSECT SELECT p2.IDAtributoValor))) AS x
            ON x.IDProductoImagen = pi.IDProductoImagen AND x.Posicion = 1;

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorAnterior)
        VALUES (@IDUsuarioAccion, 'CATALOGO', 'Producto', CAST(@IDProducto AS VARCHAR(50)), 'MODIFICAR',
                (SELECT JSON_QUERY(@Anterior) AS ImagenEliminada FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    SELECT @IDProducto AS IDProducto, @RutaImagen AS RutaImagen;
END;
GO
