/*
    004_Integridad_CheckoutPedidos.sql
    Se ejecuta conectado como shopcart_migrator (deploy.ps1 -Probar).
    Módulos: Checkout, Pedidos, Pagos, Devoluciones, Parametro, Bitacora y triggers.

    Parte 1: restricciones de tabla, en una sola transacción que se revierte al final.
    Parte 2: triggers. Un error dentro de un trigger condena la transacción completa, así que
    cada prueba de trigger usa su propia transacción con sus propios datos.
    Los datos de apoyo se crean con procedimientos temporales (#), que desaparecen al cerrar
    la conexión.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT OFF;  -- una violación de restricción debe terminar solo la sentencia, no la transacción
GO

-- Permite ejecutar el script varias veces en la misma conexión (p. ej. en SSMS).
DROP TABLE IF EXISTS #Base;
DROP PROCEDURE IF EXISTS #CrearBasePrueba;
DROP PROCEDURE IF EXISTS #CrearPedidoPrueba;
GO

CREATE TABLE #Base
(
    IDUsuario      INT,
    IDOtroUsuario  INT,
    IDVariante     INT,
    IDVariante2    INT,
    IDMetodoEnvio  INT,
    IDCupon        INT,
    IDTipoEntrada  TINYINT,
    IDDepartamento TINYINT,
    IDPagado       TINYINT,
    IDEnviado      TINYINT,
    IDCancelado    TINYINT
);
GO

/* Catálogos y datos mínimos. Usa IDs 200+ en catálogos fijos para no chocar con la semilla. */
CREATE PROCEDURE #CrearBasePrueba
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Hash VARCHAR(255) = '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA';

    INSERT INTO dbo.Rol (IDRol, Codigo, Nombre) VALUES (200, 'PRUEBA_INTEGRIDAD', N'Prueba');

    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    VALUES (200, N'prueba.integridad@shopcart.test', @Hash, N'Prueba', N'Integridad');
    DECLARE @IDUsuario INT = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    VALUES (200, N'otro.cliente@shopcart.test', @Hash, N'Otro', N'Cliente');
    DECLARE @IDOtroUsuario INT = SCOPE_IDENTITY();

    INSERT INTO dbo.Categoria (Nombre, Slug) VALUES (N'Prueba integridad', 'prueba-integridad');
    DECLARE @IDCategoria INT = SCOPE_IDENTITY();
    INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug) VALUES (@IDCategoria, N'Producto de prueba', 'producto-prueba-integridad');
    DECLARE @IDProducto INT = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ClaveCombinacion) VALUES (@IDProducto, 'PRUEBA-A', 100.00, '1');
    DECLARE @IDVariante INT = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ClaveCombinacion) VALUES (@IDProducto, 'PRUEBA-B', 100.00, '2');
    DECLARE @IDVariante2 INT = SCOPE_IDENTITY();

    INSERT INTO dbo.Departamento (IDDepartamento, Nombre) VALUES (200, N'Departamento de prueba');
    INSERT INTO dbo.Municipio (IDMunicipio, IDDepartamento, Nombre) VALUES (20001, 200, N'Municipio de prueba');
    INSERT INTO dbo.MetodoEnvio (Nombre, Costo, DiasEstimadosMin, DiasEstimadosMax) VALUES (N'Envío de prueba', 25.00, 1, 3);
    DECLARE @IDMetodoEnvio INT = SCOPE_IDENTITY();

    INSERT INTO dbo.Cupon (Codigo, Descripcion, TipoDescuento, Valor, FechaInicio, FechaFin)
    VALUES ('PRUEBA10', N'Cupón de prueba', 'PORCENTAJE', 10, SYSUTCDATETIME(), DATEADD(DAY, 30, SYSUTCDATETIME()));
    DECLARE @IDCupon INT = SCOPE_IDENTITY();

    INSERT INTO dbo.TipoMovimiento (IDTipoMovimiento, Codigo, Nombre, Signo) VALUES (200, 'PRUEBA_ENTRADA', N'Entrada de prueba', 1);

    INSERT INTO dbo.EstadoPedido (IDEstadoPedido, Codigo, Nombre, Orden, EsInicial, EsFinal, CuentaComoVenta)
    VALUES (200, 'PRUEBA_PAGADO',    N'Pagado (prueba)',    1, 1, 0, 1),
           (201, 'PRUEBA_ENVIADO',   N'Enviado (prueba)',   2, 0, 0, 1),
           (202, 'PRUEBA_CANCELADO', N'Cancelado (prueba)', 3, 0, 1, 0);
    -- Permitidas: PAGADO → ENVIADO y PAGADO → CANCELADO. No existe ENVIADO → CANCELADO.
    INSERT INTO dbo.TransicionEstadoPedido (IDEstadoOrigen, IDEstadoDestino, PermiteCliente)
    VALUES (200, 201, 0), (200, 202, 1);

    INSERT INTO #Base
    VALUES (@IDUsuario, @IDOtroUsuario, @IDVariante, @IDVariante2, @IDMetodoEnvio, @IDCupon, 200, 200, 200, 201, 202);
END;
GO

/*
    Pedido válido de 1 unidad a Q100 + Q25 de envío (Total 125 = 111.61 + 13.39 de IVA),
    con su carrito y checkout COMPLETADO.
*/
CREATE PROCEDURE #CrearPedidoPrueba
    @IDUsuario       INT,
    @IDPedido        INT    OUTPUT,
    @IDCheckout      BIGINT OUTPUT,
    @IDPedidoDetalle INT    OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @IDVariante INT, @IDMetodoEnvio INT, @IDDepartamento TINYINT, @IDPagado TINYINT;
    SELECT @IDVariante = IDVariante, @IDMetodoEnvio = IDMetodoEnvio, @IDDepartamento = IDDepartamento, @IDPagado = IDPagado
    FROM #Base;

    INSERT INTO dbo.Carrito (IDUsuario, Estado) VALUES (@IDUsuario, 'CONVERTIDO');
    DECLARE @IDCarrito INT = SCOPE_IDENTITY();

    INSERT INTO dbo.Checkout (IDCarrito, IDUsuario, ClaveIdempotencia, CorreoContacto, NombreContacto, TelefonoContacto,
                              EnvioNombre, EnvioTelefono, EnvioLinea1, EnvioMunicipio, IDDepartamento, IDMetodoEnvio,
                              Subtotal, CostoEnvio, Total, Estado, FechaExpiracion, FechaCierre)
    VALUES (@IDCarrito, @IDUsuario, NEWID(), N'cliente@shopcart.test', N'Cliente Prueba', '5555-1234',
            N'Cliente Prueba', '5555-1234', N'1a calle 1-23 zona 1', N'Guatemala', @IDDepartamento, @IDMetodoEnvio,
            100.00, 25.00, 125.00, 'COMPLETADO', DATEADD(MINUTE, 15, SYSUTCDATETIME()), SYSUTCDATETIME());
    SET @IDCheckout = SCOPE_IDENTITY();

    INSERT INTO dbo.CheckoutDetalle (IDCheckout, IDVariante, Cantidad, PrecioUnitario) VALUES (@IDCheckout, @IDVariante, 1, 100.00);

    EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuario;

    INSERT INTO dbo.Pedido (IDCheckout, IDUsuario, CorreoContacto, NombreContacto, TelefonoContacto, TokenSeguimientoHash,
                            IDEstadoPedido, EnvioNombre, EnvioTelefono, EnvioLinea1, EnvioMunicipio, IDDepartamento,
                            IDMetodoEnvio, NombreMetodoEnvio, Subtotal, CostoEnvio, Total, BaseImponible, IVA)
    VALUES (@IDCheckout, @IDUsuario, N'cliente@shopcart.test', N'Cliente Prueba', '5555-1234',
            HASHBYTES('SHA2_256', CONVERT(VARCHAR(36), NEWID())),
            @IDPagado, N'Cliente Prueba', '5555-1234', N'1a calle 1-23 zona 1', N'Guatemala', @IDDepartamento,
            @IDMetodoEnvio, N'Envío de prueba', 100.00, 25.00, 125.00, 111.61, 13.39);
    SET @IDPedido = SCOPE_IDENTITY();

    INSERT INTO dbo.PedidoDetalle (IDPedido, IDVariante, IDCategoria, SKU, NombreProducto, Cantidad, PrecioUnitario, TotalLinea)
    SELECT @IDPedido, v.IDVariante, p.IDCategoria, v.SKU, p.Nombre, 1, 100.00, 100.00
    FROM dbo.Variante AS v
    INNER JOIN dbo.Producto AS p ON p.IDProducto = v.IDProducto
    WHERE v.IDVariante = @IDVariante;
    SET @IDPedidoDetalle = SCOPE_IDENTITY();
END;
GO

DECLARE @Fallas      INT = 0;
DECLARE @Esperado    NVARCHAR(100);
DECLARE @Descripcion NVARCHAR(200);
DECLARE @Ahora       DATETIME2(3) = SYSUTCDATETIME();
DECLARE @Expira      DATETIME2(3) = DATEADD(MINUTE, 15, SYSUTCDATETIME());

DECLARE @IDUsuario INT, @IDOtroUsuario INT, @IDVariante INT, @IDVariante2 INT, @IDMetodoEnvio INT, @IDCupon INT,
        @IDTipoEntrada TINYINT, @IDDepartamento TINYINT, @IDPagado TINYINT, @IDEnviado TINYINT, @IDCancelado TINYINT;
DECLARE @IDPedido INT, @IDCheckout BIGINT, @IDPedidoDetalle INT;
DECLARE @IDPedido2 INT, @IDCheckout2 BIGINT, @IDPedidoDetalle2 INT;

/* ========================================================================================
   Parte 1: restricciones de tabla
   ======================================================================================== */
BEGIN TRANSACTION;

EXEC #CrearBasePrueba;
SELECT @IDUsuario = IDUsuario, @IDOtroUsuario = IDOtroUsuario, @IDVariante = IDVariante, @IDVariante2 = IDVariante2,
       @IDMetodoEnvio = IDMetodoEnvio, @IDCupon = IDCupon, @IDTipoEntrada = IDTipoEntrada,
       @IDDepartamento = IDDepartamento, @IDPagado = IDPagado, @IDEnviado = IDEnviado, @IDCancelado = IDCancelado
FROM #Base;

EXEC #CrearPedidoPrueba @IDUsuario, @IDPedido OUTPUT, @IDCheckout OUTPUT, @IDPedidoDetalle OUTPUT;
EXEC #CrearPedidoPrueba @IDOtroUsuario, @IDPedido2 OUTPUT, @IDCheckout2 OUTPUT, @IDPedidoDetalle2 OUTPUT;

-- Checkout PENDIENTE de un carrito activo, con su reserva.
INSERT INTO dbo.Carrito (IDUsuario) VALUES (@IDUsuario);
DECLARE @IDCarritoActivo INT = SCOPE_IDENTITY();
DECLARE @Clave UNIQUEIDENTIFIER = NEWID();
INSERT INTO dbo.Checkout (IDCarrito, IDUsuario, ClaveIdempotencia, CorreoContacto, NombreContacto, TelefonoContacto,
                          EnvioNombre, EnvioTelefono, EnvioLinea1, EnvioMunicipio, IDDepartamento, IDMetodoEnvio,
                          Subtotal, CostoEnvio, Total, FechaExpiracion)
VALUES (@IDCarritoActivo, @IDUsuario, @Clave, N'cliente@shopcart.test', N'Cliente Prueba', '5555-1234',
        N'Cliente Prueba', '5555-1234', N'1a calle 1-23 zona 1', N'Guatemala', @IDDepartamento, @IDMetodoEnvio,
        100.00, 25.00, 125.00, @Expira);
DECLARE @IDCheckoutPendiente BIGINT = SCOPE_IDENTITY();
INSERT INTO dbo.CheckoutDetalle (IDCheckout, IDVariante, Cantidad, PrecioUnitario) VALUES (@IDCheckoutPendiente, @IDVariante, 1, 100.00);
INSERT INTO dbo.ReservaInventario (IDCheckout, IDVariante, Cantidad, FechaExpiracion) VALUES (@IDCheckoutPendiente, @IDVariante, 1, @Expira);

-- Pago aprobado del primer pedido, dirección del otro cliente y una devolución válida.
INSERT INTO dbo.Pago (IDCheckout, IDPedido, Estado, Marca, Ultimos4, CodigoAutorizacion, Monto, ReferenciaExterna)
VALUES (@IDCheckout, @IDPedido, 'APROBADO', 'VISA', '4242', 'AUT001', 125.00, 'REF-PRUEBA-1');

INSERT INTO dbo.Direccion (IDUsuario, Alias, NombreDestinatario, Telefono, Linea1, IDMunicipio)
VALUES (@IDOtroUsuario, N'Casa', N'Otro Cliente', '5555-9876', N'5a avenida 2-10 zona 9', 20001);
DECLARE @IDDireccionAjena INT = SCOPE_IDENTITY();

INSERT INTO dbo.Devolucion (IDPedido, Motivo, MontoReembolso, IDUsuario) VALUES (@IDPedido, N'Talla incorrecta', 100.00, @IDUsuario);
DECLARE @IDDevolucion INT = SCOPE_IDENTITY();

/* --- Comprobaciones positivas ------------------------------------------------------------ */
IF (SELECT COUNT(*) FROM dbo.PedidoHistorialEstado WHERE IDPedido = @IDPedido AND IDEstadoAnterior IS NULL AND IDUsuario = @IDUsuario) = 1
    PRINT N'OK     Crear un pedido registra su estado inicial en el historial (trigger).';
ELSE
BEGIN
    SET @Fallas += 1; PRINT N'FALLA  Crear un pedido no registró su estado inicial en el historial.';
END;

IF (SELECT NumeroPedido FROM dbo.Pedido WHERE IDPedido = @IDPedido) LIKE 'SC-[0-9][0-9][0-9][0-9][0-9][0-9]%'
    PRINT N'OK     El número de pedido se genera con el formato SC-000000.';
ELSE
BEGIN
    SET @Fallas += 1; PRINT N'FALLA  El número de pedido no tiene el formato SC-000000.';
END;

/* --- Checkout ----------------------------------------------------------------------------- */
SELECT @Esperado = N'CK_Checkout_Totales', @Descripcion = N'Checkout cuyo total no cuadra';
BEGIN TRY
    INSERT INTO dbo.Checkout (IDCarrito, IDUsuario, ClaveIdempotencia, CorreoContacto, NombreContacto, TelefonoContacto,
                              EnvioNombre, EnvioTelefono, EnvioLinea1, EnvioMunicipio, IDDepartamento, IDMetodoEnvio,
                              Subtotal, CostoEnvio, Total, Estado, FechaExpiracion, FechaCierre)
    VALUES (@IDCarritoActivo, @IDUsuario, NEWID(), N'cliente@shopcart.test', N'Cliente Prueba', '5555-1234',
            N'Cliente Prueba', '5555-1234', N'1a calle 1-23 zona 1', N'Guatemala', @IDDepartamento, @IDMetodoEnvio,
            100.00, 25.00, 99.00, 'CANCELADO', @Expira, @Ahora);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'UQ_Checkout_Carrito_ClaveIdempotencia', @Descripcion = N'Checkout repetido con la misma clave de idempotencia';
BEGIN TRY
    INSERT INTO dbo.Checkout (IDCarrito, IDUsuario, ClaveIdempotencia, CorreoContacto, NombreContacto, TelefonoContacto,
                              EnvioNombre, EnvioTelefono, EnvioLinea1, EnvioMunicipio, IDDepartamento, IDMetodoEnvio,
                              Subtotal, CostoEnvio, Total, Estado, FechaExpiracion, FechaCierre)
    VALUES (@IDCarritoActivo, @IDUsuario, @Clave, N'cliente@shopcart.test', N'Cliente Prueba', '5555-1234',
            N'Cliente Prueba', '5555-1234', N'1a calle 1-23 zona 1', N'Guatemala', @IDDepartamento, @IDMetodoEnvio,
            100.00, 25.00, 125.00, 'CANCELADO', @Expira, @Ahora);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'UQ_Checkout_CarritoPendiente', @Descripcion = N'Segundo checkout pendiente del mismo carrito';
BEGIN TRY
    INSERT INTO dbo.Checkout (IDCarrito, IDUsuario, ClaveIdempotencia, CorreoContacto, NombreContacto, TelefonoContacto,
                              EnvioNombre, EnvioTelefono, EnvioLinea1, EnvioMunicipio, IDDepartamento, IDMetodoEnvio,
                              Subtotal, CostoEnvio, Total, FechaExpiracion)
    VALUES (@IDCarritoActivo, @IDUsuario, NEWID(), N'cliente@shopcart.test', N'Cliente Prueba', '5555-1234',
            N'Cliente Prueba', '5555-1234', N'1a calle 1-23 zona 1', N'Guatemala', @IDDepartamento, @IDMetodoEnvio,
            100.00, 25.00, 125.00, @Expira);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'FK_Checkout_DireccionDelUsuario', @Descripcion = N'Checkout con la dirección de otro cliente';
BEGIN TRY
    INSERT INTO dbo.Checkout (IDCarrito, IDUsuario, ClaveIdempotencia, CorreoContacto, NombreContacto, TelefonoContacto,
                              IDDireccion, EnvioNombre, EnvioTelefono, EnvioLinea1, EnvioMunicipio, IDDepartamento, IDMetodoEnvio,
                              Subtotal, CostoEnvio, Total, Estado, FechaExpiracion, FechaCierre)
    VALUES (@IDCarritoActivo, @IDUsuario, NEWID(), N'cliente@shopcart.test', N'Cliente Prueba', '5555-1234',
            @IDDireccionAjena, N'Otro Cliente', '5555-9876', N'5a avenida 2-10 zona 9', N'Guatemala', @IDDepartamento, @IDMetodoEnvio,
            100.00, 25.00, 125.00, 'CANCELADO', @Expira, @Ahora);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_Checkout_DescuentoSinCupon', @Descripcion = N'Checkout con descuento y sin cupón';
BEGIN TRY
    INSERT INTO dbo.Checkout (IDCarrito, IDUsuario, ClaveIdempotencia, CorreoContacto, NombreContacto, TelefonoContacto,
                              EnvioNombre, EnvioTelefono, EnvioLinea1, EnvioMunicipio, IDDepartamento, IDMetodoEnvio,
                              Subtotal, Descuento, CostoEnvio, Total, Estado, FechaExpiracion, FechaCierre)
    VALUES (@IDCarritoActivo, @IDUsuario, NEWID(), N'cliente@shopcart.test', N'Cliente Prueba', '5555-1234',
            N'Cliente Prueba', '5555-1234', N'1a calle 1-23 zona 1', N'Guatemala', @IDDepartamento, @IDMetodoEnvio,
            100.00, 10.00, 25.00, 115.00, 'CANCELADO', @Expira, @Ahora);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'FK_ReservaInventario_CheckoutDetalle', @Descripcion = N'Reserva de una variante que no está en el checkout';
BEGIN TRY
    INSERT INTO dbo.ReservaInventario (IDCheckout, IDVariante, Cantidad, FechaExpiracion) VALUES (@IDCheckoutPendiente, @IDVariante2, 1, @Expira);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptada.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazada por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_ReservaInventario_Cierre', @Descripcion = N'Reserva consumida sin fecha de cierre';
BEGIN TRY
    UPDATE dbo.ReservaInventario SET Estado = 'CONSUMIDA' WHERE IDCheckout = @IDCheckoutPendiente;
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptada.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazada por ' + @Esperado + N'.';
END CATCH

/* --- Pedidos ------------------------------------------------------------------------------ */
SELECT @Esperado = N'UQ_Pedido_IDCheckout', @Descripcion = N'Segundo pedido del mismo checkout (doble clic)';
BEGIN TRY
    INSERT INTO dbo.Pedido (IDCheckout, IDUsuario, CorreoContacto, NombreContacto, TelefonoContacto, TokenSeguimientoHash,
                            IDEstadoPedido, EnvioNombre, EnvioTelefono, EnvioLinea1, EnvioMunicipio, IDDepartamento,
                            IDMetodoEnvio, NombreMetodoEnvio, Subtotal, CostoEnvio, Total, BaseImponible, IVA)
    VALUES (@IDCheckout, @IDUsuario, N'cliente@shopcart.test', N'Cliente Prueba', '5555-1234',
            HASHBYTES('SHA2_256', CONVERT(VARCHAR(36), NEWID())),
            @IDPagado, N'Cliente Prueba', '5555-1234', N'1a calle 1-23 zona 1', N'Guatemala', @IDDepartamento,
            @IDMetodoEnvio, N'Envío de prueba', 100.00, 25.00, 125.00, 111.61, 13.39);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_Pedido_Impuestos', @Descripcion = N'Pedido cuya base imponible + IVA no suma el total';
BEGIN TRY
    UPDATE dbo.Pedido SET IVA = 15.00 WHERE IDPedido = @IDPedido;
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_PedidoDetalle_TotalLinea', @Descripcion = N'Línea de pedido cuyo total no cuadra';
BEGIN TRY
    UPDATE dbo.PedidoDetalle SET TotalLinea = 90.00 WHERE IDPedidoDetalle = @IDPedidoDetalle;
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptada.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazada por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_PedidoDetalle_CantidadDevuelta', @Descripcion = N'Devolver más cantidad de la vendida';
BEGIN TRY
    UPDATE dbo.PedidoDetalle SET CantidadDevuelta = 2 WHERE IDPedidoDetalle = @IDPedidoDetalle;
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_PedidoHistorialEstado_UsuarioRequerido', @Descripcion = N'Cambio de estado en el historial sin usuario';
BEGIN TRY
    INSERT INTO dbo.PedidoHistorialEstado (IDPedido, IDEstadoAnterior, IDEstadoNuevo, IDUsuario)
    VALUES (@IDPedido, @IDPagado, @IDEnviado, NULL);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

/* --- Devoluciones ------------------------------------------------------------------------- */
SELECT @Esperado = N'FK_DevolucionDetalle_PedidoDetalle', @Descripcion = N'Devolver una línea de otro pedido';
BEGIN TRY
    INSERT INTO dbo.DevolucionDetalle (IDDevolucion, IDPedido, IDPedidoDetalle, Cantidad, MontoReembolso)
    VALUES (@IDDevolucion, @IDPedido, @IDPedidoDetalle2, 1, 100.00);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_MovimientoInventario_UnDocumento', @Descripcion = N'Movimiento de kardex con pedido y devolución a la vez';
BEGIN TRY
    INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimiento, Signo, Cantidad, SaldoAnterior, SaldoNuevo, IDPedido, IDDevolucion, IDUsuario)
    VALUES (@IDVariante, @IDTipoEntrada, 1, 1, 0, 1, @IDPedido, @IDDevolucion, @IDUsuario);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

/* --- Pagos y cupones ---------------------------------------------------------------------- */
SELECT @Esperado = N'UQ_Pago_CheckoutAprobado', @Descripcion = N'Segundo pago aprobado del mismo checkout';
BEGIN TRY
    INSERT INTO dbo.Pago (IDCheckout, IDPedido, Estado, Marca, Ultimos4, CodigoAutorizacion, Monto, ReferenciaExterna)
    VALUES (@IDCheckout, @IDPedido, 'APROBADO', 'VISA', '4242', 'AUT002', 125.00, 'REF-PRUEBA-2');
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_Pago_Resultado', @Descripcion = N'Pago rechazado con código de autorización';
BEGIN TRY
    INSERT INTO dbo.Pago (IDCheckout, Estado, Marca, Ultimos4, CodigoAutorizacion, MotivoRechazo, Monto, ReferenciaExterna)
    VALUES (@IDCheckout2, 'RECHAZADO', 'VISA', '0002', 'AUT003', 'FONDOS_INSUFICIENTES', 125.00, 'REF-PRUEBA-3');
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'FK_Pago_PedidoDelCheckout', @Descripcion = N'Pago de un checkout asociado al pedido de otro checkout';
BEGIN TRY
    INSERT INTO dbo.Pago (IDCheckout, IDPedido, Estado, Marca, Ultimos4, CodigoAutorizacion, Monto, ReferenciaExterna)
    VALUES (@IDCheckout2, @IDPedido, 'APROBADO', 'VISA', '4242', 'AUT004', 125.00, 'REF-PRUEBA-4');
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'FK_CuponUso_PedidoCupon', @Descripcion = N'Uso de un cupón distinto al registrado en el pedido';
BEGIN TRY
    INSERT INTO dbo.CuponUso (IDCupon, IDPedido, IDUsuario, CorreoCliente, MontoDescontado)
    VALUES (@IDCupon, @IDPedido, @IDUsuario, N'cliente@shopcart.test', 10.00);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

/* --- Parametro y Bitacora ----------------------------------------------------------------- */
SELECT @Esperado = N'CK_Parametro_ValorSegunTipo', @Descripcion = N'Parámetro entero con valor no numérico';
BEGIN TRY
    INSERT INTO dbo.Parametro (IDParametro, Clave, Valor, TipoDato, Descripcion)
    VALUES (200, 'PRUEBA_MINUTOS', N'quince', 'ENTERO', N'Parámetro de prueba');
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_Parametro_ValorEnRango', @Descripcion = N'Parámetro con valor fuera de su rango';
BEGIN TRY
    INSERT INTO dbo.Parametro (IDParametro, Clave, Valor, TipoDato, Descripcion, ValorMinimo, ValorMaximo)
    VALUES (200, 'PRUEBA_RANGO', N'121', 'ENTERO', N'Parámetro de prueba', 1, 120);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_Parametro_RangoValido', @Descripcion = N'Parámetro con mínimo mayor que el máximo';
BEGIN TRY
    INSERT INTO dbo.Parametro (IDParametro, Clave, Valor, TipoDato, Descripcion, ValorMinimo, ValorMaximo)
    VALUES (200, 'PRUEBA_RANGO', N'5', 'ENTERO', N'Parámetro de prueba', 10, 1);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_Parametro_RangoValido', @Descripcion = N'Parámetro con un solo límite';
BEGIN TRY
    INSERT INTO dbo.Parametro (IDParametro, Clave, Valor, TipoDato, Descripcion, ValorMinimo, ValorMaximo)
    VALUES (200, 'PRUEBA_RANGO', N'5', 'ENTERO', N'Parámetro de prueba', 1, NULL);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_Parametro_RangoValido', @Descripcion = N'Parámetro de texto con rango';
BEGIN TRY
    INSERT INTO dbo.Parametro (IDParametro, Clave, Valor, TipoDato, Descripcion, ValorMinimo, ValorMaximo)
    VALUES (200, 'PRUEBA_RANGO', N'abc', 'TEXTO', N'Parámetro de prueba', 1, 10);
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N'.';
END CATCH

SELECT @Esperado = N'CK_Bitacora_ValoresJSON', @Descripcion = N'Bitácora con valor que no es JSON';
BEGIN TRY
    INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorNuevo)
    VALUES (@IDUsuario, 'CATALOGO', 'Variante', '1', 'MODIFICAR', N'precio=100');
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptada.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazada por ' + @Esperado + N'.';
END CATCH

ROLLBACK TRANSACTION;
DELETE FROM #Base;

/* ========================================================================================
   Parte 2: triggers (cada prueba en su propia transacción)
   ======================================================================================== */

/* Transición permitida: registra el historial. Transición no permitida: se rechaza. */
BEGIN TRANSACTION;
EXEC #CrearBasePrueba;
SELECT @IDUsuario = IDUsuario, @IDPagado = IDPagado, @IDEnviado = IDEnviado, @IDCancelado = IDCancelado FROM #Base;
EXEC #CrearPedidoPrueba @IDUsuario, @IDPedido OUTPUT, @IDCheckout OUTPUT, @IDPedidoDetalle OUTPUT;

UPDATE dbo.Pedido SET IDEstadoPedido = @IDEnviado WHERE IDPedido = @IDPedido;
IF EXISTS (SELECT 1 FROM dbo.PedidoHistorialEstado
           WHERE IDPedido = @IDPedido AND IDEstadoAnterior = @IDPagado AND IDEstadoNuevo = @IDEnviado AND IDUsuario = @IDUsuario)
    PRINT N'OK     Una transición permitida registra usuario, estado anterior y nuevo en el historial (trigger).';
ELSE
BEGIN
    SET @Fallas += 1; PRINT N'FALLA  La transición permitida no quedó en el historial.';
END;

SELECT @Esperado = N'TRANSICION_NO_PERMITIDA', @Descripcion = N'Cancelar un pedido ya enviado';
BEGIN TRY
    UPDATE dbo.Pedido SET IDEstadoPedido = @IDCancelado WHERE IDPedido = @IDPedido;
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N' (trigger).';
END CATCH
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
DELETE FROM #Base;

/* Cambio de estado sin actor identificado. */
BEGIN TRANSACTION;
EXEC #CrearBasePrueba;
SELECT @IDUsuario = IDUsuario, @IDEnviado = IDEnviado FROM #Base;
EXEC #CrearPedidoPrueba @IDUsuario, @IDPedido OUTPUT, @IDCheckout OUTPUT, @IDPedidoDetalle OUTPUT;
EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = NULL;

SELECT @Esperado = N'ACTOR_REQUERIDO', @Descripcion = N'Cambio de estado sin usuario identificado';
BEGIN TRY
    UPDATE dbo.Pedido SET IDEstadoPedido = @IDEnviado WHERE IDPedido = @IDPedido;
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N' (trigger).';
END CATCH
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
DELETE FROM #Base;

/* Pedido creado en un estado que no es el inicial. */
BEGIN TRANSACTION;
EXEC #CrearBasePrueba;
SELECT @IDUsuario = IDUsuario, @IDEnviado = IDEnviado FROM #Base;
EXEC #CrearPedidoPrueba @IDUsuario, @IDPedido OUTPUT, @IDCheckout OUTPUT, @IDPedidoDetalle OUTPUT;

-- Checkout nuevo (copia del existente) para que la única regla violada sea la del trigger.
INSERT INTO dbo.Carrito (IDUsuario, Estado) VALUES (@IDUsuario, 'CONVERTIDO');
DECLARE @IDCarritoNuevo INT = SCOPE_IDENTITY();
INSERT INTO dbo.Checkout (IDCarrito, IDUsuario, ClaveIdempotencia, CorreoContacto, NombreContacto, TelefonoContacto,
                          EnvioNombre, EnvioTelefono, EnvioLinea1, EnvioMunicipio, IDDepartamento, IDMetodoEnvio,
                          Subtotal, CostoEnvio, Total, Estado, FechaExpiracion, FechaCierre)
SELECT @IDCarritoNuevo, IDUsuario, NEWID(), CorreoContacto, NombreContacto, TelefonoContacto,
       EnvioNombre, EnvioTelefono, EnvioLinea1, EnvioMunicipio, IDDepartamento, IDMetodoEnvio,
       Subtotal, CostoEnvio, Total, Estado, FechaExpiracion, FechaCierre
FROM dbo.Checkout WHERE IDCheckout = @IDCheckout;
DECLARE @IDCheckoutNuevo BIGINT = SCOPE_IDENTITY();

SELECT @Esperado = N'ESTADO_INICIAL_INVALIDO', @Descripcion = N'Pedido creado directamente como enviado';
BEGIN TRY
    INSERT INTO dbo.Pedido (IDCheckout, IDUsuario, CorreoContacto, NombreContacto, TelefonoContacto, TokenSeguimientoHash,
                            IDEstadoPedido, EnvioNombre, EnvioTelefono, EnvioLinea1, EnvioMunicipio, IDDepartamento,
                            IDMetodoEnvio, NombreMetodoEnvio, Subtotal, CostoEnvio, Total, BaseImponible, IVA)
    SELECT @IDCheckoutNuevo, IDUsuario, CorreoContacto, NombreContacto, TelefonoContacto,
           HASHBYTES('SHA2_256', CONVERT(VARCHAR(36), NEWID())),
           @IDEnviado, EnvioNombre, EnvioTelefono, EnvioLinea1, EnvioMunicipio, IDDepartamento,
           IDMetodoEnvio, NombreMetodoEnvio, Subtotal, CostoEnvio, Total, BaseImponible, IVA
    FROM dbo.Pedido WHERE IDPedido = @IDPedido;
    SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
END TRY
BEGIN CATCH
    IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
    PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N' (trigger).';
END CATCH
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
DELETE FROM #Base;

/* Registros inmutables: kardex, historial de precios, historial de estados y bitácora. */
DECLARE @Inmutables TABLE (Orden INT IDENTITY, Descripcion NVARCHAR(200));
INSERT INTO @Inmutables (Descripcion)
VALUES (N'Modificar un movimiento del kardex'),
       (N'Eliminar un cambio de precio del historial'),
       (N'Eliminar un cambio de estado del historial del pedido'),
       (N'Modificar un registro de la bitácora');

DECLARE @Orden INT = 1;
WHILE @Orden <= 4
BEGIN
    SELECT @Descripcion = Descripcion, @Esperado = N'REGISTRO_INMUTABLE' FROM @Inmutables WHERE Orden = @Orden;

    BEGIN TRANSACTION;
    EXEC #CrearBasePrueba;
    SELECT @IDUsuario = IDUsuario, @IDVariante = IDVariante, @IDTipoEntrada = IDTipoEntrada FROM #Base;
    EXEC #CrearPedidoPrueba @IDUsuario, @IDPedido OUTPUT, @IDCheckout OUTPUT, @IDPedidoDetalle OUTPUT;

    INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimiento, Signo, Cantidad, SaldoAnterior, SaldoNuevo, IDUsuario)
    VALUES (@IDVariante, @IDTipoEntrada, 1, 5, 0, 5, @IDUsuario);
    INSERT INTO dbo.HistorialPrecio (IDVariante, PrecioAnterior, PrecioNuevo, IDUsuario) VALUES (@IDVariante, NULL, 100.00, @IDUsuario);
    INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorNuevo)
    VALUES (@IDUsuario, 'CATALOGO', 'Variante', CONVERT(VARCHAR(50), @IDVariante), 'CREAR', N'{"Precio":100.00}');

    BEGIN TRY
        IF @Orden = 1 UPDATE dbo.MovimientoInventario SET Cantidad = 50, SaldoNuevo = 50 WHERE IDVariante = @IDVariante;
        IF @Orden = 2 DELETE FROM dbo.HistorialPrecio WHERE IDVariante = @IDVariante;
        IF @Orden = 3 DELETE FROM dbo.PedidoHistorialEstado WHERE IDPedido = @IDPedido;
        IF @Orden = 4 UPDATE dbo.Bitacora SET ValorNuevo = N'{"Precio":1.00}' WHERE IDUsuario = @IDUsuario;
        SET @Fallas += 1; PRINT N'FALLA  ' + @Descripcion + N' fue aceptado.';
    END TRY
    BEGIN CATCH
        IF ERROR_MESSAGE() NOT LIKE N'%' + @Esperado + N'%' THROW;
        PRINT N'OK     ' + @Descripcion + N' rechazado por ' + @Esperado + N' (trigger).';
    END CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    DELETE FROM #Base;

    SET @Orden += 1;
END;

EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = NULL;

/* --- Resultado ---------------------------------------------------------------------------- */
IF @Fallas > 0
    THROW 50000, N'Pruebas de integridad de Checkout y Pedidos fallidas.', 1;
GO
