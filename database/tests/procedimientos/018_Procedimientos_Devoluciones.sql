/*
    018_Procedimientos_Devoluciones.sql
    Se ejecuta conectado como shopcart_migrator (deploy.ps1 -Probar). Mismo esquema que
    009–017: el migrador prepara los datos y ejecuta cada SP haciéndose pasar por un miembro
    de RolApi; los casos de error usan #EsperarError. Los SKU de prueba empiezan con DEV-PRUEBA.
    Los pedidos de la preparación se crean por el flujo real (carrito → checkout → pago) y el
    primero se lleva hasta ENTREGADO.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT OFF;
GO

-- Permite ejecutar el script varias veces en la misma conexión (p. ej. en SSMS).
DROP TABLE IF EXISTS #Contexto, #Base, #Carrito, #Checkout, #PedidoCliente, #PedidoPanel, #Devoluciones;
DROP PROCEDURE IF EXISTS #Verificar;
DROP PROCEDURE IF EXISTS #Preparar;
DROP PROCEDURE IF EXISTS #EsperarError;
GO

CREATE TABLE #Contexto (UsuarioApi SYSNAME NOT NULL);
CREATE TABLE #Base (IDCliente INT, IDOperador INT, IDA INT, IDPedido1 INT, IDPedido2 INT, IDLineaA INT, IDLineaB INT);

-- Resultados de los SPs (misma forma que devuelven).
CREATE TABLE #Carrito (IDCarrito INT, MaximoPorLinea INT, CantidadArticulos INT, Subtotal DECIMAL(12, 2), Descuento DECIMAL(12, 2),
                       Total DECIMAL(12, 2), PuedeComprar BIT, Cupon NVARCHAR(MAX), Items NVARCHAR(MAX));
CREATE TABLE #Checkout (IDCheckout BIGINT, Estado VARCHAR(20), FechaCreacion DATETIME2(3), FechaExpiracion DATETIME2(3), SegundosRestantes INT,
                        CorreoContacto NVARCHAR(254), NombreContacto NVARCHAR(200), TelefonoContacto VARCHAR(20), IDDireccion INT,
                        EnvioNombre NVARCHAR(150), EnvioTelefono VARCHAR(20), EnvioLinea1 NVARCHAR(200), EnvioLinea2 NVARCHAR(200),
                        EnvioMunicipio NVARCHAR(100), IDDepartamento TINYINT, Departamento NVARCHAR(50), EnvioCodigoPostal VARCHAR(5),
                        EnvioReferencias NVARCHAR(300), IDMetodoEnvio INT, MetodoEnvio NVARCHAR(100), DiasEstimadosMin TINYINT,
                        DiasEstimadosMax TINYINT, CodigoCupon VARCHAR(30), Subtotal DECIMAL(12, 2), Descuento DECIMAL(12, 2),
                        CostoEnvio DECIMAL(12, 2), Total DECIMAL(12, 2), BaseImponible DECIMAL(12, 2), IVA DECIMAL(12, 2),
                        IDPedido INT, NumeroPedido VARCHAR(15), Lineas NVARCHAR(MAX));
CREATE TABLE #PedidoCliente (IDPedido INT, NumeroPedido VARCHAR(15), FechaPedido DATETIME2(3), CodigoEstado VARCHAR(20), Estado NVARCHAR(50),
                             CorreoContacto NVARCHAR(254), NombreContacto NVARCHAR(200), TelefonoContacto VARCHAR(20), EnvioNombre NVARCHAR(150),
                             EnvioTelefono VARCHAR(20), EnvioLinea1 NVARCHAR(200), EnvioLinea2 NVARCHAR(200), EnvioMunicipio NVARCHAR(100),
                             Departamento NVARCHAR(50), EnvioCodigoPostal VARCHAR(5), EnvioReferencias NVARCHAR(300), NombreMetodoEnvio NVARCHAR(100),
                             CodigoCupon VARCHAR(30), Subtotal DECIMAL(12, 2), Descuento DECIMAL(12, 2), CostoEnvio DECIMAL(12, 2),
                             Total DECIMAL(12, 2), BaseImponible DECIMAL(12, 2), IVA DECIMAL(12, 2), PuedeCancelar BIT,
                             Lineas NVARCHAR(MAX), Historial NVARCHAR(MAX), Pagos NVARCHAR(MAX), Devoluciones NVARCHAR(MAX));
CREATE TABLE #PedidoPanel (IDPedido INT, NumeroPedido VARCHAR(15), FechaPedido DATETIME2(3), CodigoEstado VARCHAR(20), Estado NVARCHAR(50),
                           IDUsuario INT, CorreoContacto NVARCHAR(254), NombreContacto NVARCHAR(200), TelefonoContacto VARCHAR(20),
                           EnvioNombre NVARCHAR(150), EnvioTelefono VARCHAR(20), EnvioLinea1 NVARCHAR(200), EnvioLinea2 NVARCHAR(200),
                           EnvioMunicipio NVARCHAR(100), IDDepartamento TINYINT, Departamento NVARCHAR(50), EnvioCodigoPostal VARCHAR(5),
                           EnvioReferencias NVARCHAR(300), NombreMetodoEnvio NVARCHAR(100), CodigoCupon VARCHAR(30), Subtotal DECIMAL(12, 2),
                           Descuento DECIMAL(12, 2), CostoEnvio DECIMAL(12, 2), Total DECIMAL(12, 2), BaseImponible DECIMAL(12, 2),
                           IVA DECIMAL(12, 2), PuedeCancelar BIT, Lineas NVARCHAR(MAX), Historial NVARCHAR(MAX), Pagos NVARCHAR(MAX),
                           Devoluciones NVARCHAR(MAX));
CREATE TABLE #Devoluciones (IDDevolucion INT, Fecha DATETIME2(3), IDPedido INT, NumeroPedido VARCHAR(15), Motivo NVARCHAR(500),
                            MontoReembolso DECIMAL(12, 2), Unidades INT, Usuario NVARCHAR(201));
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
    Datos de cada caso (lo que carga la semilla se agrega solo si falta):
    - Roles, usuario de sistema, parámetros (límite 5, reserva 15 min, IVA 12 %, 30 días para
      devolver), estados y transiciones del pedido, tipos de movimiento.
    - A 40.00 con 10 unidades y B 25.00 con 5, con su inventario inicial en el kardex.
    - Pedido 1 del cliente: 3 de A con un cupón de Q20 (la línea cuesta Q100.00), llevado
      hasta ENTREGADO. Pedido 2 de otro cliente: 1 de B, sigue PAGADO.
*/
CREATE PROCEDURE #Preparar
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Hash VARCHAR(255) = '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA';
    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @IDCliente INT, @IDCliente2 INT, @IDOperador INT, @IDAdmin INT, @IDCategoria INT, @IDProducto INT, @IDA INT, @IDB INT,
            @IDDireccion INT, @IDDireccion2 INT, @IDEnvio INT, @IDInicial TINYINT, @IDCheckout BIGINT, @IDPedido1 INT, @IDPedido2 INT,
            @K UNIQUEIDENTIFIER, @Seguimiento VARBINARY(64);

    INSERT INTO dbo.Rol (IDRol, Codigo, Nombre)
    SELECT v.IDRol, v.Codigo, v.Nombre
    FROM (VALUES (201, 'CLIENTE', N'Cliente'), (202, 'OPERADOR', N'Operador'), (203, 'ADMIN', N'Administrador'))
         AS v (IDRol, Codigo, Nombre)
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Rol AS r WHERE r.Codigo = v.Codigo);

    DECLARE @Parametros TABLE (IDParametro TINYINT, Clave VARCHAR(50), Valor NVARCHAR(200), TipoDato VARCHAR(10));
    INSERT INTO @Parametros VALUES (210, 'MAXIMO_UNIDADES_POR_LINEA', N'5', 'ENTERO'), (211, 'MINUTOS_RESERVA', N'15', 'ENTERO'),
                                   (212, 'TASA_IVA', N'0.12', 'DECIMAL'), (213, 'DIAS_DEVOLUCION', N'30', 'ENTERO');
    UPDATE p SET Valor = v.Valor FROM dbo.Parametro AS p JOIN @Parametros AS v ON v.Clave = p.Clave;
    INSERT INTO dbo.Parametro (IDParametro, Clave, Valor, TipoDato, Descripcion)
    SELECT v.IDParametro, v.Clave, v.Valor, v.TipoDato, N'Prueba'
    FROM @Parametros AS v
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Parametro AS p WHERE p.Clave = v.Clave);

    DECLARE @Estados TABLE (IDEstadoPedido TINYINT, Codigo VARCHAR(20), Nombre NVARCHAR(50), Orden TINYINT, EsInicial BIT, EsFinal BIT,
                            CuentaComoVenta BIT);
    INSERT INTO @Estados VALUES (201, 'PAGADO', N'Pagado', 1, 1, 0, 1), (202, 'EN_PREPARACION', N'En preparación', 2, 0, 0, 1),
                                (203, 'ENVIADO', N'Enviado', 3, 0, 0, 1), (204, 'ENTREGADO', N'Entregado', 4, 0, 0, 1),
                                (205, 'CANCELADO', N'Cancelado', 5, 0, 1, 0), (206, 'DEVUELTO_PARCIAL', N'Devuelto parcialmente', 6, 0, 0, 1),
                                (207, 'DEVUELTO', N'Devuelto', 7, 0, 1, 0);
    INSERT INTO dbo.EstadoPedido (IDEstadoPedido, Codigo, Nombre, Orden, EsInicial, EsFinal, CuentaComoVenta)
    SELECT v.IDEstadoPedido, v.Codigo, v.Nombre, v.Orden, v.EsInicial, v.EsFinal, v.CuentaComoVenta
    FROM @Estados AS v
    WHERE NOT EXISTS (SELECT 1 FROM dbo.EstadoPedido AS e WHERE e.Codigo = v.Codigo);

    INSERT INTO dbo.TransicionEstadoPedido (IDEstadoOrigen, IDEstadoDestino, PermiteCliente)
    SELECT o.IDEstadoPedido, d.IDEstadoPedido, v.PermiteCliente
    FROM (VALUES ('PAGADO', 'EN_PREPARACION', 0), ('PAGADO', 'CANCELADO', 1), ('EN_PREPARACION', 'ENVIADO', 0),
                 ('EN_PREPARACION', 'CANCELADO', 0), ('ENVIADO', 'ENTREGADO', 0), ('ENTREGADO', 'DEVUELTO_PARCIAL', 0),
                 ('ENTREGADO', 'DEVUELTO', 0), ('DEVUELTO_PARCIAL', 'DEVUELTO', 0)) AS v (Origen, Destino, PermiteCliente)
    JOIN dbo.EstadoPedido AS o ON o.Codigo = v.Origen
    JOIN dbo.EstadoPedido AS d ON d.Codigo = v.Destino
    WHERE NOT EXISTS (SELECT 1 FROM dbo.TransicionEstadoPedido AS t WHERE t.IDEstadoOrigen = o.IDEstadoPedido AND t.IDEstadoDestino = d.IDEstadoPedido);

    INSERT INTO dbo.TipoMovimiento (IDTipoMovimiento, Codigo, Nombre, Signo)
    SELECT v.IDTipoMovimiento, v.Codigo, v.Nombre, v.Signo
    FROM (VALUES (221, 'INVENTARIO_INICIAL', N'Inventario inicial', 1), (222, 'SALIDA_VENTA', N'Salida por venta', -1),
                 (223, 'CANCELACION', N'Cancelación', 1), (224, 'DEVOLUCION', N'Devolución', 1)) AS v (IDTipoMovimiento, Codigo, Nombre, Signo)
    WHERE NOT EXISTS (SELECT 1 FROM dbo.TipoMovimiento AS t WHERE t.Codigo = v.Codigo);
    SET @IDInicial = (SELECT IDTipoMovimiento FROM dbo.TipoMovimiento WHERE Codigo = 'INVENTARIO_INICIAL');

    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'cliente.devoluciones@shopcart.test', @Hash, N'Cliente', N'Devoluciones' FROM dbo.Rol AS r WHERE r.Codigo = 'CLIENTE';
    SET @IDCliente = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'cliente2.devoluciones@shopcart.test', @Hash, N'Cliente', N'Dos' FROM dbo.Rol AS r WHERE r.Codigo = 'CLIENTE';
    SET @IDCliente2 = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'operador.devoluciones@shopcart.test', @Hash, N'Operador', N'Devoluciones' FROM dbo.Rol AS r WHERE r.Codigo = 'OPERADOR';
    SET @IDOperador = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'admin.devoluciones@shopcart.test', @Hash, N'Admin', N'Devoluciones' FROM dbo.Rol AS r WHERE r.Codigo = 'ADMIN';
    SET @IDAdmin = SCOPE_IDENTITY();
    IF NOT EXISTS (SELECT 1 FROM dbo.Usuario WHERE EsSistema = 1)
        INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido, EsSistema)
        SELECT r.IDRol, N'sistema.devoluciones@shopcart.test', NULL, N'Sistema', N'Devoluciones', 1 FROM dbo.Rol AS r WHERE r.Codigo = 'ADMIN';

    INSERT INTO dbo.Departamento (IDDepartamento, Nombre) VALUES (240, N'Departamento Devoluciones Prueba');
    INSERT INTO dbo.Municipio (IDMunicipio, IDDepartamento, Nombre) VALUES (24001, 240, N'Municipio Devoluciones Prueba');
    INSERT INTO dbo.Direccion (IDUsuario, Alias, NombreDestinatario, Telefono, Linea1, IDMunicipio, EsPredeterminada)
    VALUES (@IDCliente, N'Casa', N'Cliente Devoluciones', '5555-1234', N'1a calle 1-23 zona 1', 24001, 1);
    SET @IDDireccion = SCOPE_IDENTITY();
    INSERT INTO dbo.Direccion (IDUsuario, Alias, NombreDestinatario, Telefono, Linea1, IDMunicipio, EsPredeterminada)
    VALUES (@IDCliente2, N'Casa', N'Cliente Dos', '5555-9999', N'2a calle 2-34 zona 2', 24001, 1);
    SET @IDDireccion2 = SCOPE_IDENTITY();

    INSERT INTO dbo.Categoria (Nombre, Slug) VALUES (N'Devoluciones Prueba', 'devoluciones-prueba');
    SET @IDCategoria = SCOPE_IDENTITY();
    INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug, Activo) VALUES (@IDCategoria, N'Taza Devoluciones Prueba', 'taza-devoluciones-prueba', 1);
    SET @IDProducto = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica, ClaveCombinacion) VALUES (@IDProducto, 'DEV-PRUEBA-A', 40.00, 10, '1');
    SET @IDA = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica, ClaveCombinacion) VALUES (@IDProducto, 'DEV-PRUEBA-B', 25.00, 5, '2');
    SET @IDB = SCOPE_IDENTITY();
    INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimiento, Signo, Cantidad, SaldoAnterior, SaldoNuevo, IDUsuario)
    VALUES (@IDA, @IDInicial, 1, 10, 0, 10, @IDAdmin), (@IDB, @IDInicial, 1, 5, 0, 5, @IDAdmin);

    INSERT INTO dbo.MetodoEnvio (Nombre, Costo, DiasEstimadosMin, DiasEstimadosMax) VALUES (N'Estándar Devoluciones Prueba', 25.00, 2, 4);
    SET @IDEnvio = SCOPE_IDENTITY();
    INSERT INTO dbo.Cupon (Codigo, Descripcion, TipoDescuento, Valor, FechaInicio, FechaFin)
    VALUES ('DEV-PRUEBA-VEINTE', N'Q20 de descuento', 'MONTO_FIJO', 20, DATEADD(DAY, -1, @Ahora), DATEADD(DAY, 30, @Ahora));

    -- Pedido 1: 3 de A con el cupón (línea de Q100.00), hasta ENTREGADO.
    SELECT @K = NEWID(), @Seguimiento = HASHBYTES('SHA2_256', CONVERT(VARCHAR(36), NEWID()));
    INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @IDCliente, @IDVariante = @IDA, @Cantidad = 3;
    INSERT INTO #Carrito EXEC dbo.SP_Carrito_AplicarCupon @IDUsuario = @IDCliente, @Codigo = 'DEV-PRUEBA-VEINTE';
    INSERT INTO #Checkout EXEC dbo.SP_Checkout_Iniciar @IDUsuario = @IDCliente, @ClaveIdempotencia = @K, @IDMetodoEnvio = @IDEnvio,
                                                       @IDDireccion = @IDDireccion;
    SET @IDCheckout = (SELECT IDCheckout FROM #Checkout);
    INSERT INTO #PedidoCliente EXEC dbo.SP_Pedidos_Crear @IDUsuario = @IDCliente, @IDCheckout = @IDCheckout, @Marca = 'VISA', @Ultimos4 = '4242',
                                                         @CodigoAutorizacion = 'AUT-DEV-1', @ReferenciaExterna = 'REF-DEV-PRUEBA-1',
                                                         @TokenSeguimientoHash = @Seguimiento;
    SET @IDPedido1 = (SELECT IDPedido FROM #PedidoCliente);
    INSERT INTO #PedidoPanel EXEC dbo.SP_Pedidos_CambiarEstado @IDOperador, @IDPedido1, 'EN_PREPARACION';
    INSERT INTO #PedidoPanel EXEC dbo.SP_Pedidos_CambiarEstado @IDOperador, @IDPedido1, 'ENVIADO';
    INSERT INTO #PedidoPanel EXEC dbo.SP_Pedidos_CambiarEstado @IDOperador, @IDPedido1, 'ENTREGADO';

    -- Pedido 2: 1 de B de otro cliente, sigue PAGADO.
    DELETE FROM #Checkout; DELETE FROM #PedidoCliente;
    SELECT @K = NEWID(), @Seguimiento = HASHBYTES('SHA2_256', CONVERT(VARCHAR(36), NEWID()));
    INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @IDCliente2, @IDVariante = @IDB;
    INSERT INTO #Checkout EXEC dbo.SP_Checkout_Iniciar @IDUsuario = @IDCliente2, @ClaveIdempotencia = @K, @IDMetodoEnvio = @IDEnvio,
                                                       @IDDireccion = @IDDireccion2;
    SET @IDCheckout = (SELECT IDCheckout FROM #Checkout);
    INSERT INTO #PedidoCliente EXEC dbo.SP_Pedidos_Crear @IDUsuario = @IDCliente2, @IDCheckout = @IDCheckout, @Marca = 'VISA', @Ultimos4 = '4242',
                                                         @CodigoAutorizacion = 'AUT-DEV-2', @ReferenciaExterna = 'REF-DEV-PRUEBA-2',
                                                         @TokenSeguimientoHash = @Seguimiento;
    SET @IDPedido2 = (SELECT IDPedido FROM #PedidoCliente);
    DELETE FROM #Carrito; DELETE FROM #Checkout; DELETE FROM #PedidoCliente; DELETE FROM #PedidoPanel;

    DELETE FROM #Base;
    INSERT INTO #Base
    SELECT @IDCliente, @IDOperador, @IDA, @IDPedido1, @IDPedido2,
           (SELECT IDPedidoDetalle FROM dbo.PedidoDetalle WHERE IDPedido = @IDPedido1),
           (SELECT IDPedidoDetalle FROM dbo.PedidoDetalle WHERE IDPedido = @IDPedido2);
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
    DELETE FROM #PedidoPanel; DELETE FROM #Devoluciones;

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
DECLARE @IDCliente INT, @IDOperador INT, @IDA INT, @IDPedido1 INT, @IDLineaA INT, @Total INT;
DECLARE @Texto NVARCHAR(400);
DECLARE @Lineas dbo.TT_Devoluciones_Linea;

BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDCliente = IDCliente, @IDOperador = IDOperador, @IDA = IDA, @IDPedido1 = IDPedido1, @IDLineaA = IDLineaA FROM #Base;

/* === Devolución en tres partes de una línea de 3 unidades que costó Q100.00 =============== */
INSERT INTO @Lineas VALUES (@IDLineaA, 1, 1);
EXECUTE AS USER = @Api;
INSERT INTO #PedidoPanel EXEC dbo.SP_Devoluciones_Registrar @IDOperador, @IDPedido1, N'  Talla incorrecta  ', @Lineas;
REVERT;
SET @Texto = (SELECT CONCAT(CodigoEstado, N'|', JSON_VALUE(Lineas, '$[0].CantidadDevuelta'), N'|',
                            JSON_VALUE(Devoluciones, '$[0].Motivo'), N':', JSON_VALUE(Devoluciones, '$[0].MontoReembolso'), N':',
                            JSON_VALUE(Devoluciones, '$[0].Usuario'), N'|', JSON_VALUE(Historial, '$[4].CodigoEstado'), N':',
                            JSON_VALUE(Historial, '$[4].Comentario'))
              FROM #PedidoPanel);
SET @Texto += N'|' + CONCAT((SELECT ExistenciaFisica FROM dbo.Variante WHERE IDVariante = @IDA), N':',
                            (SELECT CONCAT(t.Codigo, N'+', m.Cantidad, N':', CASE WHEN m.IDDevolucion IS NOT NULL AND m.IDPedido IS NULL THEN N'por devolución' END)
                             FROM dbo.MovimientoInventario AS m JOIN dbo.TipoMovimiento AS t ON t.IDTipoMovimiento = m.IDTipoMovimiento
                             WHERE t.Codigo = 'DEVOLUCION' AND m.IDVariante = @IDA), N'|',
                            (SELECT COUNT(*) FROM dbo.Bitacora WHERE Modulo = 'PEDIDOS' AND Accion = 'CAMBIAR_ESTADO'
                             AND IDEntidad = CAST(@IDPedido1 AS VARCHAR(50)) AND JSON_VALUE(ValorNuevo, '$.Estado') = 'DEVUELTO_PARCIAL'));
DELETE FROM #PedidoPanel;
EXEC #Verificar N'Devolver 1 de 3: DEVUELTO_PARCIAL, reembolso Q33.33, reingresa con kardex DEVOLUCION; historial y bitácora',
     N'DEVUELTO_PARCIAL|1|Talla incorrecta:33.33:Operador Devoluciones|DEVUELTO_PARCIAL:Talla incorrecta|8:DEVOLUCION+1:por devolución|1', @Texto;

DELETE FROM @Lineas;
INSERT INTO @Lineas VALUES (@IDLineaA, 1, 1);
EXECUTE AS USER = @Api;
INSERT INTO #PedidoPanel EXEC dbo.SP_Devoluciones_Registrar @IDOperador, @IDPedido1, N'Otra talla incorrecta', @Lineas;
REVERT;
SET @Texto = (SELECT CONCAT(CodigoEstado, N'|', JSON_VALUE(Devoluciones, '$[1].MontoReembolso'), N'|',
                            (SELECT COUNT(*) FROM OPENJSON(Historial))) FROM #PedidoPanel);
SET @Texto += N'|' + CAST((SELECT ExistenciaFisica FROM dbo.Variante WHERE IDVariante = @IDA) AS NVARCHAR(10));
DELETE FROM #PedidoPanel;
EXEC #Verificar N'Devolver otra: Q33.34 (acumulado); sigue DEVUELTO_PARCIAL sin otra entrada en el historial', N'DEVUELTO_PARCIAL|33.34|5|9', @Texto;

DELETE FROM @Lineas;
INSERT INTO @Lineas VALUES (@IDLineaA, 1, 0);
EXECUTE AS USER = @Api;
INSERT INTO #PedidoPanel EXEC dbo.SP_Devoluciones_Registrar @IDOperador, @IDPedido1, N'Llegó dañada', @Lineas;
INSERT INTO #PedidoCliente EXEC dbo.SP_Pedidos_ObtenerCliente @IDCliente, @IDPedido1;
INSERT INTO #Devoluciones EXEC dbo.SP_Devoluciones_Listar @IDOperador, NULL, NULL, 1, 20, @Total OUTPUT;
REVERT;
SET @Texto = (SELECT CONCAT(CodigoEstado, N'|', JSON_VALUE(Devoluciones, '$[2].MontoReembolso'), N':', JSON_VALUE(Devoluciones, '$[2].Lineas[0].Reingresa'),
                            N'|', (SELECT SUM(j.MontoReembolso) FROM OPENJSON(Devoluciones) WITH (MontoReembolso DECIMAL(12, 2)) AS j), N'=',
                            JSON_VALUE(Lineas, '$[0].TotalLinea'))
              FROM #PedidoPanel);
SET @Texto += N'|' + CONCAT((SELECT ExistenciaFisica FROM dbo.Variante WHERE IDVariante = @IDA), N':',
                            (SELECT Cuadra FROM dbo.VW_Inventario_Conciliacion WHERE IDVariante = @IDA), N'|',
                            (SELECT CASE WHEN FechaReversion IS NULL THEN N'cupón sigue usado' END FROM dbo.CuponUso WHERE IDPedido = @IDPedido1));
SET @Texto += N'|' + (SELECT CONCAT(CodigoEstado, N':', ISNULL(JSON_VALUE(Devoluciones, '$[0].Usuario'), N'sin usuario'), N':',
                                    (SELECT COUNT(*) FROM OPENJSON(Devoluciones))) FROM #PedidoCliente);
SET @Texto += N'|' + CONCAT(@Total, N':', (SELECT SUM(MontoReembolso) FROM #Devoluciones));
DELETE FROM #PedidoPanel; DELETE FROM #PedidoCliente; DELETE FROM #Devoluciones;
EXEC #Verificar N'Devolver la última (dañada, no reingresa): DEVUELTO; los reembolsos suman lo pagado; el kardex cuadra; el cupón no se revierte; el cliente ve sus devoluciones',
     N'DEVUELTO|33.33:false|100.00=100.00|9:1|cupón sigue usado|DEVUELTO:sin usuario:3|3:100.00', @Texto;
ROLLBACK TRANSACTION;

/* === Casos de error ====================================================================== */
DECLARE @D NVARCHAR(MAX) = N'
DECLARE @Cliente INT, @Operador INT, @Pedido1 INT, @Pedido2 INT, @LineaA INT, @LineaB INT;
DECLARE @L dbo.TT_Devoluciones_Linea;
SELECT @Cliente = IDCliente, @Operador = IDOperador, @Pedido1 = IDPedido1, @Pedido2 = IDPedido2, @LineaA = IDLineaA, @LineaB = IDLineaB FROM #Base;
';
DECLARE @Devolver NVARCHAR(MAX) = N'EXEC dbo.SP_Devoluciones_Registrar @Operador, @Pedido1, N''Motivo'', @L;';

DECLARE @Errores TABLE (Orden INT IDENTITY, Descripcion NVARCHAR(300), Esperado INT, Sql NVARCHAR(MAX), Preparacion NVARCHAR(MAX));
INSERT INTO @Errores (Descripcion, Esperado, Sql, Preparacion) VALUES
    (N'Registrar: un cliente → PERMISO_DENEGADO', 50201,
        N'INSERT INTO @L VALUES (@LineaA, 1, 1); EXEC dbo.SP_Devoluciones_Registrar @Cliente, @Pedido1, N''Motivo'', @L;', NULL),
    (N'Registrar: sin motivo → MOTIVO_INVALIDO', 50024,
        N'INSERT INTO @L VALUES (@LineaA, 1, 1); EXEC dbo.SP_Devoluciones_Registrar @Operador, @Pedido1, N''  '', @L;', NULL),
    (N'Registrar: sin líneas → PARAMETRO_REQUERIDO', 50006,
        @Devolver, NULL),
    (N'Registrar: cantidad 0 → CANTIDAD_INVALIDA', 50025,
        N'INSERT INTO @L VALUES (@LineaA, 0, 1);' + @Devolver, NULL),
    (N'Registrar: pedido inexistente → PEDIDO_NO_ENCONTRADO', 50116,
        N'INSERT INTO @L VALUES (@LineaA, 1, 1); EXEC dbo.SP_Devoluciones_Registrar @Operador, -1, N''Motivo'', @L;', NULL),
    (N'Registrar: pedido que no se ha entregado → PEDIDO_NO_DEVOLVIBLE', 51701,
        N'INSERT INTO @L VALUES (@LineaB, 1, 1); EXEC dbo.SP_Devoluciones_Registrar @Operador, @Pedido2, N''Motivo'', @L;', NULL),
    (N'Registrar: una línea de otro pedido → LINEA_PEDIDO_NO_ENCONTRADA', 50117,
        N'INSERT INTO @L VALUES (@LineaA, 1, 1), (@LineaB, 1, 1);' + @Devolver, NULL),
    (N'Registrar: más unidades de las vendidas → CANTIDAD_DEVOLUCION_EXCEDIDA', 51703,
        N'INSERT INTO @L VALUES (@LineaA, 4, 1);' + @Devolver, NULL),
    (N'Registrar: 2 y luego 2 de 3 → CANTIDAD_DEVOLUCION_EXCEDIDA', 51703,
        N'INSERT INTO @L VALUES (@LineaA, 2, 1);
          INSERT INTO #PedidoPanel ' + @Devolver + N'
          EXEC dbo.SP_Devoluciones_Registrar @Operador, @Pedido1, N''Otra'', @L;', NULL),
    (N'Registrar: un pedido ya devuelto por completo → PEDIDO_NO_DEVOLVIBLE', 51701,
        N'INSERT INTO @L VALUES (@LineaA, 3, 1);
          INSERT INTO #PedidoPanel ' + @Devolver + N'
          DELETE FROM @L; INSERT INTO @L VALUES (@LineaA, 1, 1);' + @Devolver, NULL),
    (N'Registrar: entregado hace 31 días (plazo de 30) → PLAZO_DEVOLUCION_VENCIDO', 51702,
        N'INSERT INTO @L VALUES (@LineaA, 1, 1);' + @Devolver,
        N'DISABLE TRIGGER dbo.TR_PedidoHistorialEstado_Inmutable ON dbo.PedidoHistorialEstado;
          UPDATE dbo.PedidoHistorialEstado SET Fecha = DATEADD(DAY, -31, Fecha) WHERE IDPedido = (SELECT IDPedido1 FROM #Base);
          ENABLE TRIGGER dbo.TR_PedidoHistorialEstado_Inmutable ON dbo.PedidoHistorialEstado;'),
    (N'Registrar: sin DIAS_DEVOLUCION → CONFIGURACION_INCOMPLETA', 59001,
        N'INSERT INTO @L VALUES (@LineaA, 1, 1);' + @Devolver, N'DELETE FROM dbo.Parametro WHERE Clave = ''DIAS_DEVOLUCION'';'),
    (N'Listar: fecha inicial posterior a la final → RANGO_FECHAS_INVALIDO', 50026,
        N'EXEC dbo.SP_Devoluciones_Listar @Operador, ''2026-10-02'', ''2026-10-01'';', NULL),
    (N'Listar: un cliente → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Devoluciones_Listar @Cliente;', NULL);

DECLARE @Orden INT = 1, @Descripcion NVARCHAR(300), @Esperado INT, @Sql NVARCHAR(MAX), @Preparacion NVARCHAR(MAX);
WHILE @Orden <= (SELECT MAX(Orden) FROM @Errores)
BEGIN
    SELECT @Descripcion = Descripcion, @Esperado = Esperado, @Sql = @D + Sql, @Preparacion = Preparacion
    FROM @Errores WHERE Orden = @Orden;
    EXEC #EsperarError @Descripcion, @Esperado, @Sql, @Preparacion;
    SET @Orden += 1;
END;

/* Ningún caso dejó datos: todos se revirtieron. */
SET @Texto = (SELECT CONCAT((SELECT COUNT(*) FROM dbo.Variante WHERE SKU LIKE 'DEV-PRUEBA-%'), N'|',
                            (SELECT COUNT(*) FROM dbo.Usuario WHERE Correo LIKE N'%.devoluciones@shopcart.test'), N'|',
                            (SELECT COUNT(*) FROM dbo.Pago WHERE ReferenciaExterna LIKE 'REF-DEV-PRUEBA-%')));
EXEC #Verificar N'Limpieza: no quedan datos de prueba', N'0|0|0', @Texto;

/* --- Resultado ---------------------------------------------------------------------------- */
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = NULL;
EXEC sys.sp_set_session_context @key = N'ComentarioEstado', @value = NULL;

IF CAST(SESSION_CONTEXT(N'PruebasFallidas') AS INT) > 0
    THROW 50000, N'Pruebas de procedimientos de devoluciones fallidas.', 1;
EXEC sys.sp_set_session_context @key = N'PruebasFallidas', @value = NULL;
GO
