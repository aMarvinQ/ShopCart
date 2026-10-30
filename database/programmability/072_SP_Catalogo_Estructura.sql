/*
    072_SP_Catalogo_Estructura.sql
    Administración de la estructura del catálogo (RF-02): categorías, atributos, sus valores y
    qué atributos usa cada categoría. Solo administradores.

    - @IDUsuarioAccion: el administrador que ejecuta la acción (del JWT). El SP vuelve a
      validar que sea ADMIN activo (defensa en profundidad).
    - Nada se elimina: categorías, atributos y valores se desactivan. Desactivar una categoría
      oculta sus productos en la tienda sin cambiar el estado de cada producto; al reactivarla
      vuelven tal como estaban.
    - Los cambios quedan en Bitacora (módulo CATALOGO). Repetir los valores actuales no es un
      error ni genera bitácora.
    - Orden de bloqueo del catálogo: Categoria → Producto → Variante. Quien cambia los atributos
      de una categoría y quien crea variantes en ella bloquean primero la categoría, así la
      validación "atributo en uso" no compite con una variante que se está creando.
    - Cada SP devuelve un solo conjunto de resultados; las listas hijas (atributos de una
      categoría, valores de un atributo) van en una columna JSON.
    - Errores: ver docs/errores.md.
*/
:on error exit
SET NOCOUNT ON;
GO

/* === Categorías ========================================================================== */

/*
    Detalle para el formulario de edición: la categoría con VersionFila (control de edición
    concurrente) y sus atributos en JSON, con EnUso (si algún producto de la categoría lo usa,
    no se puede quitar).
*/
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ObtenerCategoria
    @IDUsuarioAccion INT,
    @IDCategoria     INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.Categoria AS c WHERE c.IDCategoria = @IDCategoria)
        THROW 50102, N'CATEGORIA_NO_ENCONTRADA: la categoría no existe.', 1;

    SELECT c.IDCategoria, c.Nombre, c.Slug, c.Descripcion, c.Activo, c.FechaCreacion, c.FechaModificacion,
           c.VersionFila,
           (SELECT COUNT(*) FROM dbo.Producto AS p WHERE p.IDCategoria = c.IDCategoria) AS ProductosTotales,
           (SELECT COUNT(*) FROM dbo.Producto AS p WHERE p.IDCategoria = c.IDCategoria AND p.Activo = 1) AS ProductosActivos,
           ISNULL((SELECT ca.IDAtributo, a.Nombre, ca.Orden, a.Activo,
                          CAST(CASE WHEN EXISTS (
                                   SELECT 1
                                   FROM dbo.Producto AS p
                                   JOIN dbo.Variante AS v ON v.IDProducto = p.IDProducto
                                   JOIN dbo.VarianteAtributoValor AS vav
                                        ON vav.IDVariante = v.IDVariante AND vav.IDAtributo = ca.IDAtributo
                                   WHERE p.IDCategoria = ca.IDCategoria
                               ) THEN 1 ELSE 0 END AS BIT) AS EnUso
                   FROM dbo.CategoriaAtributo AS ca
                   JOIN dbo.Atributo AS a ON a.IDAtributo = ca.IDAtributo
                   WHERE ca.IDCategoria = c.IDCategoria
                   ORDER BY ca.Orden, a.Nombre
                   FOR JSON PATH), N'[]') AS Atributos
    FROM dbo.Categoria AS c
    WHERE c.IDCategoria = @IDCategoria;
END;
GO

/*
    Listado para el panel: todas las categorías (activas e inactivas) con sus atributos en
    JSON. Sin paginación: las categorías son planas y pocas (D5).
*/
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ListarCategorias
    @IDUsuarioAccion INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    SELECT c.IDCategoria, c.Nombre, c.Slug, c.Descripcion, c.Activo, c.FechaCreacion, c.FechaModificacion,
           ISNULL(p.ProductosTotales, 0) AS ProductosTotales, ISNULL(p.ProductosActivos, 0) AS ProductosActivos,
           ISNULL((SELECT ca.IDAtributo, a.Nombre, ca.Orden, a.Activo
                   FROM dbo.CategoriaAtributo AS ca
                   JOIN dbo.Atributo AS a ON a.IDAtributo = ca.IDAtributo
                   WHERE ca.IDCategoria = c.IDCategoria
                   ORDER BY ca.Orden, a.Nombre
                   FOR JSON PATH), N'[]') AS Atributos
    FROM dbo.Categoria AS c
    LEFT JOIN (
        SELECT pr.IDCategoria, COUNT(*) AS ProductosTotales, SUM(CAST(pr.Activo AS INT)) AS ProductosActivos
        FROM dbo.Producto AS pr
        GROUP BY pr.IDCategoria
    ) AS p ON p.IDCategoria = c.IDCategoria
    ORDER BY c.Nombre;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_CrearCategoria
    @IDUsuarioAccion INT,
    @Nombre          NVARCHAR(101),
    @Slug            VARCHAR(121),
    @Descripcion     NVARCHAR(501) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @NumeroError INT, @MensajeError NVARCHAR(400), @IDCategoria INT;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    SELECT @Nombre      = TRIM(ISNULL(@Nombre, N'')),
           @Slug        = LOWER(TRIM(ISNULL(@Slug, ''))),
           @Descripcion = NULLIF(TRIM(@Descripcion), N'');

    SELECT @NumeroError = v.NumeroError, @MensajeError = v.MensajeError
    FROM dbo.FU_Catalogo_ValidarDatos(@Nombre, 100, @Slug, 120, @Descripcion, 500, NULL) AS v;
    IF @NumeroError IS NOT NULL
        THROW @NumeroError, @MensajeError, 1;

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        INSERT INTO dbo.Categoria (Nombre, Slug, Descripcion)
        VALUES (@Nombre, @Slug, @Descripcion);
        SET @IDCategoria = SCOPE_IDENTITY();

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorNuevo)
        SELECT @IDUsuarioAccion, 'CATALOGO', 'Categoria', CAST(@IDCategoria AS VARCHAR(50)), 'CREAR',
               (SELECT c.IDCategoria, c.Nombre, c.Slug, c.Descripcion, c.Activo
                FROM dbo.Categoria AS c
                WHERE c.IDCategoria = @IDCategoria
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() IN (2601, 2627) AND ERROR_MESSAGE() LIKE N'%UQ_Categoria_Nombre%'
            THROW 51201, N'NOMBRE_REGISTRADO: ya existe una categoría con ese nombre.', 1;
        IF ERROR_NUMBER() IN (2601, 2627) AND ERROR_MESSAGE() LIKE N'%UQ_Categoria_Slug%'
            THROW 51202, N'SLUG_REGISTRADO: ya existe una categoría con ese slug.', 1;
        THROW;
    END CATCH;

    EXEC dbo.SP_Catalogo_ObtenerCategoria @IDUsuarioAccion = @IDUsuarioAccion, @IDCategoria = @IDCategoria;
END;
GO

/*
    Control de edición concurrente: @VersionFila es la que recibió el formulario. Si otro
    administrador guardó cambios después, se rechaza en lugar de sobrescribirlos.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ActualizarCategoria
    @IDUsuarioAccion INT,
    @IDCategoria     INT,
    @Nombre          NVARCHAR(101),
    @Slug            VARCHAR(121),
    @Descripcion     NVARCHAR(501) = NULL,
    @VersionFila     BINARY(8)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @NumeroError INT, @MensajeError NVARCHAR(400), @VersionActual BINARY(8),
            @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX);

    IF @IDCategoria IS NULL OR @VersionFila IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere la categoría y su versión.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    SELECT @Nombre      = TRIM(ISNULL(@Nombre, N'')),
           @Slug        = LOWER(TRIM(ISNULL(@Slug, ''))),
           @Descripcion = NULLIF(TRIM(@Descripcion), N'');

    SELECT @NumeroError = v.NumeroError, @MensajeError = v.MensajeError
    FROM dbo.FU_Catalogo_ValidarDatos(@Nombre, 100, @Slug, 120, @Descripcion, 500, NULL) AS v;
    IF @NumeroError IS NOT NULL
        THROW @NumeroError, @MensajeError, 1;

    SET @Nuevo = (SELECT @Nombre AS Nombre, @Slug AS Slug, @Descripcion AS Descripcion
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        SELECT @VersionActual = c.VersionFila
        FROM dbo.Categoria AS c WITH (UPDLOCK)
        WHERE c.IDCategoria = @IDCategoria;

        IF @VersionActual IS NULL
            THROW 50102, N'CATEGORIA_NO_ENCONTRADA: la categoría no existe.', 1;
        IF @VersionActual <> @VersionFila
            THROW 51203, N'EDICION_CONCURRENTE: otro usuario modificó el registro; vuelva a cargarlo.', 1;

        SET @Anterior = (SELECT c.Nombre, c.Slug, c.Descripcion
                         FROM dbo.Categoria AS c
                         WHERE c.IDCategoria = @IDCategoria
                         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        -- Comparación binaria: un cambio solo de mayúsculas o tildes también es un cambio.
        IF @Anterior COLLATE Latin1_General_100_BIN2 <> @Nuevo
        BEGIN
            UPDATE dbo.Categoria
            SET Nombre = @Nombre, Slug = @Slug, Descripcion = @Descripcion, FechaModificacion = SYSUTCDATETIME()
            WHERE IDCategoria = @IDCategoria;

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioAccion, 'CATALOGO', 'Categoria', CAST(@IDCategoria AS VARCHAR(50)), 'MODIFICAR', @Anterior, @Nuevo);
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() IN (2601, 2627) AND ERROR_MESSAGE() LIKE N'%UQ_Categoria_Nombre%'
            THROW 51201, N'NOMBRE_REGISTRADO: ya existe una categoría con ese nombre.', 1;
        IF ERROR_NUMBER() IN (2601, 2627) AND ERROR_MESSAGE() LIKE N'%UQ_Categoria_Slug%'
            THROW 51202, N'SLUG_REGISTRADO: ya existe una categoría con ese slug.', 1;
        THROW;
    END CATCH;

    EXEC dbo.SP_Catalogo_ObtenerCategoria @IDUsuarioAccion = @IDUsuarioAccion, @IDCategoria = @IDCategoria;
END;
GO

/*
    Desactivar una categoría con productos activos está permitido: la tienda exige que estén
    activos el producto y su categoría, así que sus productos dejan de mostrarse.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_CambiarEstadoCategoria
    @IDUsuarioAccion INT,
    @IDCategoria     INT,
    @Activo          BIT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @IDCategoria IS NULL OR @Activo IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere la categoría y el estado.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.Categoria AS c WHERE c.IDCategoria = @IDCategoria)
        THROW 50102, N'CATEGORIA_NO_ENCONTRADA: la categoría no existe.', 1;

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        UPDATE dbo.Categoria
        SET Activo = @Activo, FechaModificacion = SYSUTCDATETIME()
        WHERE IDCategoria = @IDCategoria AND Activo <> @Activo;

        IF @@ROWCOUNT = 1
            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioAccion, 'CATALOGO', 'Categoria', CAST(@IDCategoria AS VARCHAR(50)),
                    CASE @Activo WHEN 1 THEN 'ACTIVAR' ELSE 'DESACTIVAR' END,
                    (SELECT CAST(1 - @Activo AS BIT) AS Activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                    (SELECT @Activo AS Activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    EXEC dbo.SP_Catalogo_ObtenerCategoria @IDUsuarioAccion = @IDUsuarioAccion, @IDCategoria = @IDCategoria;
END;
GO

/*
    Recibe la lista completa de atributos de la categoría con su orden: agrega los nuevos,
    actualiza el orden y quita los que no vienen (una lista vacía los quita todos).
    - Un atributo nuevo en la categoría debe existir y estar activo; uno que ya estaba asignado
      puede seguir aunque se haya desactivado.
    - No se quita un atributo que usa alguna variante de la categoría (activa o no): esas
      variantes quedarían con un atributo que su categoría no admite.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_AsignarAtributosCategoria
    @IDUsuarioAccion INT,
    @IDCategoria     INT,
    @Atributos       dbo.TT_Catalogo_CategoriaAtributo READONLY
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX);

    IF @IDCategoria IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere la categoría.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    SET @Nuevo = (SELECT (SELECT t.IDAtributo, t.Orden FROM @Atributos AS t ORDER BY t.Orden, t.IDAtributo FOR JSON PATH) AS Atributos
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        -- Bloquea la categoría: serializa con la creación de variantes en ella.
        IF NOT EXISTS (SELECT 1 FROM dbo.Categoria AS c WITH (UPDLOCK) WHERE c.IDCategoria = @IDCategoria)
            THROW 50102, N'CATEGORIA_NO_ENCONTRADA: la categoría no existe.', 1;

        IF EXISTS (
            SELECT 1
            FROM @Atributos AS t
            LEFT JOIN dbo.Atributo AS a ON a.IDAtributo = t.IDAtributo
            WHERE a.IDAtributo IS NULL
               OR (a.Activo = 0 AND NOT EXISTS (SELECT 1 FROM dbo.CategoriaAtributo AS ca
                                                WHERE ca.IDCategoria = @IDCategoria AND ca.IDAtributo = t.IDAtributo))
        )
            THROW 50103, N'ATRIBUTO_NO_ENCONTRADO: un atributo no existe o está desactivado.', 1;

        IF EXISTS (
            SELECT 1
            FROM dbo.CategoriaAtributo AS ca
            WHERE ca.IDCategoria = @IDCategoria
              AND NOT EXISTS (SELECT 1 FROM @Atributos AS t WHERE t.IDAtributo = ca.IDAtributo)
              AND EXISTS (SELECT 1
                          FROM dbo.Producto AS p
                          JOIN dbo.Variante AS v ON v.IDProducto = p.IDProducto
                          JOIN dbo.VarianteAtributoValor AS vav ON vav.IDVariante = v.IDVariante AND vav.IDAtributo = ca.IDAtributo
                          WHERE p.IDCategoria = @IDCategoria)
        )
            THROW 51204, N'ATRIBUTO_EN_USO: un producto de la categoría usa el atributo que se intenta quitar.', 1;

        SET @Anterior = (SELECT (SELECT ca.IDAtributo, ca.Orden FROM dbo.CategoriaAtributo AS ca
                                 WHERE ca.IDCategoria = @IDCategoria
                                 ORDER BY ca.Orden, ca.IDAtributo FOR JSON PATH) AS Atributos
                         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

        IF @Anterior <> @Nuevo
        BEGIN
            DELETE ca
            FROM dbo.CategoriaAtributo AS ca
            WHERE ca.IDCategoria = @IDCategoria
              AND NOT EXISTS (SELECT 1 FROM @Atributos AS t WHERE t.IDAtributo = ca.IDAtributo);

            UPDATE ca
            SET Orden = t.Orden
            FROM dbo.CategoriaAtributo AS ca
            JOIN @Atributos AS t ON t.IDAtributo = ca.IDAtributo
            WHERE ca.IDCategoria = @IDCategoria AND ca.Orden <> t.Orden;

            INSERT INTO dbo.CategoriaAtributo (IDCategoria, IDAtributo, Orden)
            SELECT @IDCategoria, t.IDAtributo, t.Orden
            FROM @Atributos AS t
            WHERE NOT EXISTS (SELECT 1 FROM dbo.CategoriaAtributo AS ca
                              WHERE ca.IDCategoria = @IDCategoria AND ca.IDAtributo = t.IDAtributo);

            UPDATE dbo.Categoria SET FechaModificacion = SYSUTCDATETIME() WHERE IDCategoria = @IDCategoria;

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioAccion, 'CATALOGO', 'Categoria', CAST(@IDCategoria AS VARCHAR(50)), 'MODIFICAR', @Anterior, @Nuevo);
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    EXEC dbo.SP_Catalogo_ObtenerCategoria @IDUsuarioAccion = @IDUsuarioAccion, @IDCategoria = @IDCategoria;
END;
GO

/* === Atributos y valores ================================================================= */

/*
    Detalle de un atributo: en cuántas categorías está asignado y sus valores en JSON, en el
    orden de los selectores, con EnUso (lo usa alguna variante o imagen).
*/
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ObtenerAtributo
    @IDUsuarioAccion INT,
    @IDAtributo      INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.Atributo AS a WHERE a.IDAtributo = @IDAtributo)
        THROW 50103, N'ATRIBUTO_NO_ENCONTRADO: el atributo no existe.', 1;

    SELECT a.IDAtributo, a.Nombre, a.Activo, a.FechaCreacion,
           (SELECT COUNT(*) FROM dbo.CategoriaAtributo AS ca WHERE ca.IDAtributo = a.IDAtributo) AS CategoriasAsignadas,
           ISNULL((SELECT av.IDAtributoValor, av.Valor, av.Orden, av.CodigoHex, av.Activo,
                          CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.VarianteAtributoValor AS vav
                                                 WHERE vav.IDAtributoValor = av.IDAtributoValor)
                                      OR EXISTS (SELECT 1 FROM dbo.ProductoImagen AS pi
                                                 WHERE pi.IDAtributoValor = av.IDAtributoValor)
                                    THEN 1 ELSE 0 END AS BIT) AS EnUso
                   FROM dbo.AtributoValor AS av
                   WHERE av.IDAtributo = a.IDAtributo
                   ORDER BY av.Orden, av.Valor
                   FOR JSON PATH, INCLUDE_NULL_VALUES), N'[]') AS Valores
    FROM dbo.Atributo AS a
    WHERE a.IDAtributo = @IDAtributo;
END;
GO

/*
    Listado para el panel y el formulario de productos: todos los atributos con sus valores en
    JSON. El formulario filtra por los atributos de la categoría del producto.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ListarAtributos
    @IDUsuarioAccion INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    SELECT a.IDAtributo, a.Nombre, a.Activo, a.FechaCreacion,
           ISNULL((SELECT av.IDAtributoValor, av.Valor, av.Orden, av.CodigoHex, av.Activo
                   FROM dbo.AtributoValor AS av
                   WHERE av.IDAtributo = a.IDAtributo
                   ORDER BY av.Orden, av.Valor
                   FOR JSON PATH, INCLUDE_NULL_VALUES), N'[]') AS Valores
    FROM dbo.Atributo AS a
    ORDER BY a.Nombre;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_CrearAtributo
    @IDUsuarioAccion INT,
    @Nombre          NVARCHAR(51)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @NumeroError INT, @MensajeError NVARCHAR(400), @IDAtributo INT;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    SET @Nombre = TRIM(ISNULL(@Nombre, N''));

    SELECT @NumeroError = v.NumeroError, @MensajeError = v.MensajeError
    FROM dbo.FU_Catalogo_ValidarDatos(@Nombre, 50, NULL, NULL, NULL, NULL, NULL) AS v;
    IF @NumeroError IS NOT NULL
        THROW @NumeroError, @MensajeError, 1;

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        INSERT INTO dbo.Atributo (Nombre) VALUES (@Nombre);
        SET @IDAtributo = SCOPE_IDENTITY();

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorNuevo)
        VALUES (@IDUsuarioAccion, 'CATALOGO', 'Atributo', CAST(@IDAtributo AS VARCHAR(50)), 'CREAR',
                (SELECT @IDAtributo AS IDAtributo, @Nombre AS Nombre FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() IN (2601, 2627) AND ERROR_MESSAGE() LIKE N'%UQ_Atributo_Nombre%'
            THROW 51201, N'NOMBRE_REGISTRADO: ya existe un atributo con ese nombre.', 1;
        THROW;
    END CATCH;

    EXEC dbo.SP_Catalogo_ObtenerAtributo @IDUsuarioAccion = @IDUsuarioAccion, @IDAtributo = @IDAtributo;
END;
GO

/* Atributo no tiene VersionFila: es un solo campo y el último cambio prevalece. */
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ActualizarAtributo
    @IDUsuarioAccion INT,
    @IDAtributo      INT,
    @Nombre          NVARCHAR(51)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @NumeroError INT, @MensajeError NVARCHAR(400), @Anterior NVARCHAR(50);

    IF @IDAtributo IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el atributo.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    SET @Nombre = TRIM(ISNULL(@Nombre, N''));

    SELECT @NumeroError = v.NumeroError, @MensajeError = v.MensajeError
    FROM dbo.FU_Catalogo_ValidarDatos(@Nombre, 50, NULL, NULL, NULL, NULL, NULL) AS v;
    IF @NumeroError IS NOT NULL
        THROW @NumeroError, @MensajeError, 1;

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        SELECT @Anterior = a.Nombre FROM dbo.Atributo AS a WITH (UPDLOCK) WHERE a.IDAtributo = @IDAtributo;
        IF @Anterior IS NULL
            THROW 50103, N'ATRIBUTO_NO_ENCONTRADO: el atributo no existe.', 1;

        IF @Anterior COLLATE Latin1_General_100_BIN2 <> @Nombre
        BEGIN
            UPDATE dbo.Atributo SET Nombre = @Nombre WHERE IDAtributo = @IDAtributo;

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioAccion, 'CATALOGO', 'Atributo', CAST(@IDAtributo AS VARCHAR(50)), 'MODIFICAR',
                    (SELECT @Anterior AS Nombre FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                    (SELECT @Nombre AS Nombre FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() IN (2601, 2627) AND ERROR_MESSAGE() LIKE N'%UQ_Atributo_Nombre%'
            THROW 51201, N'NOMBRE_REGISTRADO: ya existe un atributo con ese nombre.', 1;
        THROW;
    END CATCH;

    EXEC dbo.SP_Catalogo_ObtenerAtributo @IDUsuarioAccion = @IDUsuarioAccion, @IDAtributo = @IDAtributo;
END;
GO

/*
    Un atributo desactivado no se puede asignar a nuevas categorías ni recibir valores nuevos;
    las categorías y variantes que ya lo usan lo conservan.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_CambiarEstadoAtributo
    @IDUsuarioAccion INT,
    @IDAtributo      INT,
    @Activo          BIT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @IDAtributo IS NULL OR @Activo IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el atributo y el estado.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.Atributo AS a WHERE a.IDAtributo = @IDAtributo)
        THROW 50103, N'ATRIBUTO_NO_ENCONTRADO: el atributo no existe.', 1;

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        UPDATE dbo.Atributo SET Activo = @Activo WHERE IDAtributo = @IDAtributo AND Activo <> @Activo;

        IF @@ROWCOUNT = 1
            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioAccion, 'CATALOGO', 'Atributo', CAST(@IDAtributo AS VARCHAR(50)),
                    CASE @Activo WHEN 1 THEN 'ACTIVAR' ELSE 'DESACTIVAR' END,
                    (SELECT CAST(1 - @Activo AS BIT) AS Activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                    (SELECT @Activo AS Activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    EXEC dbo.SP_Catalogo_ObtenerAtributo @IDUsuarioAccion = @IDUsuarioAccion, @IDAtributo = @IDAtributo;
END;
GO

/*
    Valores compartidos entre productos (un solo "M", un solo "Azul") — D16. Devuelve el valor
    creado: el formulario de productos lo usa de inmediato con su IDAtributoValor.
    @Orden NULL = al final de los valores actuales. El atributo se bloquea para que dos altas
    simultáneas no calculen el mismo orden.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_CrearAtributoValor
    @IDUsuarioAccion INT,
    @IDAtributo      INT,
    @Valor           NVARCHAR(51),
    @CodigoHex       VARCHAR(8) = NULL,
    @Orden           INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @NumeroError INT, @MensajeError NVARCHAR(400), @IDAtributoValor INT;

    IF @IDAtributo IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el atributo.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    SELECT @Valor     = TRIM(ISNULL(@Valor, N'')),
           @CodigoHex = NULLIF(UPPER(TRIM(@CodigoHex)), '');

    SELECT @NumeroError = v.NumeroError, @MensajeError = v.MensajeError
    FROM dbo.FU_Catalogo_ValidarDatos(@Valor, 50, NULL, NULL, NULL, NULL, @CodigoHex) AS v;
    IF @NumeroError IS NOT NULL
        THROW @NumeroError, @MensajeError, 1;

    IF @Orden NOT BETWEEN 0 AND 255
        THROW 50012, N'ORDEN_INVALIDO: el orden va de 0 a 255.', 1;

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        IF NOT EXISTS (SELECT 1 FROM dbo.Atributo AS a WITH (UPDLOCK) WHERE a.IDAtributo = @IDAtributo AND a.Activo = 1)
            THROW 50103, N'ATRIBUTO_NO_ENCONTRADO: el atributo no existe o está desactivado.', 1;

        IF @Orden IS NULL
            SELECT @Orden = CASE WHEN MAX(av.Orden) IS NULL THEN 1
                                 WHEN MAX(av.Orden) >= 255 THEN 255
                                 ELSE MAX(av.Orden) + 1 END
            FROM dbo.AtributoValor AS av
            WHERE av.IDAtributo = @IDAtributo;

        INSERT INTO dbo.AtributoValor (IDAtributo, Valor, Orden, CodigoHex)
        VALUES (@IDAtributo, @Valor, @Orden, @CodigoHex);
        SET @IDAtributoValor = SCOPE_IDENTITY();

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorNuevo)
        VALUES (@IDUsuarioAccion, 'CATALOGO', 'AtributoValor', CAST(@IDAtributoValor AS VARCHAR(50)), 'CREAR',
                (SELECT @IDAtributoValor AS IDAtributoValor, @IDAtributo AS IDAtributo, @Valor AS Valor,
                        @Orden AS Orden, @CodigoHex AS CodigoHex
                 FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() IN (2601, 2627) AND ERROR_MESSAGE() LIKE N'%UQ_AtributoValor_Atributo_Valor%'
            THROW 51201, N'NOMBRE_REGISTRADO: el atributo ya tiene ese valor.', 1;
        THROW;
    END CATCH;

    SELECT av.IDAtributoValor, av.IDAtributo, av.Valor, av.Orden, av.CodigoHex, av.Activo
    FROM dbo.AtributoValor AS av
    WHERE av.IDAtributoValor = @IDAtributoValor;
END;
GO

/*
    Renombrar un valor en uso cambia lo que muestran todos los productos que lo usan (es un
    catálogo compartido); los pedidos ya guardaron su descripción y no cambian.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ActualizarAtributoValor
    @IDUsuarioAccion INT,
    @IDAtributoValor INT,
    @Valor           NVARCHAR(51),
    @CodigoHex       VARCHAR(8) = NULL,
    @Orden           INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @NumeroError INT, @MensajeError NVARCHAR(400), @Anterior NVARCHAR(MAX), @Nuevo NVARCHAR(MAX);

    IF @IDAtributoValor IS NULL OR @Orden IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el valor y su orden.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    SELECT @Valor     = TRIM(ISNULL(@Valor, N'')),
           @CodigoHex = NULLIF(UPPER(TRIM(@CodigoHex)), '');

    SELECT @NumeroError = v.NumeroError, @MensajeError = v.MensajeError
    FROM dbo.FU_Catalogo_ValidarDatos(@Valor, 50, NULL, NULL, NULL, NULL, @CodigoHex) AS v;
    IF @NumeroError IS NOT NULL
        THROW @NumeroError, @MensajeError, 1;

    IF @Orden NOT BETWEEN 0 AND 255
        THROW 50012, N'ORDEN_INVALIDO: el orden va de 0 a 255.', 1;

    SET @Nuevo = (SELECT @Valor AS Valor, @Orden AS Orden, @CodigoHex AS CodigoHex
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        SET @Anterior = (SELECT av.Valor, CAST(av.Orden AS INT) AS Orden, CAST(av.CodigoHex AS VARCHAR(8)) AS CodigoHex
                         FROM dbo.AtributoValor AS av WITH (UPDLOCK)
                         WHERE av.IDAtributoValor = @IDAtributoValor
                         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);
        IF @Anterior IS NULL
            THROW 50104, N'VALOR_NO_ENCONTRADO: el valor de atributo no existe.', 1;

        IF @Anterior COLLATE Latin1_General_100_BIN2 <> @Nuevo
        BEGIN
            UPDATE dbo.AtributoValor
            SET Valor = @Valor, Orden = @Orden, CodigoHex = @CodigoHex
            WHERE IDAtributoValor = @IDAtributoValor;

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioAccion, 'CATALOGO', 'AtributoValor', CAST(@IDAtributoValor AS VARCHAR(50)), 'MODIFICAR',
                    @Anterior, @Nuevo);
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() IN (2601, 2627) AND ERROR_MESSAGE() LIKE N'%UQ_AtributoValor_Atributo_Valor%'
            THROW 51201, N'NOMBRE_REGISTRADO: el atributo ya tiene ese valor.', 1;
        THROW;
    END CATCH;

    SELECT av.IDAtributoValor, av.IDAtributo, av.Valor, av.Orden, av.CodigoHex, av.Activo
    FROM dbo.AtributoValor AS av
    WHERE av.IDAtributoValor = @IDAtributoValor;
END;
GO

/*
    Un valor en uso no se elimina: se desactiva. Desactivado ya no se ofrece para variantes
    nuevas; las variantes que lo tienen lo conservan.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_CambiarEstadoAtributoValor
    @IDUsuarioAccion INT,
    @IDAtributoValor INT,
    @Activo          BIT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @IDAtributoValor IS NULL OR @Activo IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el valor y el estado.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar el catálogo.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.AtributoValor AS av WHERE av.IDAtributoValor = @IDAtributoValor)
        THROW 50104, N'VALOR_NO_ENCONTRADO: el valor de atributo no existe.', 1;

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        UPDATE dbo.AtributoValor SET Activo = @Activo WHERE IDAtributoValor = @IDAtributoValor AND Activo <> @Activo;

        IF @@ROWCOUNT = 1
            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioAccion, 'CATALOGO', 'AtributoValor', CAST(@IDAtributoValor AS VARCHAR(50)),
                    CASE @Activo WHEN 1 THEN 'ACTIVAR' ELSE 'DESACTIVAR' END,
                    (SELECT CAST(1 - @Activo AS BIT) AS Activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                    (SELECT @Activo AS Activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    SELECT av.IDAtributoValor, av.IDAtributo, av.Valor, av.Orden, av.CodigoHex, av.Activo
    FROM dbo.AtributoValor AS av
    WHERE av.IDAtributoValor = @IDAtributoValor;
END;
GO
