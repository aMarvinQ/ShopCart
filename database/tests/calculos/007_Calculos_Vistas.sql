/*
    007_Calculos_Vistas.sql
    Se ejecuta conectado como shopcart_migrator (deploy.ps1 -Probar).
    Verifica las vistas con datos controlados: conciliación del kardex y bases de reportes
    (qué cuenta como venta, devoluciones, envío y fecha local).
    Todo ocurre dentro de una transacción que se revierte al final: no deja datos.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

-- Permite ejecutar el script varias veces en la misma conexión (p. ej. en SSMS).
DROP TABLE IF EXISTS #Fallas;
DROP PROCEDURE IF EXISTS #Verificar;
DROP PROCEDURE IF EXISTS #CrearPedido;
GO

CREATE TABLE #Fallas (Descripcion NVARCHAR(300) NOT NULL);
GO

/* Compara como texto; muestra esperado y obtenido cuando no coinciden. */
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
        INSERT INTO #Fallas (Descripcion) VALUES (@Descripcion);
        PRINT N'FALLA  ' + @Descripcion + N': esperado ' + ISNULL(@Esperado, N'(NULL)') + N', obtenido ' + ISNULL(@Obtenido, N'(NULL)');
    END;
END;
GO

/*
    Pedido PAGADO de 2 líneas con cupón: A 2 × Q100 (desc. Q20) + B 1 × Q100 (desc. Q10).
    Subtotal 300, Descuento 30, Envío 25, Total 295 = 263.39 + 31.61 de IVA.
*/
CREATE PROCEDURE #CrearPedido
    @FechaPedido DATETIME2(3),
    @IDPedido    INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @IDUsuario INT = (SELECT IDUsuario FROM dbo.Usuario WHERE Correo = N'vistas@shopcart.test');
    DECLARE @IDCupon INT = (SELECT IDCupon FROM dbo.Cupon WHERE Codigo = 'VISTAS-10');
    DECLARE @IDMetodoEnvio INT = (SELECT IDMetodoEnvio FROM dbo.MetodoEnvio WHERE Nombre = N'Envío vistas');

    INSERT INTO dbo.Carrito (IDUsuario, Estado) VALUES (@IDUsuario, 'CONVERTIDO');
    DECLARE @IDCarrito INT = SCOPE_IDENTITY();
    INSERT INTO dbo.Checkout (IDCarrito, IDUsuario, ClaveIdempotencia, CorreoContacto, NombreContacto, TelefonoContacto,
                              EnvioNombre, EnvioTelefono, EnvioLinea1, EnvioMunicipio, IDDepartamento, IDMetodoEnvio, IDCupon,
                              Subtotal, Descuento, CostoEnvio, Total, Estado, FechaExpiracion, FechaCierre)
    VALUES (@IDCarrito, @IDUsuario, NEWID(), N'vistas@shopcart.test', N'Cliente Vistas', '5555-1234',
            N'Cliente Vistas', '5555-1234', N'1a calle 1-23 zona 1', N'Guatemala', 200, @IDMetodoEnvio, @IDCupon,
            300.00, 30.00, 25.00, 295.00, 'COMPLETADO', DATEADD(MINUTE, 15, SYSUTCDATETIME()), SYSUTCDATETIME());
    DECLARE @IDCheckout BIGINT = SCOPE_IDENTITY();

    EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuario;
    INSERT INTO dbo.Pedido (IDCheckout, IDUsuario, CorreoContacto, NombreContacto, TelefonoContacto, TokenSeguimientoHash,
                            IDEstadoPedido, EnvioNombre, EnvioTelefono, EnvioLinea1, EnvioMunicipio, IDDepartamento,
                            IDMetodoEnvio, NombreMetodoEnvio, IDCupon, CodigoCupon,
                            Subtotal, Descuento, CostoEnvio, Total, BaseImponible, IVA, FechaPedido)
    VALUES (@IDCheckout, @IDUsuario, N'vistas@shopcart.test', N'Cliente Vistas', '5555-1234',
            HASHBYTES('SHA2_256', CONVERT(VARCHAR(36), NEWID())),
            200, N'Cliente Vistas', '5555-1234', N'1a calle 1-23 zona 1', N'Guatemala', 200,
            @IDMetodoEnvio, N'Envío vistas', @IDCupon, 'VISTAS-10',
            300.00, 30.00, 25.00, 295.00, 263.39, 31.61, @FechaPedido);
    SET @IDPedido = SCOPE_IDENTITY();

    INSERT INTO dbo.PedidoDetalle (IDPedido, IDVariante, IDCategoria, SKU, NombreProducto, Cantidad, PrecioUnitario, DescuentoLinea, TotalLinea)
    SELECT @IDPedido, v.IDVariante, p.IDCategoria, v.SKU, p.Nombre, x.Cantidad, 100.00, x.Descuento, x.Cantidad * 100.00 - x.Descuento
    FROM (VALUES ('VISTAS-A', 2, 20.00), ('VISTAS-B', 1, 10.00)) AS x (SKU, Cantidad, Descuento)
    INNER JOIN dbo.Variante AS v ON v.SKU = x.SKU
    INNER JOIN dbo.Producto AS p ON p.IDProducto = v.IDProducto;
END;
GO

BEGIN TRANSACTION;

DECLARE @Texto NVARCHAR(400);
DECLARE @Hash  VARCHAR(255) = '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA';

/* --- Datos de apoyo ----------------------------------------------------------------------- */
INSERT INTO dbo.Rol (IDRol, Codigo, Nombre) VALUES (200, 'PRUEBA_VISTAS', N'Prueba');
INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
VALUES (200, N'vistas@shopcart.test', @Hash, N'Cliente', N'Vistas');
DECLARE @IDUsuario INT = SCOPE_IDENTITY();

INSERT INTO dbo.Departamento (IDDepartamento, Nombre) VALUES (200, N'Departamento de prueba');
INSERT INTO dbo.MetodoEnvio (Nombre, Costo, DiasEstimadosMin, DiasEstimadosMax) VALUES (N'Envío vistas', 25.00, 1, 3);
INSERT INTO dbo.EstadoPedido (IDEstadoPedido, Codigo, Nombre, Orden, EsInicial, EsFinal, CuentaComoVenta)
VALUES (200, 'PRUEBA_PAGADO', N'Pagado (prueba)', 1, 1, 0, 1),
       (201, 'PRUEBA_CANCELADO', N'Cancelado (prueba)', 2, 0, 1, 0);
INSERT INTO dbo.TransicionEstadoPedido (IDEstadoOrigen, IDEstadoDestino) VALUES (200, 201);
INSERT INTO dbo.TipoMovimiento (IDTipoMovimiento, Codigo, Nombre, Signo)
VALUES (200, 'PRUEBA_ENTRADA', N'Entrada', 1), (201, 'PRUEBA_SALIDA', N'Salida', -1);

INSERT INTO dbo.Categoria (Nombre, Slug) VALUES (N'Vistas', 'vistas');
DECLARE @IDCategoria INT = SCOPE_IDENTITY();
INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug)
VALUES (@IDCategoria, N'Vistas A', 'vistas-a'), (@IDCategoria, N'Vistas B', 'vistas-b'),
       (@IDCategoria, N'Vistas C', 'vistas-c'), (@IDCategoria, N'Vistas D', 'vistas-d');
INSERT INTO dbo.Variante (IDProducto, SKU, Precio)
SELECT IDProducto, UPPER(Slug), 100.00 FROM dbo.Producto WHERE Slug IN ('vistas-a', 'vistas-b', 'vistas-c', 'vistas-d');

INSERT INTO dbo.Cupon (Codigo, Descripcion, TipoDescuento, Valor, FechaInicio, FechaFin)
VALUES ('VISTAS-10', N'10 %', 'PORCENTAJE', 10, DATEADD(DAY, -30, SYSUTCDATETIME()), DATEADD(DAY, 30, SYSUTCDATETIME()));

DECLARE @IDA INT = (SELECT IDVariante FROM dbo.Variante WHERE SKU = 'VISTAS-A');
DECLARE @IDB INT = (SELECT IDVariante FROM dbo.Variante WHERE SKU = 'VISTAS-B');
DECLARE @IDC INT = (SELECT IDVariante FROM dbo.Variante WHERE SKU = 'VISTAS-C');
DECLARE @IDD INT = (SELECT IDVariante FROM dbo.Variante WHERE SKU = 'VISTAS-D');

/* ========================================================================================
   VW_Inventario_Conciliacion
     A: +10, −3, física 7                       → cuadra
     B: +5, física 6 (descuadre provocado)      → diferencia 1
     C: sin movimientos, física 0               → cuadra
     D: +5 (0→5), luego +2 que parte de 6 (6→8),
        física 8: el último saldo coincide pero
        falta un movimiento entre ambos          → salto detectado
   ======================================================================================== */
INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimiento, Signo, Cantidad, SaldoAnterior, SaldoNuevo, IDUsuario)
VALUES (@IDA, 200,  1, 10,  0, 10, @IDUsuario),
       (@IDA, 201, -1, -3, 10,  7, @IDUsuario),
       (@IDB, 200,  1,  5,  0,  5, @IDUsuario),
       (@IDD, 200,  1,  5,  0,  5, @IDUsuario),
       (@IDD, 200,  1,  2,  6,  8, @IDUsuario);
UPDATE dbo.Variante
SET ExistenciaFisica = CASE IDVariante WHEN @IDA THEN 7 WHEN @IDB THEN 6 WHEN @IDD THEN 8 ELSE 0 END
WHERE IDVariante IN (@IDA, @IDB, @IDC, @IDD);

SELECT @Texto = STRING_AGG(CONCAT(SKU, ' fis=', ExistenciaFisica, ' kardex=', SumaKardex, ' ultimo=', UltimoSaldo,
                                  ' saltos=', Saltos, ' dif=', Diferencia, ' cuadra=', Cuadra), ' | ')
                WITHIN GROUP (ORDER BY SKU)
FROM dbo.VW_Inventario_Conciliacion
WHERE IDVariante IN (@IDA, @IDB, @IDC, @IDD);
EXEC #Verificar N'Conciliación del kardex',
     N'VISTAS-A fis=7 kardex=7 ultimo=7 saltos=0 dif=0 cuadra=1 | VISTAS-B fis=6 kardex=5 ultimo=5 saltos=0 dif=1 cuadra=0 | VISTAS-C fis=0 kardex=0 ultimo=0 saltos=0 dif=0 cuadra=1 | VISTAS-D fis=8 kardex=7 ultimo=8 saltos=1 dif=1 cuadra=0',
     @Texto;

/* ========================================================================================
   Reportes
     Pedido 1: PAGADO el 2026-11-01 03:00 UTC (= 31 oct, 21:00 en Guatemala),
               con devolución de 1 unidad de A por Q90.00.
     Pedido 2: PAGADO y luego CANCELADO → no cuenta como venta.
   ======================================================================================== */
DECLARE @IDPedido1 INT, @IDPedido2 INT;
EXEC #CrearPedido '2026-11-01T03:00:00', @IDPedido1 OUTPUT;
EXEC #CrearPedido '2026-11-02T15:00:00', @IDPedido2 OUTPUT;
UPDATE dbo.Pedido SET IDEstadoPedido = 201 WHERE IDPedido = @IDPedido2;

INSERT INTO dbo.Devolucion (IDPedido, Motivo, MontoReembolso, IDUsuario) VALUES (@IDPedido1, N'Talla incorrecta', 90.00, @IDUsuario);
DECLARE @IDDevolucion INT = SCOPE_IDENTITY();
INSERT INTO dbo.DevolucionDetalle (IDDevolucion, IDPedido, IDPedidoDetalle, Cantidad, MontoReembolso)
SELECT @IDDevolucion, @IDPedido1, IDPedidoDetalle, 1, 90.00 FROM dbo.PedidoDetalle WHERE IDPedido = @IDPedido1 AND SKU = 'VISTAS-A';
UPDATE dbo.PedidoDetalle SET CantidadDevuelta = 1 WHERE IDPedido = @IDPedido1 AND SKU = 'VISTAS-A';

SET @Texto = (
    SELECT CONCAT('dia=', DiaLocal, ' local=', FORMAT(FechaLocal, 'HH:mm'), ' bruta=', VentaBruta,
                  ' devuelto=', MontoDevuelto, ' neta=', VentaNeta, ' envio=', CostoEnvio)
    FROM dbo.VW_Reportes_VentasNetas WHERE IDPedido = @IDPedido1);
EXEC #Verificar N'Venta neta del pedido (sin envío, menos devolución, día de Guatemala)',
     N'dia=2026-10-31 local=21:00 bruta=270.00 devuelto=90.00 neta=180.00 envio=25.00', @Texto;

SET @Texto = CAST((SELECT COUNT(*) FROM dbo.VW_Reportes_VentasNetas WHERE IDPedido = @IDPedido2) AS NVARCHAR(10));
EXEC #Verificar N'Un pedido cancelado no cuenta como venta', N'0', @Texto;

SELECT @Texto = STRING_AGG(CONCAT(SKU, ' cant=', Cantidad, ' dev=', CantidadDevuelta, ' neta=', CantidadNeta,
                                  ' total=', TotalLinea, ' devuelto=', MontoDevuelto, ' venta=', VentaNeta, ' dia=', DiaLocal), ' | ')
                WITHIN GROUP (ORDER BY SKU)
FROM dbo.VW_Reportes_LineasVendidas WHERE IDPedido IN (@IDPedido1, @IDPedido2);
EXEC #Verificar N'Líneas vendidas (solo del pedido que cuenta, netas de devolución)',
     N'VISTAS-A cant=2 dev=1 neta=1 total=180.00 devuelto=90.00 venta=90.00 dia=2026-10-31 | VISTAS-B cant=1 dev=0 neta=1 total=90.00 devuelto=0.00 venta=90.00 dia=2026-10-31',
     @Texto;

/* Coherencia: por cada pedido, la suma de sus líneas netas es igual a su venta neta. */
SET @Texto = CAST((
    SELECT COUNT(*)
    FROM dbo.VW_Reportes_VentasNetas AS vn
    CROSS APPLY (SELECT SUM(l.VentaNeta) AS Suma FROM dbo.VW_Reportes_LineasVendidas AS l WHERE l.IDPedido = vn.IDPedido) AS s
    WHERE ISNULL(s.Suma, 0) <> vn.VentaNeta) AS NVARCHAR(10));
EXEC #Verificar N'Pedidos cuya suma por líneas no cuadra con su venta neta', N'0', @Texto;

/* --- Resultado ---------------------------------------------------------------------------- */
DECLARE @Fallas INT = (SELECT COUNT(*) FROM #Fallas);
ROLLBACK TRANSACTION;
EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = NULL;

IF @Fallas > 0
    THROW 50000, N'Pruebas de cálculo de vistas fallidas.', 1;
GO
