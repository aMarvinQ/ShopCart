/*
    023_Procedimientos_Imagenes.sql
    Se ejecuta conectado como shopcart_migrator (deploy.ps1 -Probar). El migrador prepara una
    imagen de producto y ejecuta el SP haciéndose pasar por un miembro de RolApi. Todo se revierte.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT OFF;
GO

DECLARE @Api SYSNAME = (SELECT TOP (1) USER_NAME(rm.member_principal_id)
                        FROM sys.database_role_members AS rm
                        WHERE rm.role_principal_id = DATABASE_PRINCIPAL_ID(N'RolApi')
                        ORDER BY rm.member_principal_id);
DECLARE @Fallas INT = 0, @Texto NVARCHAR(400), @Error INT, @IDCategoria INT, @IDProducto INT;
DECLARE @EnUso TABLE (RutaImagen NVARCHAR(500));

IF @Api IS NULL THROW 50000, N'RolApi no tiene miembros: no se pueden ejecutar los SPs como la API.', 1;

BEGIN TRANSACTION;
INSERT INTO dbo.Categoria (Nombre, Slug) VALUES (N'Imágenes Prueba', 'imagenes-prueba');
SET @IDCategoria = SCOPE_IDENTITY();
INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug) VALUES (@IDCategoria, N'Producto Imágenes Prueba', 'producto-imagenes-prueba');
SET @IDProducto = SCOPE_IDENTITY();
INSERT INTO dbo.ProductoImagen (IDProducto, RutaImagen, TextoAlternativo, EsPrincipal)
VALUES (@IDProducto, N'/uploads/productos/prueba-en-uso.webp', N'Prueba', 1);

EXECUTE AS USER = @Api;
INSERT INTO @EnUso EXEC dbo.SP_Catalogo_FiltrarImagenesEnUso
    N'["/uploads/productos/prueba-en-uso.webp", "/uploads/productos/prueba-huerfana.webp", 5, {"x": 1}]';
REVERT;
SET @Texto = (SELECT STRING_AGG(RutaImagen, N',') FROM @EnUso);
IF @Texto = N'/uploads/productos/prueba-en-uso.webp'
    PRINT N'OK     Devuelve solo las rutas en uso (ignora las huérfanas y los elementos que no son texto): ' + @Texto;
ELSE
BEGIN
    SET @Fallas += 1;
    PRINT N'FALLA  Rutas en uso: obtenido ' + ISNULL(@Texto, N'(ninguna)');
END
ROLLBACK TRANSACTION;

-- Entrada inválida → PARAMETRO_REQUERIDO (50006): no es arreglo JSON.
SET @Error = 0;
BEGIN TRY
    EXECUTE AS USER = @Api;
    EXEC dbo.SP_Catalogo_FiltrarImagenesEnUso N'{"ruta": "/uploads/productos/x.webp"}';
    REVERT;
END TRY
BEGIN CATCH
    SET @Error = ERROR_NUMBER();
    REVERT;
END CATCH;
IF @Error = 50006
    PRINT N'OK     Un objeto JSON en lugar de un arreglo → PARAMETRO_REQUERIDO: 50006';
ELSE
BEGIN
    SET @Fallas += 1;
    PRINT N'FALLA  Un objeto JSON en lugar de un arreglo: esperado 50006, obtenido ' + CAST(@Error AS NVARCHAR(10));
END

IF @Fallas > 0
    THROW 50000, N'Pruebas de imágenes en uso fallidas.', 1;
GO
