/*
    019_Procedimientos_Reportes.sql
    Se ejecuta conectado como shopcart_migrator (deploy.ps1 -Probar). Mismo esquema que
    009–018: el migrador prepara los datos y ejecuta cada SP haciéndose pasar por un miembro
    de RolApi; los casos de error usan #EsperarError. Los SKU de prueba empiezan con REP-PRUEBA.
    Los pedidos se crean por el flujo real (carrito → checkout → pago) y después se les fija
    una fecha de 2001, así ningún otro dato de la base cae en los periodos consultados.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT OFF;
GO

-- Permite ejecutar el script varias veces en la misma conexión (p. ej. en SSMS).
DROP TABLE IF EXISTS #Contexto, #Base, #Carrito, #Checkout, #PedidoCliente, #PedidoPanel, #Dashboard, #Periodos, #Categorias, #Top,
                     #Abandonados, #Existencias;
DROP PROCEDURE IF EXISTS #Verificar;
DROP PROCEDURE IF EXISTS #Preparar;
DROP PROCEDURE IF EXISTS #Comprar;
DROP PROCEDURE IF EXISTS #EsperarError;
GO

CREATE TABLE #Contexto (UsuarioApi SYSNAME NOT NULL);
CREATE TABLE #Base (IDCliente INT, IDOperador INT, IDAdmin INT, IDCarritoReciente INT);

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
CREATE TABLE #Dashboard (FechaDesde DATE, FechaHasta DATE, VentaNeta DECIMAL(14, 2), Pedidos INT, TicketPromedio DECIMAL(12, 2), Unidades INT,
                       MontoDevuelto DECIMAL(14, 2), CarritosAbandonados INT, ValorCarritosAbandonados DECIMAL(14, 2),
                       VariantesExistenciaBaja INT, HorasCarritoAbandonado INT, ExistenciaMinima INT);
CREATE TABLE #Periodos (Periodo DATE, Desde DATE, Hasta DATE, VentaNeta DECIMAL(14, 2), Pedidos INT);
CREATE TABLE #Categorias (IDCategoria INT, Categoria NVARCHAR(100), Unidades INT, VentaNeta DECIMAL(14, 2), Porcentaje DECIMAL(5, 2));
CREATE TABLE #Top (Posicion TINYINT, IDProducto INT, Producto NVARCHAR(200), Categoria NVARCHAR(100), Unidades INT, VentaNeta DECIMAL(14, 2));
CREATE TABLE #Abandonados (IDCarrito INT, EsInvitado BIT, Cliente NVARCHAR(201), Correo NVARCHAR(254), FechaUltimaActividad DATETIME2(3),
                           HorasInactivo INT, Articulos INT, Valor DECIMAL(12, 2), CodigoCupon VARCHAR(30));
CREATE TABLE #Existencias (IDVariante INT, SKU VARCHAR(50), IDProducto INT, Producto NVARCHAR(200), Descripcion NVARCHAR(400),
                           Categoria NVARCHAR(100), ExistenciaFisica INT, Reservado INT, Disponible INT, Activo BIT, ProductoActivo BIT);
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

/* Paga el carrito actual del cliente con el método de envío y la dirección dados. */
CREATE PROCEDURE #Comprar
    @IDCliente   INT,
    @IDDireccion INT,
    @IDEnvio     INT,
    @Referencia  VARCHAR(64),
    @IDPedido    INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @K UNIQUEIDENTIFIER = NEWID(), @Seguimiento VARBINARY(64) = HASHBYTES('SHA2_256', CONVERT(VARCHAR(36), NEWID())),
            @IDCheckout BIGINT;

    DELETE FROM #Checkout; DELETE FROM #PedidoCliente;
    INSERT INTO #Checkout EXEC dbo.SP_Checkout_Iniciar @IDUsuario = @IDCliente, @ClaveIdempotencia = @K, @IDMetodoEnvio = @IDEnvio,
                                                       @IDDireccion = @IDDireccion;
    SET @IDCheckout = (SELECT IDCheckout FROM #Checkout);
    INSERT INTO #PedidoCliente EXEC dbo.SP_Pedidos_Crear @IDUsuario = @IDCliente, @IDCheckout = @IDCheckout, @Marca = 'VISA', @Ultimos4 = '4242',
                                                         @CodigoAutorizacion = 'AUT-REP', @ReferenciaExterna = @Referencia,
                                                         @TokenSeguimientoHash = @Seguimiento;
    SET @IDPedido = (SELECT IDPedido FROM #PedidoCliente);
    DELETE FROM #Carrito; DELETE FROM #Checkout; DELETE FROM #PedidoCliente;
END;
GO

/*
    Datos de cada caso (lo que carga la semilla se agrega solo si falta):
    - Roles, usuario de sistema, parámetros (carrito abandonado a las 24 h, existencia mínima 5),
      estados y transiciones del pedido, tipos de movimiento.
    - Categoría X: camisa (A, Q40, 10 u.) y gorra (B, Q25, 5 u.). Categoría Y: llavero (C, Q10,
      10 u.; D inactiva, sin existencia).
    Con @ConPedidos = 1 (envío de Q25, que no es venta):
    - Pedido 1: 3 de A (Q120), entregado y devuelta 1 (Q40): DEVUELTO_PARCIAL. Fecha 2001-03-05
      05:30 UTC = domingo 4 de marzo, 23:30 en Guatemala.
    - Pedido 2: 1 de B y 2 de C (Q45), PAGADO. 2001-03-05 06:30 UTC = lunes 5, 00:30.
    - Pedido 3: 1 de C, CANCELADO. 6 de marzo.
    - Pedido 4: 1 de B, entregado y devuelto completo: DEVUELTO. 10 de abril.
    - Carritos abandonados: cliente 3 con 2 de A (10 de marzo) e invitado con 1 de B (11 de
      marzo). No abandonados: uno vacío (12 de marzo) y el del cliente 4 con 1 de C, con
      actividad hace 2 horas.
    Existencias finales: A 8, B 4, C 8, D 0 (inactiva).
*/
CREATE PROCEDURE #Preparar
    @ConPedidos BIT = 1
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Hash VARCHAR(255) = '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA';
    DECLARE @IDCliente INT, @IDCliente2 INT, @IDCliente3 INT, @IDCliente4 INT, @IDOperador INT, @IDAdmin INT, @IDCategoriaX INT,
            @IDCategoriaY INT, @IDCamisa INT, @IDGorra INT, @IDLlavero INT, @IDA INT, @IDB INT, @IDC INT, @IDD INT, @IDDireccion INT,
            @IDDireccion2 INT, @IDEnvio INT, @IDInicial TINYINT, @IDPedido1 INT, @IDPedido2 INT, @IDPedido3 INT, @IDPedido4 INT,
            @IDCarrito INT, @IDCarritoReciente INT;
    -- Un procedimiento temporal vive en tempdb y no ve los tipos tabla de la base: la devolución
    -- se registra con SQL dinámico, que se compila en la base actual.
    DECLARE @Devolver NVARCHAR(MAX) = N'DECLARE @L dbo.TT_Devoluciones_Linea;
        INSERT INTO @L SELECT IDPedidoDetalle, 1, 1 FROM dbo.PedidoDetalle WHERE IDPedido = @IDPedido;
        INSERT INTO #PedidoPanel EXEC dbo.SP_Devoluciones_Registrar @IDOperador, @IDPedido, @Motivo, @L;';

    INSERT INTO dbo.Rol (IDRol, Codigo, Nombre)
    SELECT v.IDRol, v.Codigo, v.Nombre
    FROM (VALUES (201, 'CLIENTE', N'Cliente'), (202, 'OPERADOR', N'Operador'), (203, 'ADMIN', N'Administrador'))
         AS v (IDRol, Codigo, Nombre)
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Rol AS r WHERE r.Codigo = v.Codigo);

    DECLARE @Parametros TABLE (IDParametro TINYINT, Clave VARCHAR(50), Valor NVARCHAR(200), TipoDato VARCHAR(10));
    INSERT INTO @Parametros VALUES (210, 'MAXIMO_UNIDADES_POR_LINEA', N'5', 'ENTERO'), (211, 'MINUTOS_RESERVA', N'15', 'ENTERO'),
                                   (212, 'TASA_IVA', N'0.12', 'DECIMAL'), (213, 'DIAS_DEVOLUCION', N'30', 'ENTERO'),
                                   (214, 'HORAS_CARRITO_ABANDONADO', N'24', 'ENTERO'), (215, 'EXISTENCIA_MINIMA', N'5', 'ENTERO');
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
    SELECT r.IDRol, N'cliente.reportes@shopcart.test', @Hash, N'Cliente', N'Uno' FROM dbo.Rol AS r WHERE r.Codigo = 'CLIENTE';
    SET @IDCliente = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'cliente2.reportes@shopcart.test', @Hash, N'Cliente', N'Dos' FROM dbo.Rol AS r WHERE r.Codigo = 'CLIENTE';
    SET @IDCliente2 = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'cliente3.reportes@shopcart.test', @Hash, N'Cliente', N'Tres' FROM dbo.Rol AS r WHERE r.Codigo = 'CLIENTE';
    SET @IDCliente3 = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'cliente4.reportes@shopcart.test', @Hash, N'Cliente', N'Cuatro' FROM dbo.Rol AS r WHERE r.Codigo = 'CLIENTE';
    SET @IDCliente4 = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'operador.reportes@shopcart.test', @Hash, N'Operador', N'Reportes' FROM dbo.Rol AS r WHERE r.Codigo = 'OPERADOR';
    SET @IDOperador = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'admin.reportes@shopcart.test', @Hash, N'Admin', N'Reportes' FROM dbo.Rol AS r WHERE r.Codigo = 'ADMIN';
    SET @IDAdmin = SCOPE_IDENTITY();
    IF NOT EXISTS (SELECT 1 FROM dbo.Usuario WHERE EsSistema = 1)
        INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido, EsSistema)
        SELECT r.IDRol, N'sistema.reportes@shopcart.test', NULL, N'Sistema', N'Reportes', 1 FROM dbo.Rol AS r WHERE r.Codigo = 'ADMIN';

    DELETE FROM #Base;
    INSERT INTO #Base (IDCliente, IDOperador, IDAdmin) VALUES (@IDCliente, @IDOperador, @IDAdmin);
    IF @ConPedidos = 0
        RETURN;

    INSERT INTO dbo.Departamento (IDDepartamento, Nombre) VALUES (241, N'Departamento Reportes Prueba');
    INSERT INTO dbo.Municipio (IDMunicipio, IDDepartamento, Nombre) VALUES (24101, 241, N'Municipio Reportes Prueba');
    INSERT INTO dbo.Direccion (IDUsuario, Alias, NombreDestinatario, Telefono, Linea1, IDMunicipio, EsPredeterminada)
    VALUES (@IDCliente, N'Casa', N'Cliente Uno', '5555-1234', N'1a calle 1-23 zona 1', 24101, 1);
    SET @IDDireccion = SCOPE_IDENTITY();
    INSERT INTO dbo.Direccion (IDUsuario, Alias, NombreDestinatario, Telefono, Linea1, IDMunicipio, EsPredeterminada)
    VALUES (@IDCliente2, N'Casa', N'Cliente Dos', '5555-9999', N'2a calle 2-34 zona 2', 24101, 1);
    SET @IDDireccion2 = SCOPE_IDENTITY();

    INSERT INTO dbo.Categoria (Nombre, Slug) VALUES (N'Reportes Prueba X', 'reportes-prueba-x');
    SET @IDCategoriaX = SCOPE_IDENTITY();
    INSERT INTO dbo.Categoria (Nombre, Slug) VALUES (N'Reportes Prueba Y', 'reportes-prueba-y');
    SET @IDCategoriaY = SCOPE_IDENTITY();
    INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug, Activo) VALUES (@IDCategoriaX, N'Camisa Reportes Prueba', 'camisa-reportes-prueba', 1);
    SET @IDCamisa = SCOPE_IDENTITY();
    INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug, Activo) VALUES (@IDCategoriaX, N'Gorra Reportes Prueba', 'gorra-reportes-prueba', 1);
    SET @IDGorra = SCOPE_IDENTITY();
    INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug, Activo) VALUES (@IDCategoriaY, N'Llavero Reportes Prueba', 'llavero-reportes-prueba', 1);
    SET @IDLlavero = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica, ClaveCombinacion) VALUES (@IDCamisa, 'REP-PRUEBA-A', 40.00, 10, '1');
    SET @IDA = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica, ClaveCombinacion) VALUES (@IDGorra, 'REP-PRUEBA-B', 25.00, 5, '1');
    SET @IDB = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica, ClaveCombinacion) VALUES (@IDLlavero, 'REP-PRUEBA-C', 10.00, 10, '1');
    SET @IDC = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica, ClaveCombinacion, Activo) VALUES (@IDLlavero, 'REP-PRUEBA-D', 10.00, 0, '2', 0);
    SET @IDD = SCOPE_IDENTITY();
    INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimiento, Signo, Cantidad, SaldoAnterior, SaldoNuevo, IDUsuario)
    VALUES (@IDA, @IDInicial, 1, 10, 0, 10, @IDAdmin), (@IDB, @IDInicial, 1, 5, 0, 5, @IDAdmin), (@IDC, @IDInicial, 1, 10, 0, 10, @IDAdmin);

    INSERT INTO dbo.MetodoEnvio (Nombre, Costo, DiasEstimadosMin, DiasEstimadosMax) VALUES (N'Estándar Reportes Prueba', 25.00, 2, 4);
    SET @IDEnvio = SCOPE_IDENTITY();

    -- Pedido 1: 3 de A, entregado, se devuelve 1.
    INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @IDCliente, @IDVariante = @IDA, @Cantidad = 3;
    EXEC #Comprar @IDCliente, @IDDireccion, @IDEnvio, 'REF-REP-PRUEBA-1', @IDPedido1 OUTPUT;
    INSERT INTO #PedidoPanel EXEC dbo.SP_Pedidos_CambiarEstado @IDOperador, @IDPedido1, 'EN_PREPARACION';
    INSERT INTO #PedidoPanel EXEC dbo.SP_Pedidos_CambiarEstado @IDOperador, @IDPedido1, 'ENVIADO';
    INSERT INTO #PedidoPanel EXEC dbo.SP_Pedidos_CambiarEstado @IDOperador, @IDPedido1, 'ENTREGADO';
    EXEC sys.sp_executesql @Devolver, N'@IDOperador INT, @IDPedido INT, @Motivo NVARCHAR(500)', @IDOperador, @IDPedido1, N'Talla incorrecta';

    -- Pedido 2: 1 de B y 2 de C, sigue PAGADO.
    INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @IDCliente2, @IDVariante = @IDB;
    INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @IDCliente2, @IDVariante = @IDC, @Cantidad = 2;
    EXEC #Comprar @IDCliente2, @IDDireccion2, @IDEnvio, 'REF-REP-PRUEBA-2', @IDPedido2 OUTPUT;

    -- Pedido 3: 1 de C, cancelado.
    INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @IDCliente, @IDVariante = @IDC;
    EXEC #Comprar @IDCliente, @IDDireccion, @IDEnvio, 'REF-REP-PRUEBA-3', @IDPedido3 OUTPUT;
    INSERT INTO #PedidoPanel EXEC dbo.SP_Pedidos_Cancelar @IDOperador, @IDPedido3, N'Sin existencia en bodega';

    -- Pedido 4: 1 de B, entregado y devuelto completo.
    INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @IDCliente2, @IDVariante = @IDB;
    EXEC #Comprar @IDCliente2, @IDDireccion2, @IDEnvio, 'REF-REP-PRUEBA-4', @IDPedido4 OUTPUT;
    INSERT INTO #PedidoPanel EXEC dbo.SP_Pedidos_CambiarEstado @IDOperador, @IDPedido4, 'EN_PREPARACION';
    INSERT INTO #PedidoPanel EXEC dbo.SP_Pedidos_CambiarEstado @IDOperador, @IDPedido4, 'ENVIADO';
    INSERT INTO #PedidoPanel EXEC dbo.SP_Pedidos_CambiarEstado @IDOperador, @IDPedido4, 'ENTREGADO';
    EXEC sys.sp_executesql @Devolver, N'@IDOperador INT, @IDPedido INT, @Motivo NVARCHAR(500)', @IDOperador, @IDPedido4, N'No le quedó';
    DELETE FROM #PedidoPanel;

    -- Fechas controladas (UTC).
    UPDATE dbo.Pedido
    SET FechaPedido = CASE IDPedido WHEN @IDPedido1 THEN '2001-03-05T05:30:00' WHEN @IDPedido2 THEN '2001-03-05T06:30:00'
                                    WHEN @IDPedido3 THEN '2001-03-06T15:00:00' ELSE '2001-04-10T15:00:00' END
    WHERE IDPedido IN (@IDPedido1, @IDPedido2, @IDPedido3, @IDPedido4);

    -- Carritos.
    INSERT INTO dbo.Carrito (IDUsuario, FechaUltimaActividad) VALUES (@IDCliente3, '2001-03-10T18:00:00');
    SET @IDCarrito = SCOPE_IDENTITY();
    INSERT INTO dbo.CarritoItem (IDCarrito, IDVariante, Cantidad) VALUES (@IDCarrito, @IDA, 2);
    INSERT INTO dbo.Carrito (TokenInvitadoHash, FechaUltimaActividad) VALUES (HASHBYTES('SHA2_256', 'reportes-prueba-invitado'), '2001-03-11T18:00:00');
    SET @IDCarrito = SCOPE_IDENTITY();
    INSERT INTO dbo.CarritoItem (IDCarrito, IDVariante, Cantidad) VALUES (@IDCarrito, @IDB, 1);
    INSERT INTO dbo.Carrito (IDUsuario, FechaUltimaActividad) VALUES (@IDCliente, '2001-03-12T18:00:00');
    INSERT INTO dbo.Carrito (IDUsuario, FechaUltimaActividad) VALUES (@IDCliente4, DATEADD(HOUR, -2, SYSUTCDATETIME()));
    SET @IDCarritoReciente = SCOPE_IDENTITY();
    INSERT INTO dbo.CarritoItem (IDCarrito, IDVariante, Cantidad) VALUES (@IDCarritoReciente, @IDC, 1);

    UPDATE #Base SET IDCarritoReciente = @IDCarritoReciente;
END;
GO

/*
    Caso de error: prepara (sin pedidos), ejecuta @Sql como la API y compara el número de
    error (0 = no falló). Todo se revierte.
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
    EXEC #Preparar @ConPedidos = 0;
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
    DELETE FROM #Periodos;

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
DECLARE @IDAdmin INT, @IDCarritoReciente INT, @Total INT, @TotalBaja INT, @Hoy DATE;
DECLARE @Texto NVARCHAR(400);

BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDAdmin = IDAdmin, @IDCarritoReciente = IDCarritoReciente FROM #Base;

/* === Resumen del dashboard ================================================================ */
EXECUTE AS USER = @Api;
INSERT INTO #Dashboard EXEC dbo.SP_Reportes_Resumen @IDAdmin, '2001-03-01', '2001-04-30';
INSERT INTO #Existencias EXEC dbo.SP_Inventario_ListarExistencias @IDAdmin, NULL, NULL, 0, 1, 100, @TotalBaja OUTPUT, 1;
REVERT;
SET @Texto = (SELECT CONCAT(VentaNeta, N'|', Pedidos, N'|', TicketPromedio, N'|', Unidades, N'|', MontoDevuelto, N'|',
                            CarritosAbandonados, N':', ValorCarritosAbandonados, N'|', HorasCarritoAbandonado, N':', ExistenciaMinima)
              FROM #Dashboard);
EXEC #Verificar N'Resumen de marzo y abril: sin cancelado ni devuelto completo, neto de devoluciones, sin envío; carritos abandonados del periodo',
     N'125.00|2|62.50|5|65.00|2:105.00|24:5', @Texto;
SET @Texto = (SELECT CASE WHEN VariantesExistenciaBaja = @TotalBaja AND @TotalBaja >= 1 THEN N'coinciden'
                            ELSE CONCAT(VariantesExistenciaBaja, N' contra ', @TotalBaja) END FROM #Dashboard);
EXEC #Verificar N'Resumen: las variantes con existencia baja son las del listado de existencias bajas', N'coinciden', @Texto;
DELETE FROM #Dashboard; DELETE FROM #Existencias;

/* === Ventas por periodo =================================================================== */
EXECUTE AS USER = @Api;
INSERT INTO #Periodos EXEC dbo.SP_Reportes_VentasPorPeriodo @IDAdmin, 'dia', '2001-03-03', '2001-03-06';
REVERT;
SET @Texto = (SELECT STRING_AGG(CONCAT(Periodo, N':', VentaNeta, N':', Pedidos), N' | ') WITHIN GROUP (ORDER BY Periodo) FROM #Periodos);
DELETE FROM #Periodos;
EXEC #Verificar N'Por día: el pedido de las 05:30 UTC cuenta el domingo 4 (hora de Guatemala); días sin ventas en 0; el cancelado no cuenta',
     N'2001-03-03:0.00:0 | 2001-03-04:80.00:1 | 2001-03-05:45.00:1 | 2001-03-06:0.00:0', @Texto;

EXECUTE AS USER = @Api;
INSERT INTO #Periodos EXEC dbo.SP_Reportes_VentasPorPeriodo @IDAdmin, 'SEMANA', '2001-03-01', '2001-03-14';
REVERT;
SET @Texto = (SELECT STRING_AGG(CONCAT(Periodo, N':', Desde, N'..', Hasta, N':', VentaNeta, N':', Pedidos), N' | ') WITHIN GROUP (ORDER BY Periodo)
              FROM #Periodos);
DELETE FROM #Periodos;
EXEC #Verificar N'Por semana: de lunes a domingo, la primera recortada al rango; el domingo 4 y el lunes 5 caen en semanas distintas',
     N'2001-02-26:2001-03-01..2001-03-04:80.00:1 | 2001-03-05:2001-03-05..2001-03-11:45.00:1 | 2001-03-12:2001-03-12..2001-03-14:0.00:0', @Texto;

EXECUTE AS USER = @Api;
INSERT INTO #Periodos EXEC dbo.SP_Reportes_VentasPorPeriodo @IDAdmin, 'MES', '2001-03-01', '2001-05-10';
REVERT;
SET @Texto = (SELECT STRING_AGG(CONCAT(Periodo, N':', Desde, N'..', Hasta, N':', VentaNeta, N':', Pedidos), N' | ') WITHIN GROUP (ORDER BY Periodo)
              FROM #Periodos);
DELETE FROM #Periodos;
EXEC #Verificar N'Por mes: abril en 0 (su único pedido se devolvió completo); mayo recortado al rango',
     N'2001-03-01:2001-03-01..2001-03-31:125.00:2 | 2001-04-01:2001-04-01..2001-04-30:0.00:0 | 2001-05-01:2001-05-01..2001-05-10:0.00:0', @Texto;

EXECUTE AS USER = @Api;
INSERT INTO #Periodos EXEC dbo.SP_Reportes_VentasPorPeriodo @IDAdmin, 'DIA', '2000-01-01', '2000-12-31';
INSERT INTO #Periodos EXEC dbo.SP_Reportes_VentasPorPeriodo @IDAdmin, 'SEMANA', '2001-01-01', '2010-12-31';
REVERT;
SET @Texto = CONCAT((SELECT COUNT(*) FROM #Periodos WHERE Periodo < '2001-01-01'), N'|', (SELECT COUNT(*) FROM #Periodos WHERE Periodo >= '2001-01-01'));
DELETE FROM #Periodos;
EXEC #Verificar N'Rangos máximos: 366 días (año bisiesto completo) y 522 semanas en 10 años', N'366|522', @Texto;

/* === Ventas por categoría y top 10 ======================================================== */
EXECUTE AS USER = @Api;
INSERT INTO #Categorias EXEC dbo.SP_Reportes_VentasPorCategoria @IDAdmin, '2001-03-01', '2001-04-30';
INSERT INTO #Top EXEC dbo.SP_Reportes_TopProductos @IDAdmin, '2001-03-01', '2001-04-30';
REVERT;
SET @Texto = (SELECT STRING_AGG(CONCAT(Categoria, N':', Unidades, N':', VentaNeta, N':', Porcentaje, N'%'), N' | ') WITHIN GROUP (ORDER BY VentaNeta DESC)
              FROM #Categorias);
EXEC #Verificar N'Por categoría: unidades y ventas netas con su porcentaje; suman lo mismo que el resumen',
     N'Reportes Prueba X:3:105.00:84.00% | Reportes Prueba Y:2:20.00:16.00%', @Texto;
SET @Texto = (SELECT STRING_AGG(CONCAT(Posicion, N'.', Producto, N':', Unidades, N':', VentaNeta), N' | ') WITHIN GROUP (ORDER BY Posicion) FROM #Top);
EXEC #Verificar N'Top 10: por unidades netas (la devuelta no cuenta); a igual cantidad, por ventas',
     N'1.Camisa Reportes Prueba:2:80.00 | 2.Llavero Reportes Prueba:2:20.00 | 3.Gorra Reportes Prueba:1:25.00', @Texto;
DELETE FROM #Categorias; DELETE FROM #Top;

/* === Carritos abandonados ================================================================= */
EXECUTE AS USER = @Api;
INSERT INTO #Abandonados EXEC dbo.SP_Reportes_CarritosAbandonados @IDAdmin, '2001-03-01', '2001-03-31', 1, 20, @Total OUTPUT;
REVERT;
SET @Texto = CONCAT(@Total, N'|', (SELECT STRING_AGG(CONCAT(ISNULL(Cliente, N'Invitado'), N':', EsInvitado, N':', Articulos, N':', Valor), N' | ')
                                          WITHIN GROUP (ORDER BY FechaUltimaActividad DESC) FROM #Abandonados));
DELETE FROM #Abandonados;
EXEC #Verificar N'Carritos abandonados de marzo: el invitado y el cliente, el más reciente primero; el vacío no cuenta',
     N'2|Invitado:1:1:25.00 | Cliente Tres:0:2:80.00', @Texto;

-- El carrito con actividad hace 2 horas no está abandonado con 24 h, pero sí con 1 h.
SET @Hoy = CAST(DATEADD(HOUR, -2, SYSUTCDATETIME()) AT TIME ZONE 'UTC' AT TIME ZONE 'Central America Standard Time' AS DATE);
EXECUTE AS USER = @Api;
INSERT INTO #Abandonados EXEC dbo.SP_Reportes_CarritosAbandonados @IDAdmin, @Hoy, @Hoy, 1, 100;
REVERT;
SET @Texto = CAST((SELECT COUNT(*) FROM #Abandonados WHERE IDCarrito = @IDCarritoReciente) AS NVARCHAR(10));
DELETE FROM #Abandonados;
UPDATE dbo.Parametro SET Valor = N'1' WHERE Clave = 'HORAS_CARRITO_ABANDONADO';
EXECUTE AS USER = @Api;
INSERT INTO #Abandonados EXEC dbo.SP_Reportes_CarritosAbandonados @IDAdmin, @Hoy, @Hoy, 1, 100;
REVERT;
SET @Texto += N'|' + CAST((SELECT COUNT(*) FROM #Abandonados WHERE IDCarrito = @IDCarritoReciente) AS NVARCHAR(10));
DELETE FROM #Abandonados;
EXEC #Verificar N'HORAS_CARRITO_ABANDONADO: un carrito inactivo hace 2 horas no cuenta con 24 y sí con 1', N'0|1', @Texto;

/* === Existencias bajas ==================================================================== */
EXECUTE AS USER = @Api;
INSERT INTO #Existencias EXEC dbo.SP_Inventario_ListarExistencias @IDAdmin, N'REP-PRUEBA', NULL, 0, 1, 20, @Total OUTPUT, 1;
REVERT;
SET @Texto = CONCAT(@Total, N'|', (SELECT STRING_AGG(CONCAT(SKU, N':', Disponible), N' | ') WITHIN GROUP (ORDER BY SKU) FROM #Existencias));
DELETE FROM #Existencias;
UPDATE dbo.Parametro SET Valor = N'8' WHERE Clave = 'EXISTENCIA_MINIMA';
EXECUTE AS USER = @Api;
INSERT INTO #Existencias EXEC dbo.SP_Inventario_ListarExistencias @IDAdmin, N'REP-PRUEBA', NULL, 0, 1, 20, @Total OUTPUT, 1;
REVERT;
SET @Texto += N'||' + CONCAT(@Total, N'|', (SELECT STRING_AGG(CONCAT(SKU, N':', Disponible), N' | ') WITHIN GROUP (ORDER BY SKU) FROM #Existencias));
DELETE FROM #Existencias;
EXEC #Verificar N'Existencias bajas: con mínimo 5 solo B (4); con 8 también A y C; la variante inactiva nunca',
     N'1|REP-PRUEBA-B:4||3|REP-PRUEBA-A:8 | REP-PRUEBA-B:4 | REP-PRUEBA-C:8', @Texto;
ROLLBACK TRANSACTION;

/* === Casos de error ====================================================================== */
DECLARE @D NVARCHAR(MAX) = N'
DECLARE @Cliente INT, @Operador INT, @Admin INT;
SELECT @Cliente = IDCliente, @Operador = IDOperador, @Admin = IDAdmin FROM #Base;
';

DECLARE @Errores TABLE (Orden INT IDENTITY, Descripcion NVARCHAR(300), Esperado INT, Sql NVARCHAR(MAX), Preparacion NVARCHAR(MAX));
INSERT INTO @Errores (Descripcion, Esperado, Sql, Preparacion) VALUES
    (N'Resumen: un operador → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Reportes_Resumen @Operador, ''2001-03-01'', ''2001-03-31'';', NULL),
    (N'Resumen: sin fecha final → RANGO_FECHAS_INVALIDO', 50026,
        N'EXEC dbo.SP_Reportes_Resumen @Admin, ''2001-03-01'', NULL;', NULL),
    (N'Resumen: fecha inicial posterior a la final → RANGO_FECHAS_INVALIDO', 50026,
        N'EXEC dbo.SP_Reportes_Resumen @Admin, ''2001-03-02'', ''2001-03-01'';', NULL),
    (N'Resumen: antes del 2000 → RANGO_FECHAS_INVALIDO', 50026,
        N'EXEC dbo.SP_Reportes_Resumen @Admin, ''1999-12-31'', ''2001-03-01'';', NULL),
    (N'Resumen: sin HORAS_CARRITO_ABANDONADO → CONFIGURACION_INCOMPLETA', 59001,
        N'EXEC dbo.SP_Reportes_Resumen @Admin, ''2001-03-01'', ''2001-03-31'';',
        N'DELETE FROM dbo.Parametro WHERE Clave = ''HORAS_CARRITO_ABANDONADO'';'),
    (N'Resumen: EXISTENCIA_MINIMA fuera de rango → CONFIGURACION_INCOMPLETA', 59001,
        N'EXEC dbo.SP_Reportes_Resumen @Admin, ''2001-03-01'', ''2001-03-31'';',
        N'UPDATE dbo.Parametro SET Valor = N''1000'' WHERE Clave = ''EXISTENCIA_MINIMA'';'),
    (N'Por periodo: agrupación por año → AGRUPACION_INVALIDA', 50039,
        N'INSERT INTO #Periodos EXEC dbo.SP_Reportes_VentasPorPeriodo @Admin, ''ANIO'', ''2001-03-01'', ''2001-03-31'';', NULL),
    (N'Por periodo: 367 días por día → RANGO_FECHAS_EXCEDIDO', 50040,
        N'INSERT INTO #Periodos EXEC dbo.SP_Reportes_VentasPorPeriodo @Admin, ''DIA'', ''2001-01-01'', ''2002-01-02'';', NULL),
    (N'Por periodo: 10 años por mes → RANGO_FECHAS_EXCEDIDO', 50040,
        N'INSERT INTO #Periodos EXEC dbo.SP_Reportes_VentasPorPeriodo @Admin, ''MES'', ''2001-01-01'', ''2011-01-01'';', NULL),
    (N'Por categoría: un cliente → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Reportes_VentasPorCategoria @Cliente, ''2001-03-01'', ''2001-03-31'';', NULL),
    (N'Top 10: un operador → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Reportes_TopProductos @Operador, ''2001-03-01'', ''2001-03-31'';', NULL),
    (N'Carritos abandonados: página 0 → PAGINACION_INVALIDA', 50007,
        N'EXEC dbo.SP_Reportes_CarritosAbandonados @Admin, NULL, NULL, 0;', NULL),
    (N'Carritos abandonados: fecha inicial posterior a la final → RANGO_FECHAS_INVALIDO', 50026,
        N'EXEC dbo.SP_Reportes_CarritosAbandonados @Admin, ''2001-03-02'', ''2001-03-01'';', NULL),
    (N'Carritos abandonados: sin HORAS_CARRITO_ABANDONADO → CONFIGURACION_INCOMPLETA', 59001,
        N'EXEC dbo.SP_Reportes_CarritosAbandonados @Admin;',
        N'DELETE FROM dbo.Parametro WHERE Clave = ''HORAS_CARRITO_ABANDONADO'';'),
    (N'Existencias bajas: sin EXISTENCIA_MINIMA → CONFIGURACION_INCOMPLETA', 59001,
        N'EXEC dbo.SP_Inventario_ListarExistencias @Operador, @SoloExistenciaBaja = 1;',
        N'DELETE FROM dbo.Parametro WHERE Clave = ''EXISTENCIA_MINIMA'';');

DECLARE @Orden INT = 1, @Descripcion NVARCHAR(300), @Esperado INT, @Sql NVARCHAR(MAX), @Preparacion NVARCHAR(MAX);
WHILE @Orden <= (SELECT MAX(Orden) FROM @Errores)
BEGIN
    SELECT @Descripcion = Descripcion, @Esperado = Esperado, @Sql = @D + Sql, @Preparacion = Preparacion
    FROM @Errores WHERE Orden = @Orden;
    EXEC #EsperarError @Descripcion, @Esperado, @Sql, @Preparacion;
    SET @Orden += 1;
END;

/* Ningún caso dejó datos: todos se revirtieron. */
SET @Texto = (SELECT CONCAT((SELECT COUNT(*) FROM dbo.Variante WHERE SKU LIKE 'REP-PRUEBA-%'), N'|',
                            (SELECT COUNT(*) FROM dbo.Usuario WHERE Correo LIKE N'%.reportes@shopcart.test'), N'|',
                            (SELECT COUNT(*) FROM dbo.Pago WHERE ReferenciaExterna LIKE 'REF-REP-PRUEBA-%')));
EXEC #Verificar N'Limpieza: no quedan datos de prueba', N'0|0|0', @Texto;

/* --- Resultado ---------------------------------------------------------------------------- */
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = NULL;
EXEC sys.sp_set_session_context @key = N'ComentarioEstado', @value = NULL;

IF CAST(SESSION_CONTEXT(N'PruebasFallidas') AS INT) > 0
    THROW 50000, N'Pruebas de procedimientos de reportes fallidas.', 1;
EXEC sys.sp_set_session_context @key = N'PruebasFallidas', @value = NULL;
GO
