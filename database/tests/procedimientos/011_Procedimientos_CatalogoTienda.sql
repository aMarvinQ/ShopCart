/*
    011_Procedimientos_CatalogoTienda.sql
    Se ejecuta conectado como shopcart_migrator (deploy.ps1 -Probar). Mismo esquema que 009 y
    010: el migrador prepara los datos y ejecuta cada SP haciéndose pasar por un miembro de
    RolApi. Las búsquedas filtran por el texto "Prueba" para no depender de la semilla.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT OFF;
GO

-- Permite ejecutar el script varias veces en la misma conexión (p. ej. en SSMS).
DROP TABLE IF EXISTS #Contexto, #Base, #Tarjeta, #Detalle, #Categorias;
DROP PROCEDURE IF EXISTS #Verificar;
DROP PROCEDURE IF EXISTS #Preparar;
DROP PROCEDURE IF EXISTS #EsperarError;
DROP PROCEDURE IF EXISTS #Buscar;
GO

CREATE TABLE #Contexto (UsuarioApi SYSNAME NOT NULL);
CREATE TABLE #Base (IDRopa INT, IDHogar INT, IDOculta INT, IDPlayera INT);

-- Resultados de los SPs (misma forma que devuelven).
CREATE TABLE #Tarjeta (IDProducto INT, Nombre NVARCHAR(200), Slug VARCHAR(220), Categoria NVARCHAR(100), SlugCategoria VARCHAR(120),
                       Precio DECIMAL(12, 2), Disponible BIT, ImagenPrincipal NVARCHAR(500), TextoAlternativo NVARCHAR(200));
CREATE TABLE #Detalle (IDProducto INT, Nombre NVARCHAR(200), Slug VARCHAR(220), Descripcion NVARCHAR(4000), IDCategoria INT,
                       Categoria NVARCHAR(100), SlugCategoria VARCHAR(120), Variantes NVARCHAR(MAX), Imagenes NVARCHAR(MAX));
CREATE TABLE #Categorias (IDCategoria INT, Nombre NVARCHAR(100), Slug VARCHAR(120), Descripcion NVARCHAR(500), ProductosVisibles INT);
GO

/*
    Compara como texto; muestra esperado y obtenido cuando no coinciden. Las fallas se cuentan
    en SESSION_CONTEXT: el ROLLBACK de cada caso no las borra.
*/
CREATE PROCEDURE #Verificar
    @Descripcion NVARCHAR(300),
    @Esperado    NVARCHAR(400),
    @Obtenido    NVARCHAR(400)
AS
BEGIN
    SET NOCOUNT ON;
    IF ISNULL(@Esperado, N'(NULL)') COLLATE Latin1_General_100_BIN2 = ISNULL(@Obtenido, N'(NULL)')
        PRINT N'OK     ' + @Descripcion + N': ' + ISNULL(@Obtenido, N'(NULL)');
    ELSE
    BEGIN
        DECLARE @Fallas INT = ISNULL(CAST(SESSION_CONTEXT(N'PruebasFallidas') AS INT), 0) + 1;
        EXEC sys.sp_set_session_context @key = N'PruebasFallidas', @value = @Fallas;
        PRINT N'FALLA  ' + @Descripcion + N': esperado ' + ISNULL(@Esperado, N'(NULL)') + N', obtenido ' + ISNULL(@Obtenido, N'(NULL)');
    END;
END;
GO

/*
    Catálogo de la tienda:
    - Ropa (Color y luego Talla): Playera activa con Rojo/S agotada (100), Rojo/M (120, 5 en
      existencia), Azul/S (90, 3) y Azul/M desactivada; imágenes general, roja y azul.
      Selección inicial = Rojo/M (la primera disponible): precio mostrado 120 e imagen roja.
      Gorra inactiva (no se muestra).
    - Hogar: Taza Prueba activa, agotada (50), con descripción "porcelana 100% blanca".
    - Oculta (categoría inactiva): Chaqueta activa (no se muestra).
    - Vacía (activa, sin productos): no aparece en el menú.
*/
CREATE PROCEDURE #Preparar
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @IDRopa INT, @IDHogar INT, @IDOculta INT, @IDTalla INT, @IDColor INT, @IDS INT, @IDM INT, @IDRojo INT, @IDAzul INT,
            @IDPlayera INT, @IDGorra INT, @IDTaza INT, @IDChaqueta INT;
    DECLARE @Variantes TABLE (SKU VARCHAR(50), Color INT, Talla INT, Precio DECIMAL(12, 2), Existencia INT, Activo BIT);

    INSERT INTO dbo.Atributo (Nombre) VALUES (N'Talla Prueba');
    SET @IDTalla = SCOPE_IDENTITY();
    INSERT INTO dbo.Atributo (Nombre) VALUES (N'Color Prueba');
    SET @IDColor = SCOPE_IDENTITY();
    INSERT INTO dbo.AtributoValor (IDAtributo, Valor, Orden) VALUES (@IDTalla, N'S', 1);
    SET @IDS = SCOPE_IDENTITY();
    INSERT INTO dbo.AtributoValor (IDAtributo, Valor, Orden) VALUES (@IDTalla, N'M', 2);
    SET @IDM = SCOPE_IDENTITY();
    INSERT INTO dbo.AtributoValor (IDAtributo, Valor, Orden, CodigoHex) VALUES (@IDColor, N'Rojo', 1, '#FF0000');
    SET @IDRojo = SCOPE_IDENTITY();
    INSERT INTO dbo.AtributoValor (IDAtributo, Valor, Orden, CodigoHex) VALUES (@IDColor, N'Azul', 2, '#0000FF');
    SET @IDAzul = SCOPE_IDENTITY();

    INSERT INTO dbo.Categoria (Nombre, Slug) VALUES (N'Ropa Prueba', 'ropa-prueba');
    SET @IDRopa = SCOPE_IDENTITY();
    INSERT INTO dbo.Categoria (Nombre, Slug) VALUES (N'Hogar Prueba', 'hogar-prueba');
    SET @IDHogar = SCOPE_IDENTITY();
    INSERT INTO dbo.Categoria (Nombre, Slug, Activo) VALUES (N'Oculta Prueba', 'oculta-prueba', 0);
    SET @IDOculta = SCOPE_IDENTITY();
    INSERT INTO dbo.Categoria (Nombre, Slug) VALUES (N'Vacía Prueba', 'vacia-prueba');
    INSERT INTO dbo.CategoriaAtributo (IDCategoria, IDAtributo, Orden) VALUES (@IDRopa, @IDColor, 1), (@IDRopa, @IDTalla, 2);

    INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug, Descripcion, Activo, FechaCreacion)
    VALUES (@IDRopa, N'Playera Prueba', 'playera-prueba', N'Algodón', 1, DATEADD(DAY, -2, SYSUTCDATETIME()));
    SET @IDPlayera = SCOPE_IDENTITY();
    INSERT INTO @Variantes VALUES ('PRUEBA-ROJO-S', @IDRojo, @IDS, 100.00, 0, 1), ('PRUEBA-ROJO-M', @IDRojo, @IDM, 120.00, 5, 1),
                                  ('PRUEBA-AZUL-S', @IDAzul, @IDS, 90.00, 3, 1), ('PRUEBA-AZUL-M', @IDAzul, @IDM, 95.00, 8, 0);
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica, ClaveCombinacion, Activo)
    SELECT @IDPlayera, v.SKU, v.Precio, v.Existencia, CONCAT(v.Talla, '|', v.Color), v.Activo FROM @Variantes AS v;
    INSERT INTO dbo.VarianteAtributoValor (IDVariante, IDAtributo, IDAtributoValor)
    SELECT va.IDVariante, x.IDAtributo, x.IDAtributoValor
    FROM @Variantes AS v
    JOIN dbo.Variante AS va ON va.SKU = v.SKU
    CROSS APPLY (VALUES (@IDTalla, v.Talla), (@IDColor, v.Color)) AS x (IDAtributo, IDAtributoValor);
    INSERT INTO dbo.ProductoImagen (IDProducto, IDAtributoValor, RutaImagen, TextoAlternativo, Orden, EsPrincipal)
    VALUES (@IDPlayera, NULL, N'/uploads/productos/prueba-general.webp', N'Playera', 1, 1),
           (@IDPlayera, @IDAzul, N'/uploads/productos/prueba-azul.webp', N'Playera azul', 1, 1),
           (@IDPlayera, @IDRojo, N'/uploads/productos/prueba-rojo-2.webp', N'Playera roja espalda', 2, 0),
           (@IDPlayera, @IDRojo, N'/uploads/productos/prueba-rojo.webp', N'Playera roja', 1, 1);

    INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug, Activo) VALUES (@IDRopa, N'Gorra Prueba', 'gorra-prueba', 0);
    SET @IDGorra = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica) VALUES (@IDGorra, 'PRUEBA-GORRA', 60.00, 10);

    INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug, Descripcion, Activo, FechaCreacion)
    VALUES (@IDHogar, N'Taza Prueba', 'taza-prueba', N'Porcelana 100% blanca', 1, DATEADD(DAY, -1, SYSUTCDATETIME()));
    SET @IDTaza = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica) VALUES (@IDTaza, 'PRUEBA-TAZA', 50.00, 0);
    INSERT INTO dbo.ProductoImagen (IDProducto, RutaImagen, TextoAlternativo, Orden, EsPrincipal)
    VALUES (@IDTaza, N'/uploads/productos/prueba-taza.webp', N'Taza', 1, 1);

    INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug, Activo) VALUES (@IDOculta, N'Chaqueta Prueba', 'chaqueta-prueba', 1);
    SET @IDChaqueta = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica) VALUES (@IDChaqueta, 'PRUEBA-CHAQUETA', 300.00, 2);

    DELETE FROM #Base;
    INSERT INTO #Base VALUES (@IDRopa, @IDHogar, @IDOculta, @IDPlayera);
END;
GO

/* Busca como la API y devuelve "nombre:precio:disponible" de cada tarjeta, en orden, y el total. */
CREATE PROCEDURE #Buscar
    @Texto           NVARCHAR(101) = N'Prueba',
    @SlugCategoria   VARCHAR(121) = NULL,
    @PrecioMinimo    DECIMAL(12, 2) = NULL,
    @PrecioMaximo    DECIMAL(12, 2) = NULL,
    @SoloDisponibles BIT = 0,
    @OrdenarPor      VARCHAR(20) = 'NOMBRE',
    @Direccion       VARCHAR(4) = 'ASC',
    @Pagina          INT = 1,
    @TamanoPagina    INT = 20,
    @Resultado       NVARCHAR(400) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Api SYSNAME = (SELECT UsuarioApi FROM #Contexto), @Total INT;
    DECLARE @Filas TABLE (Orden INT IDENTITY, IDProducto INT, Nombre NVARCHAR(200), Slug VARCHAR(220), Categoria NVARCHAR(100),
                          SlugCategoria VARCHAR(120), Precio DECIMAL(12, 2), Disponible BIT, ImagenPrincipal NVARCHAR(500),
                          TextoAlternativo NVARCHAR(200));
    DELETE FROM #Tarjeta;
    EXECUTE AS USER = @Api;
    INSERT INTO @Filas (IDProducto, Nombre, Slug, Categoria, SlugCategoria, Precio, Disponible, ImagenPrincipal, TextoAlternativo)
    EXEC dbo.SP_Catalogo_BuscarProductos @Texto, @SlugCategoria, @PrecioMinimo, @PrecioMaximo, @SoloDisponibles,
                                         @OrdenarPor, @Direccion, @Pagina, @TamanoPagina, @Total OUTPUT;
    REVERT;
    INSERT INTO #Tarjeta SELECT IDProducto, Nombre, Slug, Categoria, SlugCategoria, Precio, Disponible, ImagenPrincipal, TextoAlternativo
                         FROM @Filas;
    SET @Resultado = CONCAT(@Total, N'|', (SELECT STRING_AGG(CONCAT(Nombre, N':', Precio, N':', CAST(Disponible AS INT)), N',')
                                                  WITHIN GROUP (ORDER BY Orden) FROM @Filas));
END;
GO

/*
    Caso de error: prepara, ejecuta @Sql como la API y compara el número de error (0 = no
    falló). Todo se revierte.
*/
CREATE PROCEDURE #EsperarError
    @Descripcion NVARCHAR(300),
    @Esperado    INT,
    @Sql         NVARCHAR(MAX),
    @Preparacion NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Api SYSNAME = (SELECT UsuarioApi FROM #Contexto), @Error INT = 0,
            @TextoEsperado NVARCHAR(10), @TextoObtenido NVARCHAR(10);

    BEGIN TRANSACTION;
    EXEC #Preparar;
    IF @Preparacion IS NOT NULL
        EXEC sys.sp_executesql @Preparacion;

    BEGIN TRY
        EXECUTE AS USER = @Api;
        EXEC sys.sp_executesql @Sql;
        REVERT;
    END TRY
    BEGIN CATCH
        SET @Error = ERROR_NUMBER();
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        REVERT;
    END CATCH;
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;

    SELECT @TextoEsperado = CAST(@Esperado AS NVARCHAR(10)), @TextoObtenido = CAST(@Error AS NVARCHAR(10));
    EXEC #Verificar @Descripcion, @TextoEsperado, @TextoObtenido;
END;
GO

EXEC sys.sp_set_session_context @key = N'PruebasFallidas', @value = 0;

INSERT INTO #Contexto (UsuarioApi)
SELECT TOP (1) USER_NAME(rm.member_principal_id)
FROM sys.database_role_members AS rm
WHERE rm.role_principal_id = DATABASE_PRINCIPAL_ID(N'RolApi')
ORDER BY rm.member_principal_id;

IF NOT EXISTS (SELECT 1 FROM #Contexto)
    THROW 50000, N'RolApi no tiene miembros: no se pueden ejecutar los SPs como la API.', 1;
GO

DECLARE @Api SYSNAME = (SELECT UsuarioApi FROM #Contexto);
DECLARE @Texto NVARCHAR(400), @IDRopa INT, @IDPlayera INT;

BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDRopa = IDRopa, @IDPlayera = IDPlayera FROM #Base;

/* === Búsqueda ============================================================================ */
EXEC #Buscar @Resultado = @Texto OUTPUT;
EXEC #Verificar N'Buscar: solo productos visibles (sin el inactivo ni el de categoría inactiva); precio mostrado = selección inicial',
     N'2|Playera Prueba:120.00:1,Taza Prueba:50.00:0', @Texto;

SET @Texto = (SELECT CONCAT(ImagenPrincipal, N'|', TextoAlternativo, N'|', SlugCategoria) FROM #Tarjeta WHERE Nombre = N'Playera Prueba');
EXEC #Verificar N'Buscar: la tarjeta usa la imagen principal del color de la selección inicial',
     N'/uploads/productos/prueba-rojo.webp|Playera roja|ropa-prueba', @Texto;

EXEC #Buscar @SoloDisponibles = 1, @Resultado = @Texto OUTPUT;
EXEC #Verificar N'Buscar: solo disponibles oculta el agotado', N'1|Playera Prueba:120.00:1', @Texto;

EXEC #Buscar @PrecioMinimo = 80, @PrecioMaximo = 100, @Resultado = @Texto OUTPUT;
EXEC #Verificar N'Buscar: el rango usa el precio mostrado (la variante de 90 no hace entrar a la Playera)', N'0|', @Texto;

EXEC #Buscar @PrecioMinimo = 110, @PrecioMaximo = 120, @Resultado = @Texto OUTPUT;
EXEC #Verificar N'Buscar: rango con límites incluidos', N'1|Playera Prueba:120.00:1', @Texto;

EXEC #Buscar @OrdenarPor = 'precio', @Direccion = 'asc', @Resultado = @Texto OUTPUT;
EXEC #Verificar N'Buscar: orden por precio ascendente (sin distinguir mayúsculas)', N'2|Taza Prueba:50.00:0,Playera Prueba:120.00:1', @Texto;

EXEC #Buscar @OrdenarPor = 'RECIENTES', @Direccion = 'DESC', @Resultado = @Texto OUTPUT;
EXEC #Verificar N'Buscar: más recientes primero', N'2|Taza Prueba:50.00:0,Playera Prueba:120.00:1', @Texto;

EXEC #Buscar @OrdenarPor = 'NOMBRE', @Direccion = 'DESC', @Resultado = @Texto OUTPUT;
EXEC #Verificar N'Buscar: orden por nombre descendente', N'2|Taza Prueba:50.00:0,Playera Prueba:120.00:1', @Texto;

EXEC #Buscar @SlugCategoria = ' Ropa-Prueba ', @Resultado = @Texto OUTPUT;
EXEC #Verificar N'Buscar: por categoría (slug normalizado)', N'1|Playera Prueba:120.00:1', @Texto;

EXEC #Buscar @Pagina = 2, @TamanoPagina = 1, @Resultado = @Texto OUTPUT;
EXEC #Verificar N'Buscar: segunda página de tamaño 1 con el total completo', N'2|Taza Prueba:50.00:0', @Texto;

EXEC #Buscar @Texto = N'100%', @Resultado = @Texto OUTPUT;
EXEC #Verificar N'Buscar: busca en la descripción y el % se busca como texto', N'1|Taza Prueba:50.00:0', @Texto;

EXEC #Buscar @Texto = N'Pla_era', @Resultado = @Texto OUTPUT;
EXEC #Verificar N'Buscar: el _ se busca como texto, no como comodín', N'0|', @Texto;

EXEC #Buscar @Texto = N'playera prueba', @Resultado = @Texto OUTPUT;
EXEC #Verificar N'Buscar: sin distinguir mayúsculas', N'1|Playera Prueba:120.00:1', @Texto;

-- Si se agota la selección inicial, el precio mostrado pasa a la siguiente disponible (Azul/S, 90).
UPDATE dbo.Variante SET ExistenciaFisica = 0 WHERE SKU = 'PRUEBA-ROJO-M';
EXEC #Buscar @Texto = N'Playera', @Resultado = @Texto OUTPUT;
SET @Texto += N'|' + (SELECT ImagenPrincipal FROM #Tarjeta);
EXEC #Verificar N'Buscar: al agotarse la selección inicial cambian el precio y la imagen a la siguiente disponible',
     N'1|Playera Prueba:90.00:1|/uploads/productos/prueba-azul.webp', @Texto;

-- Todo agotado: se sigue mostrando, con la primera combinación (Rojo/S) y no disponible.
UPDATE dbo.Variante SET ExistenciaFisica = 0 WHERE SKU = 'PRUEBA-AZUL-S';
EXEC #Buscar @Texto = N'Playera', @Resultado = @Texto OUTPUT;
EXEC #Verificar N'Buscar: un producto con todo agotado se muestra como no disponible con la primera combinación',
     N'1|Playera Prueba:100.00:0', @Texto;
UPDATE dbo.Variante SET ExistenciaFisica = 5 WHERE SKU = 'PRUEBA-ROJO-M';
UPDATE dbo.Variante SET ExistenciaFisica = 3 WHERE SKU = 'PRUEBA-AZUL-S';

/* === Detalle ============================================================================= */
EXECUTE AS USER = @Api;
INSERT INTO #Detalle EXEC dbo.SP_Catalogo_ObtenerProducto ' Playera-Prueba ';
REVERT;
SET @Texto = (SELECT STRING_AGG(CONCAT(JSON_VALUE(j.value, '$.SKU'), N':', JSON_VALUE(j.value, '$.Disponible'),
                                       CASE JSON_VALUE(j.value, '$.EsSeleccionInicial') WHEN 'true' THEN N'*' END), N',')
                     WITHIN GROUP (ORDER BY CAST(j.[key] AS INT))
              FROM #Detalle AS d CROSS APPLY OPENJSON(d.Variantes) AS j);
EXEC #Verificar N'Detalle: solo variantes activas; la selección inicial primero y las agotadas al final',
     N'PRUEBA-ROJO-M:5*,PRUEBA-AZUL-S:3,PRUEBA-ROJO-S:0', @Texto;

SET @Texto = (SELECT STRING_AGG(CONCAT(JSON_VALUE(a.value, '$.Atributo'), N'(', JSON_VALUE(a.value, '$.OrdenAtributo'), N')=',
                                       JSON_VALUE(a.value, '$.Valor'), N'(', JSON_VALUE(a.value, '$.OrdenValor'), N')',
                                       JSON_VALUE(a.value, '$.CodigoHex')), N',')
                     WITHIN GROUP (ORDER BY CAST(a.[key] AS INT))
              FROM #Detalle AS d CROSS APPLY OPENJSON(d.Variantes, '$[0].Atributos') AS a);
EXEC #Verificar N'Detalle: atributos con su orden y color para armar los selectores',
     N'Color Prueba(1)=Rojo(1)#FF0000,Talla Prueba(2)=M(2)', @Texto;

SET @Texto = (SELECT STRING_AGG(CONCAT(REPLACE(JSON_VALUE(j.value, '$.RutaImagen'), N'/uploads/productos/', N''), N':',
                                       JSON_VALUE(j.value, '$.EsPrincipal')), N',') WITHIN GROUP (ORDER BY CAST(j.[key] AS INT))
              FROM #Detalle AS d CROSS APPLY OPENJSON(d.Imagenes) AS j);
SET @Texto += N'|' + (SELECT CONCAT(Categoria, N':', SlugCategoria, N':', Descripcion) FROM #Detalle);
EXEC #Verificar N'Detalle: imágenes generales primero, luego por color en su orden con la principal al inicio; datos de la categoría',
     N'prueba-general.webp:true,prueba-rojo.webp:true,prueba-rojo-2.webp:false,prueba-azul.webp:true|Ropa Prueba:ropa-prueba:Algodón', @Texto;

/* === Categorías ========================================================================== */
EXECUTE AS USER = @Api;
INSERT INTO #Categorias EXEC dbo.SP_Catalogo_ListarCategoriasTienda;
REVERT;
SET @Texto = (SELECT STRING_AGG(CONCAT(Nombre, N':', ProductosVisibles), N',') WITHIN GROUP (ORDER BY Nombre)
              FROM #Categorias WHERE Nombre LIKE N'%Prueba');
EXEC #Verificar N'Categorías de la tienda: activas y con productos visibles (sin la inactiva ni la vacía)',
     N'Hogar Prueba:1,Ropa Prueba:1', @Texto;

-- Desactivar la categoría oculta sus productos sin tocar su estado.
UPDATE dbo.Categoria SET Activo = 0 WHERE IDCategoria = @IDRopa;
EXEC #Buscar @Resultado = @Texto OUTPUT;
SET @Texto += N'|' + CAST((SELECT Activo FROM dbo.Producto WHERE IDProducto = @IDPlayera) AS NVARCHAR(1));
EXEC #Verificar N'Categoría desactivada: sus productos dejan de mostrarse y conservan su estado', N'1|Taza Prueba:50.00:0|1', @Texto;
ROLLBACK TRANSACTION;

/* === Casos de error ====================================================================== */
DECLARE @Errores TABLE (Orden INT IDENTITY, Descripcion NVARCHAR(300), Esperado INT, Sql NVARCHAR(MAX), Preparacion NVARCHAR(MAX));
INSERT INTO @Errores (Descripcion, Esperado, Sql, Preparacion) VALUES
    (N'Detalle: slug inexistente → PRODUCTO_NO_ENCONTRADO', 50105,
        N'EXEC dbo.SP_Catalogo_ObtenerProducto ''no-existe-prueba'';', NULL),
    (N'Detalle: producto inactivo → PRODUCTO_NO_ENCONTRADO', 50105,
        N'EXEC dbo.SP_Catalogo_ObtenerProducto ''gorra-prueba'';', NULL),
    (N'Detalle: producto de una categoría inactiva → PRODUCTO_NO_ENCONTRADO', 50105,
        N'EXEC dbo.SP_Catalogo_ObtenerProducto ''chaqueta-prueba'';', NULL),
    (N'Detalle: producto activo sin variantes activas → PRODUCTO_NO_ENCONTRADO', 50105,
        N'EXEC dbo.SP_Catalogo_ObtenerProducto ''taza-prueba'';',
        N'UPDATE dbo.Variante SET Activo = 0 WHERE SKU = ''PRUEBA-TAZA'';'),
    (N'Buscar: categoría inexistente → CATEGORIA_NO_ENCONTRADA', 50102,
        N'EXEC dbo.SP_Catalogo_BuscarProductos @SlugCategoria = ''no-existe-prueba'';', NULL),
    (N'Buscar: categoría inactiva → CATEGORIA_NO_ENCONTRADA', 50102,
        N'EXEC dbo.SP_Catalogo_BuscarProductos @SlugCategoria = ''oculta-prueba'';', NULL),
    (N'Buscar: página 0 → PAGINACION_INVALIDA', 50007,
        N'EXEC dbo.SP_Catalogo_BuscarProductos @Pagina = 0;', NULL),
    (N'Buscar: tamaño 101 → PAGINACION_INVALIDA', 50007,
        N'EXEC dbo.SP_Catalogo_BuscarProductos @TamanoPagina = 101;', NULL),
    (N'Buscar: texto de 101 caracteres → BUSQUEDA_INVALIDA', 50008,
        N'EXEC dbo.SP_Catalogo_BuscarProductos @Texto = N''' + REPLICATE(N'b', 101) + N''';', NULL),
    (N'Buscar: mínimo mayor que el máximo → RANGO_PRECIO_INVALIDO', 50021,
        N'EXEC dbo.SP_Catalogo_BuscarProductos @PrecioMinimo = 100, @PrecioMaximo = 50;', NULL),
    (N'Buscar: precio negativo → RANGO_PRECIO_INVALIDO', 50021,
        N'EXEC dbo.SP_Catalogo_BuscarProductos @PrecioMinimo = -1;', NULL),
    (N'Buscar: ordenar por una columna fuera de la lista → ORDENAMIENTO_INVALIDO', 50022,
        N'EXEC dbo.SP_Catalogo_BuscarProductos @OrdenarPor = ''IDProducto; DROP TABLE x'';', NULL),
    (N'Buscar: dirección inválida → ORDENAMIENTO_INVALIDO', 50022,
        N'EXEC dbo.SP_Catalogo_BuscarProductos @Direccion = ''ARRIBA'';', NULL);

DECLARE @Orden INT = 1, @Descripcion NVARCHAR(300), @Esperado INT, @Sql NVARCHAR(MAX), @Preparacion NVARCHAR(MAX);
WHILE @Orden <= (SELECT MAX(Orden) FROM @Errores)
BEGIN
    SELECT @Descripcion = Descripcion, @Esperado = Esperado, @Sql = Sql, @Preparacion = Preparacion
    FROM @Errores WHERE Orden = @Orden;
    EXEC #EsperarError @Descripcion, @Esperado, @Sql, @Preparacion;
    SET @Orden += 1;
END;

/* Ningún caso dejó datos: todos se revirtieron. */
SET @Texto = (SELECT CONCAT((SELECT COUNT(*) FROM dbo.Producto WHERE Slug LIKE '%prueba%'), N'|',
                            (SELECT COUNT(*) FROM dbo.Categoria WHERE Slug LIKE '%prueba%')));
EXEC #Verificar N'Limpieza: no quedan datos de prueba', N'0|0', @Texto;

/* --- Resultado ---------------------------------------------------------------------------- */
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;

IF CAST(SESSION_CONTEXT(N'PruebasFallidas') AS INT) > 0
    THROW 50000, N'Pruebas de procedimientos de catálogo (tienda) fallidas.', 1;
EXEC sys.sp_set_session_context @key = N'PruebasFallidas', @value = NULL;
GO
