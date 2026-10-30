/*
    009_Procedimientos_CatalogoEstructura.sql
    Se ejecuta conectado como shopcart_migrator (deploy.ps1 -Probar). Igual que 008: el
    migrador prepara los datos y ejecuta cada SP haciéndose pasar por un miembro de RolApi.

    Los casos de error usan #EsperarError: prepara los datos en una transacción, ejecuta el
    SQL como la API, compara el número de error y revierte. El SQL de cada caso lee los IDs de
    la preparación desde #Base: la API no puede leer tablas, así que lo que se prepara como
    migrador va en @Preparacion. Los nombres llevan "Prueba" para no chocar con la semilla.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT OFF;
GO

-- Permite ejecutar el script varias veces en la misma conexión (p. ej. en SSMS).
DROP TABLE IF EXISTS #Contexto, #Base, #Categoria, #ListaCategorias, #Atributo, #ListaAtributos, #Valor;
DROP PROCEDURE IF EXISTS #Verificar;
DROP PROCEDURE IF EXISTS #Preparar;
DROP PROCEDURE IF EXISTS #EsperarError;
GO

CREATE TABLE #Contexto (UsuarioApi SYSNAME NOT NULL);
CREATE TABLE #Base (IDAdmin INT, IDOperador INT, IDRopa INT, IDHogar INT, IDTalla INT, IDColor INT, IDMaterial INT,
                    IDTallaS INT, IDTallaM INT, IDTallaL INT, IDRojo INT, IDAzul INT, IDProducto INT,
                    VersionHogar BINARY(8));

-- Resultados de los SPs (misma forma que devuelven).
CREATE TABLE #Categoria (IDCategoria INT, Nombre NVARCHAR(100), Slug VARCHAR(120), Descripcion NVARCHAR(500), Activo BIT,
                         FechaCreacion DATETIME2(3), FechaModificacion DATETIME2(3), VersionFila BINARY(8),
                         ProductosTotales INT, ProductosActivos INT, Atributos NVARCHAR(MAX));
CREATE TABLE #ListaCategorias (IDCategoria INT, Nombre NVARCHAR(100), Slug VARCHAR(120), Descripcion NVARCHAR(500), Activo BIT,
                               FechaCreacion DATETIME2(3), FechaModificacion DATETIME2(3),
                               ProductosTotales INT, ProductosActivos INT, Atributos NVARCHAR(MAX));
CREATE TABLE #Atributo (IDAtributo INT, Nombre NVARCHAR(50), Activo BIT, FechaCreacion DATETIME2(3),
                        CategoriasAsignadas INT, Valores NVARCHAR(MAX));
CREATE TABLE #ListaAtributos (IDAtributo INT, Nombre NVARCHAR(50), Activo BIT, FechaCreacion DATETIME2(3), Valores NVARCHAR(MAX));
CREATE TABLE #Valor (IDAtributoValor INT, IDAtributo INT, Valor NVARCHAR(50), Orden TINYINT, CodigoHex CHAR(7), Activo BIT);
GO

/*
    Compara como texto; muestra esperado y obtenido cuando no coinciden. Las fallas se cuentan
    en SESSION_CONTEXT y no en una tabla temporal: muchas verificaciones ocurren dentro de la
    transacción del caso, y su ROLLBACK borraría también el registro de la falla.
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
    Datos de cada caso: roles (si la semilla no los cargó), un administrador y un operador;
    atributos Talla (S, M, L) y Color (Rojo, Azul) y uno inactivo (Material); la categoría
    Ropa con Color y Talla, la categoría Hogar sin atributos, y un producto inactivo de Ropa
    con una variante Rojo/M (deja Color, Talla, Rojo y M en uso).
*/
CREATE PROCEDURE #Preparar
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Hash VARCHAR(255) = '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA';
    DECLARE @IDAdmin INT, @IDOperador INT, @IDRopa INT, @IDHogar INT, @IDTalla INT, @IDColor INT, @IDMaterial INT,
            @IDTallaS INT, @IDTallaM INT, @IDTallaL INT, @IDRojo INT, @IDAzul INT, @IDProducto INT, @IDVariante INT;

    INSERT INTO dbo.Rol (IDRol, Codigo, Nombre)
    SELECT v.IDRol, v.Codigo, v.Nombre
    FROM (VALUES (201, 'CLIENTE', N'Cliente'), (202, 'OPERADOR', N'Operador'), (203, 'ADMIN', N'Administrador'))
         AS v (IDRol, Codigo, Nombre)
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Rol AS r WHERE r.Codigo = v.Codigo);

    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'admin.catalogo@shopcart.test', @Hash, N'Admin', N'Catálogo' FROM dbo.Rol AS r WHERE r.Codigo = 'ADMIN';
    SET @IDAdmin = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'operador.catalogo@shopcart.test', @Hash, N'Operador', N'Catálogo' FROM dbo.Rol AS r WHERE r.Codigo = 'OPERADOR';
    SET @IDOperador = SCOPE_IDENTITY();

    INSERT INTO dbo.Atributo (Nombre) VALUES (N'Talla Prueba');
    SET @IDTalla = SCOPE_IDENTITY();
    INSERT INTO dbo.Atributo (Nombre) VALUES (N'Color Prueba');
    SET @IDColor = SCOPE_IDENTITY();
    INSERT INTO dbo.Atributo (Nombre, Activo) VALUES (N'Material Prueba', 0);
    SET @IDMaterial = SCOPE_IDENTITY();

    INSERT INTO dbo.AtributoValor (IDAtributo, Valor, Orden) VALUES (@IDTalla, N'S', 1);
    SET @IDTallaS = SCOPE_IDENTITY();
    INSERT INTO dbo.AtributoValor (IDAtributo, Valor, Orden) VALUES (@IDTalla, N'M', 2);
    SET @IDTallaM = SCOPE_IDENTITY();
    INSERT INTO dbo.AtributoValor (IDAtributo, Valor, Orden) VALUES (@IDTalla, N'L', 3);
    SET @IDTallaL = SCOPE_IDENTITY();
    INSERT INTO dbo.AtributoValor (IDAtributo, Valor, Orden, CodigoHex) VALUES (@IDColor, N'Rojo', 1, '#FF0000');
    SET @IDRojo = SCOPE_IDENTITY();
    INSERT INTO dbo.AtributoValor (IDAtributo, Valor, Orden, CodigoHex) VALUES (@IDColor, N'Azul', 2, '#0000FF');
    SET @IDAzul = SCOPE_IDENTITY();

    INSERT INTO dbo.Categoria (Nombre, Slug) VALUES (N'Ropa Prueba', 'ropa-prueba');
    SET @IDRopa = SCOPE_IDENTITY();
    INSERT INTO dbo.Categoria (Nombre, Slug) VALUES (N'Hogar Prueba', 'hogar-prueba');
    SET @IDHogar = SCOPE_IDENTITY();
    INSERT INTO dbo.CategoriaAtributo (IDCategoria, IDAtributo, Orden) VALUES (@IDRopa, @IDColor, 1), (@IDRopa, @IDTalla, 2);

    INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug) VALUES (@IDRopa, N'Playera Prueba', 'playera-prueba');
    SET @IDProducto = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ClaveCombinacion)
    VALUES (@IDProducto, 'PRUEBA-ROJO-M', 100.00, CONCAT(@IDTallaM, '|', @IDRojo));
    SET @IDVariante = SCOPE_IDENTITY();
    INSERT INTO dbo.VarianteAtributoValor (IDVariante, IDAtributo, IDAtributoValor)
    VALUES (@IDVariante, @IDTalla, @IDTallaM), (@IDVariante, @IDColor, @IDRojo);

    DELETE FROM #Base;
    INSERT INTO #Base VALUES (@IDAdmin, @IDOperador, @IDRopa, @IDHogar, @IDTalla, @IDColor, @IDMaterial,
                              @IDTallaS, @IDTallaM, @IDTallaL, @IDRojo, @IDAzul, @IDProducto,
                              (SELECT c.VersionFila FROM dbo.Categoria AS c WHERE c.IDCategoria = @IDHogar));
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
DECLARE @IDAdmin INT, @IDRopa INT, @IDHogar INT, @IDTalla INT, @IDColor INT, @IDMaterial INT, @IDAzul INT, @IDNuevo INT;
DECLARE @Texto NVARCHAR(400), @Version BINARY(8), @VersionNueva BINARY(8);
DECLARE @Atributos dbo.TT_Catalogo_CategoriaAtributo;

/* === Categorías: crear, actualizar y estado ============================================== */
BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDAdmin = IDAdmin, @IDRopa = IDRopa FROM #Base;

EXECUTE AS USER = @Api;
INSERT INTO #Categoria EXEC dbo.SP_Catalogo_CrearCategoria @IDAdmin, N'  Ropa Nueva  ', ' Ropa-Nueva ', N'   ';
REVERT;
SET @Texto = (SELECT CONCAT(Nombre, N'|', Slug, N'|', ISNULL(Descripcion, N'NULL'), N'|', CAST(Activo AS INT), N'|',
                            ProductosTotales, N'|', Atributos) FROM #Categoria);
EXEC #Verificar N'Crear categoría: textos recortados, slug en minúsculas, descripción vacía = NULL, activa y sin atributos',
     N'Ropa Nueva|ropa-nueva|NULL|1|0|[]', @Texto;
SET @Texto = (SELECT CONCAT(COUNT(*), N'|', MAX(JSON_VALUE(b.ValorNuevo, '$.Slug')))
              FROM dbo.Bitacora AS b JOIN #Categoria AS c ON b.IDEntidad = CAST(c.IDCategoria AS VARCHAR(50))
              WHERE b.IDUsuario = @IDAdmin AND b.Entidad = 'Categoria' AND b.Accion = 'CREAR');
EXEC #Verificar N'Crear categoría: bitácora CREAR con los datos guardados', N'1|ropa-nueva', @Texto;

-- Actualizar con la versión que vio el formulario.
DELETE FROM #Categoria;
EXECUTE AS USER = @Api;
INSERT INTO #Categoria EXEC dbo.SP_Catalogo_ObtenerCategoria @IDAdmin, @IDRopa;
REVERT;
SET @Version = (SELECT VersionFila FROM #Categoria);
DELETE FROM #Categoria;
EXECUTE AS USER = @Api;
INSERT INTO #Categoria EXEC dbo.SP_Catalogo_ActualizarCategoria @IDAdmin, @IDRopa, N'Ropa Prueba Editada', 'ropa-prueba-editada',
                                                                 N'Prendas', @Version;
REVERT;
SELECT @VersionNueva = VersionFila,
       @Texto = CONCAT(Nombre, N'|', Slug, N'|', Descripcion, N'|', CASE WHEN VersionFila <> @Version THEN N'versión nueva' END)
FROM #Categoria;
EXEC #Verificar N'Actualizar categoría: guarda los cambios y cambia la versión', N'Ropa Prueba Editada|ropa-prueba-editada|Prendas|versión nueva', @Texto;
SET @Texto = (SELECT CONCAT(COUNT(*), N'|', MAX(JSON_VALUE(b.ValorAnterior, '$.Nombre')), N'|', MAX(JSON_VALUE(b.ValorNuevo, '$.Nombre')))
              FROM dbo.Bitacora AS b WHERE b.IDUsuario = @IDAdmin AND b.Entidad = 'Categoria' AND b.Accion = 'MODIFICAR');
EXEC #Verificar N'Actualizar categoría: bitácora MODIFICAR con valor anterior y nuevo', N'1|Ropa Prueba|Ropa Prueba Editada', @Texto;

DELETE FROM #Categoria;
EXECUTE AS USER = @Api;
INSERT INTO #Categoria EXEC dbo.SP_Catalogo_ActualizarCategoria @IDAdmin, @IDRopa, N'Ropa Prueba Editada', 'ropa-prueba-editada',
                                                                 N'Prendas', @VersionNueva;
REVERT;
SET @Texto = (SELECT CONCAT(CASE WHEN VersionFila = @VersionNueva THEN N'misma versión' END, N'|',
                            (SELECT COUNT(*) FROM dbo.Bitacora AS b WHERE b.IDUsuario = @IDAdmin AND b.Accion = 'MODIFICAR'))
              FROM #Categoria);
EXEC #Verificar N'Actualizar categoría: los mismos valores no cambian la versión ni generan bitácora', N'misma versión|1', @Texto;

DELETE FROM #Categoria;
EXECUTE AS USER = @Api;
INSERT INTO #Categoria EXEC dbo.SP_Catalogo_ActualizarCategoria @IDAdmin, @IDRopa, N'ROPA PRUEBA EDITADA', 'ropa-prueba-editada',
                                                                 N'Prendas', @VersionNueva;
REVERT;
SET @Texto = (SELECT CONCAT(Nombre, N'|', (SELECT COUNT(*) FROM dbo.Bitacora AS b WHERE b.IDUsuario = @IDAdmin AND b.Accion = 'MODIFICAR'))
              FROM #Categoria);
EXEC #Verificar N'Actualizar categoría: un cambio solo de mayúsculas sí se guarda', N'ROPA PRUEBA EDITADA|2', @Texto;

-- Desactivar (aunque tenga productos), repetir y reactivar.
DELETE FROM #Categoria;
EXECUTE AS USER = @Api;
INSERT INTO #Categoria EXEC dbo.SP_Catalogo_CambiarEstadoCategoria @IDAdmin, @IDRopa, 0;
INSERT INTO #Categoria EXEC dbo.SP_Catalogo_CambiarEstadoCategoria @IDAdmin, @IDRopa, 0;
INSERT INTO #Categoria EXEC dbo.SP_Catalogo_CambiarEstadoCategoria @IDAdmin, @IDRopa, 1;
REVERT;
SET @Texto = (SELECT STRING_AGG(CAST(Activo AS NVARCHAR(1)), N',') FROM #Categoria);
SET @Texto += N'|' + (SELECT STRING_AGG(Accion, ',') WITHIN GROUP (ORDER BY IDBitacora)
                      FROM dbo.Bitacora WHERE IDUsuario = @IDAdmin AND Entidad = 'Categoria' AND Accion IN ('ACTIVAR', 'DESACTIVAR'));
EXEC #Verificar N'Estado de categoría: desactiva con productos, repetir no genera bitácora, reactiva', N'0,0,1|DESACTIVAR,ACTIVAR', @Texto;
ROLLBACK TRANSACTION;

/* === Categorías: atributos asignados ===================================================== */
BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDAdmin = IDAdmin, @IDRopa = IDRopa, @IDHogar = IDHogar, @IDTalla = IDTalla, @IDColor = IDColor FROM #Base;

DELETE FROM #Categoria;
EXECUTE AS USER = @Api;
INSERT INTO #Categoria EXEC dbo.SP_Catalogo_ObtenerCategoria @IDAdmin, @IDRopa;
REVERT;
SET @Texto = (SELECT CONCAT(ProductosTotales, N'|', ProductosActivos, N'|',
                            (SELECT STRING_AGG(CONCAT(JSON_VALUE(j.value, '$.Nombre'), N':', JSON_VALUE(j.value, '$.EnUso')), N',')
                                    WITHIN GROUP (ORDER BY CAST(j.[key] AS INT))
                             FROM OPENJSON(c.Atributos) AS j))
              FROM #Categoria AS c);
EXEC #Verificar N'Obtener categoría: conteo de productos y atributos en orden con EnUso',
     N'1|0|Color Prueba:true,Talla Prueba:true', @Texto;

INSERT INTO @Atributos VALUES (@IDTalla, 2), (@IDColor, 1);
DELETE FROM #Categoria;
EXECUTE AS USER = @Api;
INSERT INTO #Categoria EXEC dbo.SP_Catalogo_AsignarAtributosCategoria @IDAdmin, @IDHogar, @Atributos;
INSERT INTO #Categoria EXEC dbo.SP_Catalogo_AsignarAtributosCategoria @IDAdmin, @IDHogar, @Atributos;
REVERT;
SET @Texto = (SELECT TOP (1) (SELECT STRING_AGG(CONCAT(JSON_VALUE(j.value, '$.Nombre'), N':', JSON_VALUE(j.value, '$.EnUso')), N',')
                                     WITHIN GROUP (ORDER BY CAST(j.[key] AS INT))
                              FROM OPENJSON(c.Atributos) AS j) FROM #Categoria AS c);
SET @Texto += N'|' + CAST((SELECT COUNT(*) FROM dbo.Bitacora WHERE IDUsuario = @IDAdmin AND Entidad = 'Categoria' AND Accion = 'MODIFICAR') AS NVARCHAR(10));
EXEC #Verificar N'Asignar atributos: agrega en el orden indicado; repetir la misma lista no genera bitácora',
     N'Color Prueba:false,Talla Prueba:false|1', @Texto;

DELETE FROM @Atributos;
INSERT INTO @Atributos VALUES (@IDTalla, 1), (@IDColor, 2);
DELETE FROM #Categoria;
EXECUTE AS USER = @Api;
INSERT INTO #Categoria EXEC dbo.SP_Catalogo_AsignarAtributosCategoria @IDAdmin, @IDHogar, @Atributos;
REVERT;
SET @Texto = (SELECT (SELECT STRING_AGG(JSON_VALUE(j.value, '$.Nombre'), N',') WITHIN GROUP (ORDER BY CAST(j.[key] AS INT))
                      FROM OPENJSON(c.Atributos) AS j) FROM #Categoria AS c);
EXEC #Verificar N'Asignar atributos: cambia el orden', N'Talla Prueba,Color Prueba', @Texto;

DELETE FROM @Atributos;
DELETE FROM #Categoria;
EXECUTE AS USER = @Api;
INSERT INTO #Categoria EXEC dbo.SP_Catalogo_AsignarAtributosCategoria @IDAdmin, @IDHogar, @Atributos;
REVERT;
SET @Texto = (SELECT CONCAT(Atributos, N'|', (SELECT COUNT(*) FROM dbo.CategoriaAtributo WHERE IDCategoria = @IDHogar)) FROM #Categoria);
EXEC #Verificar N'Asignar atributos: una lista vacía quita los que no están en uso', N'[]|0', @Texto;

-- Un atributo ya asignado puede quedarse aunque se haya desactivado.
UPDATE dbo.Atributo SET Activo = 0 WHERE IDAtributo = @IDColor;
INSERT INTO @Atributos VALUES (@IDColor, 1), (@IDTalla, 2);
DELETE FROM #Categoria;
EXECUTE AS USER = @Api;
INSERT INTO #Categoria EXEC dbo.SP_Catalogo_AsignarAtributosCategoria @IDAdmin, @IDRopa, @Atributos;
REVERT;
SET @Texto = (SELECT (SELECT STRING_AGG(CONCAT(JSON_VALUE(j.value, '$.Nombre'), N':', JSON_VALUE(j.value, '$.Activo')), N',')
                             WITHIN GROUP (ORDER BY CAST(j.[key] AS INT))
                      FROM OPENJSON(c.Atributos) AS j) FROM #Categoria AS c);
EXEC #Verificar N'Asignar atributos: conserva un atributo desactivado que ya estaba asignado', N'Color Prueba:false,Talla Prueba:true', @Texto;

DELETE FROM #ListaCategorias;
EXECUTE AS USER = @Api;
INSERT INTO #ListaCategorias EXEC dbo.SP_Catalogo_ListarCategorias @IDAdmin;
REVERT;
SET @Texto = (SELECT STRING_AGG(CONCAT(l.Nombre, N':', l.ProductosTotales, N':', l.ProductosActivos, N':', j.Cantidad), N',')
                     WITHIN GROUP (ORDER BY l.Nombre)
              FROM #ListaCategorias AS l
              CROSS APPLY (SELECT COUNT(*) AS Cantidad FROM OPENJSON(l.Atributos)) AS j
              WHERE l.IDCategoria IN (@IDRopa, @IDHogar));
EXEC #Verificar N'Listar categorías: productos totales y activos, y cantidad de atributos', N'Hogar Prueba:0:0:0,Ropa Prueba:1:0:2', @Texto;
ROLLBACK TRANSACTION;

/* === Atributos =========================================================================== */
BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDAdmin = IDAdmin, @IDTalla = IDTalla FROM #Base;

EXECUTE AS USER = @Api;
INSERT INTO #Atributo EXEC dbo.SP_Catalogo_CrearAtributo @IDAdmin, N'  Almacenamiento Prueba ';
REVERT;
SELECT @IDNuevo = IDAtributo, @Texto = CONCAT(Nombre, N'|', CAST(Activo AS INT), N'|', CategoriasAsignadas, N'|', Valores) FROM #Atributo;
EXEC #Verificar N'Crear atributo: nombre recortado, activo, sin categorías ni valores', N'Almacenamiento Prueba|1|0|[]', @Texto;

DELETE FROM #Atributo;
EXECUTE AS USER = @Api;
INSERT INTO #Atributo EXEC dbo.SP_Catalogo_ActualizarAtributo @IDAdmin, @IDNuevo, N'Capacidad Prueba';
INSERT INTO #Atributo EXEC dbo.SP_Catalogo_ActualizarAtributo @IDAdmin, @IDNuevo, N'Capacidad Prueba';
INSERT INTO #Atributo EXEC dbo.SP_Catalogo_CambiarEstadoAtributo @IDAdmin, @IDNuevo, 0;
REVERT;
SET @Texto = (SELECT STRING_AGG(CONCAT(Nombre, N':', CAST(Activo AS INT)), N',') FROM #Atributo);
SET @Texto += N'|' + (SELECT STRING_AGG(Accion, ',') WITHIN GROUP (ORDER BY IDBitacora)
                      FROM dbo.Bitacora WHERE IDUsuario = @IDAdmin AND Entidad = 'Atributo');
EXEC #Verificar N'Atributo: renombrar (repetir no genera bitácora) y desactivar',
     N'Capacidad Prueba:1,Capacidad Prueba:1,Capacidad Prueba:0|CREAR,MODIFICAR,DESACTIVAR', @Texto;

DELETE FROM #Atributo;
EXECUTE AS USER = @Api;
INSERT INTO #Atributo EXEC dbo.SP_Catalogo_ObtenerAtributo @IDAdmin, @IDTalla;
REVERT;
SET @Texto = (SELECT CONCAT(CategoriasAsignadas, N'|',
                            (SELECT STRING_AGG(CONCAT(JSON_VALUE(j.value, '$.Valor'), N':', JSON_VALUE(j.value, '$.EnUso')), N',')
                                    WITHIN GROUP (ORDER BY CAST(j.[key] AS INT))
                             FROM OPENJSON(a.Valores) AS j))
              FROM #Atributo AS a);
EXEC #Verificar N'Obtener atributo: categorías asignadas y valores en orden con EnUso', N'1|S:false,M:true,L:false', @Texto;

DELETE FROM #ListaAtributos;
EXECUTE AS USER = @Api;
INSERT INTO #ListaAtributos EXEC dbo.SP_Catalogo_ListarAtributos @IDAdmin;
REVERT;
SET @Texto = (SELECT STRING_AGG(CONCAT(l.Nombre, N':', CAST(l.Activo AS INT), N':', j.Cantidad), N',')
                     WITHIN GROUP (ORDER BY l.Nombre)
              FROM #ListaAtributos AS l
              CROSS APPLY (SELECT COUNT(*) AS Cantidad FROM OPENJSON(l.Valores)) AS j
              WHERE l.Nombre LIKE N'%Prueba');
EXEC #Verificar N'Listar atributos: incluye inactivos, con sus valores',
     N'Capacidad Prueba:0:0,Color Prueba:1:2,Material Prueba:0:0,Talla Prueba:1:3', @Texto;
ROLLBACK TRANSACTION;

/* === Valores de atributo ================================================================= */
BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDAdmin = IDAdmin, @IDTalla = IDTalla, @IDColor = IDColor, @IDAzul = IDAzul FROM #Base;

EXECUTE AS USER = @Api;
INSERT INTO #Valor EXEC dbo.SP_Catalogo_CrearAtributoValor @IDAdmin, @IDTalla, N' XL ';
INSERT INTO #Valor EXEC dbo.SP_Catalogo_CrearAtributoValor @IDAdmin, @IDColor, N'Verde', ' #1e40af ';
INSERT INTO #Valor EXEC dbo.SP_Catalogo_CrearAtributoValor @IDAdmin, @IDColor, N'Negro', NULL, 0;
REVERT;
SET @Texto = (SELECT STRING_AGG(CONCAT(Valor, N':', Orden, N':', ISNULL(CAST(CodigoHex AS VARCHAR(7)), 'NULL')), N',') WITHIN GROUP (ORDER BY IDAtributoValor)
              FROM #Valor);
EXEC #Verificar N'Crear valor: sin orden va al final, color en mayúsculas, orden explícito', N'XL:4:NULL,Verde:3:#1E40AF,Negro:0:NULL', @Texto;

DELETE FROM #Valor;
EXECUTE AS USER = @Api;
INSERT INTO #Valor EXEC dbo.SP_Catalogo_ActualizarAtributoValor @IDAdmin, @IDAzul, N'Azul Marino', '#000080', 5;
INSERT INTO #Valor EXEC dbo.SP_Catalogo_ActualizarAtributoValor @IDAdmin, @IDAzul, N'Azul Marino', '#000080', 5;
INSERT INTO #Valor EXEC dbo.SP_Catalogo_CambiarEstadoAtributoValor @IDAdmin, @IDAzul, 0;
REVERT;
SET @Texto = (SELECT STRING_AGG(CONCAT(Valor, N':', Orden, N':', CodigoHex, N':', CAST(Activo AS INT)), N',') FROM #Valor);
SET @Texto += N'|' + (SELECT STRING_AGG(Accion, ',') WITHIN GROUP (ORDER BY IDBitacora)
                      FROM dbo.Bitacora WHERE IDUsuario = @IDAdmin AND Entidad = 'AtributoValor'
                        AND IDEntidad = CAST(@IDAzul AS VARCHAR(50)));
EXEC #Verificar N'Valor: actualizar (repetir no genera bitácora) y desactivar',
     N'Azul Marino:5:#000080:1,Azul Marino:5:#000080:1,Azul Marino:5:#000080:0|MODIFICAR,DESACTIVAR', @Texto;
ROLLBACK TRANSACTION;

/* === Casos de error ====================================================================== */
DECLARE @D NVARCHAR(MAX) = N'
DECLARE @Admin INT, @Operador INT, @Ropa INT, @Hogar INT, @Talla INT, @Color INT, @Material INT, @M INT, @Azul INT;
DECLARE @T dbo.TT_Catalogo_CategoriaAtributo, @V BINARY(8);
SELECT @Admin = IDAdmin, @Operador = IDOperador, @Ropa = IDRopa, @Hogar = IDHogar, @Talla = IDTalla, @Color = IDColor,
       @Material = IDMaterial, @M = IDTallaM, @Azul = IDAzul, @V = VersionHogar FROM #Base;
';

DECLARE @Errores TABLE (Orden INT IDENTITY, Descripcion NVARCHAR(300), Esperado INT, Sql NVARCHAR(MAX), Preparacion NVARCHAR(MAX));
INSERT INTO @Errores (Descripcion, Esperado, Sql, Preparacion) VALUES
    -- Crear categoría
    (N'Crear categoría: un operador → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Catalogo_CrearCategoria @Operador, N''Nueva'', ''nueva'';', NULL),
    (N'Crear categoría: administrador desactivado → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Catalogo_CrearCategoria @Admin, N''Nueva'', ''nueva'';',
        N'UPDATE dbo.Usuario SET Activo = 0 WHERE IDUsuario = (SELECT IDAdmin FROM #Base);'),
    (N'Crear categoría: nombre solo con espacios → NOMBRE_INVALIDO', 50003,
        N'EXEC dbo.SP_Catalogo_CrearCategoria @Admin, N''   '', ''nueva'';', NULL),
    (N'Crear categoría: nombre de 101 caracteres → NOMBRE_INVALIDO', 50003,
        N'EXEC dbo.SP_Catalogo_CrearCategoria @Admin, @Nombre = ' + N'N''' + REPLICATE(N'x', 101) + N''', @Slug = ''nueva'';', NULL),
    (N'Crear categoría: slug con espacio → SLUG_INVALIDO', 50009,
        N'EXEC dbo.SP_Catalogo_CrearCategoria @Admin, N''Nueva'', ''ropa nueva'';', NULL),
    (N'Crear categoría: slug con tilde → SLUG_INVALIDO', 50009,
        N'EXEC dbo.SP_Catalogo_CrearCategoria @Admin, N''Nueva'', N''camión'';', NULL),
    (N'Crear categoría: slug que empieza con guion → SLUG_INVALIDO', 50009,
        N'EXEC dbo.SP_Catalogo_CrearCategoria @Admin, N''Nueva'', ''-nueva'';', NULL),
    (N'Crear categoría: slug que termina con guion → SLUG_INVALIDO', 50009,
        N'EXEC dbo.SP_Catalogo_CrearCategoria @Admin, N''Nueva'', ''nueva-'';', NULL),
    (N'Crear categoría: slug con guion doble → SLUG_INVALIDO', 50009,
        N'EXEC dbo.SP_Catalogo_CrearCategoria @Admin, N''Nueva'', ''ro--pa'';', NULL),
    (N'Crear categoría: slug con guion bajo → SLUG_INVALIDO', 50009,
        N'EXEC dbo.SP_Catalogo_CrearCategoria @Admin, N''Nueva'', ''ro_pa'';', NULL),
    (N'Crear categoría: slug de 121 caracteres → SLUG_INVALIDO', 50009,
        N'EXEC dbo.SP_Catalogo_CrearCategoria @Admin, N''Nueva'', ''' + REPLICATE('a', 121) + N''';', NULL),
    (N'Crear categoría: slug NULL → SLUG_INVALIDO', 50009,
        N'EXEC dbo.SP_Catalogo_CrearCategoria @Admin, N''Nueva'', NULL;', NULL),
    (N'Crear categoría: descripción de 501 caracteres → DESCRIPCION_INVALIDA', 50010,
        N'EXEC dbo.SP_Catalogo_CrearCategoria @Admin, N''Nueva'', ''nueva'', N''' + REPLICATE(N'd', 501) + N''';', NULL),
    (N'Crear categoría: nombre repetido en mayúsculas → NOMBRE_REGISTRADO', 51201,
        N'EXEC dbo.SP_Catalogo_CrearCategoria @Admin, N''ROPA PRUEBA'', ''otra'';', NULL),
    (N'Crear categoría: nombre repetido con tilde → NOMBRE_REGISTRADO', 51201,
        N'EXEC dbo.SP_Catalogo_CrearCategoria @Admin, N''Ropá Prueba'', ''otra'';', NULL),
    (N'Crear categoría: slug repetido → SLUG_REGISTRADO', 51202,
        N'EXEC dbo.SP_Catalogo_CrearCategoria @Admin, N''Otra'', ''ropa-prueba'';', NULL),
    -- Actualizar categoría
    (N'Actualizar categoría: versión vieja → EDICION_CONCURRENTE', 51203,
        N'EXEC dbo.SP_Catalogo_ActualizarCategoria @Admin, @Hogar, N''Hogar'', ''hogar'', NULL, 0x0000000000000001;', NULL),
    (N'Actualizar categoría: otro la modificó después de cargarla → EDICION_CONCURRENTE', 51203,
        N'EXEC dbo.SP_Catalogo_ActualizarCategoria @Admin, @Hogar, N''Hogar'', ''hogar'', NULL, @V;',
        N'UPDATE dbo.Categoria SET Descripcion = N''otro cambio'' WHERE IDCategoria = (SELECT IDHogar FROM #Base);'),
    (N'Actualizar categoría: inexistente → CATEGORIA_NO_ENCONTRADA', 50102,
        N'EXEC dbo.SP_Catalogo_ActualizarCategoria @Admin, -1, N''Hogar'', ''hogar'', NULL, @V;', NULL),
    (N'Actualizar categoría: sin versión → PARAMETRO_REQUERIDO', 50006,
        N'EXEC dbo.SP_Catalogo_ActualizarCategoria @Admin, @Hogar, N''Hogar'', ''hogar'', NULL, NULL;', NULL),
    (N'Actualizar categoría: nombre de otra → NOMBRE_REGISTRADO', 51201,
        N'EXEC dbo.SP_Catalogo_ActualizarCategoria @Admin, @Hogar, N''Ropa Prueba'', ''hogar-prueba'', NULL, @V;', NULL),
    (N'Actualizar categoría: slug de otra → SLUG_REGISTRADO', 51202,
        N'EXEC dbo.SP_Catalogo_ActualizarCategoria @Admin, @Hogar, N''Hogar Prueba'', ''ropa-prueba'', NULL, @V;', NULL),
    (N'Actualizar categoría: un operador → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Catalogo_ActualizarCategoria @Operador, @Hogar, N''Hogar'', ''hogar'', NULL, @V;', NULL),
    -- Estado de categoría
    (N'Estado de categoría: inexistente → CATEGORIA_NO_ENCONTRADA', 50102,
        N'EXEC dbo.SP_Catalogo_CambiarEstadoCategoria @Admin, -1, 0;', NULL),
    (N'Estado de categoría: sin estado → PARAMETRO_REQUERIDO', 50006,
        N'EXEC dbo.SP_Catalogo_CambiarEstadoCategoria @Admin, @Hogar, NULL;', NULL),
    -- Atributos de la categoría
    (N'Asignar atributos: atributo inexistente → ATRIBUTO_NO_ENCONTRADO', 50103,
        N'INSERT INTO @T VALUES (-1, 1); EXEC dbo.SP_Catalogo_AsignarAtributosCategoria @Admin, @Hogar, @T;', NULL),
    (N'Asignar atributos: atributo desactivado nuevo en la categoría → ATRIBUTO_NO_ENCONTRADO', 50103,
        N'INSERT INTO @T VALUES (@Material, 1); EXEC dbo.SP_Catalogo_AsignarAtributosCategoria @Admin, @Hogar, @T;', NULL),
    (N'Asignar atributos: quitar uno en uso por una variante (de un producto inactivo) → ATRIBUTO_EN_USO', 51204,
        N'INSERT INTO @T VALUES (@Color, 1); EXEC dbo.SP_Catalogo_AsignarAtributosCategoria @Admin, @Ropa, @T;', NULL),
    (N'Asignar atributos: categoría inexistente → CATEGORIA_NO_ENCONTRADA', 50102,
        N'EXEC dbo.SP_Catalogo_AsignarAtributosCategoria @Admin, -1, @T;', NULL),
    (N'Asignar atributos: un operador → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Catalogo_AsignarAtributosCategoria @Operador, @Hogar, @T;', NULL),
    (N'Obtener categoría: un operador → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Catalogo_ObtenerCategoria @Operador, @Hogar;', NULL),
    (N'Listar categorías: un operador → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Catalogo_ListarCategorias @Operador;', NULL),
    -- Atributos
    (N'Crear atributo: nombre vacío → NOMBRE_INVALIDO', 50003,
        N'EXEC dbo.SP_Catalogo_CrearAtributo @Admin, N'''';', NULL),
    (N'Crear atributo: nombre de 51 caracteres → NOMBRE_INVALIDO', 50003,
        N'EXEC dbo.SP_Catalogo_CrearAtributo @Admin, N''' + REPLICATE(N'x', 51) + N''';', NULL),
    (N'Crear atributo: nombre repetido en minúsculas → NOMBRE_REGISTRADO', 51201,
        N'EXEC dbo.SP_Catalogo_CrearAtributo @Admin, N''talla prueba'';', NULL),
    (N'Actualizar atributo: inexistente → ATRIBUTO_NO_ENCONTRADO', 50103,
        N'EXEC dbo.SP_Catalogo_ActualizarAtributo @Admin, -1, N''Otro'';', NULL),
    (N'Actualizar atributo: nombre de otro → NOMBRE_REGISTRADO', 51201,
        N'EXEC dbo.SP_Catalogo_ActualizarAtributo @Admin, @Talla, N''Color Prueba'';', NULL),
    (N'Estado de atributo: inexistente → ATRIBUTO_NO_ENCONTRADO', 50103,
        N'EXEC dbo.SP_Catalogo_CambiarEstadoAtributo @Admin, -1, 1;', NULL),
    (N'Obtener atributo: inexistente → ATRIBUTO_NO_ENCONTRADO', 50103,
        N'EXEC dbo.SP_Catalogo_ObtenerAtributo @Admin, -1;', NULL),
    (N'Listar atributos: un operador → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Catalogo_ListarAtributos @Operador;', NULL),
    -- Valores
    (N'Crear valor: atributo desactivado → ATRIBUTO_NO_ENCONTRADO', 50103,
        N'EXEC dbo.SP_Catalogo_CrearAtributoValor @Admin, @Material, N''Algodón'';', NULL),
    (N'Crear valor: atributo inexistente → ATRIBUTO_NO_ENCONTRADO', 50103,
        N'EXEC dbo.SP_Catalogo_CrearAtributoValor @Admin, -1, N''Algodón'';', NULL),
    (N'Crear valor: valor repetido en minúsculas → NOMBRE_REGISTRADO', 51201,
        N'EXEC dbo.SP_Catalogo_CrearAtributoValor @Admin, @Talla, N''m'';', NULL),
    (N'Crear valor: valor vacío → NOMBRE_INVALIDO', 50003,
        N'EXEC dbo.SP_Catalogo_CrearAtributoValor @Admin, @Talla, N'' '';', NULL),
    (N'Crear valor: color de 5 dígitos → COLOR_INVALIDO', 50011,
        N'EXEC dbo.SP_Catalogo_CrearAtributoValor @Admin, @Color, N''Verde'', ''#12345'';', NULL),
    (N'Crear valor: color con nombre → COLOR_INVALIDO', 50011,
        N'EXEC dbo.SP_Catalogo_CrearAtributoValor @Admin, @Color, N''Verde'', ''verde'';', NULL),
    (N'Crear valor: color con letras fuera de A-F → COLOR_INVALIDO', 50011,
        N'EXEC dbo.SP_Catalogo_CrearAtributoValor @Admin, @Color, N''Verde'', ''#GGGGGG'';', NULL),
    (N'Crear valor: color de 8 caracteres → COLOR_INVALIDO', 50011,
        N'EXEC dbo.SP_Catalogo_CrearAtributoValor @Admin, @Color, N''Verde'', ''#1E40AF0'';', NULL),
    (N'Crear valor: orden 256 → ORDEN_INVALIDO', 50012,
        N'EXEC dbo.SP_Catalogo_CrearAtributoValor @Admin, @Talla, N''XXL'', NULL, 256;', NULL),
    (N'Crear valor: orden negativo → ORDEN_INVALIDO', 50012,
        N'EXEC dbo.SP_Catalogo_CrearAtributoValor @Admin, @Talla, N''XXL'', NULL, -1;', NULL),
    (N'Crear valor: un operador → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Catalogo_CrearAtributoValor @Operador, @Talla, N''XXL'';', NULL),
    (N'Actualizar valor: inexistente → VALOR_NO_ENCONTRADO', 50104,
        N'EXEC dbo.SP_Catalogo_ActualizarAtributoValor @Admin, -1, N''X'', NULL, 1;', NULL),
    (N'Actualizar valor: sin orden → PARAMETRO_REQUERIDO', 50006,
        N'EXEC dbo.SP_Catalogo_ActualizarAtributoValor @Admin, @Azul, N''Azul'', NULL, NULL;', NULL),
    (N'Actualizar valor: nombre de otro valor del atributo → NOMBRE_REGISTRADO', 51201,
        N'EXEC dbo.SP_Catalogo_ActualizarAtributoValor @Admin, @Azul, N''Rojo'', NULL, 1;', NULL),
    (N'Estado de valor: inexistente → VALOR_NO_ENCONTRADO', 50104,
        N'EXEC dbo.SP_Catalogo_CambiarEstadoAtributoValor @Admin, -1, 0;', NULL);

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
                  (SELECT COUNT(*) FROM dbo.Categoria WHERE Nombre LIKE N'%Prueba%' OR Slug LIKE '%prueba%'), N'|',
                  (SELECT COUNT(*) FROM dbo.Atributo WHERE Nombre LIKE N'%Prueba%'), N'|',
                  (SELECT COUNT(*) FROM dbo.Usuario WHERE Correo LIKE N'%.catalogo@shopcart.test')));
EXEC #Verificar N'Limpieza: no quedan datos de prueba', N'0|0|0', @Texto;

/* --- Resultado ---------------------------------------------------------------------------- */
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = NULL;

IF CAST(SESSION_CONTEXT(N'PruebasFallidas') AS INT) > 0
    THROW 50000, N'Pruebas de procedimientos de catálogo (estructura) fallidas.', 1;
EXEC sys.sp_set_session_context @key = N'PruebasFallidas', @value = NULL;
GO
