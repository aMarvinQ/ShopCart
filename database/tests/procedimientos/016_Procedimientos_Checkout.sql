/*
    016_Procedimientos_Checkout.sql
    Se ejecuta conectado como shopcart_migrator (deploy.ps1 -Probar). Mismo esquema que
    009–015: el migrador prepara los datos y ejecuta cada SP haciéndose pasar por un miembro
    de RolApi; los casos de error usan #EsperarError. Los SKU de prueba empiezan con CHK-PRUEBA.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT OFF;
GO

-- Permite ejecutar el script varias veces en la misma conexión (p. ej. en SSMS).
DROP TABLE IF EXISTS #Contexto, #Base, #Carrito, #Checkout, #Expiracion;
DROP PROCEDURE IF EXISTS #Verificar;
DROP PROCEDURE IF EXISTS #Preparar;
DROP PROCEDURE IF EXISTS #EsperarError;
GO

CREATE TABLE #Contexto (UsuarioApi SYSNAME NOT NULL);
CREATE TABLE #Base (IDCliente INT, IDCliente2 INT, IDOperador INT, IDA INT, IDB INT, IDC INT, IDE INT, IDDireccion INT,
                    IDDireccionAjena INT, IDEstandar INT, IDMetodoInactivo INT, IDDiez INT, IDMin INT);

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
CREATE TABLE #Expiracion (CheckoutsExpirados INT, ReservasLiberadas INT);
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
    - Roles; MAXIMO_UNIDADES_POR_LINEA = 5, MINUTOS_RESERVA = 15, TASA_IVA = 0.12.
    - Un operador y dos clientes; el primero sin teléfono en su cuenta, cada uno con una dirección
      en "Municipio Checkout Prueba" (departamento 220).
    - Camisa: A 100.00 con 10 unidades, B 50.00 con 2, C desactivada; E de una categoría oculta.
    - Envío estándar Q25 (activo) y uno inactivo. Cupones DIEZ (10 %) y MIN (Q30 desde Q1000).
*/
CREATE PROCEDURE #Preparar
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Hash VARCHAR(255) = '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA';
    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @IDCliente INT, @IDCliente2 INT, @IDOperador INT, @IDCategoria INT, @IDOculta INT, @IDCamisa INT, @IDLampara INT,
            @IDA INT, @IDB INT, @IDC INT, @IDE INT, @IDDireccion INT, @IDDireccionAjena INT, @IDEstandar INT, @IDMetodoInactivo INT,
            @IDDiez INT, @IDMin INT;

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

    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'cliente.checkout@shopcart.test', @Hash, N'Cliente', N'Checkout' FROM dbo.Rol AS r WHERE r.Codigo = 'CLIENTE';
    SET @IDCliente = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido, Telefono)
    SELECT r.IDRol, N'cliente2.checkout@shopcart.test', @Hash, N'Cliente', N'Dos', '2222-3333' FROM dbo.Rol AS r WHERE r.Codigo = 'CLIENTE';
    SET @IDCliente2 = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'operador.checkout@shopcart.test', @Hash, N'Operador', N'Checkout' FROM dbo.Rol AS r WHERE r.Codigo = 'OPERADOR';
    SET @IDOperador = SCOPE_IDENTITY();

    INSERT INTO dbo.Departamento (IDDepartamento, Nombre) VALUES (220, N'Departamento Checkout Prueba');
    INSERT INTO dbo.Municipio (IDMunicipio, IDDepartamento, Nombre) VALUES (22001, 220, N'Municipio Checkout Prueba');
    INSERT INTO dbo.Direccion (IDUsuario, Alias, NombreDestinatario, Telefono, Linea1, IDMunicipio, CodigoPostal, Referencias, EsPredeterminada)
    VALUES (@IDCliente, N'Casa', N'Destinatario Checkout', '5555-1234', N'1a calle 1-23 zona 1', 22001, '01001', N'Portón negro', 1);
    SET @IDDireccion = SCOPE_IDENTITY();
    INSERT INTO dbo.Direccion (IDUsuario, Alias, NombreDestinatario, Telefono, Linea1, IDMunicipio, EsPredeterminada)
    VALUES (@IDCliente2, N'Casa', N'Cliente Dos', '5555-9999', N'2a calle 2-34 zona 2', 22001, 1);
    SET @IDDireccionAjena = SCOPE_IDENTITY();

    INSERT INTO dbo.Categoria (Nombre, Slug) VALUES (N'Checkout Prueba', 'checkout-prueba');
    SET @IDCategoria = SCOPE_IDENTITY();
    INSERT INTO dbo.Categoria (Nombre, Slug, Activo) VALUES (N'Checkout Prueba Oculta', 'checkout-prueba-oculta', 0);
    SET @IDOculta = SCOPE_IDENTITY();
    INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug, Activo) VALUES (@IDCategoria, N'Camisa Checkout Prueba', 'camisa-checkout-prueba', 1);
    SET @IDCamisa = SCOPE_IDENTITY();
    INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug, Activo) VALUES (@IDOculta, N'Lámpara Checkout Prueba', 'lampara-checkout-prueba', 1);
    SET @IDLampara = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica, ClaveCombinacion) VALUES (@IDCamisa, 'CHK-PRUEBA-A', 100.00, 10, '1');
    SET @IDA = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica, ClaveCombinacion) VALUES (@IDCamisa, 'CHK-PRUEBA-B', 50.00, 2, '2');
    SET @IDB = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica, ClaveCombinacion, Activo) VALUES (@IDCamisa, 'CHK-PRUEBA-C', 30.00, 5, '3', 0);
    SET @IDC = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica) VALUES (@IDLampara, 'CHK-PRUEBA-E', 20.00, 5);
    SET @IDE = SCOPE_IDENTITY();

    INSERT INTO dbo.MetodoEnvio (Nombre, Costo, DiasEstimadosMin, DiasEstimadosMax) VALUES (N'Estándar Checkout Prueba', 25.00, 2, 4);
    SET @IDEstandar = SCOPE_IDENTITY();
    INSERT INTO dbo.MetodoEnvio (Nombre, Costo, DiasEstimadosMin, DiasEstimadosMax, Activo) VALUES (N'Inactivo Checkout Prueba', 5.00, 1, 2, 0);
    SET @IDMetodoInactivo = SCOPE_IDENTITY();

    INSERT INTO dbo.Cupon (Codigo, Descripcion, TipoDescuento, Valor, MontoMinimo, FechaInicio, FechaFin)
    VALUES ('CHK-PRUEBA-DIEZ', N'Diez por ciento', 'PORCENTAJE', 10, 0, DATEADD(DAY, -1, @Ahora), DATEADD(DAY, 30, @Ahora));
    SET @IDDiez = SCOPE_IDENTITY();
    INSERT INTO dbo.Cupon (Codigo, Descripcion, TipoDescuento, Valor, MontoMinimo, FechaInicio, FechaFin)
    VALUES ('CHK-PRUEBA-MIN', N'Q30 desde Q1000', 'MONTO_FIJO', 30, 1000, DATEADD(DAY, -1, @Ahora), DATEADD(DAY, 30, @Ahora));
    SET @IDMin = SCOPE_IDENTITY();

    DELETE FROM #Base;
    INSERT INTO #Base VALUES (@IDCliente, @IDCliente2, @IDOperador, @IDA, @IDB, @IDC, @IDE, @IDDireccion, @IDDireccionAjena,
                              @IDEstandar, @IDMetodoInactivo, @IDDiez, @IDMin);
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
    DELETE FROM #Carrito;
    DELETE FROM #Checkout;

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
DECLARE @IDCliente INT, @IDA INT, @IDB INT, @IDDireccion INT, @IDEstandar INT, @Primero BIGINT, @Segundo BIGINT, @Tercero BIGINT,
        @Invitado BIGINT;
DECLARE @Texto NVARCHAR(400);
DECLARE @K1 UNIQUEIDENTIFIER = NEWID(), @K2 UNIQUEIDENTIFIER = NEWID(), @K3 UNIQUEIDENTIFIER = NEWID(), @KI UNIQUEIDENTIFIER = NEWID();
DECLARE @Token VARBINARY(64) = HASHBYTES('SHA2_256', 'invitado-checkout');

BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDCliente = IDCliente, @IDA = IDA, @IDB = IDB, @IDDireccion = IDDireccion, @IDEstandar = IDEstandar FROM #Base;

/* === Cliente registrado =================================================================== */
EXECUTE AS USER = @Api;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @IDCliente, @IDVariante = @IDA, @Cantidad = 2;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @IDCliente, @IDVariante = @IDB, @Cantidad = 1;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AplicarCupon @IDUsuario = @IDCliente, @Codigo = 'CHK-PRUEBA-DIEZ';
INSERT INTO #Checkout EXEC dbo.SP_Checkout_Iniciar @IDUsuario = @IDCliente, @ClaveIdempotencia = @K1, @IDMetodoEnvio = @IDEstandar,
                                                   @IDDireccion = @IDDireccion;
REVERT;
DELETE FROM #Carrito;
SET @Primero = (SELECT IDCheckout FROM #Checkout);
SET @Texto = (SELECT CONCAT(Estado, N'|', CASE WHEN SegundosRestantes BETWEEN 880 AND 900 THEN N'15 min' ELSE CAST(SegundosRestantes AS NVARCHAR(10)) END,
                            N'|', CorreoContacto, N'|', NombreContacto, N'|', TelefonoContacto, N'|', EnvioNombre, N'|', EnvioMunicipio, N', ',
                            Departamento, N'|', EnvioCodigoPostal, N'|', MetodoEnvio, N'|', CodigoCupon) FROM #Checkout);
EXEC #Verificar N'Iniciar (registrado): pendiente 15 min; contacto de la cuenta con el teléfono de la dirección; copia de la dirección',
     N'PENDIENTE|15 min|cliente.checkout@shopcart.test|Cliente Checkout|5555-1234|Destinatario Checkout|Municipio Checkout Prueba, Departamento Checkout Prueba|01001|Estándar Checkout Prueba|CHK-PRUEBA-DIEZ',
     @Texto;

SET @Texto = (SELECT CONCAT(Subtotal, N'-', Descuento, N'+', CostoEnvio, N'=', Total, N'|', BaseImponible, N'+', IVA, N'|',
                            (SELECT STRING_AGG(CONCAT(j.SKU, N':', j.Cantidad, N'x', j.PrecioUnitario, N'-', j.DescuentoLinea, N'=', j.TotalLinea), N',')
                                    WITHIN GROUP (ORDER BY j.SKU)
                             FROM OPENJSON(Lineas) WITH (SKU VARCHAR(50), Cantidad INT, PrecioUnitario DECIMAL(12, 2),
                                                         DescuentoLinea DECIMAL(12, 2), TotalLinea DECIMAL(12, 2)) AS j))
              FROM #Checkout);
DELETE FROM #Checkout;
EXEC #Verificar N'Iniciar: totales, IVA incluido desglosado y el descuento repartido por línea',
     N'250.00-25.00+25.00=250.00|223.21+26.79|CHK-PRUEBA-A:2x100.00-20.00=180.00,CHK-PRUEBA-B:1x50.00-5.00=45.00', @Texto;

SET @Texto = CONCAT((SELECT STRING_AGG(CONCAT(r.Cantidad, N':', r.Estado), N',') WITHIN GROUP (ORDER BY r.IDVariante)
                     FROM dbo.ReservaInventario AS r WHERE r.IDCheckout = @Primero), N'|',
                    (SELECT Disponible FROM dbo.FU_Inventario_Disponibilidad(SYSUTCDATETIME()) WHERE IDVariante = @IDB));
EXEC #Verificar N'Iniciar: reserva cada línea; B queda con 1 disponible', N'2:ACTIVA,1:ACTIVA|1', @Texto;

EXECUTE AS USER = @Api;
INSERT INTO #Checkout EXEC dbo.SP_Checkout_Iniciar @IDUsuario = @IDCliente, @ClaveIdempotencia = @K1, @IDMetodoEnvio = @IDEstandar,
                                                   @IDDireccion = @IDDireccion;
REVERT;
SET @Texto = CONCAT(CASE WHEN (SELECT IDCheckout FROM #Checkout) = @Primero THEN N'mismo' ELSE N'otro' END, N'|',
                    (SELECT COUNT(*) FROM dbo.Checkout WHERE IDUsuario = @IDCliente), N'|',
                    (SELECT COUNT(*) FROM dbo.ReservaInventario WHERE IDCheckout = @Primero));
DELETE FROM #Checkout;
EXEC #Verificar N'Misma clave (doble clic): devuelve el mismo checkout sin reservar de nuevo', N'mismo|1|2', @Texto;

EXECUTE AS USER = @Api;
INSERT INTO #Checkout EXEC dbo.SP_Checkout_Iniciar @IDUsuario = @IDCliente, @ClaveIdempotencia = @K2, @IDMetodoEnvio = @IDEstandar,
                                                   @IDDireccion = @IDDireccion;
REVERT;
SET @Segundo = (SELECT IDCheckout FROM #Checkout);
DELETE FROM #Checkout;
SET @Texto = CONCAT((SELECT CONCAT(Estado, N':', CASE WHEN FechaCierre IS NULL THEN N'abierto' ELSE N'cerrado' END) FROM dbo.Checkout WHERE IDCheckout = @Primero),
                    N'|', (SELECT STRING_AGG(Estado, ',') FROM dbo.ReservaInventario WHERE IDCheckout = @Primero),
                    N'|', (SELECT Estado FROM dbo.Checkout WHERE IDCheckout = @Segundo),
                    N'|', (SELECT COUNT(*) FROM dbo.ReservaInventario WHERE IDCheckout = @Segundo AND Estado = 'ACTIVA'));
EXEC #Verificar N'Otra clave: el checkout anterior se cancela y libera sus reservas; el nuevo reserva',
     N'CANCELADO:cerrado|LIBERADA,LIBERADA|PENDIENTE|2', @Texto;

-- El cliente cambia el carrito: el checkout ya no se puede pagar.
EXECUTE AS USER = @Api;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @IDCliente, @IDVariante = @IDA, @Cantidad = 1;
INSERT INTO #Checkout EXEC dbo.SP_Checkout_Obtener @IDUsuario = @IDCliente, @IDCheckout = @Segundo;
REVERT;
DELETE FROM #Carrito;
SET @Texto = (SELECT CONCAT(Estado, N'|', SegundosRestantes) FROM #Checkout);
DELETE FROM #Checkout;
EXEC #Verificar N'Carrito modificado después de iniciar: el checkout deja de poder pagarse', N'CARRITO_MODIFICADO|0', @Texto;

EXECUTE AS USER = @Api;
INSERT INTO #Checkout EXEC dbo.SP_Checkout_RegistrarPagoRechazado @IDUsuario = @IDCliente, @IDCheckout = @Segundo, @Marca = ' visa ',
                                                                  @Ultimos4 = '0002', @MotivoRechazo = 'fondos_insuficientes',
                                                                  @ReferenciaExterna = 'REF-CHK-PRUEBA-1';
DELETE FROM #Checkout;
INSERT INTO #Checkout EXEC dbo.SP_Checkout_RegistrarPagoRechazado @IDUsuario = @IDCliente, @IDCheckout = @Segundo, @Marca = 'VISA',
                                                                  @Ultimos4 = '0002', @MotivoRechazo = 'FONDOS_INSUFICIENTES',
                                                                  @ReferenciaExterna = 'REF-CHK-PRUEBA-1';
REVERT;
DELETE FROM #Checkout;
SET @Texto = (SELECT CONCAT(COUNT(*), N'|', MAX(Estado), N':', MAX(Marca), N':', MAX(Ultimos4), N':', MAX(MotivoRechazo), N':', MAX(Monto))
              FROM dbo.Pago WHERE IDCheckout = @Segundo);
SET @Texto += N'|' + (SELECT Estado FROM dbo.Checkout WHERE IDCheckout = @Segundo);
EXEC #Verificar N'Pago rechazado: se registra una vez (misma referencia), sin datos sensibles; el checkout no cambia',
     N'1|RECHAZADO:VISA:0002:FONDOS_INSUFICIENTES:250.00|PENDIENTE', @Texto;

/* === Invitado ============================================================================= */
-- B tiene 2: 1 reservada por el checkout pendiente del cliente; el invitado puede llevar la otra.
EXECUTE AS USER = @Api;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @TokenInvitadoHash = @Token, @IDVariante = @IDB, @Cantidad = 1;
INSERT INTO #Checkout EXEC dbo.SP_Checkout_Iniciar @TokenInvitadoHash = @Token, @ClaveIdempotencia = @KI, @IDMetodoEnvio = @IDEstandar,
                                                   @Correo = N' Invitado.Checkout@ShopCart.TEST ', @NombreDestinatario = N' Invitado Checkout ',
                                                   @Telefono = N'+502 4444 5555', @Linea1 = N'3a avenida 4-56 zona 10',
                                                   @IDMunicipio = 22001;
REVERT;
DELETE FROM #Carrito;
SET @Invitado = (SELECT IDCheckout FROM #Checkout);
SET @Texto = (SELECT CONCAT(Estado, N'|', CorreoContacto, N'|', NombreContacto, N'|', TelefonoContacto, N'|',
                            COALESCE(CAST(IDDireccion AS NVARCHAR(10)), N'sin libreta'), N'|', Total, N'|', BaseImponible, N'+', IVA)
              FROM #Checkout);
DELETE FROM #Checkout;
SET @Texto += N'|' + CAST((SELECT Disponible FROM dbo.FU_Inventario_Disponibilidad(SYSUTCDATETIME()) WHERE IDVariante = @IDB) AS NVARCHAR(10));
EXEC #Verificar N'Iniciar (invitado): correo en minúsculas, quien recibe es el contacto; B queda agotada',
     N'PENDIENTE|invitado.checkout@shopcart.test|Invitado Checkout|+502 4444 5555|sin libreta|75.00|66.96+8.04|0', @Texto;

-- El cliente vuelve a pagar: su checkout anterior libera su unidad de B antes de verificar lo disponible.
EXECUTE AS USER = @Api;
INSERT INTO #Checkout EXEC dbo.SP_Checkout_Iniciar @IDUsuario = @IDCliente, @ClaveIdempotencia = @K3, @IDMetodoEnvio = @IDEstandar,
                                                   @IDDireccion = @IDDireccion;
REVERT;
SET @Tercero = (SELECT IDCheckout FROM #Checkout);
SET @Texto = (SELECT CONCAT(Estado, N'|', Subtotal, N'|', (SELECT Estado FROM dbo.Checkout WHERE IDCheckout = @Segundo)) FROM #Checkout);
DELETE FROM #Checkout;
EXEC #Verificar N'Reiniciar con B agotada por otros: la unidad que el propio cliente reservaba se libera y se vuelve a reservar',
     N'PENDIENTE|350.00|CANCELADO', @Texto;

/* === Expiración =========================================================================== */
UPDATE dbo.Checkout SET FechaCreacion = DATEADD(MINUTE, -20, SYSUTCDATETIME()), FechaExpiracion = DATEADD(MINUTE, -5, SYSUTCDATETIME())
WHERE IDCheckout = @Invitado;
EXECUTE AS USER = @Api;
INSERT INTO #Checkout EXEC dbo.SP_Checkout_Obtener @TokenInvitadoHash = @Token, @IDCheckout = @Invitado;
INSERT INTO #Expiracion EXEC dbo.SP_Checkout_ExpirarVencidos;
INSERT INTO #Expiracion EXEC dbo.SP_Checkout_ExpirarVencidos;
REVERT;
SET @Texto = CONCAT((SELECT Estado FROM #Checkout), N'|',
                    (SELECT STRING_AGG(CONCAT(CheckoutsExpirados, N'/', ReservasLiberadas), N',') FROM #Expiracion), N'|',
                    (SELECT CONCAT(ch.Estado, N':', r.Estado) FROM dbo.Checkout AS ch JOIN dbo.ReservaInventario AS r ON r.IDCheckout = ch.IDCheckout
                     WHERE ch.IDCheckout = @Invitado), N'|',
                    (SELECT Estado FROM dbo.Checkout WHERE IDCheckout = @Tercero));
DELETE FROM #Checkout;
EXEC #Verificar N'Vencido: se ve EXPIRADO aun antes del job; el job lo marca y libera su reserva una sola vez; los vigentes no se tocan',
     N'EXPIRADO|1/1,0/0|EXPIRADO:LIBERADA|PENDIENTE', @Texto;
ROLLBACK TRANSACTION;

/* === Casos de error ====================================================================== */
DECLARE @D NVARCHAR(MAX) = N'
DECLARE @Cliente INT, @Cliente2 INT, @Operador INT, @A INT, @B INT, @Dir INT, @DirAjena INT, @Estandar INT, @MetodoInactivo INT, @ID BIGINT;
DECLARE @K UNIQUEIDENTIFIER = NEWID(), @Token VARBINARY(64) = HASHBYTES(''SHA2_256'', ''invitado-checkout-error''),
        @Token2 VARBINARY(64) = HASHBYTES(''SHA2_256'', ''otro-invitado-checkout'');
SELECT @Cliente = IDCliente, @Cliente2 = IDCliente2, @Operador = IDOperador, @A = IDA, @B = IDB, @Dir = IDDireccion,
       @DirAjena = IDDireccionAjena, @Estandar = IDEstandar, @MetodoInactivo = IDMetodoInactivo FROM #Base;
';
DECLARE @ConA NVARCHAR(MAX) = N'INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = @A;
';
DECLARE @Iniciar NVARCHAR(MAX) = N'EXEC dbo.SP_Checkout_Iniciar @IDUsuario = @Cliente, @ClaveIdempotencia = @K, @IDMetodoEnvio = @Estandar, @IDDireccion = @Dir;';
DECLARE @InvitadoConA NVARCHAR(MAX) = N'INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @TokenInvitadoHash = @Token, @IDVariante = @A;
EXEC dbo.SP_Checkout_Iniciar @TokenInvitadoHash = @Token, @ClaveIdempotencia = @K, @IDMetodoEnvio = @Estandar, @IDMunicipio = 22001, ';
-- Carrito del cliente con una línea, armado como el migrador (para estados que la API no permite crear).
DECLARE @CarritoCon NVARCHAR(MAX) = N'
DECLARE @IDCarrito INT;
INSERT INTO dbo.Carrito (IDUsuario, IDCupon) SELECT IDCliente, @Cupon FROM #Base;
SET @IDCarrito = SCOPE_IDENTITY();
INSERT INTO dbo.CarritoItem (IDCarrito, IDVariante, Cantidad) VALUES (@IDCarrito, @Variante, @Cantidad);
';

DECLARE @Errores TABLE (Orden INT IDENTITY, Descripcion NVARCHAR(300), Esperado INT, Sql NVARCHAR(MAX), Preparacion NVARCHAR(MAX));
INSERT INTO @Errores (Descripcion, Esperado, Sql, Preparacion) VALUES
    (N'Iniciar: sin clave de idempotencia → PARAMETRO_REQUERIDO', 50006,
        @ConA + N'EXEC dbo.SP_Checkout_Iniciar @IDUsuario = @Cliente, @ClaveIdempotencia = NULL, @IDMetodoEnvio = @Estandar, @IDDireccion = @Dir;', NULL),
    (N'Iniciar (registrado): sin dirección → PARAMETRO_REQUERIDO', 50006,
        @ConA + N'EXEC dbo.SP_Checkout_Iniciar @IDUsuario = @Cliente, @ClaveIdempotencia = @K, @IDMetodoEnvio = @Estandar;', NULL),
    (N'Iniciar: un operador → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Checkout_Iniciar @IDUsuario = @Operador, @ClaveIdempotencia = @K, @IDMetodoEnvio = @Estandar, @IDDireccion = @Dir;', NULL),
    (N'Iniciar: sin carrito → CARRITO_NO_ENCONTRADO', 50108,
        @Iniciar, NULL),
    (N'Iniciar: carrito vaciado → CARRITO_VACIO', 51409,
        @ConA + N'INSERT INTO #Carrito EXEC dbo.SP_Carrito_Vaciar @IDUsuario = @Cliente;' + @Iniciar, NULL),
    (N'Iniciar: dirección de otro cliente → DIRECCION_NO_ENCONTRADA', 50113,
        @ConA + N'EXEC dbo.SP_Checkout_Iniciar @IDUsuario = @Cliente, @ClaveIdempotencia = @K, @IDMetodoEnvio = @Estandar, @IDDireccion = @DirAjena;', NULL),
    (N'Iniciar: método de envío inactivo → METODO_ENVIO_NO_ENCONTRADO', 50114,
        @ConA + N'EXEC dbo.SP_Checkout_Iniciar @IDUsuario = @Cliente, @ClaveIdempotencia = @K, @IDMetodoEnvio = @MetodoInactivo, @IDDireccion = @Dir;', NULL),
    (N'Iniciar: método de envío inexistente → METODO_ENVIO_NO_ENCONTRADO', 50114,
        @ConA + N'EXEC dbo.SP_Checkout_Iniciar @IDUsuario = @Cliente, @ClaveIdempotencia = @K, @IDMetodoEnvio = -1, @IDDireccion = @Dir;', NULL),
    (N'Iniciar: variante desactivada en el carrito → VARIANTE_NO_DISPONIBLE', 51302,
        @Iniciar, N'DECLARE @Cupon INT = NULL, @Variante INT = (SELECT IDC FROM #Base), @Cantidad INT = 1;' + @CarritoCon),
    (N'Iniciar: producto de una categoría oculta → VARIANTE_NO_DISPONIBLE', 51302,
        @Iniciar, N'DECLARE @Cupon INT = NULL, @Variante INT = (SELECT IDE FROM #Base), @Cantidad INT = 1;' + @CarritoCon),
    (N'Iniciar: el límite por línea bajó después de agregar → CANTIDAD_EXCEDE_LIMITE', 50027,
        @Iniciar, N'DECLARE @Cupon INT = NULL, @Variante INT = (SELECT IDA FROM #Base), @Cantidad INT = 5;' + @CarritoCon
                  + N'UPDATE dbo.Parametro SET Valor = N''3'' WHERE Clave = ''MAXIMO_UNIDADES_POR_LINEA'';'),
    (N'Iniciar: la existencia bajó después de agregar → STOCK_INSUFICIENTE', 51301,
        @Iniciar, N'DECLARE @Cupon INT = NULL, @Variante INT = (SELECT IDA FROM #Base), @Cantidad INT = 4;' + @CarritoCon
                  + N'UPDATE dbo.Variante SET ExistenciaFisica = 3 WHERE IDVariante = @Variante;'),
    (N'Iniciar: la última unidad de B la reservó otro comprador → STOCK_INSUFICIENTE', 51301,
        N'INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = @B;
          INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @TokenInvitadoHash = @Token2, @IDVariante = @B, @Cantidad = 2;
          INSERT INTO #Checkout EXEC dbo.SP_Checkout_Iniciar @TokenInvitadoHash = @Token2, @ClaveIdempotencia = @K, @IDMetodoEnvio = @Estandar,
                                 @Correo = N''otro@shopcart.test'', @NombreDestinatario = N''Otro'', @Telefono = N''5555-1111'',
                                 @Linea1 = N''Calle'', @IDMunicipio = 22001;
          SET @K = NEWID();' + @Iniciar, NULL),
    (N'Iniciar: cupón desactivado después de aplicarlo → CUPON_INVALIDO', 51401,
        @Iniciar, N'DECLARE @Cupon INT = (SELECT IDDiez FROM #Base), @Variante INT = (SELECT IDA FROM #Base), @Cantidad INT = 1;' + @CarritoCon
                  + N'UPDATE dbo.Cupon SET Activo = 0 WHERE IDCupon = @Cupon;'),
    (N'Iniciar: el carrito no alcanza el monto mínimo del cupón → CUPON_MONTO_MINIMO', 51407,
        @Iniciar, N'DECLARE @Cupon INT = (SELECT IDMin FROM #Base), @Variante INT = (SELECT IDA FROM #Base), @Cantidad INT = 1;' + @CarritoCon),
    (N'Iniciar (invitado): correo inválido → CORREO_INVALIDO', 50001,
        @InvitadoConA + N'@Correo = N''sin-arroba'', @NombreDestinatario = N''X'', @Telefono = N''5555-1234'', @Linea1 = N''Calle'';', NULL),
    (N'Iniciar (invitado): sin correo → CORREO_INVALIDO', 50001,
        @InvitadoConA + N'@NombreDestinatario = N''X'', @Telefono = N''5555-1234'', @Linea1 = N''Calle'';', NULL),
    (N'Iniciar (invitado): teléfono inválido → TELEFONO_INVALIDO', 50004,
        @InvitadoConA + N'@Correo = N''x@shopcart.test'', @NombreDestinatario = N''X'', @Telefono = N''123'', @Linea1 = N''Calle'';', NULL),
    (N'Iniciar (invitado): sin dirección → DIRECCION_INVALIDA', 50034,
        @InvitadoConA + N'@Correo = N''x@shopcart.test'', @NombreDestinatario = N''X'', @Telefono = N''5555-1234'';', NULL),
    (N'Iniciar (invitado): municipio inexistente → MUNICIPIO_NO_ENCONTRADO', 50111,
        N'INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @TokenInvitadoHash = @Token, @IDVariante = @A;
          EXEC dbo.SP_Checkout_Iniciar @TokenInvitadoHash = @Token, @ClaveIdempotencia = @K, @IDMetodoEnvio = @Estandar, @IDMunicipio = 32000,
                                       @Correo = N''x@shopcart.test'', @NombreDestinatario = N''X'', @Telefono = N''5555-1234'', @Linea1 = N''Calle'';', NULL),
    (N'Iniciar: sin MINUTOS_RESERVA → CONFIGURACION_INCOMPLETA', 59001,
        @ConA + @Iniciar, N'DELETE FROM dbo.Parametro WHERE Clave = ''MINUTOS_RESERVA'';'),
    (N'Iniciar: sin TASA_IVA → CONFIGURACION_INCOMPLETA', 59001,
        @ConA + @Iniciar, N'DELETE FROM dbo.Parametro WHERE Clave = ''TASA_IVA'';'),
    (N'Obtener: checkout de otro cliente → CHECKOUT_NO_ENCONTRADO', 50115,
        @ConA + N'INSERT INTO #Checkout ' + @Iniciar + N'
          SET @ID = (SELECT IDCheckout FROM #Checkout);
          EXEC dbo.SP_Checkout_Obtener @IDUsuario = @Cliente2, @IDCheckout = @ID;', NULL),
    (N'Obtener: checkout de otro invitado → CHECKOUT_NO_ENCONTRADO', 50115,
        N'INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @TokenInvitadoHash = @Token, @IDVariante = @A;
          INSERT INTO #Checkout EXEC dbo.SP_Checkout_Iniciar @TokenInvitadoHash = @Token, @ClaveIdempotencia = @K, @IDMetodoEnvio = @Estandar,
                                 @Correo = N''x@shopcart.test'', @NombreDestinatario = N''X'', @Telefono = N''5555-1234'', @Linea1 = N''Calle'',
                                 @IDMunicipio = 22001;
          SET @ID = (SELECT IDCheckout FROM #Checkout);
          EXEC dbo.SP_Checkout_Obtener @TokenInvitadoHash = @Token2, @IDCheckout = @ID;', NULL),
    (N'Obtener: checkout inexistente → CHECKOUT_NO_ENCONTRADO', 50115,
        N'EXEC dbo.SP_Checkout_Obtener @IDUsuario = @Cliente, @IDCheckout = -1;', NULL),
    (N'Pago rechazado: marca no aceptada → DATOS_PAGO_INVALIDOS', 50037,
        N'EXEC dbo.SP_Checkout_RegistrarPagoRechazado @IDUsuario = @Cliente, @IDCheckout = 1, @Marca = ''DINERS'', @Ultimos4 = ''1234'',
                                                      @MotivoRechazo = ''RECHAZADA'', @ReferenciaExterna = ''REF-X'';', NULL),
    (N'Pago rechazado: últimos 4 con una letra → DATOS_PAGO_INVALIDOS', 50037,
        N'EXEC dbo.SP_Checkout_RegistrarPagoRechazado @IDUsuario = @Cliente, @IDCheckout = 1, @Marca = ''VISA'', @Ultimos4 = ''12a4'',
                                                      @MotivoRechazo = ''RECHAZADA'', @ReferenciaExterna = ''REF-X'';', NULL),
    (N'Pago rechazado: sin motivo → DATOS_PAGO_INVALIDOS', 50037,
        N'EXEC dbo.SP_Checkout_RegistrarPagoRechazado @IDUsuario = @Cliente, @IDCheckout = 1, @Marca = ''VISA'', @Ultimos4 = ''1234'',
                                                      @MotivoRechazo = ''  '', @ReferenciaExterna = ''REF-X'';', NULL),
    (N'Pago rechazado: checkout inexistente → CHECKOUT_NO_ENCONTRADO', 50115,
        N'EXEC dbo.SP_Checkout_RegistrarPagoRechazado @IDUsuario = @Cliente, @IDCheckout = -1, @Marca = ''VISA'', @Ultimos4 = ''1234'',
                                                      @MotivoRechazo = ''RECHAZADA'', @ReferenciaExterna = ''REF-X'';', NULL);

DECLARE @Orden INT = 1, @Descripcion NVARCHAR(300), @Esperado INT, @Sql NVARCHAR(MAX), @Preparacion NVARCHAR(MAX);
WHILE @Orden <= (SELECT MAX(Orden) FROM @Errores)
BEGIN
    SELECT @Descripcion = Descripcion, @Esperado = Esperado, @Sql = @D + Sql, @Preparacion = Preparacion
    FROM @Errores WHERE Orden = @Orden;
    EXEC #EsperarError @Descripcion, @Esperado, @Sql, @Preparacion;
    SET @Orden += 1;
END;

/* Ningún caso dejó datos: todos se revirtieron. */
SET @Texto = (SELECT CONCAT((SELECT COUNT(*) FROM dbo.Variante WHERE SKU LIKE 'CHK-PRUEBA-%'), N'|',
                            (SELECT COUNT(*) FROM dbo.Usuario WHERE Correo LIKE N'%.checkout@shopcart.test'), N'|',
                            (SELECT COUNT(*) FROM dbo.Pago WHERE ReferenciaExterna LIKE 'REF-CHK-PRUEBA-%')));
EXEC #Verificar N'Limpieza: no quedan datos de prueba', N'0|0|0', @Texto;

/* --- Resultado ---------------------------------------------------------------------------- */
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = NULL;

IF CAST(SESSION_CONTEXT(N'PruebasFallidas') AS INT) > 0
    THROW 50000, N'Pruebas de procedimientos del checkout fallidas.', 1;
EXEC sys.sp_set_session_context @key = N'PruebasFallidas', @value = NULL;
GO
