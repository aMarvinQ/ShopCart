/*
    002_Integridad_SeguridadCatalogo.sql
    Se ejecuta conectado como shopcart_migrator (deploy.ps1 -Probar).
    Intenta insertar datos inválidos y verifica que la restricción esperada los rechace.
    Todo ocurre dentro de una transacción que se revierte al final: no deja datos.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT OFF;  -- una violación de restricción debe terminar solo la sentencia, no la transacción

BEGIN TRANSACTION;

DECLARE @Fallas      INT = 0;
DECLARE @Esperado    SYSNAME;
DECLARE @Descripcion NVARCHAR(200);
DECLARE @Hash        VARCHAR(255) = '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA';

/* --- Datos válidos de apoyo --------------------------------------------------------------- */
DECLARE @IDRol TINYINT = 200;
INSERT INTO dbo.Rol (IDRol, Codigo, Nombre) VALUES (@IDRol, 'PRUEBA_INTEGRIDAD', N'Prueba');

INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
VALUES (@IDRol, N'prueba.integridad@shopcart.test', @Hash, N'Prueba', N'Integridad');
DECLARE @IDUsuario INT = SCOPE_IDENTITY();

IF NOT EXISTS (SELECT 1 FROM dbo.Usuario WHERE EsSistema = 1)
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido, EsSistema, Activo)
    VALUES (@IDRol, N'sistema.prueba@shopcart.test', NULL, N'Sistema', N'Prueba', 1, 0);

INSERT INTO dbo.Categoria (Nombre, Slug) VALUES (N'Prueba integridad', 'prueba-integridad');
DECLARE @IDCategoria INT = SCOPE_IDENTITY();

INSERT INTO dbo.Atributo (Nombre) VALUES (N'PruebaColor');
DECLARE @IDAtributoColor INT = SCOPE_IDENTITY();
INSERT INTO dbo.Atributo (Nombre) VALUES (N'PruebaTalla');
DECLARE @IDAtributoTalla INT = SCOPE_IDENTITY();

INSERT INTO dbo.AtributoValor (IDAtributo, Valor, Orden, CodigoHex) VALUES (@IDAtributoColor, N'Rojo', 1, '#FF0000');
DECLARE @IDRojo INT = SCOPE_IDENTITY();
INSERT INTO dbo.AtributoValor (IDAtributo, Valor, Orden) VALUES (@IDAtributoTalla, N'M', 2);
DECLARE @IDTallaM INT = SCOPE_IDENTITY();

INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug) VALUES (@IDCategoria, N'Playera de prueba', 'playera-prueba-integridad');
DECLARE @IDProducto INT = SCOPE_IDENTITY();

DECLARE @Clave VARCHAR(100) = CONCAT(@IDRojo, '|', @IDTallaM);
INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ClaveCombinacion) VALUES (@IDProducto, 'PRUEBA-ROJO-M', 99.00, @Clave);
DECLARE @IDVariante INT = SCOPE_IDENTITY();

INSERT INTO dbo.ProductoImagen (IDProducto, IDAtributoValor, RutaImagen, TextoAlternativo, EsPrincipal)
VALUES (@IDProducto, @IDRojo, N'/uploads/productos/prueba-rojo.webp', N'Playera roja', 1),
       (@IDProducto, NULL,    N'/uploads/productos/prueba-general.webp', N'Playera', 1);

/* --- Seguridad ---------------------------------------------------------------------------- */
SELECT @Esperado = N'CK_Usuario_CorreoMinusculas', @Descripcion = N'Correo con mayúsculas';
BEGIN TRY
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    VALUES (@IDRol, N'Mayusculas@ShopCart.test', @Hash, N'Prueba', N'Integridad');
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_Usuario_Contrasena', @Descripcion = N'Cliente sin contraseña';
BEGIN TRY
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    VALUES (@IDRol, N'sin.contrasena@shopcart.test', NULL, N'Prueba', N'Integridad');
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_Usuario_Contrasena', @Descripcion = N'Contraseña en texto plano';
BEGIN TRY
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    VALUES (@IDRol, N'texto.plano@shopcart.test', 'MiContrasena123', N'Prueba', N'Integridad');
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptada.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazada por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'UQ_Usuario_Correo', @Descripcion = N'Correo duplicado';
BEGIN TRY
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    VALUES (@IDRol, N'prueba.integridad@shopcart.test', @Hash, N'Otro', N'Usuario');
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'UQ_Usuario_UnicoSistema', @Descripcion = N'Segundo usuario de sistema';
BEGIN TRY
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido, EsSistema)
    VALUES (@IDRol, N'sistema.dos@shopcart.test', NULL, N'Sistema', N'Dos', 1);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_RefreshToken_Vigencia', @Descripcion = N'Refresh token que vence después del máximo de sesión';
BEGIN TRY
    INSERT INTO dbo.RefreshToken (IDUsuario, TokenHash, Familia, FechaExpiracion, FechaExpiracionSesion)
    VALUES (@IDUsuario, HASHBYTES('SHA2_256', 'token-prueba-1'), NEWID(),
            DATEADD(DAY, 40, SYSUTCDATETIME()), DATEADD(DAY, 30, SYSUTCDATETIME()));
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_RefreshToken_Revocacion', @Descripcion = N'Refresh token revocado sin motivo';
BEGIN TRY
    INSERT INTO dbo.RefreshToken (IDUsuario, TokenHash, Familia, FechaExpiracion, FechaExpiracionSesion, FechaRevocacion)
    VALUES (@IDUsuario, HASHBYTES('SHA2_256', 'token-prueba-2'), NEWID(),
            DATEADD(DAY, 7, SYSUTCDATETIME()), DATEADD(DAY, 30, SYSUTCDATETIME()), SYSUTCDATETIME());
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

/* --- Catálogo ----------------------------------------------------------------------------- */
SELECT @Esperado = N'CK_Categoria_SlugFormato', @Descripcion = N'Slug con mayúsculas y espacios';
BEGIN TRY
    INSERT INTO dbo.Categoria (Nombre, Slug) VALUES (N'Slug inválido', 'Slug Invalido');
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_AtributoValor_CodigoHexFormato', @Descripcion = N'Código de color inválido';
BEGIN TRY
    INSERT INTO dbo.AtributoValor (IDAtributo, Valor, CodigoHex) VALUES (@IDAtributoColor, N'Verde', '#GG0000');
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_Variante_PrecioPositivo', @Descripcion = N'Variante con precio cero';
BEGIN TRY
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ClaveCombinacion) VALUES (@IDProducto, 'PRUEBA-PRECIO', 0, '900|901');
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptada.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazada por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_Variante_ExistenciaNoNegativa', @Descripcion = N'Existencia negativa';
BEGIN TRY
    UPDATE dbo.Variante SET ExistenciaFisica = -1 WHERE IDVariante = @IDVariante;
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptada.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazada por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_Variante_SKUFormato', @Descripcion = N'SKU en minúsculas';
BEGIN TRY
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ClaveCombinacion) VALUES (@IDProducto, 'prueba-sku', 50, '900|902');
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'UQ_Variante_SKU', @Descripcion = N'SKU duplicado';
BEGIN TRY
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ClaveCombinacion) VALUES (@IDProducto, 'PRUEBA-ROJO-M', 50, '900|903');
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'UQ_Variante_Producto_Combinacion', @Descripcion = N'Combinación repetida (Rojo/M dos veces)';
BEGIN TRY
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ClaveCombinacion) VALUES (@IDProducto, 'PRUEBA-ROJO-M-2', 50, @Clave);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptada.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazada por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'FK_VarianteAtributoValor_AtributoValor', @Descripcion = N'Valor "Rojo" guardado como Talla';
BEGIN TRY
    INSERT INTO dbo.VarianteAtributoValor (IDVariante, IDAtributo, IDAtributoValor) VALUES (@IDVariante, @IDAtributoTalla, @IDRojo);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'UQ_ProductoImagen_Principal', @Descripcion = N'Segunda imagen principal del mismo color';
BEGIN TRY
    INSERT INTO dbo.ProductoImagen (IDProducto, IDAtributoValor, RutaImagen, TextoAlternativo, EsPrincipal)
    VALUES (@IDProducto, @IDRojo, N'/uploads/productos/prueba-rojo-2.webp', N'Playera roja', 1);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptada.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazada por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'UQ_ProductoImagen_Principal', @Descripcion = N'Segunda imagen principal general';
BEGIN TRY
    INSERT INTO dbo.ProductoImagen (IDProducto, IDAtributoValor, RutaImagen, TextoAlternativo, EsPrincipal)
    VALUES (@IDProducto, NULL, N'/uploads/productos/prueba-general-2.webp', N'Playera', 1);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptada.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazada por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_ProductoImagen_RutaFormato', @Descripcion = N'Ruta de imagen fuera de /uploads';
BEGIN TRY
    INSERT INTO dbo.ProductoImagen (IDProducto, RutaImagen, TextoAlternativo)
    VALUES (@IDProducto, N'/uploads/../web.config', N'Ruta maliciosa');
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptada.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazada por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_HistorialPrecio_HayCambio', @Descripcion = N'Historial de precio sin cambio real';
BEGIN TRY
    INSERT INTO dbo.HistorialPrecio (IDVariante, PrecioAnterior, PrecioNuevo, IDUsuario) VALUES (@IDVariante, 99.00, 99.00, @IDUsuario);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

/* --- Resultado ---------------------------------------------------------------------------- */
ROLLBACK TRANSACTION;

IF @Fallas > 0
    THROW 50000, N'Pruebas de integridad de Seguridad y Catálogo fallidas.', 1;
GO
