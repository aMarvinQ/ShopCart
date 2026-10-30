/*
    003_Integridad_InventarioCuponesCarrito.sql
    Se ejecuta conectado como shopcart_migrator (deploy.ps1 -Probar).
    Módulos: Inventario, Direcciones y envío, Cupones, Carrito.
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
DECLARE @Ahora       DATETIME2(3) = SYSUTCDATETIME();

/* --- Datos válidos de apoyo --------------------------------------------------------------- */
DECLARE @IDRol TINYINT = 200;
INSERT INTO dbo.Rol (IDRol, Codigo, Nombre) VALUES (@IDRol, 'PRUEBA_INTEGRIDAD', N'Prueba');

INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
VALUES (@IDRol, N'prueba.integridad@shopcart.test', @Hash, N'Prueba', N'Integridad');
DECLARE @IDUsuario INT = SCOPE_IDENTITY();

INSERT INTO dbo.Categoria (Nombre, Slug) VALUES (N'Prueba integridad', 'prueba-integridad');
DECLARE @IDCategoria INT = SCOPE_IDENTITY();

INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug) VALUES (@IDCategoria, N'Producto de prueba', 'producto-prueba-integridad');
DECLARE @IDProducto INT = SCOPE_IDENTITY();

INSERT INTO dbo.Variante (IDProducto, SKU, Precio) VALUES (@IDProducto, 'PRUEBA-UNICA', 150.00);
DECLARE @IDVariante INT = SCOPE_IDENTITY();

DECLARE @IDEntrada TINYINT = 200, @IDSalida TINYINT = 201;
INSERT INTO dbo.TipoMovimiento (IDTipoMovimiento, Codigo, Nombre, Signo)
VALUES (@IDEntrada, 'PRUEBA_ENTRADA', N'Entrada de prueba', 1),
       (@IDSalida,  'PRUEBA_SALIDA',  N'Salida de prueba', -1);

-- Movimiento válido: existencia inicial de 3 unidades.
INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimiento, Signo, Cantidad, SaldoAnterior, SaldoNuevo, IDUsuario)
VALUES (@IDVariante, @IDEntrada, 1, 3, 0, 3, @IDUsuario);

DECLARE @IDDepartamento TINYINT = 200;
INSERT INTO dbo.Departamento (IDDepartamento, Nombre) VALUES (@IDDepartamento, N'Departamento de prueba');
DECLARE @IDMunicipio SMALLINT = 20001;
INSERT INTO dbo.Municipio (IDMunicipio, IDDepartamento, Nombre) VALUES (@IDMunicipio, @IDDepartamento, N'Municipio de prueba');

INSERT INTO dbo.Direccion (IDUsuario, Alias, NombreDestinatario, Telefono, Linea1, IDMunicipio, EsPredeterminada)
VALUES (@IDUsuario, N'Casa', N'Prueba Integridad', '5555-1234', N'1a calle 1-23 zona 1', @IDMunicipio, 1);

INSERT INTO dbo.Cupon (Codigo, Descripcion, TipoDescuento, Valor, FechaInicio, FechaFin, LimiteUsosTotal)
VALUES ('PRUEBA10', N'Cupón de prueba', 'PORCENTAJE', 10, @Ahora, DATEADD(DAY, 30, @Ahora), 5);
DECLARE @IDCupon INT = SCOPE_IDENTITY();

-- Un carrito CONVERTIDO no impide que el mismo usuario tenga uno ACTIVO.
INSERT INTO dbo.Carrito (IDUsuario, Estado) VALUES (@IDUsuario, 'CONVERTIDO');
INSERT INTO dbo.Carrito (IDUsuario) VALUES (@IDUsuario);
DECLARE @IDCarrito INT = SCOPE_IDENTITY();
INSERT INTO dbo.CarritoItem (IDCarrito, IDVariante, Cantidad) VALUES (@IDCarrito, @IDVariante, 1);

/* --- Inventario --------------------------------------------------------------------------- */
SELECT @Esperado = N'CK_MovimientoInventario_SaldoCuadra', @Descripcion = N'Kardex con saldo que no cuadra (3 + 5 = 9)';
BEGIN TRY
    INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimiento, Signo, Cantidad, SaldoAnterior, SaldoNuevo, IDUsuario)
    VALUES (@IDVariante, @IDEntrada, 1, 5, 3, 9, @IDUsuario);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_MovimientoInventario_SaldoNoNegativo', @Descripcion = N'Salida que deja existencia negativa';
BEGIN TRY
    INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimiento, Signo, Cantidad, SaldoAnterior, SaldoNuevo, IDUsuario)
    VALUES (@IDVariante, @IDSalida, -1, -5, 3, -2, @IDUsuario);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptada.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazada por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_MovimientoInventario_CantidadConSigno', @Descripcion = N'Salida con cantidad positiva';
BEGIN TRY
    INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimiento, Signo, Cantidad, SaldoAnterior, SaldoNuevo, IDUsuario)
    VALUES (@IDVariante, @IDSalida, -1, 2, 3, 5, @IDUsuario);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptada.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazada por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'FK_MovimientoInventario_TipoMovimiento', @Descripcion = N'Tipo de salida registrado con signo de entrada';
BEGIN TRY
    INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimiento, Signo, Cantidad, SaldoAnterior, SaldoNuevo, IDUsuario)
    VALUES (@IDVariante, @IDSalida, 1, 2, 3, 5, @IDUsuario);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

/* --- Direcciones y envío ------------------------------------------------------------------ */
SELECT @Esperado = N'UQ_Direccion_Predeterminada', @Descripcion = N'Segunda dirección predeterminada';
BEGIN TRY
    INSERT INTO dbo.Direccion (IDUsuario, Alias, NombreDestinatario, Telefono, Linea1, IDMunicipio, EsPredeterminada)
    VALUES (@IDUsuario, N'Oficina', N'Prueba Integridad', '5555-1234', N'2a avenida 3-45 zona 4', @IDMunicipio, 1);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptada.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazada por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_Direccion_PredeterminadaActiva', @Descripcion = N'Desactivar la dirección predeterminada';
BEGIN TRY
    UPDATE dbo.Direccion SET Activo = 0 WHERE IDUsuario = @IDUsuario AND EsPredeterminada = 1;
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_Direccion_CodigoPostalFormato', @Descripcion = N'Código postal con letras';
BEGIN TRY
    INSERT INTO dbo.Direccion (IDUsuario, Alias, NombreDestinatario, Telefono, Linea1, IDMunicipio, CodigoPostal)
    VALUES (@IDUsuario, N'Postal', N'Prueba Integridad', '5555-1234', N'4a calle 7-89 zona 3', @IDMunicipio, '0101A');
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'FK_Direccion_Municipio', @Descripcion = N'Dirección con un municipio inexistente';
BEGIN TRY
    INSERT INTO dbo.Direccion (IDUsuario, Alias, NombreDestinatario, Telefono, Linea1, IDMunicipio)
    VALUES (@IDUsuario, N'Otra', N'Prueba Integridad', '5555-1234', N'6a calle 1-10 zona 2', 32000);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptada.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazada por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'UQ_Municipio_Departamento_Nombre', @Descripcion = N'Municipio repetido en el mismo departamento';
BEGIN TRY
    INSERT INTO dbo.Municipio (IDMunicipio, IDDepartamento, Nombre) VALUES (20002, @IDDepartamento, N'Municipio de prueba');
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_MetodoEnvio_DiasEstimados', @Descripcion = N'Método de envío con rango de días invertido';
BEGIN TRY
    INSERT INTO dbo.MetodoEnvio (Nombre, Costo, DiasEstimadosMin, DiasEstimadosMax) VALUES (N'Envío de prueba', 25.00, 5, 2);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

/* --- Cupones ------------------------------------------------------------------------------ */
SELECT @Esperado = N'CK_Cupon_Valor', @Descripcion = N'Cupón de porcentaje mayor a 100';
BEGIN TRY
    INSERT INTO dbo.Cupon (Codigo, Descripcion, TipoDescuento, Valor, FechaInicio, FechaFin)
    VALUES ('PRUEBA150', N'Cupón inválido', 'PORCENTAJE', 150, @Ahora, DATEADD(DAY, 30, @Ahora));
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_Cupon_Vigencia', @Descripcion = N'Cupón que termina antes de empezar';
BEGIN TRY
    INSERT INTO dbo.Cupon (Codigo, Descripcion, TipoDescuento, Valor, FechaInicio, FechaFin)
    VALUES ('PRUEBAFECHA', N'Cupón inválido', 'MONTO_FIJO', 25, @Ahora, DATEADD(DAY, -1, @Ahora));
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_Cupon_CodigoFormato', @Descripcion = N'Código de cupón en minúsculas';
BEGIN TRY
    INSERT INTO dbo.Cupon (Codigo, Descripcion, TipoDescuento, Valor, FechaInicio, FechaFin)
    VALUES ('prueba20', N'Cupón inválido', 'PORCENTAJE', 20, @Ahora, DATEADD(DAY, 30, @Ahora));
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_Cupon_UsosDentroDelLimite', @Descripcion = N'Uso de cupón por encima del límite total';
BEGIN TRY
    UPDATE dbo.Cupon SET UsosActuales = LimiteUsosTotal + 1 WHERE IDCupon = @IDCupon;
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

/* --- Carrito ------------------------------------------------------------------------------ */
SELECT @Esperado = N'CK_Carrito_Propietario', @Descripcion = N'Carrito sin usuario ni token de invitado';
BEGIN TRY
    INSERT INTO dbo.Carrito (IDUsuario, TokenInvitadoHash) VALUES (NULL, NULL);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'UQ_Carrito_UsuarioActivo', @Descripcion = N'Segundo carrito activo del mismo usuario';
BEGIN TRY
    INSERT INTO dbo.Carrito (IDUsuario) VALUES (@IDUsuario);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'UQ_CarritoItem_Carrito_Variante', @Descripcion = N'Misma variante en dos líneas del carrito';
BEGIN TRY
    INSERT INTO dbo.CarritoItem (IDCarrito, IDVariante, Cantidad) VALUES (@IDCarrito, @IDVariante, 2);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptada.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazada por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_CarritoItem_Cantidad', @Descripcion = N'Línea de carrito con cantidad cero';
BEGIN TRY
    UPDATE dbo.CarritoItem SET Cantidad = 0 WHERE IDCarrito = @IDCarrito;
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptada.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazada por ' + @Esperado + N'.';
END CATCH

/* --- Resultado ---------------------------------------------------------------------------- */
ROLLBACK TRANSACTION;

IF @Fallas > 0
    THROW 50000, N'Pruebas de integridad de Inventario, Direcciones, Cupones y Carrito fallidas.', 1;
GO
