/*
    017_Procedimientos_Pedidos.sql
    Se ejecuta conectado como shopcart_migrator (deploy.ps1 -Probar). Mismo esquema que
    009–016: el migrador prepara los datos y ejecuta cada SP haciéndose pasar por un miembro
    de RolApi; los casos de error usan #EsperarError. Los SKU de prueba empiezan con PED-PRUEBA.
    Los pedidos se crean por el flujo real: carrito → checkout → pago aprobado.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT OFF;
GO

-- Permite ejecutar el script varias veces en la misma conexión (p. ej. en SSMS).
DROP TABLE IF EXISTS #Contexto, #Base, #Id, #Carrito, #Checkout, #PedidoCliente, #PedidoPanel, #ListaPanel, #ListaCliente;
DROP PROCEDURE IF EXISTS #Verificar;
DROP PROCEDURE IF EXISTS #Preparar;
DROP PROCEDURE IF EXISTS #EsperarError;
GO

CREATE TABLE #Contexto (UsuarioApi SYSNAME NOT NULL);
CREATE TABLE #Base (IDCliente INT, IDCliente2 INT, IDOperador INT, IDAdmin INT, IDSistema INT, IDA INT, IDB INT, IDDireccion INT,
                    IDDireccion2 INT, IDEnvio INT, IDDiez INT, IDUltimo INT);
-- Un ID que la preparación de un caso deja para el SQL del caso (la API no puede consultar tablas).
CREATE TABLE #Id (ID BIGINT);

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
CREATE TABLE #ListaPanel (IDPedido INT, NumeroPedido VARCHAR(15), FechaPedido DATETIME2(3), CodigoEstado VARCHAR(20), Estado NVARCHAR(50),
                          NombreContacto NVARCHAR(200), CorreoContacto NVARCHAR(254), EsInvitado BIT, Total DECIMAL(12, 2), Articulos INT);
CREATE TABLE #ListaCliente (IDPedido INT, NumeroPedido VARCHAR(15), FechaPedido DATETIME2(3), CodigoEstado VARCHAR(20), Estado NVARCHAR(50),
                            Total DECIMAL(12, 2), Articulos INT);
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
    - Roles, usuario de sistema, parámetros (límite 5, reserva 15 min, IVA 12 %).
    - Estados del pedido y sus transiciones (diagrama del README); el cliente solo puede
      cancelar desde PAGADO. Tipos de movimiento INVENTARIO_INICIAL, SALIDA_VENTA y CANCELACION.
    - Un administrador, un operador y dos clientes con su dirección (departamento 230).
    - A 100.00 con 10 unidades y B 50.00 con 1, con su inventario inicial en el kardex.
    - Envío Q25. Cupones DIEZ (10 %) y ULTIMO (5 %, un solo uso en total).
*/
CREATE PROCEDURE #Preparar
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Hash VARCHAR(255) = '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA';
    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @IDCliente INT, @IDCliente2 INT, @IDOperador INT, @IDAdmin INT, @IDSistema INT, @IDCategoria INT, @IDProducto INT,
            @IDA INT, @IDB INT, @IDDireccion INT, @IDDireccion2 INT, @IDEnvio INT, @IDDiez INT, @IDUltimo INT, @IDInicial TINYINT;

    INSERT INTO dbo.Rol (IDRol, Codigo, Nombre)
    SELECT v.IDRol, v.Codigo, v.Nombre
    FROM (VALUES (201, 'CLIENTE', N'Cliente'), (202, 'OPERADOR', N'Operador'), (203, 'ADMIN', N'Administrador'))
         AS v (IDRol, Codigo, Nombre)
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Rol AS r WHERE r.Codigo = v.Codigo);

    DECLARE @Parametros TABLE (IDParametro TINYINT, Clave VARCHAR(50), Valor NVARCHAR(200), TipoDato VARCHAR(10));
    INSERT INTO @Parametros VALUES (210, 'MAXIMO_UNIDADES_POR_LINEA', N'5', 'ENTERO'), (211, 'MINUTOS_RESERVA', N'15', 'ENTERO'),
                                   (212, 'TASA_IVA', N'0.12', 'DECIMAL');
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
                 (223, 'CANCELACION', N'Cancelación', 1)) AS v (IDTipoMovimiento, Codigo, Nombre, Signo)
    WHERE NOT EXISTS (SELECT 1 FROM dbo.TipoMovimiento AS t WHERE t.Codigo = v.Codigo);
    SET @IDInicial = (SELECT IDTipoMovimiento FROM dbo.TipoMovimiento WHERE Codigo = 'INVENTARIO_INICIAL');

    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'cliente.pedidos@shopcart.test', @Hash, N'Cliente', N'Pedidos' FROM dbo.Rol AS r WHERE r.Codigo = 'CLIENTE';
    SET @IDCliente = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'cliente2.pedidos@shopcart.test', @Hash, N'Cliente', N'Dos' FROM dbo.Rol AS r WHERE r.Codigo = 'CLIENTE';
    SET @IDCliente2 = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'operador.pedidos@shopcart.test', @Hash, N'Operador', N'Pedidos' FROM dbo.Rol AS r WHERE r.Codigo = 'OPERADOR';
    SET @IDOperador = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'admin.pedidos@shopcart.test', @Hash, N'Admin', N'Pedidos' FROM dbo.Rol AS r WHERE r.Codigo = 'ADMIN';
    SET @IDAdmin = SCOPE_IDENTITY();
    SET @IDSistema = (SELECT u.IDUsuario FROM dbo.Usuario AS u WHERE u.EsSistema = 1);
    IF @IDSistema IS NULL
    BEGIN
        INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido, EsSistema)
        SELECT r.IDRol, N'sistema.pedidos@shopcart.test', NULL, N'Sistema', N'Pedidos', 1 FROM dbo.Rol AS r WHERE r.Codigo = 'ADMIN';
        SET @IDSistema = SCOPE_IDENTITY();
    END;

    INSERT INTO dbo.Departamento (IDDepartamento, Nombre) VALUES (230, N'Departamento Pedidos Prueba');
    INSERT INTO dbo.Municipio (IDMunicipio, IDDepartamento, Nombre) VALUES (23001, 230, N'Municipio Pedidos Prueba');
    INSERT INTO dbo.Direccion (IDUsuario, Alias, NombreDestinatario, Telefono, Linea1, IDMunicipio, EsPredeterminada)
    VALUES (@IDCliente, N'Casa', N'Cliente Pedidos', '5555-1234', N'1a calle 1-23 zona 1', 23001, 1);
    SET @IDDireccion = SCOPE_IDENTITY();
    INSERT INTO dbo.Direccion (IDUsuario, Alias, NombreDestinatario, Telefono, Linea1, IDMunicipio, EsPredeterminada)
    VALUES (@IDCliente2, N'Casa', N'Cliente Dos', '5555-9999', N'2a calle 2-34 zona 2', 23001, 1);
    SET @IDDireccion2 = SCOPE_IDENTITY();

    INSERT INTO dbo.Categoria (Nombre, Slug) VALUES (N'Pedidos Prueba', 'pedidos-prueba');
    SET @IDCategoria = SCOPE_IDENTITY();
    INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug, Activo) VALUES (@IDCategoria, N'Taza Pedidos Prueba', 'taza-pedidos-prueba', 1);
    SET @IDProducto = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica, ClaveCombinacion) VALUES (@IDProducto, 'PED-PRUEBA-A', 100.00, 10, '1');
    SET @IDA = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica, ClaveCombinacion) VALUES (@IDProducto, 'PED-PRUEBA-B', 50.00, 1, '2');
    SET @IDB = SCOPE_IDENTITY();
    INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimiento, Signo, Cantidad, SaldoAnterior, SaldoNuevo, IDUsuario)
    VALUES (@IDA, @IDInicial, 1, 10, 0, 10, @IDAdmin), (@IDB, @IDInicial, 1, 1, 0, 1, @IDAdmin);

    INSERT INTO dbo.MetodoEnvio (Nombre, Costo, DiasEstimadosMin, DiasEstimadosMax) VALUES (N'Estándar Pedidos Prueba', 25.00, 2, 4);
    SET @IDEnvio = SCOPE_IDENTITY();

    INSERT INTO dbo.Cupon (Codigo, Descripcion, TipoDescuento, Valor, FechaInicio, FechaFin)
    VALUES ('PED-PRUEBA-DIEZ', N'Diez por ciento', 'PORCENTAJE', 10, DATEADD(DAY, -1, @Ahora), DATEADD(DAY, 30, @Ahora));
    SET @IDDiez = SCOPE_IDENTITY();
    INSERT INTO dbo.Cupon (Codigo, Descripcion, TipoDescuento, Valor, FechaInicio, FechaFin, LimiteUsosTotal)
    VALUES ('PED-PRUEBA-ULTIMO', N'Un solo uso', 'PORCENTAJE', 5, DATEADD(DAY, -1, @Ahora), DATEADD(DAY, 30, @Ahora), 1);
    SET @IDUltimo = SCOPE_IDENTITY();

    DELETE FROM #Base;
    INSERT INTO #Base VALUES (@IDCliente, @IDCliente2, @IDOperador, @IDAdmin, @IDSistema, @IDA, @IDB, @IDDireccion, @IDDireccion2,
                              @IDEnvio, @IDDiez, @IDUltimo);
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
    DELETE FROM #Carrito; DELETE FROM #Checkout; DELETE FROM #PedidoCliente; DELETE FROM #PedidoPanel; DELETE FROM #Id;

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
DECLARE @IDCliente INT, @IDCliente2 INT, @IDOperador INT, @IDSistema INT, @IDA INT, @IDB INT, @IDDireccion INT, @IDDireccion2 INT,
        @IDEnvio INT, @IDCheckout BIGINT, @IDPedido INT, @IDPedidoInvitado INT, @IDPedido2 INT, @Numero VARCHAR(15), @Total INT;
DECLARE @Texto NVARCHAR(400);
DECLARE @TokenInvitado VARBINARY(64) = HASHBYTES('SHA2_256', 'invitado-pedidos'),
        @Seguimiento1 VARBINARY(64) = HASHBYTES('SHA2_256', 'seguimiento-pedidos-1'),
        @Seguimiento2 VARBINARY(64) = HASHBYTES('SHA2_256', 'seguimiento-pedidos-2'),
        @Seguimiento3 VARBINARY(64) = HASHBYTES('SHA2_256', 'seguimiento-pedidos-3'),
        @Seguimiento4 VARBINARY(64) = HASHBYTES('SHA2_256', 'seguimiento-pedidos-4'),
        @K UNIQUEIDENTIFIER;

BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDCliente = IDCliente, @IDCliente2 = IDCliente2, @IDOperador = IDOperador, @IDSistema = IDSistema, @IDA = IDA, @IDB = IDB,
       @IDDireccion = IDDireccion, @IDDireccion2 = IDDireccion2, @IDEnvio = IDEnvio FROM #Base;

/* === Compra de un cliente registrado ====================================================== */
SET @K = NEWID();
EXECUTE AS USER = @Api;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @IDCliente, @IDVariante = @IDA, @Cantidad = 2;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AplicarCupon @IDUsuario = @IDCliente, @Codigo = 'PED-PRUEBA-DIEZ';
INSERT INTO #Checkout EXEC dbo.SP_Checkout_Iniciar @IDUsuario = @IDCliente, @ClaveIdempotencia = @K, @IDMetodoEnvio = @IDEnvio,
                                                   @IDDireccion = @IDDireccion;
SET @IDCheckout = (SELECT IDCheckout FROM #Checkout);
INSERT INTO #PedidoCliente EXEC dbo.SP_Pedidos_Crear @IDUsuario = @IDCliente, @IDCheckout = @IDCheckout, @Marca = 'visa', @Ultimos4 = '4242',
                                                     @CodigoAutorizacion = 'AUT-001', @ReferenciaExterna = 'REF-PED-PRUEBA-1',
                                                     @TokenSeguimientoHash = @Seguimiento1;
REVERT;
DELETE FROM #Carrito; DELETE FROM #Checkout;
SELECT @IDPedido = IDPedido, @Numero = NumeroPedido FROM #PedidoCliente;
SET @Texto = (SELECT CONCAT(CASE WHEN NumeroPedido LIKE 'SC-[0-9][0-9][0-9][0-9][0-9][0-9]' THEN N'SC-######' ELSE NumeroPedido END, N'|',
                            CodigoEstado, N'|', CAST(PuedeCancelar AS INT), N'|', Subtotal, N'-', Descuento, N'+', CostoEnvio, N'=', Total, N'|',
                            BaseImponible, N'+', IVA, N'|', CodigoCupon, N'|',
                            (SELECT STRING_AGG(CONCAT(j.SKU, N':', j.Cantidad, N'x', j.PrecioUnitario, N'-', j.DescuentoLinea, N'=', j.TotalLinea), N',')
                             FROM OPENJSON(Lineas) WITH (SKU VARCHAR(50), Cantidad INT, PrecioUnitario DECIMAL(12, 2), DescuentoLinea DECIMAL(12, 2),
                                                         TotalLinea DECIMAL(12, 2)) AS j), N'|',
                            JSON_VALUE(Historial, '$[0].CodigoEstado'), N':', ISNULL(JSON_VALUE(Historial, '$[0].Usuario'), N'sin usuario'), N'|',
                            JSON_VALUE(Pagos, '$[0].Estado'), N':', JSON_VALUE(Pagos, '$[0].Marca'), N':', JSON_VALUE(Pagos, '$[0].Monto'))
              FROM #PedidoCliente);
DELETE FROM #PedidoCliente;
EXEC #Verificar N'Crear: pedido PAGADO con número, montos e IVA, línea con su descuento; el cliente no ve quién cambió el estado',
     N'SC-######|PAGADO|1|200.00-20.00+25.00=205.00|183.04+21.96|PED-PRUEBA-DIEZ|PED-PRUEBA-A:2x100.00-20.00=180.00|PAGADO:sin usuario|APROBADO:VISA:205.00',
     @Texto;

SET @Texto = CONCAT((SELECT ExistenciaFisica FROM dbo.Variante WHERE IDVariante = @IDA), N'|',
                    (SELECT CONCAT(t.Codigo, N':', m.Cantidad, N':', CASE WHEN m.IDUsuario = @IDCliente THEN N'cliente' END)
                     FROM dbo.MovimientoInventario AS m JOIN dbo.TipoMovimiento AS t ON t.IDTipoMovimiento = m.IDTipoMovimiento
                     WHERE m.IDPedido = @IDPedido), N'|',
                    (SELECT STRING_AGG(Estado, ',') FROM dbo.ReservaInventario WHERE IDCheckout = @IDCheckout), N'|',
                    (SELECT CONCAT(CorreoCliente, N':', MontoDescontado) FROM dbo.CuponUso WHERE IDPedido = @IDPedido), N':',
                    (SELECT UsosActuales FROM dbo.Cupon WHERE Codigo = 'PED-PRUEBA-DIEZ'), N'|',
                    (SELECT c.Estado FROM dbo.Carrito AS c JOIN dbo.Checkout AS ch ON ch.IDCarrito = c.IDCarrito WHERE ch.IDCheckout = @IDCheckout), N':',
                    (SELECT Estado FROM dbo.Checkout WHERE IDCheckout = @IDCheckout));
EXEC #Verificar N'Crear: descuenta existencia con kardex, consume reservas, usa el cupón, convierte el carrito y completa el checkout',
     N'8|SALIDA_VENTA:-2:cliente|CONSUMIDA|cliente.pedidos@shopcart.test:20.00:1|CONVERTIDO:COMPLETADO', @Texto;

EXECUTE AS USER = @Api;
INSERT INTO #PedidoCliente EXEC dbo.SP_Pedidos_Crear @IDUsuario = @IDCliente, @IDCheckout = @IDCheckout, @Marca = 'VISA', @Ultimos4 = '4242',
                                                     @CodigoAutorizacion = 'AUT-001', @ReferenciaExterna = 'REF-PED-PRUEBA-1',
                                                     @TokenSeguimientoHash = @Seguimiento1;
REVERT;
SET @Texto = CONCAT(CASE WHEN (SELECT IDPedido FROM #PedidoCliente) = @IDPedido THEN N'mismo pedido' ELSE N'otro' END, N'|',
                    (SELECT COUNT(*) FROM dbo.Pedido WHERE IDCheckout = @IDCheckout), N'|',
                    (SELECT COUNT(*) FROM dbo.Pago WHERE IDCheckout = @IDCheckout), N'|',
                    (SELECT ExistenciaFisica FROM dbo.Variante WHERE IDVariante = @IDA));
DELETE FROM #PedidoCliente;
EXEC #Verificar N'Reintento con la misma referencia (doble clic): devuelve el mismo pedido sin cobrar ni descontar otra vez',
     N'mismo pedido|1|1|8', @Texto;

/* === Panel: listado, detalle y avance de estado =========================================== */
EXECUTE AS USER = @Api;
INSERT INTO #ListaPanel EXEC dbo.SP_Pedidos_Listar @IDOperador, NULL, NULL, NULL, N'cliente.pedidos', 1, 20, @Total OUTPUT;
INSERT INTO #PedidoPanel EXEC dbo.SP_Pedidos_CambiarEstado @IDOperador, @IDPedido, ' en_preparacion ', N'  Empacando  ';
DELETE FROM #PedidoPanel;
INSERT INTO #PedidoPanel EXEC dbo.SP_Pedidos_CambiarEstado @IDOperador, @IDPedido, 'EN_PREPARACION';
DELETE FROM #PedidoCliente;
INSERT INTO #PedidoCliente EXEC dbo.SP_Pedidos_ObtenerCliente @IDCliente, @IDPedido;
REVERT;
SET @Texto = CONCAT(@Total, N'|', (SELECT CONCAT(NumeroPedido, N':', CodigoEstado, N':', CAST(EsInvitado AS INT), N':', Total, N':', Articulos) FROM #ListaPanel),
                    N'|', (SELECT CONCAT(CodigoEstado, N':', CAST(PuedeCancelar AS INT), N':',
                                         (SELECT STRING_AGG(CONCAT(j.CodigoEstado, N'/', ISNULL(j.Usuario, N'-'), N'/', ISNULL(j.Comentario, N'-')), N',')
                                          FROM OPENJSON(Historial) WITH (CodigoEstado VARCHAR(20), Usuario NVARCHAR(201), Comentario NVARCHAR(500)) AS j))
                           FROM #PedidoPanel),
                    N'|', (SELECT CAST(PuedeCancelar AS INT) FROM #PedidoCliente),
                    N'|', (SELECT CONCAT(COUNT(*), N':', MAX(JSON_VALUE(ValorNuevo, '$.Estado'))) FROM dbo.Bitacora
                           WHERE Modulo = 'PEDIDOS' AND IDEntidad = CAST(@IDPedido AS VARCHAR(50))));
SET @Texto = REPLACE(@Texto, @Numero, N'SC-n');
DELETE FROM #ListaPanel; DELETE FROM #PedidoPanel; DELETE FROM #PedidoCliente;
EXEC #Verificar N'Panel: lista, avance a EN_PREPARACION con comentario (repetirlo no cambia nada); el cliente ya no puede cancelar',
     N'1|SC-n:PAGADO:0:205.00:2|EN_PREPARACION:1:PAGADO/Cliente Pedidos/-,EN_PREPARACION/Operador Pedidos/Empacando|0|1:EN_PREPARACION', @Texto;

EXECUTE AS USER = @Api;
INSERT INTO #PedidoPanel EXEC dbo.SP_Pedidos_Cancelar @IDOperador, @IDPedido, N' Cliente llamó para cancelar ';
REVERT;
SET @Texto = (SELECT CONCAT(CodigoEstado, N'|', CAST(PuedeCancelar AS INT), N'|', JSON_VALUE(Historial, '$[2].Comentario'), N'|',
                            (SELECT STRING_AGG(CONCAT(j.Estado, N':', j.Monto), N',') WITHIN GROUP (ORDER BY j.IDPago)
                             FROM OPENJSON(Pagos) WITH (IDPago BIGINT, Estado VARCHAR(12), Monto DECIMAL(12, 2)) AS j))
              FROM #PedidoPanel);
SET @Texto += N'|' + CONCAT((SELECT ExistenciaFisica FROM dbo.Variante WHERE IDVariante = @IDA), N':',
                            (SELECT CONCAT(t.Codigo, N'+', m.Cantidad) FROM dbo.MovimientoInventario AS m
                             JOIN dbo.TipoMovimiento AS t ON t.IDTipoMovimiento = m.IDTipoMovimiento
                             WHERE m.IDPedido = @IDPedido AND t.Codigo = 'CANCELACION'), N'|',
                            (SELECT CASE WHEN FechaReversion IS NOT NULL THEN N'uso revertido' END FROM dbo.CuponUso WHERE IDPedido = @IDPedido), N':',
                            (SELECT UsosActuales FROM dbo.Cupon WHERE Codigo = 'PED-PRUEBA-DIEZ'), N'|',
                            (SELECT Cuadra FROM dbo.VW_Inventario_Conciliacion WHERE IDVariante = @IDA));
DELETE FROM #PedidoPanel;
EXEC #Verificar N'Cancelar (operador): devuelve la existencia con kardex, revierte el cupón, reembolsa el pago y el kardex cuadra',
     N'CANCELADO|0|Cliente llamó para cancelar|APROBADO:205.00,REEMBOLSADO:205.00|10:CANCELACION+2|uso revertido:0|1', @Texto;

/* === Invitado: la última unidad y el seguimiento ========================================== */
SET @K = NEWID();
EXECUTE AS USER = @Api;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @TokenInvitadoHash = @TokenInvitado, @IDVariante = @IDB;
INSERT INTO #Checkout EXEC dbo.SP_Checkout_Iniciar @TokenInvitadoHash = @TokenInvitado, @ClaveIdempotencia = @K, @IDMetodoEnvio = @IDEnvio,
                                                   @Correo = N'invitado.pedidos@shopcart.test', @NombreDestinatario = N'Invitado Pedidos',
                                                   @Telefono = N'5555-7777', @Linea1 = N'3a avenida 4-56 zona 10', @IDMunicipio = 23001;
SET @IDCheckout = (SELECT IDCheckout FROM #Checkout);
INSERT INTO #PedidoCliente EXEC dbo.SP_Pedidos_Crear @TokenInvitadoHash = @TokenInvitado, @IDCheckout = @IDCheckout, @Marca = 'AMEX',
                                                     @Ultimos4 = '0005', @CodigoAutorizacion = 'AUT-002', @ReferenciaExterna = 'REF-PED-PRUEBA-2',
                                                     @TokenSeguimientoHash = @Seguimiento2;
SET @IDPedidoInvitado = (SELECT IDPedido FROM #PedidoCliente);
DELETE FROM #PedidoCliente;
INSERT INTO #PedidoCliente EXEC dbo.SP_Pedidos_ObtenerSeguimiento @Seguimiento2;
REVERT;
DELETE FROM #Carrito; DELETE FROM #Checkout;
SET @Texto = (SELECT CONCAT(CASE WHEN IDPedido = @IDPedidoInvitado THEN N'su pedido' END, N'|', CodigoEstado, N'|', CorreoContacto, N'|',
                            CAST(PuedeCancelar AS INT), N'|', Total) FROM #PedidoCliente);
SET @Texto += N'|' + CONCAT((SELECT ExistenciaFisica FROM dbo.Variante WHERE IDVariante = @IDB), N':',
                            (SELECT CASE WHEN m.IDUsuario = @IDSistema THEN N'usuario de sistema' END FROM dbo.MovimientoInventario AS m
                             WHERE m.IDPedido = @IDPedidoInvitado), N':',
                            (SELECT CASE WHEN IDUsuario IS NULL THEN N'historial sin usuario' END FROM dbo.PedidoHistorialEstado
                             WHERE IDPedido = @IDPedidoInvitado));
DELETE FROM #PedidoCliente;
EXEC #Verificar N'Invitado: compra la última unidad; el enlace de seguimiento muestra su pedido; no puede cancelarlo desde la tienda',
     N'su pedido|PAGADO|invitado.pedidos@shopcart.test|0|75.00|0:usuario de sistema:historial sin usuario', @Texto;

/* === El cliente cancela su pedido pagado ================================================== */
SET @K = NEWID();
EXECUTE AS USER = @Api;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @IDCliente2, @IDVariante = @IDA, @Cantidad = 3;
INSERT INTO #Checkout EXEC dbo.SP_Checkout_Iniciar @IDUsuario = @IDCliente2, @ClaveIdempotencia = @K, @IDMetodoEnvio = @IDEnvio,
                                                   @IDDireccion = @IDDireccion2;
SET @IDCheckout = (SELECT IDCheckout FROM #Checkout);
INSERT INTO #PedidoCliente EXEC dbo.SP_Pedidos_Crear @IDUsuario = @IDCliente2, @IDCheckout = @IDCheckout, @Marca = 'MASTERCARD',
                                                     @Ultimos4 = '4444', @CodigoAutorizacion = 'AUT-003', @ReferenciaExterna = 'REF-PED-PRUEBA-3',
                                                     @TokenSeguimientoHash = @Seguimiento3;
SET @IDPedido2 = (SELECT IDPedido FROM #PedidoCliente);
DELETE FROM #PedidoCliente;
INSERT INTO #PedidoCliente EXEC dbo.SP_Pedidos_Cancelar @IDCliente2, @IDPedido2;
INSERT INTO #ListaCliente EXEC dbo.SP_Pedidos_ListarCliente @IDCliente2, 1, 10, @Total OUTPUT;
REVERT;
DELETE FROM #Carrito; DELETE FROM #Checkout;
SET @Texto = (SELECT CONCAT(CodigoEstado, N'|', CAST(PuedeCancelar AS INT), N'|', ISNULL(JSON_VALUE(Historial, '$[1].Comentario'), N'sin motivo'))
              FROM #PedidoCliente);
SET @Texto += N'|' + CONCAT(@Total, N':', (SELECT CONCAT(CodigoEstado, N':', Articulos) FROM #ListaCliente), N'|',
                            (SELECT ExistenciaFisica FROM dbo.Variante WHERE IDVariante = @IDA));
DELETE FROM #PedidoCliente; DELETE FROM #ListaCliente;
EXEC #Verificar N'Cancelar (cliente): su pedido PAGADO, sin motivo obligatorio; "Mis pedidos" lo muestra cancelado y la existencia vuelve',
     N'CANCELADO|0|sin motivo|1:CANCELADO:3|10', @Texto;

/* === Checkout vencido mientras se cobraba (D39) =========================================== */
SET @K = NEWID();
EXECUTE AS USER = @Api;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @IDCliente, @IDVariante = @IDA;
INSERT INTO #Checkout EXEC dbo.SP_Checkout_Iniciar @IDUsuario = @IDCliente, @ClaveIdempotencia = @K, @IDMetodoEnvio = @IDEnvio,
                                                   @IDDireccion = @IDDireccion;
REVERT;
SET @IDCheckout = (SELECT IDCheckout FROM #Checkout);
UPDATE dbo.Checkout SET FechaCreacion = DATEADD(MINUTE, -20, SYSUTCDATETIME()), FechaExpiracion = DATEADD(SECOND, -5, SYSUTCDATETIME())
WHERE IDCheckout = @IDCheckout;
UPDATE dbo.ReservaInventario SET FechaCreacion = DATEADD(MINUTE, -20, SYSUTCDATETIME()), FechaExpiracion = DATEADD(SECOND, -5, SYSUTCDATETIME())
WHERE IDCheckout = @IDCheckout;
EXECUTE AS USER = @Api;
INSERT INTO #PedidoCliente EXEC dbo.SP_Pedidos_Crear @IDUsuario = @IDCliente, @IDCheckout = @IDCheckout, @Marca = 'VISA', @Ultimos4 = '4242',
                                                     @CodigoAutorizacion = 'AUT-004', @ReferenciaExterna = 'REF-PED-PRUEBA-4',
                                                     @TokenSeguimientoHash = @Seguimiento4;
REVERT;
SET @Texto = CONCAT((SELECT CodigoEstado FROM #PedidoCliente), N'|', (SELECT Estado FROM dbo.Checkout WHERE IDCheckout = @IDCheckout), N'|',
                    (SELECT ExistenciaFisica FROM dbo.Variante WHERE IDVariante = @IDA));
DELETE FROM #Carrito; DELETE FROM #Checkout; DELETE FROM #PedidoCliente;
EXEC #Verificar N'Checkout vencido hace segundos con existencia suficiente: el pedido se acepta (el cliente ya pagó)',
     N'PAGADO|COMPLETADO|9', @Texto;
ROLLBACK TRANSACTION;

/* === Casos de error ====================================================================== */
DECLARE @D NVARCHAR(MAX) = N'
DECLARE @Cliente INT, @Cliente2 INT, @Operador INT, @Admin INT, @A INT, @B INT, @Dir INT, @Dir2 INT, @Envio INT, @ID BIGINT, @Pedido INT;
DECLARE @K UNIQUEIDENTIFIER = NEWID(), @TS VARBINARY(64) = HASHBYTES(''SHA2_256'', CONVERT(VARCHAR(36), NEWID())),
        @TS2 VARBINARY(64) = HASHBYTES(''SHA2_256'', CONVERT(VARCHAR(36), NEWID()));
SELECT @Cliente = IDCliente, @Cliente2 = IDCliente2, @Operador = IDOperador, @Admin = IDAdmin, @A = IDA, @B = IDB, @Dir = IDDireccion,
       @Dir2 = IDDireccion2, @Envio = IDEnvio FROM #Base;
';
-- Compra completa del cliente: deja @ID (checkout) y @Pedido.
DECLARE @Comprar NVARCHAR(MAX) = N'
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = @A;
INSERT INTO #Checkout EXEC dbo.SP_Checkout_Iniciar @IDUsuario = @Cliente, @ClaveIdempotencia = @K, @IDMetodoEnvio = @Envio, @IDDireccion = @Dir;
SET @ID = (SELECT IDCheckout FROM #Checkout);
INSERT INTO #PedidoCliente EXEC dbo.SP_Pedidos_Crear @IDUsuario = @Cliente, @IDCheckout = @ID, @Marca = ''VISA'', @Ultimos4 = ''4242'',
       @CodigoAutorizacion = ''AUT-E'', @ReferenciaExterna = ''REF-PED-PRUEBA-E1'', @TokenSeguimientoHash = @TS;
SET @Pedido = (SELECT IDPedido FROM #PedidoCliente);
';
DECLARE @IniciarCliente NVARCHAR(MAX) = N'
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = @A;
INSERT INTO #Checkout EXEC dbo.SP_Checkout_Iniciar @IDUsuario = @Cliente, @ClaveIdempotencia = @K, @IDMetodoEnvio = @Envio, @IDDireccion = @Dir;
SET @ID = (SELECT IDCheckout FROM #Checkout);
';
DECLARE @Pagar NVARCHAR(MAX) = N'EXEC dbo.SP_Pedidos_Crear @IDUsuario = @Cliente, @IDCheckout = @ID, @Marca = ''VISA'', @Ultimos4 = ''4242'',
       @CodigoAutorizacion = ''AUT-E'', @ReferenciaExterna = ''REF-PED-PRUEBA-E9'', @TokenSeguimientoHash = @TS2;';
-- Checkout del cliente que venció hace 15 minutos, con A agotada mientras tanto (armado como el migrador).
DECLARE @VencidoSinExistencia NVARCHAR(MAX) = N'
DECLARE @IDCarrito INT, @IDCheckout BIGINT, @Ahora DATETIME2(3) = SYSUTCDATETIME();
INSERT INTO dbo.Carrito (IDUsuario) SELECT IDCliente FROM #Base;
SET @IDCarrito = SCOPE_IDENTITY();
INSERT INTO dbo.CarritoItem (IDCarrito, IDVariante, Cantidad) SELECT @IDCarrito, IDA, 1 FROM #Base;
INSERT INTO dbo.Checkout (IDCarrito, IDUsuario, ClaveIdempotencia, CorreoContacto, NombreContacto, TelefonoContacto, EnvioNombre,
                          EnvioTelefono, EnvioLinea1, EnvioMunicipio, IDDepartamento, IDMetodoEnvio, Subtotal, CostoEnvio, Total,
                          FechaCreacion, FechaExpiracion)
SELECT @IDCarrito, IDCliente, NEWID(), N''cliente.pedidos@shopcart.test'', N''Cliente Pedidos'', ''5555-1234'', N''Cliente Pedidos'',
       ''5555-1234'', N''Calle'', N''Municipio Pedidos Prueba'', 230, IDEnvio, 100.00, 25.00, 125.00,
       DATEADD(MINUTE, -30, @Ahora), DATEADD(MINUTE, -15, @Ahora)
FROM #Base;
SET @IDCheckout = SCOPE_IDENTITY();
INSERT INTO dbo.CheckoutDetalle (IDCheckout, IDVariante, Cantidad, PrecioUnitario) SELECT @IDCheckout, IDA, 1, 100.00 FROM #Base;
UPDATE dbo.Variante SET ExistenciaFisica = 0 WHERE IDVariante = (SELECT IDA FROM #Base);
INSERT INTO #Id VALUES (@IDCheckout);';

DECLARE @Errores TABLE (Orden INT IDENTITY, Descripcion NVARCHAR(300), Esperado INT, Sql NVARCHAR(MAX), Preparacion NVARCHAR(MAX));
INSERT INTO @Errores (Descripcion, Esperado, Sql, Preparacion) VALUES
    (N'Crear: el checkout ya se pagó con otra referencia (segundo cobro) → CHECKOUT_YA_PAGADO', 51602,
        @Comprar + @Pagar, NULL),
    (N'Crear: el carrito cambió después de iniciar → CHECKOUT_NO_PAGABLE', 51603,
        @IniciarCliente + N'INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = @A;' + @Pagar, NULL),
    (N'Crear: checkout cancelado por otro más reciente → CHECKOUT_NO_PAGABLE', 51603,
        @IniciarCliente + N'SET @K = NEWID();
          INSERT INTO #Checkout EXEC dbo.SP_Checkout_Iniciar @IDUsuario = @Cliente, @ClaveIdempotencia = @K, @IDMetodoEnvio = @Envio, @IDDireccion = @Dir;'
          + @Pagar, NULL),
    (N'Crear: checkout vencido y sin existencia para todo → CHECKOUT_EXPIRADO', 51601,
        N'SET @ID = (SELECT ID FROM #Id);' + @Pagar, @VencidoSinExistencia),
    (N'Crear: dos clientes con el último uso de un cupón; el segundo en pagar → CUPON_AGOTADO', 51404,
        N'INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente2, @IDVariante = @A;
          INSERT INTO #Carrito EXEC dbo.SP_Carrito_AplicarCupon @IDUsuario = @Cliente2, @Codigo = ''PED-PRUEBA-ULTIMO'';
          INSERT INTO #Checkout EXEC dbo.SP_Checkout_Iniciar @IDUsuario = @Cliente2, @ClaveIdempotencia = @K, @IDMetodoEnvio = @Envio, @IDDireccion = @Dir2;
          DECLARE @ID2 BIGINT = (SELECT IDCheckout FROM #Checkout);
          DELETE FROM #Checkout; SET @K = NEWID();
          INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = @A;
          INSERT INTO #Carrito EXEC dbo.SP_Carrito_AplicarCupon @IDUsuario = @Cliente, @Codigo = ''PED-PRUEBA-ULTIMO'';
          INSERT INTO #Checkout EXEC dbo.SP_Checkout_Iniciar @IDUsuario = @Cliente, @ClaveIdempotencia = @K, @IDMetodoEnvio = @Envio, @IDDireccion = @Dir;
          SET @ID = (SELECT IDCheckout FROM #Checkout);
          INSERT INTO #PedidoCliente EXEC dbo.SP_Pedidos_Crear @IDUsuario = @Cliente, @IDCheckout = @ID, @Marca = ''VISA'', @Ultimos4 = ''4242'',
                 @CodigoAutorizacion = ''AUT-E'', @ReferenciaExterna = ''REF-PED-PRUEBA-E1'', @TokenSeguimientoHash = @TS;
          EXEC dbo.SP_Pedidos_Crear @IDUsuario = @Cliente2, @IDCheckout = @ID2, @Marca = ''VISA'', @Ultimos4 = ''4242'',
                 @CodigoAutorizacion = ''AUT-E'', @ReferenciaExterna = ''REF-PED-PRUEBA-E2'', @TokenSeguimientoHash = @TS2;', NULL),
    (N'Crear: checkout de otro cliente → CHECKOUT_NO_ENCONTRADO', 50115,
        @IniciarCliente + N'EXEC dbo.SP_Pedidos_Crear @IDUsuario = @Cliente2, @IDCheckout = @ID, @Marca = ''VISA'', @Ultimos4 = ''4242'',
          @CodigoAutorizacion = ''AUT-E'', @ReferenciaExterna = ''REF-PED-PRUEBA-E9'', @TokenSeguimientoHash = @TS2;', NULL),
    (N'Crear: sin código de autorización → DATOS_PAGO_INVALIDOS', 50037,
        @IniciarCliente + N'EXEC dbo.SP_Pedidos_Crear @IDUsuario = @Cliente, @IDCheckout = @ID, @Marca = ''VISA'', @Ultimos4 = ''4242'',
          @CodigoAutorizacion = '' '', @ReferenciaExterna = ''REF-PED-PRUEBA-E9'', @TokenSeguimientoHash = @TS2;', NULL),
    (N'Crear: sin token de seguimiento → PARAMETRO_REQUERIDO', 50006,
        @IniciarCliente + N'EXEC dbo.SP_Pedidos_Crear @IDUsuario = @Cliente, @IDCheckout = @ID, @Marca = ''VISA'', @Ultimos4 = ''4242'',
          @CodigoAutorizacion = ''AUT-E'', @ReferenciaExterna = ''REF-PED-PRUEBA-E9'', @TokenSeguimientoHash = NULL;', NULL),
    (N'Crear: sin el tipo de movimiento SALIDA_VENTA → CONFIGURACION_INCOMPLETA', 59001,
        @IniciarCliente + @Pagar, N'DELETE FROM dbo.TipoMovimiento WHERE Codigo = ''SALIDA_VENTA'';'),
    (N'Cambiar estado: un cliente → PERMISO_DENEGADO', 50201,
        @Comprar + N'EXEC dbo.SP_Pedidos_CambiarEstado @Cliente, @Pedido, ''EN_PREPARACION'';', NULL),
    (N'Cambiar estado: estado inexistente → ESTADO_PEDIDO_INVALIDO', 50038,
        @Comprar + N'EXEC dbo.SP_Pedidos_CambiarEstado @Operador, @Pedido, ''PERDIDO'';', NULL),
    (N'Cambiar estado: a CANCELADO (tiene su propio SP) → ESTADO_PEDIDO_INVALIDO', 50038,
        @Comprar + N'EXEC dbo.SP_Pedidos_CambiarEstado @Operador, @Pedido, ''CANCELADO'';', NULL),
    (N'Cambiar estado: de PAGADO a ENTREGADO sin pasos intermedios → TRANSICION_NO_PERMITIDA', 51010,
        @Comprar + N'EXEC dbo.SP_Pedidos_CambiarEstado @Operador, @Pedido, ''ENTREGADO'';', NULL),
    (N'Cambiar estado: comentario de 501 caracteres → MOTIVO_INVALIDO', 50024,
        @Comprar + N'EXEC dbo.SP_Pedidos_CambiarEstado @Operador, @Pedido, ''EN_PREPARACION'', N''' + REPLICATE(N'c', 501) + N''';', NULL),
    (N'Cambiar estado: pedido inexistente → PEDIDO_NO_ENCONTRADO', 50116,
        N'EXEC dbo.SP_Pedidos_CambiarEstado @Operador, -1, ''EN_PREPARACION'';', NULL),
    (N'Cancelar (operador): sin motivo → MOTIVO_INVALIDO', 50024,
        @Comprar + N'EXEC dbo.SP_Pedidos_Cancelar @Operador, @Pedido;', NULL),
    (N'Cancelar (cliente): pedido de otro cliente → PEDIDO_NO_ENCONTRADO', 50116,
        @Comprar + N'EXEC dbo.SP_Pedidos_Cancelar @Cliente2, @Pedido;', NULL),
    (N'Cancelar (cliente): pedido ya en preparación → TRANSICION_NO_PERMITIDA', 51010,
        @Comprar + N'INSERT INTO #PedidoPanel EXEC dbo.SP_Pedidos_CambiarEstado @Operador, @Pedido, ''EN_PREPARACION'';
          EXEC dbo.SP_Pedidos_Cancelar @Cliente, @Pedido;', NULL),
    (N'Cancelar (operador): pedido ya enviado → TRANSICION_NO_PERMITIDA', 51010,
        @Comprar + N'INSERT INTO #PedidoPanel EXEC dbo.SP_Pedidos_CambiarEstado @Operador, @Pedido, ''EN_PREPARACION'';
          INSERT INTO #PedidoPanel EXEC dbo.SP_Pedidos_CambiarEstado @Operador, @Pedido, ''ENVIADO'';
          EXEC dbo.SP_Pedidos_Cancelar @Operador, @Pedido, N''Tarde'';', NULL),
    (N'Cancelar: un pedido ya cancelado → TRANSICION_NO_PERMITIDA', 51010,
        @Comprar + N'INSERT INTO #PedidoCliente EXEC dbo.SP_Pedidos_Cancelar @Cliente, @Pedido;
          EXEC dbo.SP_Pedidos_Cancelar @Admin, @Pedido, N''Otra vez'';', NULL),
    (N'Cancelar (operador en EN_PREPARACION, permitido)', 0,
        @Comprar + N'INSERT INTO #PedidoPanel EXEC dbo.SP_Pedidos_CambiarEstado @Operador, @Pedido, ''EN_PREPARACION'';
          INSERT INTO #PedidoPanel EXEC dbo.SP_Pedidos_Cancelar @Operador, @Pedido, N''Sin existencia en bodega'';', NULL),
    (N'Mis pedidos: detalle de un pedido de otro cliente → PEDIDO_NO_ENCONTRADO', 50116,
        @Comprar + N'EXEC dbo.SP_Pedidos_ObtenerCliente @Cliente2, @Pedido;', NULL),
    (N'Seguimiento: token desconocido → PEDIDO_NO_ENCONTRADO', 50116,
        N'EXEC dbo.SP_Pedidos_ObtenerSeguimiento @TS2;', NULL),
    (N'Seguimiento: token que no es SHA-256 → PARAMETRO_REQUERIDO', 50006,
        N'EXEC dbo.SP_Pedidos_ObtenerSeguimiento 0x0102;', NULL),
    (N'Panel: estado inexistente en el filtro → ESTADO_PEDIDO_INVALIDO', 50038,
        N'EXEC dbo.SP_Pedidos_Listar @Operador, ''PERDIDO'';', NULL),
    (N'Panel: un cliente → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Pedidos_Listar @Cliente;', NULL),
    (N'Panel: detalle de un pedido inexistente → PEDIDO_NO_ENCONTRADO', 50116,
        N'EXEC dbo.SP_Pedidos_Obtener @Operador, -1;', NULL);

DECLARE @Orden INT = 1, @Descripcion NVARCHAR(300), @Esperado INT, @Sql NVARCHAR(MAX), @Preparacion NVARCHAR(MAX);
WHILE @Orden <= (SELECT MAX(Orden) FROM @Errores)
BEGIN
    SELECT @Descripcion = Descripcion, @Esperado = Esperado, @Sql = @D + Sql, @Preparacion = Preparacion
    FROM @Errores WHERE Orden = @Orden;
    EXEC #EsperarError @Descripcion, @Esperado, @Sql, @Preparacion;
    SET @Orden += 1;
END;

/* Ningún caso dejó datos: todos se revirtieron. */
SET @Texto = (SELECT CONCAT((SELECT COUNT(*) FROM dbo.Variante WHERE SKU LIKE 'PED-PRUEBA-%'), N'|',
                            (SELECT COUNT(*) FROM dbo.Usuario WHERE Correo LIKE N'%.pedidos@shopcart.test'), N'|',
                            (SELECT COUNT(*) FROM dbo.Pago WHERE ReferenciaExterna LIKE 'REF-PED-PRUEBA-%')));
EXEC #Verificar N'Limpieza: no quedan datos de prueba', N'0|0|0', @Texto;

/* --- Resultado ---------------------------------------------------------------------------- */
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = NULL;
EXEC sys.sp_set_session_context @key = N'ComentarioEstado', @value = NULL;

IF CAST(SESSION_CONTEXT(N'PruebasFallidas') AS INT) > 0
    THROW 50000, N'Pruebas de procedimientos de pedidos fallidas.', 1;
EXEC sys.sp_set_session_context @key = N'PruebasFallidas', @value = NULL;
GO
