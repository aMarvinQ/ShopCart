/*
    010_Procedimientos_CatalogoProductos.sql
    Se ejecuta conectado como shopcart_migrator (deploy.ps1 -Probar). Mismo esquema que 009:
    el migrador prepara los datos y ejecuta cada SP haciéndose pasar por un miembro de RolApi;
    los casos de error usan #EsperarError (el SQL lee los IDs de #Base; lo que se prepara
    como migrador va en @Preparacion). Los nombres llevan "Prueba" para no chocar con la semilla.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT OFF;
GO

-- Permite ejecutar el script varias veces en la misma conexión (p. ej. en SSMS).
DROP TABLE IF EXISTS #Contexto, #Base, #Producto, #Lista, #Historial, #Eliminada;
DROP PROCEDURE IF EXISTS #Verificar;
DROP PROCEDURE IF EXISTS #Preparar;
DROP PROCEDURE IF EXISTS #EsperarError;
GO

CREATE TABLE #Contexto (UsuarioApi SYSNAME NOT NULL);
CREATE TABLE #Base (IDAdmin INT, IDOperador INT, IDRopa INT, IDRopaDos INT, IDHogar INT, IDCalzado INT,
                    IDTalla INT, IDColor INT, IDMaterial INT, IDS INT, IDM INT, IDL INT, IDRojo INT, IDAzul INT, IDVerde INT,
                    IDAlgodon INT, IDPlayera INT, IDTaza INT, IDRojoS INT, IDAzulS INT, IDVarTaza INT, IDImagen INT,
                    VersionPlayera BINARY(8), VersionRojoS BINARY(8));

-- Resultados de los SPs (misma forma que devuelven).
CREATE TABLE #Producto (IDProducto INT, IDCategoria INT, Categoria NVARCHAR(100), CategoriaActiva BIT, Nombre NVARCHAR(200),
                        Slug VARCHAR(220), Descripcion NVARCHAR(4000), Activo BIT, FechaCreacion DATETIME2(3),
                        FechaModificacion DATETIME2(3), VersionFila BINARY(8), Variantes NVARCHAR(MAX), Imagenes NVARCHAR(MAX));
CREATE TABLE #Lista (IDProducto INT, Nombre NVARCHAR(200), Slug VARCHAR(220), IDCategoria INT, Categoria NVARCHAR(100), Activo BIT,
                     CategoriaActiva BIT, VariantesTotales INT, VariantesActivas INT, PrecioMinimo DECIMAL(12, 2),
                     PrecioMaximo DECIMAL(12, 2), ExistenciaTotal INT, ImagenPrincipal NVARCHAR(500), FechaModificacion DATETIME2(3));
CREATE TABLE #Historial (IDHistorialPrecio BIGINT, Fecha DATETIME2(3), PrecioAnterior DECIMAL(12, 2), PrecioNuevo DECIMAL(12, 2),
                         IDUsuario INT, Usuario NVARCHAR(201));
CREATE TABLE #Eliminada (IDProducto INT, RutaImagen NVARCHAR(500));
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
    Datos de cada caso:
    - Roles y el tipo de movimiento INVENTARIO_INICIAL (si la semilla no los cargó); un
      administrador y un operador.
    - Atributos Talla (S, M, L), Color (Rojo, Azul y Verde desactivado) y Material (Algodón),
      que no está en ninguna categoría.
    - Categorías: Ropa y Ropa Dos (Color y Talla), Calzado (solo Talla) y Hogar (sin atributos).
    - Playera (Ropa, activa): variantes Rojo/S y Azul/S y una imagen general.
    - Taza (Hogar, inactiva): una variante sin atributos y sin imágenes.
*/
CREATE PROCEDURE #Preparar
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Hash VARCHAR(255) = '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA';
    DECLARE @IDAdmin INT, @IDOperador INT, @IDRopa INT, @IDRopaDos INT, @IDHogar INT, @IDCalzado INT,
            @IDTalla INT, @IDColor INT, @IDMaterial INT, @IDS INT, @IDM INT, @IDL INT, @IDRojo INT, @IDAzul INT,
            @IDVerde INT, @IDAlgodon INT, @IDPlayera INT, @IDTaza INT, @IDRojoS INT, @IDAzulS INT, @IDVarTaza INT, @IDImagen INT;

    INSERT INTO dbo.Rol (IDRol, Codigo, Nombre)
    SELECT v.IDRol, v.Codigo, v.Nombre
    FROM (VALUES (201, 'CLIENTE', N'Cliente'), (202, 'OPERADOR', N'Operador'), (203, 'ADMIN', N'Administrador'))
         AS v (IDRol, Codigo, Nombre)
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Rol AS r WHERE r.Codigo = v.Codigo);

    INSERT INTO dbo.TipoMovimiento (IDTipoMovimiento, Codigo, Nombre, Signo)
    SELECT 201, 'INVENTARIO_INICIAL', N'Inventario inicial', 1
    WHERE NOT EXISTS (SELECT 1 FROM dbo.TipoMovimiento AS t WHERE t.Codigo = 'INVENTARIO_INICIAL');

    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'admin.productos@shopcart.test', @Hash, N'Admin', N'Productos' FROM dbo.Rol AS r WHERE r.Codigo = 'ADMIN';
    SET @IDAdmin = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'operador.productos@shopcart.test', @Hash, N'Operador', N'Productos' FROM dbo.Rol AS r WHERE r.Codigo = 'OPERADOR';
    SET @IDOperador = SCOPE_IDENTITY();

    INSERT INTO dbo.Atributo (Nombre) VALUES (N'Talla Prueba');
    SET @IDTalla = SCOPE_IDENTITY();
    INSERT INTO dbo.Atributo (Nombre) VALUES (N'Color Prueba');
    SET @IDColor = SCOPE_IDENTITY();
    INSERT INTO dbo.Atributo (Nombre) VALUES (N'Material Prueba');
    SET @IDMaterial = SCOPE_IDENTITY();

    INSERT INTO dbo.AtributoValor (IDAtributo, Valor, Orden) VALUES (@IDTalla, N'S', 1);
    SET @IDS = SCOPE_IDENTITY();
    INSERT INTO dbo.AtributoValor (IDAtributo, Valor, Orden) VALUES (@IDTalla, N'M', 2);
    SET @IDM = SCOPE_IDENTITY();
    INSERT INTO dbo.AtributoValor (IDAtributo, Valor, Orden) VALUES (@IDTalla, N'L', 3);
    SET @IDL = SCOPE_IDENTITY();
    INSERT INTO dbo.AtributoValor (IDAtributo, Valor, Orden, CodigoHex) VALUES (@IDColor, N'Rojo', 1, '#FF0000');
    SET @IDRojo = SCOPE_IDENTITY();
    INSERT INTO dbo.AtributoValor (IDAtributo, Valor, Orden, CodigoHex) VALUES (@IDColor, N'Azul', 2, '#0000FF');
    SET @IDAzul = SCOPE_IDENTITY();
    INSERT INTO dbo.AtributoValor (IDAtributo, Valor, Orden, Activo) VALUES (@IDColor, N'Verde', 3, 0);
    SET @IDVerde = SCOPE_IDENTITY();
    INSERT INTO dbo.AtributoValor (IDAtributo, Valor, Orden) VALUES (@IDMaterial, N'Algodón', 1);
    SET @IDAlgodon = SCOPE_IDENTITY();

    INSERT INTO dbo.Categoria (Nombre, Slug) VALUES (N'Ropa Prueba', 'ropa-prueba');
    SET @IDRopa = SCOPE_IDENTITY();
    INSERT INTO dbo.Categoria (Nombre, Slug) VALUES (N'Ropa Dos Prueba', 'ropa-dos-prueba');
    SET @IDRopaDos = SCOPE_IDENTITY();
    INSERT INTO dbo.Categoria (Nombre, Slug) VALUES (N'Calzado Prueba', 'calzado-prueba');
    SET @IDCalzado = SCOPE_IDENTITY();
    INSERT INTO dbo.Categoria (Nombre, Slug) VALUES (N'Hogar Prueba', 'hogar-prueba');
    SET @IDHogar = SCOPE_IDENTITY();
    INSERT INTO dbo.CategoriaAtributo (IDCategoria, IDAtributo, Orden)
    VALUES (@IDRopa, @IDColor, 1), (@IDRopa, @IDTalla, 2), (@IDRopaDos, @IDColor, 1), (@IDRopaDos, @IDTalla, 2),
           (@IDCalzado, @IDTalla, 1);

    INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug, Activo) VALUES (@IDRopa, N'Playera Prueba', 'playera-prueba', 1);
    SET @IDPlayera = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ClaveCombinacion)
    VALUES (@IDPlayera, 'PRUEBA-ROJO-S', 100.00, CONCAT(@IDS, '|', @IDRojo));
    SET @IDRojoS = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ClaveCombinacion)
    VALUES (@IDPlayera, 'PRUEBA-AZUL-S', 110.00, CONCAT(@IDS, '|', @IDAzul));
    SET @IDAzulS = SCOPE_IDENTITY();
    INSERT INTO dbo.VarianteAtributoValor (IDVariante, IDAtributo, IDAtributoValor)
    VALUES (@IDRojoS, @IDTalla, @IDS), (@IDRojoS, @IDColor, @IDRojo), (@IDAzulS, @IDTalla, @IDS), (@IDAzulS, @IDColor, @IDAzul);
    INSERT INTO dbo.ProductoImagen (IDProducto, RutaImagen, TextoAlternativo, Orden, EsPrincipal)
    VALUES (@IDPlayera, N'/uploads/productos/prueba-playera.webp', N'Playera', 1, 1);
    SET @IDImagen = SCOPE_IDENTITY();

    INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug) VALUES (@IDHogar, N'Taza Prueba', 'taza-prueba');
    SET @IDTaza = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio) VALUES (@IDTaza, 'PRUEBA-TAZA', 50.00);
    SET @IDVarTaza = SCOPE_IDENTITY();

    DELETE FROM #Base;
    INSERT INTO #Base
    SELECT @IDAdmin, @IDOperador, @IDRopa, @IDRopaDos, @IDHogar, @IDCalzado, @IDTalla, @IDColor, @IDMaterial,
           @IDS, @IDM, @IDL, @IDRojo, @IDAzul, @IDVerde, @IDAlgodon, @IDPlayera, @IDTaza, @IDRojoS, @IDAzulS, @IDVarTaza, @IDImagen,
           (SELECT VersionFila FROM dbo.Producto WHERE IDProducto = @IDPlayera),
           (SELECT VersionFila FROM dbo.Variante WHERE IDVariante = @IDRojoS);
END;
GO

/*
    Caso de error: prepara, ejecuta @Sql como la API y compara el número de error (0 = no
    falló). Todo se revierte. EXECUTE AS dentro del procedimiento se revierte al salir de él.
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
DECLARE @IDAdmin INT, @IDRopa INT, @IDRopaDos INT, @IDHogar INT, @IDTalla INT, @IDColor INT, @IDS INT, @IDM INT, @IDL INT,
        @IDRojo INT, @IDAzul INT, @IDPlayera INT, @IDTaza INT, @IDRojoS INT, @IDAzulS INT, @IDImagen INT, @IDNuevo INT,
        @IDVariante INT, @IDImagenRojo INT, @Total INT;
DECLARE @Texto NVARCHAR(400), @Version BINARY(8);
DECLARE @Variantes dbo.TT_Catalogo_Variante, @Atributos dbo.TT_Catalogo_VarianteAtributo, @Imagenes dbo.TT_Catalogo_ProductoImagen;

/* === Alta de un producto con variantes e imágenes ======================================== */
BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDAdmin = IDAdmin, @IDRopa = IDRopa, @IDTalla = IDTalla, @IDColor = IDColor, @IDS = IDS, @IDM = IDM,
       @IDRojo = IDRojo, @IDAzul = IDAzul FROM #Base;

-- Talla y Color en orden inverso al de la categoría: el orden lógico lo define Color (1) y luego Talla.
INSERT INTO @Variantes VALUES (1, ' sud-azul-m ', 120.00, 2), (2, 'SUD-ROJO-S', 100.00, 5), (3, 'SUD-ROJO-M', 100.00, 0),
                              (4, 'SUD-AZUL-S', 120.00, 3);
INSERT INTO @Atributos VALUES (1, @IDTalla, @IDM), (1, @IDColor, @IDAzul), (2, @IDTalla, @IDS), (2, @IDColor, @IDRojo),
                              (3, @IDTalla, @IDM), (3, @IDColor, @IDRojo), (4, @IDTalla, @IDS), (4, @IDColor, @IDAzul);
INSERT INTO @Imagenes VALUES (1, N' /uploads/productos/sud-general.webp ', N' Sudadera ', NULL, 1, 0),
                             (2, N'/uploads/productos/sud-rojo-2.webp', N'Sudadera roja espalda', @IDRojo, 2, 0),
                             (3, N'/uploads/productos/sud-rojo-1.webp', N'Sudadera roja', @IDRojo, 1, 0),
                             (4, N'/uploads/productos/sud-azul.webp', N'Sudadera azul', @IDAzul, 1, 1);

EXECUTE AS USER = @Api;
INSERT INTO #Producto EXEC dbo.SP_Catalogo_CrearProducto @IDAdmin, @IDRopa, N' Sudadera Prueba ', 'Sudadera-Prueba', NULL,
                                                         @Variantes, @Atributos, @Imagenes;
REVERT;
SELECT @IDNuevo = IDProducto FROM #Producto;

SET @Texto = (SELECT CONCAT(p.Nombre, N'|', p.Slug, N'|', CAST(p.Activo AS INT), N'|',
                            (SELECT STRING_AGG(CONCAT(JSON_VALUE(j.value, '$.SKU'), N':', JSON_VALUE(j.value, '$.ExistenciaFisica'),
                                                      CASE JSON_VALUE(j.value, '$.EsSeleccionInicial') WHEN 'true' THEN N'*' END), N',')
                                    WITHIN GROUP (ORDER BY CAST(j.[key] AS INT))
                             FROM OPENJSON(p.Variantes) AS j))
              FROM #Producto AS p);
EXEC #Verificar N'Crear producto: nace inactivo, SKU normalizado, variantes en orden lógico (Color y luego Talla) y selección inicial',
     N'Sudadera Prueba|sudadera-prueba|0|SUD-ROJO-S:5*,SUD-ROJO-M:0,SUD-AZUL-S:3,SUD-AZUL-M:2', @Texto;

SET @Texto = (SELECT (SELECT STRING_AGG(CONCAT(JSON_VALUE(a.value, '$.Atributo'), N'=', JSON_VALUE(a.value, '$.Valor')), N',')
                             WITHIN GROUP (ORDER BY CAST(a.[key] AS INT))
                      FROM OPENJSON(p.Variantes, '$[0].Atributos') AS a)
              FROM #Producto AS p);
EXEC #Verificar N'Crear producto: atributos de la variante en el orden de la categoría', N'Color Prueba=Rojo,Talla Prueba=S', @Texto;

SET @Texto = (SELECT CONCAT(COUNT(*), N'|', SUM(CASE WHEN v.ClaveCombinacion = CONCAT(vt.IDAtributoValor, '|', vc.IDAtributoValor)
                                                     THEN 1 ELSE 0 END))
              FROM dbo.Variante AS v
              JOIN dbo.VarianteAtributoValor AS vt ON vt.IDVariante = v.IDVariante AND vt.IDAtributo = @IDTalla
              JOIN dbo.VarianteAtributoValor AS vc ON vc.IDVariante = v.IDVariante AND vc.IDAtributo = @IDColor
              WHERE v.IDProducto = @IDNuevo);
EXEC #Verificar N'Crear producto: ClaveCombinacion = valores ordenados por IDAtributo (Talla antes que Color)', N'4|4', @Texto;

SET @Texto = (SELECT CONCAT(COUNT(*), N'|', SUM(m.Cantidad), N'|',
                            SUM(CASE WHEN m.SaldoAnterior = 0 AND m.SaldoNuevo = v.ExistenciaFisica AND m.IDUsuario = @IDAdmin
                                     THEN 1 ELSE 0 END))
              FROM dbo.MovimientoInventario AS m
              JOIN dbo.Variante AS v ON v.IDVariante = m.IDVariante
              JOIN dbo.TipoMovimiento AS t ON t.IDTipoMovimiento = m.IDTipoMovimiento AND t.Codigo = 'INVENTARIO_INICIAL'
              WHERE v.IDProducto = @IDNuevo);
EXEC #Verificar N'Crear producto: kardex INVENTARIO_INICIAL solo para existencia > 0 y saldo de la variante igual al movimiento',
     N'3|10|3', @Texto;

SET @Texto = (SELECT CONCAT(COUNT(*), N'|', SUM(CASE WHEN h.PrecioAnterior IS NULL AND h.PrecioNuevo = v.Precio THEN 1 ELSE 0 END))
              FROM dbo.HistorialPrecio AS h JOIN dbo.Variante AS v ON v.IDVariante = h.IDVariante
              WHERE v.IDProducto = @IDNuevo);
EXEC #Verificar N'Crear producto: precio inicial de cada variante en HistorialPrecio', N'4|4', @Texto;

SET @Texto = (SELECT STRING_AGG(CONCAT(REPLACE(pi.RutaImagen, N'/uploads/productos/', N''), N':', CAST(pi.EsPrincipal AS INT)), N',')
                     WITHIN GROUP (ORDER BY pi.RutaImagen)
              FROM dbo.ProductoImagen AS pi WHERE pi.IDProducto = @IDNuevo);
EXEC #Verificar N'Crear producto: rutas recortadas; una principal por grupo (la marcada o la de menor orden)',
     N'sud-azul.webp:1,sud-general.webp:1,sud-rojo-1.webp:1,sud-rojo-2.webp:0', @Texto;

SET @Texto = (SELECT CONCAT(COUNT(*), N'|', MAX(JSON_VALUE(b.ValorNuevo, '$.Slug')), N'|', MAX(v.Cantidad))
              FROM dbo.Bitacora AS b
              CROSS APPLY (SELECT COUNT(*) AS Cantidad FROM OPENJSON(b.ValorNuevo, '$.Variantes')) AS v
              WHERE b.IDUsuario = @IDAdmin AND b.Entidad = 'Producto' AND b.Accion = 'CREAR');
EXEC #Verificar N'Crear producto: bitácora CREAR con el producto y sus variantes', N'1|sudadera-prueba|4', @Texto;
ROLLBACK TRANSACTION;

-- Producto simple: una variante sin atributos y sin imágenes.
DELETE FROM @Variantes; DELETE FROM @Atributos; DELETE FROM @Imagenes; DELETE FROM #Producto;
BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDAdmin = IDAdmin, @IDHogar = IDHogar FROM #Base;
INSERT INTO @Variantes VALUES (1, 'VASO-PRUEBA', 35.50, 0);
EXECUTE AS USER = @Api;
INSERT INTO #Producto EXEC dbo.SP_Catalogo_CrearProducto @IDAdmin, @IDHogar, N'Vaso Prueba', 'vaso-prueba', N'De vidrio',
                                                         @Variantes, @Atributos, @Imagenes;
REVERT;
SET @Texto = (SELECT CONCAT(JSON_VALUE(p.Variantes, '$[0].SKU'), N'|', JSON_QUERY(p.Variantes, '$[0].Atributos'), N'|', p.Imagenes, N'|',
                            (SELECT COUNT(*) FROM dbo.MovimientoInventario AS m JOIN dbo.Variante AS v ON v.IDVariante = m.IDVariante
                             WHERE v.IDProducto = p.IDProducto))
              FROM #Producto AS p);
EXEC #Verificar N'Crear producto simple: una variante sin atributos, sin imágenes y sin kardex por existencia 0',
     N'VASO-PRUEBA|[]|[]|0', @Texto;
ROLLBACK TRANSACTION;

/* === Edición del producto, estado y variantes ============================================ */
DELETE FROM @Variantes; DELETE FROM @Atributos; DELETE FROM #Producto;
BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDAdmin = IDAdmin, @IDRopaDos = IDRopaDos, @IDTalla = IDTalla, @IDColor = IDColor, @IDM = IDM, @IDRojo = IDRojo,
       @IDPlayera = IDPlayera, @IDRojoS = IDRojoS, @IDAzulS = IDAzulS, @Version = VersionPlayera FROM #Base;

EXECUTE AS USER = @Api;
INSERT INTO #Producto EXEC dbo.SP_Catalogo_ActualizarProducto @IDAdmin, @IDPlayera, @IDRopaDos, N'Playera Prueba Editada',
                                                              'playera-prueba-editada', N'Algodón', @Version;
REVERT;
SET @Texto = (SELECT CONCAT(Categoria, N'|', Nombre, N'|', Slug, N'|', Descripcion, N'|',
                            CASE WHEN VersionFila <> @Version THEN N'versión nueva' END) FROM #Producto);
SET @Texto += N'|' + (SELECT CONCAT(COUNT(*), N':', MAX(JSON_VALUE(ValorAnterior, '$.Nombre'))) FROM dbo.Bitacora
                      WHERE IDUsuario = @IDAdmin AND Entidad = 'Producto' AND Accion = 'MODIFICAR');
EXEC #Verificar N'Actualizar producto: cambia a una categoría compatible y registra bitácora',
     N'Ropa Dos Prueba|Playera Prueba Editada|playera-prueba-editada|Algodón|versión nueva|1:Playera Prueba', @Texto;

-- Agregar variantes a un producto activo.
INSERT INTO @Variantes VALUES (1, 'PRUEBA-ROJO-M', 105.00, 4);
INSERT INTO @Atributos VALUES (1, @IDTalla, @IDM), (1, @IDColor, @IDRojo);
DELETE FROM #Producto;
EXECUTE AS USER = @Api;
INSERT INTO #Producto EXEC dbo.SP_Catalogo_AgregarVariantes @IDAdmin, @IDPlayera, @Variantes, @Atributos;
REVERT;
SET @Texto = (SELECT CONCAT((SELECT COUNT(*) FROM OPENJSON(p.Variantes)), N'|',
                            (SELECT v.ExistenciaFisica FROM dbo.Variante AS v WHERE v.SKU = 'PRUEBA-ROJO-M'), N'|',
                            (SELECT COUNT(*) FROM dbo.Bitacora AS b WHERE b.IDUsuario = @IDAdmin AND b.Entidad = 'Variante' AND b.Accion = 'CREAR'))
              FROM #Producto AS p);
EXEC #Verificar N'Agregar variantes: se suma al producto con su existencia inicial y bitácora', N'3|4|1', @Texto;

-- Precio: cambia, repetirlo no hace nada, historial del más reciente al más antiguo.
INSERT INTO dbo.HistorialPrecio (IDVariante, PrecioAnterior, PrecioNuevo, IDUsuario, Fecha)
VALUES (@IDRojoS, NULL, 100.00, @IDAdmin, DATEADD(DAY, -1, SYSUTCDATETIME()));
SET @Version = (SELECT VersionFila FROM dbo.Variante WHERE IDVariante = @IDRojoS);
DELETE FROM #Producto;
EXECUTE AS USER = @Api;
INSERT INTO #Producto EXEC dbo.SP_Catalogo_CambiarPrecio @IDAdmin, @IDRojoS, 89.90, @Version;
REVERT;
SET @Version = (SELECT VersionFila FROM dbo.Variante WHERE IDVariante = @IDRojoS);
EXECUTE AS USER = @Api;
INSERT INTO #Producto EXEC dbo.SP_Catalogo_CambiarPrecio @IDAdmin, @IDRojoS, 89.90, @Version;
INSERT INTO #Historial EXEC dbo.SP_Catalogo_ListarHistorialPrecios @IDAdmin, @IDRojoS;
REVERT;
SET @Texto = (SELECT STRING_AGG(CONCAT(ISNULL(CAST(PrecioAnterior AS NVARCHAR(20)), N'NULL'), N'>', PrecioNuevo, N':', Usuario), N',')
                     WITHIN GROUP (ORDER BY Fecha DESC, IDHistorialPrecio DESC)
              FROM #Historial);
SET @Texto += N'|' + CAST((SELECT COUNT(*) FROM dbo.Bitacora WHERE IDUsuario = @IDAdmin AND Entidad = 'Variante' AND Accion = 'MODIFICAR'
                             AND JSON_VALUE(ValorNuevo, '$.Precio') IS NOT NULL) AS NVARCHAR(10));
EXEC #Verificar N'Cambiar precio: historial y bitácora una sola vez (repetir el precio no cambia nada)',
     N'100.00>89.90:Admin Productos,NULL>100.00:Admin Productos|1', @Texto;

-- SKU y estado de la variante.
SET @Version = (SELECT VersionFila FROM dbo.Variante WHERE IDVariante = @IDAzulS);
DELETE FROM #Producto;
EXECUTE AS USER = @Api;
INSERT INTO #Producto EXEC dbo.SP_Catalogo_ActualizarVariante @IDAdmin, @IDAzulS, ' prueba-azul-chica ', @Version;
INSERT INTO #Producto EXEC dbo.SP_Catalogo_CambiarEstadoVariante @IDAdmin, @IDAzulS, 0;
INSERT INTO #Producto EXEC dbo.SP_Catalogo_CambiarEstadoVariante @IDAdmin, @IDAzulS, 0;
REVERT;
SET @Texto = (SELECT CONCAT(v.SKU, N'|', CAST(v.Activo AS INT)) FROM dbo.Variante AS v WHERE v.IDVariante = @IDAzulS);
SET @Texto += N'|' + (SELECT STRING_AGG(Accion, ',') WITHIN GROUP (ORDER BY IDBitacora) FROM dbo.Bitacora
                      WHERE IDUsuario = @IDAdmin AND Entidad = 'Variante' AND IDEntidad = CAST(@IDAzulS AS VARCHAR(50)));
EXEC #Verificar N'Variante: SKU normalizado y desactivar (repetir no genera bitácora)', N'PRUEBA-AZUL-CHICA|0|MODIFICAR,DESACTIVAR', @Texto;

-- Agotada no es desactivada: la selección inicial salta a la primera variante disponible.
UPDATE dbo.Variante SET ExistenciaFisica = 0 WHERE IDVariante = @IDRojoS;
DELETE FROM #Producto;
EXECUTE AS USER = @Api;
INSERT INTO #Producto EXEC dbo.SP_Catalogo_ObtenerProductoAdmin @IDAdmin, @IDPlayera;
REVERT;
SET @Texto = (SELECT STRING_AGG(CONCAT(JSON_VALUE(j.value, '$.SKU'), N':', JSON_VALUE(j.value, '$.Disponible'), N':',
                                       JSON_VALUE(j.value, '$.Activo'),
                                       CASE JSON_VALUE(j.value, '$.EsSeleccionInicial') WHEN 'true' THEN N'*' END), N',')
                     WITHIN GROUP (ORDER BY CAST(j.[key] AS INT))
              FROM #Producto AS p CROSS APPLY OPENJSON(p.Variantes) AS j);
EXEC #Verificar N'Obtener producto: la agotada sigue listada y la selección inicial es la primera disponible',
     N'PRUEBA-ROJO-S:0:true,PRUEBA-ROJO-M:4:true*,PRUEBA-AZUL-CHICA:0:false', @Texto;

-- Desactivar y reactivar el producto.
DELETE FROM #Producto;
EXECUTE AS USER = @Api;
INSERT INTO #Producto EXEC dbo.SP_Catalogo_CambiarEstadoProducto @IDAdmin, @IDPlayera, 0;
INSERT INTO #Producto EXEC dbo.SP_Catalogo_CambiarEstadoProducto @IDAdmin, @IDPlayera, 1;
REVERT;
SET @Texto = (SELECT STRING_AGG(CAST(Activo AS NVARCHAR(1)), N',') FROM #Producto);
SET @Texto += N'|' + (SELECT STRING_AGG(Accion, ',') WITHIN GROUP (ORDER BY IDBitacora) FROM dbo.Bitacora
                      WHERE IDUsuario = @IDAdmin AND Entidad = 'Producto' AND Accion IN ('ACTIVAR', 'DESACTIVAR'));
EXEC #Verificar N'Estado del producto: desactivar y reactivar', N'0,1|DESACTIVAR,ACTIVAR', @Texto;

-- Listado del panel: búsqueda por SKU y resumen de variantes activas.
DELETE FROM #Lista;
EXECUTE AS USER = @Api;
INSERT INTO #Lista EXEC dbo.SP_Catalogo_ListarProductos @IDAdmin, NULL, NULL, N'prueba-rojo', 1, 20, @Total OUTPUT;
REVERT;
SET @Texto = (SELECT CONCAT(@Total, N'|', Nombre, N'|', VariantesTotales, N':', VariantesActivas, N'|', PrecioMinimo, N'-', PrecioMaximo,
                            N'|', ExistenciaTotal, N'|', ImagenPrincipal) FROM #Lista);
EXEC #Verificar N'Listar productos: busca por SKU y resume las variantes activas',
     N'1|Playera Prueba Editada|3:2|89.90-105.00|4|/uploads/productos/prueba-playera.webp', @Texto;
ROLLBACK TRANSACTION;

/* === Imágenes ============================================================================ */
DELETE FROM @Imagenes; DELETE FROM #Producto;
BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDAdmin = IDAdmin, @IDPlayera = IDPlayera, @IDRojo = IDRojo, @IDImagen = IDImagen FROM #Base;

INSERT INTO @Imagenes VALUES (1, N'/uploads/productos/prueba-general-2.webp', N'Playera de frente', NULL, 2, 1),
                             (2, N'/uploads/productos/prueba-rojo-1.webp', N'Playera roja', @IDRojo, 1, 0),
                             (3, N'/uploads/productos/prueba-rojo-2.webp', N'Playera roja espalda', @IDRojo, 2, 0);
EXECUTE AS USER = @Api;
INSERT INTO #Producto EXEC dbo.SP_Catalogo_AgregarImagenes @IDAdmin, @IDPlayera, @Imagenes;
REVERT;
SET @Texto = (SELECT STRING_AGG(CONCAT(REPLACE(pi.RutaImagen, N'/uploads/productos/', N''), N':', CAST(pi.EsPrincipal AS INT)), N',')
                     WITHIN GROUP (ORDER BY pi.RutaImagen)
              FROM dbo.ProductoImagen AS pi WHERE pi.IDProducto = @IDPlayera);
EXEC #Verificar N'Agregar imágenes: la nueva principal reemplaza a la general; el grupo rojo toma la de menor orden',
     N'prueba-general-2.webp:1,prueba-playera.webp:0,prueba-rojo-1.webp:1,prueba-rojo-2.webp:0', @Texto;

SET @IDImagenRojo = (SELECT IDProductoImagen FROM dbo.ProductoImagen WHERE RutaImagen = N'/uploads/productos/prueba-rojo-2.webp');
DELETE FROM #Producto;
EXECUTE AS USER = @Api;
INSERT INTO #Producto EXEC dbo.SP_Catalogo_EstablecerImagenPrincipal @IDAdmin, @IDImagenRojo;
INSERT INTO #Producto EXEC dbo.SP_Catalogo_ActualizarImagen @IDAdmin, @IDImagenRojo, N' Espalda ', 0;
REVERT;
SET @Texto = (SELECT STRING_AGG(CONCAT(REPLACE(pi.RutaImagen, N'/uploads/productos/', N''), N':', CAST(pi.EsPrincipal AS INT), N':',
                                       pi.TextoAlternativo, N':', pi.Orden), N',') WITHIN GROUP (ORDER BY pi.RutaImagen)
              FROM dbo.ProductoImagen AS pi WHERE pi.IDProducto = @IDPlayera AND pi.IDAtributoValor IS NOT NULL);
EXEC #Verificar N'Imagen: establecer principal en su grupo y actualizar texto y orden',
     N'prueba-rojo-1.webp:0:Playera roja:1,prueba-rojo-2.webp:1:Espalda:0', @Texto;

-- Eliminar la principal: el grupo promueve la siguiente y se devuelve la ruta para borrar el archivo.
DELETE FROM #Eliminada;
EXECUTE AS USER = @Api;
INSERT INTO #Eliminada EXEC dbo.SP_Catalogo_EliminarImagen @IDAdmin, @IDImagenRojo;
REVERT;
SET @Texto = (SELECT CONCAT(RutaImagen, N'|') FROM #Eliminada);
SET @Texto += (SELECT STRING_AGG(CONCAT(REPLACE(pi.RutaImagen, N'/uploads/productos/', N''), N':', CAST(pi.EsPrincipal AS INT)), N',')
               FROM dbo.ProductoImagen AS pi WHERE pi.IDProducto = @IDPlayera AND pi.IDAtributoValor IS NOT NULL);
SET @Texto += N'|' + (SELECT JSON_VALUE(ValorAnterior, '$.ImagenEliminada.RutaImagen') FROM dbo.Bitacora
                      WHERE IDUsuario = @IDAdmin AND Entidad = 'Producto' AND Accion = 'MODIFICAR');
EXEC #Verificar N'Eliminar imagen: devuelve la ruta, promueve la siguiente y queda en bitácora',
     N'/uploads/productos/prueba-rojo-2.webp|prueba-rojo-1.webp:1|/uploads/productos/prueba-rojo-2.webp', @Texto;
ROLLBACK TRANSACTION;

/* === Casos de error ====================================================================== */
DECLARE @D NVARCHAR(MAX) = N'
DECLARE @Admin INT, @Operador INT, @Ropa INT, @RopaDos INT, @Hogar INT, @Calzado INT, @Talla INT, @Color INT, @Material INT,
        @S INT, @M INT, @L INT, @Rojo INT, @Azul INT, @Verde INT, @Algodon INT, @Playera INT, @Taza INT, @RojoS INT, @AzulS INT,
        @VarTaza INT, @Imagen INT, @VP BINARY(8), @VR BINARY(8), @Total INT;
DECLARE @Va dbo.TT_Catalogo_Variante, @At dbo.TT_Catalogo_VarianteAtributo, @Im dbo.TT_Catalogo_ProductoImagen;
SELECT @Admin = IDAdmin, @Operador = IDOperador, @Ropa = IDRopa, @RopaDos = IDRopaDos, @Hogar = IDHogar, @Calzado = IDCalzado,
       @Talla = IDTalla, @Color = IDColor, @Material = IDMaterial, @S = IDS, @M = IDM, @L = IDL, @Rojo = IDRojo, @Azul = IDAzul,
       @Verde = IDVerde, @Algodon = IDAlgodon, @Playera = IDPlayera, @Taza = IDTaza, @RojoS = IDRojoS, @AzulS = IDAzulS,
       @VarTaza = IDVarTaza, @Imagen = IDImagen, @VP = VersionPlayera, @VR = VersionRojoS
FROM #Base;
';
-- Alta válida de base para los casos de CrearProducto: una variante Rojo/M en Ropa.
DECLARE @Alta NVARCHAR(MAX) = N'EXEC dbo.SP_Catalogo_CrearProducto @Admin, @Ropa, N''Nueva Prueba'', ''nueva-prueba'', NULL, @Va, @At, @Im;';
DECLARE @VarianteOk NVARCHAR(MAX) = N'INSERT INTO @Va VALUES (1, ''NUEVA-1'', 10, 1); INSERT INTO @At VALUES (1, @Talla, @M), (1, @Color, @Rojo);';

DECLARE @Errores TABLE (Orden INT IDENTITY, Descripcion NVARCHAR(300), Esperado INT, Sql NVARCHAR(MAX), Preparacion NVARCHAR(MAX));
INSERT INTO @Errores (Descripcion, Esperado, Sql, Preparacion) VALUES
    -- Alta: permisos y datos del producto
    (N'Crear producto: un operador → PERMISO_DENEGADO', 50201,
        @VarianteOk + N'EXEC dbo.SP_Catalogo_CrearProducto @Operador, @Ropa, N''Nueva'', ''nueva'', NULL, @Va, @At, @Im;', NULL),
    (N'Crear producto: sin categoría → PARAMETRO_REQUERIDO', 50006,
        @VarianteOk + N'EXEC dbo.SP_Catalogo_CrearProducto @Admin, NULL, N''Nueva'', ''nueva'', NULL, @Va, @At, @Im;', NULL),
    (N'Crear producto: categoría inexistente → CATEGORIA_NO_ENCONTRADA', 50102,
        @VarianteOk + N'EXEC dbo.SP_Catalogo_CrearProducto @Admin, -1, N''Nueva'', ''nueva'', NULL, @Va, @At, @Im;', NULL),
    (N'Crear producto: nombre vacío → NOMBRE_INVALIDO', 50003,
        @VarianteOk + N'EXEC dbo.SP_Catalogo_CrearProducto @Admin, @Ropa, N'' '', ''nueva'', NULL, @Va, @At, @Im;', NULL),
    (N'Crear producto: nombre de 201 caracteres → NOMBRE_INVALIDO', 50003,
        @VarianteOk + N'EXEC dbo.SP_Catalogo_CrearProducto @Admin, @Ropa, N''' + REPLICATE(N'x', 201) + N''', ''nueva'', NULL, @Va, @At, @Im;', NULL),
    (N'Crear producto: slug con punto → SLUG_INVALIDO', 50009,
        @VarianteOk + N'EXEC dbo.SP_Catalogo_CrearProducto @Admin, @Ropa, N''Nueva'', ''nueva.prueba'', NULL, @Va, @At, @Im;', NULL),
    (N'Crear producto: slug de 221 caracteres → SLUG_INVALIDO', 50009,
        @VarianteOk + N'EXEC dbo.SP_Catalogo_CrearProducto @Admin, @Ropa, N''Nueva'', ''' + REPLICATE('a', 221) + N''', NULL, @Va, @At, @Im;', NULL),
    (N'Crear producto: descripción de 4001 caracteres → DESCRIPCION_INVALIDA', 50010,
        @VarianteOk + N'DECLARE @Larga NVARCHAR(MAX) = REPLICATE(CAST(N''d'' AS NVARCHAR(MAX)), 4001);
          EXEC dbo.SP_Catalogo_CrearProducto @Admin, @Ropa, N''Nueva'', ''nueva'', @Larga, @Va, @At, @Im;', NULL),
    (N'Crear producto: slug de otro producto → SLUG_REGISTRADO', 51202,
        @VarianteOk + N'EXEC dbo.SP_Catalogo_CrearProducto @Admin, @Ropa, N''Nueva'', ''playera-prueba'', NULL, @Va, @At, @Im;', NULL),
    (N'Crear producto: sin variantes → VARIANTES_REQUERIDAS', 50013, @Alta, NULL),
    (N'Crear producto: falta INVENTARIO_INICIAL → CONFIGURACION_INCOMPLETA', 59001, @VarianteOk + @Alta,
        N'UPDATE dbo.TipoMovimiento SET Codigo = ''INVENTARIO_INICIAL_X'' WHERE Codigo = ''INVENTARIO_INICIAL'';'),
    -- Alta: variantes
    (N'Variantes: SKU de 2 caracteres → SKU_INVALIDO', 50014,
        N'INSERT INTO @Va VALUES (1, ''AB'', 10, 0); INSERT INTO @At VALUES (1, @Talla, @M), (1, @Color, @Rojo);' + @Alta, NULL),
    (N'Variantes: SKU con espacio interno → SKU_INVALIDO', 50014,
        N'INSERT INTO @Va VALUES (1, ''AB CD'', 10, 0); INSERT INTO @At VALUES (1, @Talla, @M), (1, @Color, @Rojo);' + @Alta, NULL),
    (N'Variantes: SKU con tilde → SKU_INVALIDO', 50014,
        N'INSERT INTO @Va VALUES (1, ''CAMIÓN-1'', 10, 0); INSERT INTO @At VALUES (1, @Talla, @M), (1, @Color, @Rojo);' + @Alta, NULL),
    (N'Variantes: precio 0 → PRECIO_INVALIDO', 50015,
        N'INSERT INTO @Va VALUES (1, ''NUEVA-1'', 0, 0); INSERT INTO @At VALUES (1, @Talla, @M), (1, @Color, @Rojo);' + @Alta, NULL),
    (N'Variantes: existencia negativa → EXISTENCIA_INVALIDA', 50016,
        N'INSERT INTO @Va VALUES (1, ''NUEVA-1'', 10, -1); INSERT INTO @At VALUES (1, @Talla, @M), (1, @Color, @Rojo);' + @Alta, NULL),
    (N'Variantes: atributos de una línea que no existe → COMBINACION_INCOMPLETA', 50019,
        @VarianteOk + N'INSERT INTO @At VALUES (2, @Talla, @S);' + @Alta, NULL),
    (N'Variantes: atributo que la categoría no tiene → ATRIBUTO_NO_PERMITIDO', 50017,
        @VarianteOk + N'INSERT INTO @At VALUES (1, @Material, @Algodon);' + @Alta, NULL),
    (N'Variantes: atributo desactivado → ATRIBUTO_NO_PERMITIDO', 50017, @VarianteOk + @Alta,
        N'UPDATE dbo.Atributo SET Activo = 0 WHERE IDAtributo = (SELECT IDColor FROM #Base);'),
    (N'Variantes: valor de otro atributo (Rojo como Talla) → VALOR_INVALIDO', 50018,
        N'INSERT INTO @Va VALUES (1, ''NUEVA-1'', 10, 0); INSERT INTO @At VALUES (1, @Talla, @Rojo), (1, @Color, @Rojo);' + @Alta, NULL),
    (N'Variantes: valor desactivado → VALOR_INVALIDO', 50018,
        N'INSERT INTO @Va VALUES (1, ''NUEVA-1'', 10, 0); INSERT INTO @At VALUES (1, @Talla, @M), (1, @Color, @Verde);' + @Alta, NULL),
    (N'Variantes: distintos atributos entre variantes → COMBINACION_INCOMPLETA', 50019,
        @VarianteOk + N'INSERT INTO @Va VALUES (2, ''NUEVA-2'', 10, 0); INSERT INTO @At VALUES (2, @Color, @Azul);' + @Alta, NULL),
    (N'Variantes: dos variantes y una sin atributos → COMBINACION_INCOMPLETA', 50019,
        N'INSERT INTO @Va VALUES (1, ''NUEVA-1'', 10, 0), (2, ''NUEVA-2'', 10, 0);
          EXEC dbo.SP_Catalogo_CrearProducto @Admin, @Hogar, N''Nueva'', ''nueva'', NULL, @Va, @At, @Im;', NULL),
    (N'Variantes: SKU repetido en la lista → SKU_REGISTRADO', 51205,
        @VarianteOk + N'INSERT INTO @Va VALUES (2, ''nueva-1'', 10, 0); INSERT INTO @At VALUES (2, @Talla, @S), (2, @Color, @Rojo);' + @Alta, NULL),
    (N'Variantes: SKU de otro producto (en minúsculas) → SKU_REGISTRADO', 51205,
        N'INSERT INTO @Va VALUES (1, '' prueba-rojo-s'', 10, 0); INSERT INTO @At VALUES (1, @Talla, @M), (1, @Color, @Rojo);' + @Alta, NULL),
    (N'Variantes: combinación repetida en la lista → COMBINACION_REPETIDA', 51206,
        @VarianteOk + N'INSERT INTO @Va VALUES (2, ''NUEVA-2'', 10, 0); INSERT INTO @At VALUES (2, @Color, @Rojo), (2, @Talla, @M);' + @Alta, NULL),
    -- Alta: imágenes
    (N'Imágenes: ruta fuera de /uploads → IMAGEN_INVALIDA', 50020,
        @VarianteOk + N'INSERT INTO @Im VALUES (1, N''/otra/carpeta/a.webp'', N''Texto'', NULL, 1, 0);' + @Alta, NULL),
    (N'Imágenes: ruta con .. → IMAGEN_INVALIDA', 50020,
        @VarianteOk + N'INSERT INTO @Im VALUES (1, N''/uploads/../secreto.webp'', N''Texto'', NULL, 1, 0);' + @Alta, NULL),
    (N'Imágenes: texto alternativo vacío → IMAGEN_INVALIDA', 50020,
        @VarianteOk + N'INSERT INTO @Im VALUES (1, N''/uploads/productos/a.webp'', N''  '', NULL, 1, 0);' + @Alta, NULL),
    (N'Imágenes: valor que ninguna variante usa → IMAGEN_INVALIDA', 50020,
        @VarianteOk + N'INSERT INTO @Im VALUES (1, N''/uploads/productos/a.webp'', N''Azul'', @Azul, 1, 0);' + @Alta, NULL),
    (N'Imágenes: por valor de dos atributos distintos → IMAGEN_INVALIDA', 50020,
        @VarianteOk + N'INSERT INTO @Im VALUES (1, N''/uploads/productos/a.webp'', N''Rojo'', @Rojo, 1, 0),
                                               (2, N''/uploads/productos/b.webp'', N''Mediana'', @M, 1, 0);' + @Alta, NULL),
    (N'Imágenes: dos principales en el mismo grupo → IMAGEN_INVALIDA', 50020,
        @VarianteOk + N'INSERT INTO @Im VALUES (1, N''/uploads/productos/a.webp'', N''A'', NULL, 1, 1),
                                               (2, N''/uploads/productos/b.webp'', N''B'', NULL, 2, 1);' + @Alta, NULL),
    (N'Imágenes: ruta que ya existe → IMAGEN_REGISTRADA', 51210,
        @VarianteOk + N'INSERT INTO @Im VALUES (1, N''/uploads/productos/prueba-playera.webp'', N''A'', NULL, 1, 0);' + @Alta, NULL),
    -- Agregar variantes
    (N'Agregar variantes: producto inexistente → PRODUCTO_NO_ENCONTRADO', 50105,
        @VarianteOk + N'EXEC dbo.SP_Catalogo_AgregarVariantes @Admin, -1, @Va, @At;', NULL),
    (N'Agregar variantes: combinación que ya tiene (Rojo/S) → COMBINACION_REPETIDA', 51206,
        N'INSERT INTO @Va VALUES (1, ''NUEVA-1'', 10, 0); INSERT INTO @At VALUES (1, @Talla, @S), (1, @Color, @Rojo);
          EXEC dbo.SP_Catalogo_AgregarVariantes @Admin, @Playera, @Va, @At;', NULL),
    (N'Agregar variantes: combinación de una variante desactivada → COMBINACION_REPETIDA', 51206,
        N'INSERT INTO @Va VALUES (1, ''NUEVA-1'', 10, 0); INSERT INTO @At VALUES (1, @Talla, @S), (1, @Color, @Azul);
          EXEC dbo.SP_Catalogo_AgregarVariantes @Admin, @Playera, @Va, @At;',
        N'UPDATE dbo.Variante SET Activo = 0 WHERE IDVariante = (SELECT IDAzulS FROM #Base);'),
    (N'Agregar variantes: sin los atributos de las actuales → COMBINACION_INCOMPLETA', 50019,
        N'INSERT INTO @Va VALUES (1, ''NUEVA-1'', 10, 0); INSERT INTO @At VALUES (1, @Color, @Azul);
          EXEC dbo.SP_Catalogo_AgregarVariantes @Admin, @Playera, @Va, @At;', NULL),
    (N'Agregar variantes: segunda variante sin atributos a un producto simple → COMBINACION_INCOMPLETA', 50019,
        N'INSERT INTO @Va VALUES (1, ''NUEVA-1'', 10, 0); EXEC dbo.SP_Catalogo_AgregarVariantes @Admin, @Taza, @Va, @At;', NULL),
    (N'Agregar variantes: un operador → PERMISO_DENEGADO', 50201,
        @VarianteOk + N'EXEC dbo.SP_Catalogo_AgregarVariantes @Operador, @Playera, @Va, @At;', NULL),
    -- Actualizar producto
    (N'Actualizar producto: versión vieja → EDICION_CONCURRENTE', 51203,
        N'EXEC dbo.SP_Catalogo_ActualizarProducto @Admin, @Playera, @Ropa, N''Playera'', ''playera-prueba'', NULL, @VP;',
        N'UPDATE dbo.Producto SET Descripcion = N''otro cambio'' WHERE IDProducto = (SELECT IDPlayera FROM #Base);'),
    (N'Actualizar producto: categoría que no admite Color → CATEGORIA_INCOMPATIBLE', 51207,
        N'EXEC dbo.SP_Catalogo_ActualizarProducto @Admin, @Playera, @Calzado, N''Playera'', ''playera-prueba'', NULL, @VP;', NULL),
    (N'Actualizar producto: categoría inexistente → CATEGORIA_NO_ENCONTRADA', 50102,
        N'EXEC dbo.SP_Catalogo_ActualizarProducto @Admin, @Playera, -1, N''Playera'', ''playera-prueba'', NULL, @VP;', NULL),
    (N'Actualizar producto: inexistente → PRODUCTO_NO_ENCONTRADO', 50105,
        N'EXEC dbo.SP_Catalogo_ActualizarProducto @Admin, -1, @Ropa, N''Playera'', ''playera-prueba'', NULL, @VP;', NULL),
    (N'Actualizar producto: slug de otro producto → SLUG_REGISTRADO', 51202,
        N'EXEC dbo.SP_Catalogo_ActualizarProducto @Admin, @Playera, @Ropa, N''Playera'', ''taza-prueba'', NULL, @VP;', NULL),
    (N'Actualizar producto: sin versión → PARAMETRO_REQUERIDO', 50006,
        N'EXEC dbo.SP_Catalogo_ActualizarProducto @Admin, @Playera, @Ropa, N''Playera'', ''playera-prueba'', NULL, NULL;', NULL),
    -- Estado del producto
    (N'Activar producto sin imágenes → PRODUCTO_SIN_IMAGEN', 51208,
        N'EXEC dbo.SP_Catalogo_CambiarEstadoProducto @Admin, @Taza, 1;', NULL),
    (N'Activar producto sin variantes activas → PRODUCTO_SIN_VARIANTES', 51209,
        N'EXEC dbo.SP_Catalogo_CambiarEstadoProducto @Admin, @Playera, 1;',
        N'UPDATE dbo.Producto SET Activo = 0 WHERE IDProducto = (SELECT IDPlayera FROM #Base);
          UPDATE dbo.Variante SET Activo = 0 WHERE IDProducto = (SELECT IDPlayera FROM #Base);'),
    (N'Estado de producto: inexistente → PRODUCTO_NO_ENCONTRADO', 50105,
        N'EXEC dbo.SP_Catalogo_CambiarEstadoProducto @Admin, -1, 0;', NULL),
    (N'Obtener producto: inexistente → PRODUCTO_NO_ENCONTRADO', 50105,
        N'EXEC dbo.SP_Catalogo_ObtenerProductoAdmin @Admin, -1;', NULL),
    (N'Obtener producto: un operador → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Catalogo_ObtenerProductoAdmin @Operador, @Playera;', NULL),
    -- Variantes
    (N'Desactivar la última variante activa de un producto activo → PRODUCTO_SIN_VARIANTES', 51209,
        N'EXEC dbo.SP_Catalogo_CambiarEstadoVariante @Admin, @RojoS, 0;',
        N'UPDATE dbo.Variante SET Activo = 0 WHERE IDVariante = (SELECT IDAzulS FROM #Base);'),
    (N'Desactivar la única variante de un producto inactivo → permitido', 0,
        N'INSERT INTO #Producto EXEC dbo.SP_Catalogo_CambiarEstadoVariante @Admin, @VarTaza, 0;', NULL),
    (N'Estado de variante: inexistente → VARIANTE_NO_ENCONTRADA', 50106,
        N'EXEC dbo.SP_Catalogo_CambiarEstadoVariante @Admin, -1, 0;', NULL),
    (N'Actualizar variante: SKU inválido → SKU_INVALIDO', 50014,
        N'EXEC dbo.SP_Catalogo_ActualizarVariante @Admin, @RojoS, ''A_B_C'', @VR;', NULL),
    (N'Actualizar variante: SKU de otra variante → SKU_REGISTRADO', 51205,
        N'EXEC dbo.SP_Catalogo_ActualizarVariante @Admin, @RojoS, ''prueba-taza'', @VR;', NULL),
    (N'Actualizar variante: versión vieja → EDICION_CONCURRENTE', 51203,
        N'EXEC dbo.SP_Catalogo_ActualizarVariante @Admin, @RojoS, ''PRUEBA-OTRO'', 0x0000000000000001;', NULL),
    (N'Actualizar variante: inexistente → VARIANTE_NO_ENCONTRADA', 50106,
        N'EXEC dbo.SP_Catalogo_ActualizarVariante @Admin, -1, ''PRUEBA-OTRO'', @VR;', NULL),
    (N'Cambiar precio: 0 → PRECIO_INVALIDO', 50015,
        N'EXEC dbo.SP_Catalogo_CambiarPrecio @Admin, @RojoS, 0, @VR;', NULL),
    (N'Cambiar precio: NULL → PRECIO_INVALIDO', 50015,
        N'EXEC dbo.SP_Catalogo_CambiarPrecio @Admin, @RojoS, NULL, @VR;', NULL),
    (N'Cambiar precio: otro lo cambió antes → EDICION_CONCURRENTE', 51203,
        N'EXEC dbo.SP_Catalogo_CambiarPrecio @Admin, @RojoS, 80, @VR;',
        N'UPDATE dbo.Variante SET Precio = 95 WHERE IDVariante = (SELECT IDRojoS FROM #Base);'),
    (N'Cambiar precio: inexistente → VARIANTE_NO_ENCONTRADA', 50106,
        N'EXEC dbo.SP_Catalogo_CambiarPrecio @Admin, -1, 80, @VR;', NULL),
    (N'Cambiar precio: un operador → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Catalogo_CambiarPrecio @Operador, @RojoS, 80, @VR;', NULL),
    (N'Historial de precios: variante inexistente → VARIANTE_NO_ENCONTRADA', 50106,
        N'EXEC dbo.SP_Catalogo_ListarHistorialPrecios @Admin, -1;', NULL),
    -- Imágenes
    (N'Agregar imágenes: lista vacía → PARAMETRO_REQUERIDO', 50006,
        N'EXEC dbo.SP_Catalogo_AgregarImagenes @Admin, @Playera, @Im;', NULL),
    (N'Agregar imágenes: producto inexistente → PRODUCTO_NO_ENCONTRADO', 50105,
        N'INSERT INTO @Im VALUES (1, N''/uploads/productos/a.webp'', N''A'', NULL, 1, 0);
          EXEC dbo.SP_Catalogo_AgregarImagenes @Admin, -1, @Im;', NULL),
    (N'Agregar imágenes: de otro atributo que las existentes → IMAGEN_INVALIDA', 50020,
        N'INSERT INTO @Im VALUES (1, N''/uploads/productos/a.webp'', N''Chica'', @S, 1, 0);
          EXEC dbo.SP_Catalogo_AgregarImagenes @Admin, @Playera, @Im;',
        N'INSERT INTO dbo.ProductoImagen (IDProducto, IDAtributoValor, RutaImagen, TextoAlternativo, Orden, EsPrincipal)
          SELECT IDPlayera, IDRojo, N''/uploads/productos/prueba-rojo.webp'', N''Roja'', 1, 1 FROM #Base;'),
    (N'Actualizar imagen: texto vacío → IMAGEN_INVALIDA', 50020,
        N'EXEC dbo.SP_Catalogo_ActualizarImagen @Admin, @Imagen, N'' '', 1;', NULL),
    (N'Actualizar imagen: orden 300 → ORDEN_INVALIDO', 50012,
        N'EXEC dbo.SP_Catalogo_ActualizarImagen @Admin, @Imagen, N''Texto'', 300;', NULL),
    (N'Actualizar imagen: inexistente → IMAGEN_NO_ENCONTRADA', 50107,
        N'EXEC dbo.SP_Catalogo_ActualizarImagen @Admin, -1, N''Texto'', 1;', NULL),
    (N'Imagen principal: inexistente → IMAGEN_NO_ENCONTRADA', 50107,
        N'EXEC dbo.SP_Catalogo_EstablecerImagenPrincipal @Admin, -1;', NULL),
    (N'Eliminar la última imagen de un producto activo → PRODUCTO_SIN_IMAGEN', 51208,
        N'EXEC dbo.SP_Catalogo_EliminarImagen @Admin, @Imagen;', NULL),
    (N'Eliminar imagen: inexistente → IMAGEN_NO_ENCONTRADA', 50107,
        N'EXEC dbo.SP_Catalogo_EliminarImagen @Admin, -1;', NULL),
    (N'Eliminar imagen: un operador → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Catalogo_EliminarImagen @Operador, @Imagen;', NULL),
    -- Listado
    (N'Listar productos: página 0 → PAGINACION_INVALIDA', 50007,
        N'EXEC dbo.SP_Catalogo_ListarProductos @Admin, NULL, NULL, NULL, 0, 20, @Total OUTPUT;', NULL),
    (N'Listar productos: búsqueda de 101 caracteres → BUSQUEDA_INVALIDA', 50008,
        N'EXEC dbo.SP_Catalogo_ListarProductos @Admin, NULL, NULL, N''' + REPLICATE(N'b', 101) + N''', 1, 20, @Total OUTPUT;', NULL);

DECLARE @Orden INT = 1, @Descripcion NVARCHAR(300), @Esperado INT, @Sql NVARCHAR(MAX), @Preparacion NVARCHAR(MAX);
WHILE @Orden <= (SELECT MAX(Orden) FROM @Errores)
BEGIN
    SELECT @Descripcion = Descripcion, @Esperado = Esperado, @Sql = @D + Sql, @Preparacion = Preparacion
    FROM @Errores WHERE Orden = @Orden;
    EXEC #EsperarError @Descripcion, @Esperado, @Sql, @Preparacion;
    SET @Orden += 1;
END;

/* Ningún caso dejó datos: todos se revirtieron. */
SET @Texto = (SELECT CONCAT(
                  (SELECT COUNT(*) FROM dbo.Producto WHERE Slug LIKE '%prueba%'), N'|',
                  (SELECT COUNT(*) FROM dbo.Variante WHERE SKU LIKE 'PRUEBA-%' OR SKU LIKE 'SUD-%' OR SKU LIKE 'NUEVA-%'), N'|',
                  (SELECT COUNT(*) FROM dbo.Usuario WHERE Correo LIKE N'%.productos@shopcart.test')));
EXEC #Verificar N'Limpieza: no quedan datos de prueba', N'0|0|0', @Texto;

/* --- Resultado ---------------------------------------------------------------------------- */
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = NULL;

IF CAST(SESSION_CONTEXT(N'PruebasFallidas') AS INT) > 0
    THROW 50000, N'Pruebas de procedimientos de catálogo (productos) fallidas.', 1;
EXEC sys.sp_set_session_context @key = N'PruebasFallidas', @value = NULL;
GO
