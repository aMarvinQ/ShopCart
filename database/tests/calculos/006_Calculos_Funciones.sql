/*
    006_Calculos_Funciones.sql
    Se ejecuta conectado como shopcart_migrator (deploy.ps1 -Probar).
    Verifica los resultados de las funciones con datos y fechas controlados: disponibilidad,
    orden y selección inicial de variantes, cupones, prorrateo e IVA.
    Todo ocurre dentro de una transacción que se revierte al final: no deja datos.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

-- Permite ejecutar el script varias veces en la misma conexión (p. ej. en SSMS).
DROP TABLE IF EXISTS #Fallas;
DROP PROCEDURE IF EXISTS #Verificar;
DROP PROCEDURE IF EXISTS #CrearPedidoConCupon;
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

/* Pedido pagado con cupón (para probar los límites de uso). Total = 100 − 10 + 25 = 115. */
CREATE PROCEDURE #CrearPedidoConCupon
    @IDUsuario INT,
    @IDCupon   INT,
    @IDPedido  INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.Carrito (IDUsuario, Estado) VALUES (@IDUsuario, 'CONVERTIDO');
    DECLARE @IDCarrito INT = SCOPE_IDENTITY();
    DECLARE @IDMetodoEnvio INT = (SELECT TOP (1) IDMetodoEnvio FROM dbo.MetodoEnvio WHERE Nombre = N'Envío de prueba');
    DECLARE @IDVariante INT = (SELECT IDVariante FROM dbo.Variante WHERE SKU = 'CALC-VASO-A');

    INSERT INTO dbo.Checkout (IDCarrito, IDUsuario, ClaveIdempotencia, CorreoContacto, NombreContacto, TelefonoContacto,
                              EnvioNombre, EnvioTelefono, EnvioLinea1, EnvioMunicipio, IDDepartamento, IDMetodoEnvio, IDCupon,
                              Subtotal, Descuento, CostoEnvio, Total, Estado, FechaExpiracion, FechaCierre)
    VALUES (@IDCarrito, @IDUsuario, NEWID(), N'cliente@shopcart.test', N'Cliente Prueba', '5555-1234',
            N'Cliente Prueba', '5555-1234', N'1a calle 1-23 zona 1', N'Guatemala', 200, @IDMetodoEnvio, @IDCupon,
            100.00, 10.00, 25.00, 115.00, 'COMPLETADO', DATEADD(MINUTE, 15, SYSUTCDATETIME()), SYSUTCDATETIME());
    DECLARE @IDCheckout BIGINT = SCOPE_IDENTITY();
    INSERT INTO dbo.CheckoutDetalle (IDCheckout, IDVariante, Cantidad, PrecioUnitario, DescuentoLinea)
    VALUES (@IDCheckout, @IDVariante, 10, 10.00, 10.00);

    EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuario;
    INSERT INTO dbo.Pedido (IDCheckout, IDUsuario, CorreoContacto, NombreContacto, TelefonoContacto, TokenSeguimientoHash,
                            IDEstadoPedido, EnvioNombre, EnvioTelefono, EnvioLinea1, EnvioMunicipio, IDDepartamento,
                            IDMetodoEnvio, NombreMetodoEnvio, IDCupon, CodigoCupon,
                            Subtotal, Descuento, CostoEnvio, Total, BaseImponible, IVA)
    SELECT @IDCheckout, @IDUsuario, N'cliente@shopcart.test', N'Cliente Prueba', '5555-1234',
           HASHBYTES('SHA2_256', CONVERT(VARCHAR(36), NEWID())),
           200, N'Cliente Prueba', '5555-1234', N'1a calle 1-23 zona 1', N'Guatemala', 200,
           @IDMetodoEnvio, N'Envío de prueba', c.IDCupon, c.Codigo,
           100.00, 10.00, 25.00, 115.00, 102.68, 12.32
    FROM dbo.Cupon AS c WHERE c.IDCupon = @IDCupon;
    SET @IDPedido = SCOPE_IDENTITY();
END;
GO

BEGIN TRANSACTION;

DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME();
DECLARE @Hash  VARCHAR(255) = '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA';
DECLARE @Texto NVARCHAR(400);

/* --- Datos de apoyo ----------------------------------------------------------------------- */
INSERT INTO dbo.Rol (IDRol, Codigo, Nombre) VALUES (200, 'PRUEBA_CALCULOS', N'Prueba');
INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
VALUES (200, N'cliente@shopcart.test', @Hash, N'Cliente', N'Prueba');
DECLARE @IDUsuario INT = SCOPE_IDENTITY();

INSERT INTO dbo.Departamento (IDDepartamento, Nombre) VALUES (200, N'Departamento de prueba');
INSERT INTO dbo.MetodoEnvio (Nombre, Costo, DiasEstimadosMin, DiasEstimadosMax) VALUES (N'Envío de prueba', 25.00, 1, 3);
DECLARE @IDMetodoEnvio INT = SCOPE_IDENTITY();
INSERT INTO dbo.EstadoPedido (IDEstadoPedido, Codigo, Nombre, Orden, EsInicial, CuentaComoVenta)
VALUES (200, 'PRUEBA_PAGADO', N'Pagado (prueba)', 1, 1, 1);

INSERT INTO dbo.Categoria (Nombre, Slug) VALUES (N'Calc Ropa', 'calc-ropa');
DECLARE @IDRopa INT = SCOPE_IDENTITY();
INSERT INTO dbo.Categoria (Nombre, Slug) VALUES (N'Calc Hogar', 'calc-hogar');
DECLARE @IDHogar INT = SCOPE_IDENTITY();
INSERT INTO dbo.Categoria (Nombre, Slug) VALUES (N'Calc Electrónica', 'calc-electronica');
DECLARE @IDElectronica INT = SCOPE_IDENTITY();

-- Color se muestra antes que Talla en Ropa (CategoriaAtributo.Orden).
INSERT INTO dbo.Atributo (Nombre) VALUES (N'CalcColor');
DECLARE @IDColor INT = SCOPE_IDENTITY();
INSERT INTO dbo.Atributo (Nombre) VALUES (N'CalcTalla');
DECLARE @IDTalla INT = SCOPE_IDENTITY();
INSERT INTO dbo.CategoriaAtributo (IDCategoria, IDAtributo, Orden) VALUES (@IDRopa, @IDColor, 1), (@IDRopa, @IDTalla, 2);

-- Azul se inserta primero (ID menor) pero su Orden es 2: el orden debe salir de Orden, no del ID.
INSERT INTO dbo.AtributoValor (IDAtributo, Valor, Orden) VALUES (@IDColor, N'Azul', 2);
DECLARE @IDAzul INT = SCOPE_IDENTITY();
INSERT INTO dbo.AtributoValor (IDAtributo, Valor, Orden) VALUES (@IDColor, N'Rojo', 1);
DECLARE @IDRojo INT = SCOPE_IDENTITY();
INSERT INTO dbo.AtributoValor (IDAtributo, Valor, Orden) VALUES (@IDTalla, N'M', 2);
DECLARE @IDTallaM INT = SCOPE_IDENTITY();
INSERT INTO dbo.AtributoValor (IDAtributo, Valor, Orden) VALUES (@IDTalla, N'S', 1);
DECLARE @IDTallaS INT = SCOPE_IDENTITY();

-- Playera: Rojo-S agotada, Rojo-M y Azul-S con existencia, Azul-M inactiva con existencia.
INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug) VALUES (@IDRopa, N'Playera cálculo', 'calc-playera');
DECLARE @IDPlayera INT = SCOPE_IDENTITY();
INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica, ClaveCombinacion, Activo)
VALUES (@IDPlayera, 'CALC-ROJO-S',  90.00, 0, '1|1', 1),
       (@IDPlayera, 'CALC-ROJO-M', 100.00, 5, '1|2', 1),
       (@IDPlayera, 'CALC-AZUL-S', 110.00, 5, '2|1', 1),
       (@IDPlayera, 'CALC-AZUL-M', 120.00, 9, '2|2', 0);
INSERT INTO dbo.VarianteAtributoValor (IDVariante, IDAtributo, IDAtributoValor)
SELECT v.IDVariante, x.IDAtributo, x.IDAtributoValor
FROM dbo.Variante AS v
INNER JOIN (VALUES ('CALC-ROJO-S', @IDColor, @IDRojo), ('CALC-ROJO-S', @IDTalla, @IDTallaS),
                   ('CALC-ROJO-M', @IDColor, @IDRojo), ('CALC-ROJO-M', @IDTalla, @IDTallaM),
                   ('CALC-AZUL-S', @IDColor, @IDAzul), ('CALC-AZUL-S', @IDTalla, @IDTallaS),
                   ('CALC-AZUL-M', @IDColor, @IDAzul), ('CALC-AZUL-M', @IDTalla, @IDTallaM)) AS x (SKU, IDAtributo, IDAtributoValor)
    ON x.SKU = v.SKU;

-- Gorra: solo color, todas agotadas → la selección inicial es la primera combinación (Rojo).
INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug) VALUES (@IDRopa, N'Gorra cálculo', 'calc-gorra');
DECLARE @IDGorra INT = SCOPE_IDENTITY();
INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica, ClaveCombinacion)
VALUES (@IDGorra, 'CALC-GORRA-AZUL', 60.00, 0, '2'), (@IDGorra, 'CALC-GORRA-ROJO', 65.00, 0, '1');
INSERT INTO dbo.VarianteAtributoValor (IDVariante, IDAtributo, IDAtributoValor)
SELECT IDVariante, @IDColor, CASE SKU WHEN 'CALC-GORRA-ROJO' THEN @IDRojo ELSE @IDAzul END
FROM dbo.Variante WHERE IDProducto = @IDGorra;

-- Hogar: productos sin atributos (una variante cada uno).
INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug)
VALUES (@IDHogar, N'Taza cálculo', 'calc-taza'), (@IDHogar, N'Vaso A', 'calc-vaso-a'),
       (@IDHogar, N'Vaso B', 'calc-vaso-b'), (@IDHogar, N'Vaso C', 'calc-vaso-c');
INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica)
SELECT IDProducto, CASE Slug WHEN 'calc-taza' THEN 'CALC-TAZA' WHEN 'calc-vaso-a' THEN 'CALC-VASO-A'
                             WHEN 'calc-vaso-b' THEN 'CALC-VASO-B' ELSE 'CALC-VASO-C' END,
       CASE Slug WHEN 'calc-taza' THEN 50.00 ELSE 10.00 END,
       CASE Slug WHEN 'calc-taza' THEN 1 ELSE 20 END
FROM dbo.Producto WHERE Slug IN ('calc-taza', 'calc-vaso-a', 'calc-vaso-b', 'calc-vaso-c');

DECLARE @IDRojoM INT = (SELECT IDVariante FROM dbo.Variante WHERE SKU = 'CALC-ROJO-M');
DECLARE @IDTaza  INT = (SELECT IDVariante FROM dbo.Variante WHERE SKU = 'CALC-TAZA');
DECLARE @IDTazaProducto INT = (SELECT IDProducto FROM dbo.Variante WHERE IDVariante = @IDTaza);

/*
    Reservas sobre Rojo-M (física 5):
      checkout 1 PENDIENTE: 2 unidades ACTIVA vigente (vence en 10 min)          → cuenta
      checkout 2 EXPIRADO:  1 unidad ACTIVA ya vencida (el job aún no la libera) → no cuenta
      checkout 3 CANCELADO: 3 unidades LIBERADA                                  → no cuenta
    Sobre la Taza (física 1): 3 unidades ACTIVA vigentes → disponible 0, nunca negativo.
*/
INSERT INTO dbo.Carrito (IDUsuario, Estado) VALUES (@IDUsuario, 'CONVERTIDO');
DECLARE @IDCarritoReservas INT = SCOPE_IDENTITY();

INSERT INTO dbo.Checkout (IDCarrito, IDUsuario, ClaveIdempotencia, CorreoContacto, NombreContacto, TelefonoContacto,
                          EnvioNombre, EnvioTelefono, EnvioLinea1, EnvioMunicipio, IDDepartamento, IDMetodoEnvio,
                          Subtotal, CostoEnvio, Total, Estado, FechaCreacion, FechaExpiracion, FechaCierre)
VALUES (@IDCarritoReservas, @IDUsuario, NEWID(), N'cliente@shopcart.test', N'Cliente Prueba', '5555-1234', N'Cliente Prueba', '5555-1234',
        N'1a calle 1-23 zona 1', N'Guatemala', 200, @IDMetodoEnvio, 350.00, 25.00, 375.00,
        'PENDIENTE', DATEADD(MINUTE, -5, @Ahora), DATEADD(MINUTE, 10, @Ahora), NULL);
DECLARE @IDCheckout1 BIGINT = SCOPE_IDENTITY();
INSERT INTO dbo.Checkout (IDCarrito, IDUsuario, ClaveIdempotencia, CorreoContacto, NombreContacto, TelefonoContacto,
                          EnvioNombre, EnvioTelefono, EnvioLinea1, EnvioMunicipio, IDDepartamento, IDMetodoEnvio,
                          Subtotal, CostoEnvio, Total, Estado, FechaCreacion, FechaExpiracion, FechaCierre)
VALUES (@IDCarritoReservas, @IDUsuario, NEWID(), N'cliente@shopcart.test', N'Cliente Prueba', '5555-1234', N'Cliente Prueba', '5555-1234',
        N'1a calle 1-23 zona 1', N'Guatemala', 200, @IDMetodoEnvio, 100.00, 25.00, 125.00,
        'EXPIRADO', DATEADD(MINUTE, -30, @Ahora), DATEADD(MINUTE, -15, @Ahora), DATEADD(MINUTE, -15, @Ahora));
DECLARE @IDCheckout2 BIGINT = SCOPE_IDENTITY();
INSERT INTO dbo.Checkout (IDCarrito, IDUsuario, ClaveIdempotencia, CorreoContacto, NombreContacto, TelefonoContacto,
                          EnvioNombre, EnvioTelefono, EnvioLinea1, EnvioMunicipio, IDDepartamento, IDMetodoEnvio,
                          Subtotal, CostoEnvio, Total, Estado, FechaCreacion, FechaExpiracion, FechaCierre)
VALUES (@IDCarritoReservas, @IDUsuario, NEWID(), N'cliente@shopcart.test', N'Cliente Prueba', '5555-1234', N'Cliente Prueba', '5555-1234',
        N'1a calle 1-23 zona 1', N'Guatemala', 200, @IDMetodoEnvio, 300.00, 25.00, 325.00,
        'CANCELADO', DATEADD(MINUTE, -20, @Ahora), DATEADD(MINUTE, -5, @Ahora), DATEADD(MINUTE, -10, @Ahora));
DECLARE @IDCheckout3 BIGINT = SCOPE_IDENTITY();

INSERT INTO dbo.CheckoutDetalle (IDCheckout, IDVariante, Cantidad, PrecioUnitario)
VALUES (@IDCheckout1, @IDRojoM, 2, 100.00), (@IDCheckout1, @IDTaza, 3, 50.00),
       (@IDCheckout2, @IDRojoM, 1, 100.00), (@IDCheckout3, @IDRojoM, 3, 100.00);
INSERT INTO dbo.ReservaInventario (IDCheckout, IDVariante, Cantidad, Estado, FechaCreacion, FechaExpiracion, FechaCierre)
VALUES (@IDCheckout1, @IDRojoM, 2, 'ACTIVA',   DATEADD(MINUTE, -5, @Ahora),  DATEADD(MINUTE, 10, @Ahora),  NULL),
       (@IDCheckout1, @IDTaza,  3, 'ACTIVA',   DATEADD(MINUTE, -5, @Ahora),  DATEADD(MINUTE, 10, @Ahora),  NULL),
       (@IDCheckout2, @IDRojoM, 1, 'ACTIVA',   DATEADD(MINUTE, -30, @Ahora), DATEADD(MINUTE, -15, @Ahora), NULL),
       (@IDCheckout3, @IDRojoM, 3, 'LIBERADA', DATEADD(MINUTE, -20, @Ahora), DATEADD(MINUTE, -5, @Ahora),  DATEADD(MINUTE, -10, @Ahora));

/* ========================================================================================
   FU_Inventario_Disponibilidad
   ======================================================================================== */
SET @Texto = (SELECT CONCAT('fisica=', ExistenciaFisica, ' reservado=', Reservado, ' disponible=', Disponible)
FROM dbo.FU_Inventario_Disponibilidad(@Ahora) WHERE IDVariante = @IDRojoM);
EXEC #Verificar N'Disponible descuenta solo reservas activas vigentes', N'fisica=5 reservado=2 disponible=3', @Texto;

SET @Texto = (SELECT CONCAT('reservado=', Reservado, ' disponible=', Disponible)
FROM dbo.FU_Inventario_Disponibilidad(DATEADD(MINUTE, 11, @Ahora)) WHERE IDVariante = @IDRojoM);
EXEC #Verificar N'Al vencer la reserva vuelve a estar disponible, sin intervención', N'reservado=0 disponible=5', @Texto;

SET @Texto = (SELECT CONCAT('fisica=', ExistenciaFisica, ' reservado=', Reservado, ' disponible=', Disponible)
FROM dbo.FU_Inventario_Disponibilidad(@Ahora) WHERE IDVariante = @IDTaza);
EXEC #Verificar N'Disponible nunca es negativo', N'fisica=1 reservado=3 disponible=0', @Texto;

/* ========================================================================================
   FU_Catalogo_OrdenVariantes
   ======================================================================================== */
SELECT @Texto = STRING_AGG(CONCAT(SKU, ':', PosicionInicial, CASE WHEN EsSeleccionInicial = 1 THEN '*' ELSE '' END), ' ')
                WITHIN GROUP (ORDER BY PosicionInicial)
FROM dbo.FU_Catalogo_OrdenVariantes(@Ahora) WHERE IDProducto = @IDPlayera;
EXEC #Verificar N'Orden de la playera (disponibles, luego Color, luego Talla; inactiva al final)',
     N'CALC-ROJO-M:1* CALC-AZUL-S:2 CALC-ROJO-S:3 CALC-AZUL-M:4', @Texto;

SELECT @Texto = STRING_AGG(CONCAT(SKU, CASE WHEN EsSeleccionInicial = 1 THEN '*' ELSE '' END), ' ')
                WITHIN GROUP (ORDER BY PosicionInicial)
FROM dbo.FU_Catalogo_OrdenVariantes(@Ahora) WHERE IDProducto = @IDGorra;
EXEC #Verificar N'Todo agotado: la selección inicial es la primera combinación', N'CALC-GORRA-ROJO* CALC-GORRA-AZUL', @Texto;

SET @Texto = (SELECT CONCAT(SKU, ' clave=''', ClaveOrden, ''' inicial=', EsSeleccionInicial)
FROM dbo.FU_Catalogo_OrdenVariantes(@Ahora) WHERE IDProducto = @IDTazaProducto);
EXEC #Verificar N'Producto sin atributos', N'CALC-TAZA clave='''' inicial=1', @Texto;

SELECT @Texto = CAST(COUNT(*) AS NVARCHAR(10))
FROM (
    SELECT IDProducto FROM dbo.FU_Catalogo_OrdenVariantes(@Ahora)
    GROUP BY IDProducto
    HAVING SUM(CAST(EsSeleccionInicial AS INT)) <> MAX(CAST(Activo AS INT))
) AS x;
EXEC #Verificar N'Productos con variantes activas: exactamente una selección inicial (sin activas: ninguna)', N'0', @Texto;

/* ========================================================================================
   FU_Cupones_Validar
   ======================================================================================== */
INSERT INTO dbo.Cupon (Codigo, Descripcion, TipoDescuento, Valor, FechaInicio, FechaFin, Activo, LimiteUsosTotal, UsosActuales, LimiteUsosPorCliente, SoloRegistrados)
VALUES ('CALC-OK',       N'Válido',            'PORCENTAJE', 10, DATEADD(DAY, -1, @Ahora), DATEADD(DAY, 1, @Ahora), 1, NULL, 0, NULL, 0),
       ('CALC-INACTIVO', N'Inactivo',          'PORCENTAJE', 10, DATEADD(DAY, -1, @Ahora), DATEADD(DAY, 1, @Ahora), 0, NULL, 0, NULL, 0),
       ('CALC-FUTURO',   N'Aún no vigente',    'PORCENTAJE', 10, DATEADD(DAY,  1, @Ahora), DATEADD(DAY, 2, @Ahora), 1, NULL, 0, NULL, 0),
       ('CALC-VENCIDO',  N'Vencido',           'PORCENTAJE', 10, DATEADD(DAY, -2, @Ahora), @Ahora,                   1, NULL, 0, NULL, 0),
       ('CALC-AGOTADO',  N'Agotado',           'PORCENTAJE', 10, DATEADD(DAY, -1, @Ahora), DATEADD(DAY, 1, @Ahora), 1, 2,    2, NULL, 0),
       ('CALC-SOLOREG',  N'Solo registrados',  'PORCENTAJE', 10, DATEADD(DAY, -1, @Ahora), DATEADD(DAY, 1, @Ahora), 1, NULL, 0, NULL, 1),
       ('CALC-UNOXCLI',  N'Uno por cliente',   'PORCENTAJE', 10, DATEADD(DAY, -1, @Ahora), DATEADD(DAY, 1, @Ahora), 1, NULL, 0, 1,    0),
       ('CALC-REVERTIDO',N'Uso revertido',     'PORCENTAJE', 10, DATEADD(DAY, -1, @Ahora), DATEADD(DAY, 1, @Ahora), 1, NULL, 0, 1,    0);

DECLARE @IDPedidoUso INT, @IDPedidoRevertido INT;
DECLARE @IDUnoPorCliente INT = (SELECT IDCupon FROM dbo.Cupon WHERE Codigo = 'CALC-UNOXCLI');
DECLARE @IDRevertido     INT = (SELECT IDCupon FROM dbo.Cupon WHERE Codigo = 'CALC-REVERTIDO');
EXEC #CrearPedidoConCupon @IDUsuario, @IDUnoPorCliente, @IDPedidoUso OUTPUT;
EXEC #CrearPedidoConCupon @IDUsuario, @IDRevertido, @IDPedidoRevertido OUTPUT;
INSERT INTO dbo.CuponUso (IDCupon, IDPedido, IDUsuario, CorreoCliente, MontoDescontado, FechaReversion)
VALUES (@IDUnoPorCliente, @IDPedidoUso,       @IDUsuario, N'cliente@shopcart.test', 10.00, NULL),
       (@IDRevertido,     @IDPedidoRevertido, @IDUsuario, N'cliente@shopcart.test', 10.00, SYSUTCDATETIME());

SELECT @Texto = STRING_AGG(CONCAT(c.Codigo, '=', ISNULL(v.CodigoError, 'OK')), ' ') WITHIN GROUP (ORDER BY c.IDCupon)
FROM dbo.Cupon AS c
CROSS APPLY dbo.FU_Cupones_Validar(c.IDCupon, NULL, N'invitado@shopcart.test', @Ahora) AS v
WHERE c.Codigo LIKE 'CALC-%';
EXEC #Verificar N'Validación para un invitado',
     N'CALC-OK=OK CALC-INACTIVO=CUPON_INVALIDO CALC-FUTURO=CUPON_NO_VIGENTE CALC-VENCIDO=CUPON_VENCIDO CALC-AGOTADO=CUPON_AGOTADO CALC-SOLOREG=CUPON_SOLO_REGISTRADOS CALC-UNOXCLI=OK CALC-REVERTIDO=OK',
     @Texto;

SELECT @Texto = STRING_AGG(CONCAT(c.Codigo, '=', ISNULL(v.CodigoError, 'OK')), ' ') WITHIN GROUP (ORDER BY c.IDCupon)
FROM dbo.Cupon AS c
CROSS APPLY dbo.FU_Cupones_Validar(c.IDCupon, @IDUsuario, NULL, @Ahora) AS v
WHERE c.Codigo IN ('CALC-SOLOREG', 'CALC-UNOXCLI', 'CALC-REVERTIDO');
EXEC #Verificar N'Validación para el cliente registrado (usó UNOXCLI; su uso de REVERTIDO se revirtió)',
     N'CALC-SOLOREG=OK CALC-UNOXCLI=CUPON_LIMITE_CLIENTE CALC-REVERTIDO=OK', @Texto;

SELECT @Texto = STRING_AGG(CONCAT(c.Codigo, '=', ISNULL(v.CodigoError, 'OK')), ' ') WITHIN GROUP (ORDER BY c.IDCupon)
FROM dbo.Cupon AS c
CROSS APPLY dbo.FU_Cupones_Validar(c.IDCupon, NULL, N'cliente@shopcart.test', @Ahora) AS v
WHERE c.Codigo = 'CALC-UNOXCLI';
EXEC #Verificar N'Un invitado con el correo de quien ya usó el cupón (límite por correo, D19)',
     N'CALC-UNOXCLI=CUPON_LIMITE_CLIENTE', @Texto;

SET @Texto = (SELECT ISNULL(CodigoError, 'OK') FROM dbo.FU_Cupones_Validar(-1, NULL, NULL, @Ahora));
EXEC #Verificar N'Cupón inexistente', N'CUPON_INVALIDO', @Texto;

/* ========================================================================================
   FU_Cupones_CalculoDescuento: carrito = Rojo-M ×2 (Q200, Ropa) + Taza ×1 (Q50, Hogar) = Q250
   ======================================================================================== */
INSERT INTO dbo.Carrito (IDUsuario) VALUES (@IDUsuario);
DECLARE @IDCarrito INT = SCOPE_IDENTITY();
INSERT INTO dbo.CarritoItem (IDCarrito, IDVariante, Cantidad) VALUES (@IDCarrito, @IDRojoM, 2), (@IDCarrito, @IDTaza, 1);

INSERT INTO dbo.Cupon (Codigo, Descripcion, TipoDescuento, Valor, MontoMinimo, FechaInicio, FechaFin, IDCategoria)
VALUES ('CALC-10',       N'10 % global',          'PORCENTAJE', 10,     0, DATEADD(DAY, -1, @Ahora), DATEADD(DAY, 1, @Ahora), NULL),
       ('CALC-10ROPA',   N'10 % en Ropa',         'PORCENTAJE', 10,     0, DATEADD(DAY, -1, @Ahora), DATEADD(DAY, 1, @Ahora), @IDRopa),
       ('CALC-300HOGAR', N'Q300 en Hogar',        'MONTO_FIJO', 300,    0, DATEADD(DAY, -1, @Ahora), DATEADD(DAY, 1, @Ahora), @IDHogar),
       ('CALC-MIN300',   N'Q10 desde Q300',       'MONTO_FIJO', 10,   300, DATEADD(DAY, -1, @Ahora), DATEADD(DAY, 1, @Ahora), NULL),
       ('CALC-ELEC',     N'10 % en Electrónica',  'PORCENTAJE', 10,     0, DATEADD(DAY, -1, @Ahora), DATEADD(DAY, 1, @Ahora), @IDElectronica),
       ('CALC-FIJO10',   N'Q10 global',           'MONTO_FIJO', 10,     0, DATEADD(DAY, -1, @Ahora), DATEADD(DAY, 1, @Ahora), NULL);

SELECT @Texto = STRING_AGG(CONCAT(c.Codigo, ' sub=', d.Subtotal, ' eleg=', d.SubtotalElegible, ' desc=', d.Descuento, ' ', ISNULL(d.CodigoError, 'OK')), ' | ')
                WITHIN GROUP (ORDER BY c.IDCupon)
FROM dbo.Cupon AS c
CROSS APPLY dbo.FU_Cupones_CalculoDescuento(c.IDCupon, @IDCarrito) AS d
WHERE c.Codigo IN ('CALC-10', 'CALC-10ROPA', 'CALC-300HOGAR', 'CALC-MIN300', 'CALC-ELEC');
EXEC #Verificar N'Cálculo del descuento',
     N'CALC-10 sub=250.00 eleg=250.00 desc=25.00 OK | CALC-10ROPA sub=250.00 eleg=200.00 desc=20.00 OK | CALC-300HOGAR sub=250.00 eleg=50.00 desc=50.00 OK | CALC-MIN300 sub=250.00 eleg=250.00 desc=0.00 CUPON_MONTO_MINIMO | CALC-ELEC sub=250.00 eleg=0.00 desc=0.00 CUPON_SIN_PRODUCTOS_ELEGIBLES',
     @Texto;

INSERT INTO dbo.Carrito (IDUsuario, Estado) VALUES (@IDUsuario, 'FUSIONADO');
DECLARE @IDCarritoVacio INT = SCOPE_IDENTITY();
SET @Texto = (SELECT CONCAT(Descuento, ' ', CodigoError)
FROM dbo.FU_Cupones_CalculoDescuento((SELECT IDCupon FROM dbo.Cupon WHERE Codigo = 'CALC-10'), @IDCarritoVacio));
EXEC #Verificar N'Carrito vacío', N'0.00 CARRITO_VACIO', @Texto;

/* ========================================================================================
   FU_Cupones_ProrrateoDescuento
   ======================================================================================== */
DECLARE @ID10 INT = (SELECT IDCupon FROM dbo.Cupon WHERE Codigo = 'CALC-10');
DECLARE @ID10Ropa INT = (SELECT IDCupon FROM dbo.Cupon WHERE Codigo = 'CALC-10ROPA');

SELECT @Texto = STRING_AGG(CONCAT(v.SKU, '=', p.DescuentoLinea), ' ') WITHIN GROUP (ORDER BY v.SKU)
FROM dbo.FU_Cupones_ProrrateoDescuento(@ID10, @IDCarrito, 25.00) AS p
INNER JOIN dbo.Variante AS v ON v.IDVariante = p.IDVariante;
EXEC #Verificar N'Prorrateo proporcional (Q25 en Q200 + Q50)', N'CALC-ROJO-M=20.00 CALC-TAZA=5.00', @Texto;

SELECT @Texto = STRING_AGG(CONCAT(v.SKU, '=', p.DescuentoLinea), ' ') WITHIN GROUP (ORDER BY v.SKU)
FROM dbo.FU_Cupones_ProrrateoDescuento(@ID10Ropa, @IDCarrito, 20.00) AS p
INNER JOIN dbo.Variante AS v ON v.IDVariante = p.IDVariante;
EXEC #Verificar N'Cupón de categoría: las líneas no elegibles reciben 0', N'CALC-ROJO-M=20.00 CALC-TAZA=0.00', @Texto;

SELECT @Texto = STRING_AGG(CONCAT(v.SKU, '=', p.DescuentoLinea), ' ') WITHIN GROUP (ORDER BY v.SKU)
FROM dbo.FU_Cupones_ProrrateoDescuento(@ID10, @IDCarrito, 7.77) AS p
INNER JOIN dbo.Variante AS v ON v.IDVariante = p.IDVariante;
EXEC #Verificar N'Centavo sobrante al mayor residuo (Q7.77: 6.216 y 1.554)', N'CALC-ROJO-M=6.22 CALC-TAZA=1.55', @Texto;

INSERT INTO dbo.Carrito (IDUsuario, Estado) VALUES (@IDUsuario, 'CONVERTIDO');
DECLARE @IDCarritoVasos INT = SCOPE_IDENTITY();
INSERT INTO dbo.CarritoItem (IDCarrito, IDVariante, Cantidad)
SELECT @IDCarritoVasos, IDVariante, 1 FROM dbo.Variante WHERE SKU IN ('CALC-VASO-A', 'CALC-VASO-B', 'CALC-VASO-C');

SELECT @Texto = STRING_AGG(CAST(p.DescuentoLinea AS NVARCHAR(20)), ' ') WITHIN GROUP (ORDER BY p.IDVariante)
FROM dbo.FU_Cupones_ProrrateoDescuento((SELECT IDCupon FROM dbo.Cupon WHERE Codigo = 'CALC-FIJO10'), @IDCarritoVasos, 10.00) AS p;
EXEC #Verificar N'Q10 entre 3 líneas iguales, en orden de IDVariante (empate: el centavo va a la menor)', N'3.34 3.33 3.33', @Texto;

/* Propiedad: para muchos montos, la suma cuadra exacta y ninguna línea excede su importe. */
WITH Montos AS
(
    SELECT TOP (2500) CAST(ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS DECIMAL(12, 2)) / 10 AS Descuento
    FROM sys.all_columns AS a CROSS JOIN sys.all_columns AS b
)
SELECT @Texto = CAST(COUNT(*) AS NVARCHAR(10))
FROM Montos AS m
CROSS APPLY (
    SELECT SUM(p.DescuentoLinea) AS Suma, MAX(CASE WHEN p.DescuentoLinea > p.Importe OR p.DescuentoLinea < 0 THEN 1 ELSE 0 END) AS Excede
    FROM dbo.FU_Cupones_ProrrateoDescuento(@ID10, @IDCarrito, m.Descuento) AS p
) AS r
WHERE r.Suma <> m.Descuento OR r.Excede = 1;
EXEC #Verificar N'2 500 montos de Q0.10 a Q250.00: casos que no cuadran o exceden el importe', N'0', @Texto;

/* ========================================================================================
   FU_Pedidos_DesgloseIVA (tasa 12 %)
   ======================================================================================== */
IF NOT EXISTS (SELECT 1 FROM dbo.Parametro WHERE Clave = 'TASA_IVA')
    INSERT INTO dbo.Parametro (IDParametro, Clave, Valor, TipoDato, Descripcion)
    VALUES (200, 'TASA_IVA', N'0.12', 'DECIMAL', N'Tasa de IVA (prueba)');
ELSE
    UPDATE dbo.Parametro SET Valor = N'0.12' WHERE Clave = 'TASA_IVA';

SELECT @Texto = STRING_AGG(CONCAT(t.Total, '=', d.BaseImponible, '+', d.IVA), ' ') WITHIN GROUP (ORDER BY t.Total)
FROM (VALUES (CAST(0.01 AS DECIMAL(12, 2))), (112.00), (125.00), (99999.99)) AS t (Total)
CROSS APPLY dbo.FU_Pedidos_DesgloseIVA(t.Total) AS d;
EXEC #Verificar N'Desglose de IVA', N'0.01=0.01+0.00 112.00=100.00+12.00 125.00=111.61+13.39 99999.99=89285.71+10714.28', @Texto;

WITH Totales AS
(
    SELECT TOP (20000) CAST(ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS DECIMAL(12, 2)) / 100 AS Total
    FROM sys.all_columns AS a CROSS JOIN sys.all_columns AS b
)
SELECT @Texto = CAST(COUNT(*) AS NVARCHAR(10))
FROM Totales AS t
CROSS APPLY dbo.FU_Pedidos_DesgloseIVA(t.Total) AS d
WHERE d.BaseImponible + d.IVA <> t.Total
   OR ABS(ROUND(d.BaseImponible * 1.12, 2) - t.Total) > 0.01;
EXEC #Verificar N'20 000 totales de Q0.01 a Q200.00: casos donde Base + IVA no cuadra', N'0', @Texto;

DELETE FROM dbo.Parametro WHERE Clave = 'TASA_IVA';
SELECT @Texto = CAST(COUNT(*) AS NVARCHAR(10)) FROM dbo.FU_Pedidos_DesgloseIVA(100.00);
EXEC #Verificar N'Sin TASA_IVA no devuelve fila (el SP no inventa impuestos)', N'0', @Texto;

/* --- Resultado ---------------------------------------------------------------------------- */
DECLARE @Fallas INT = (SELECT COUNT(*) FROM #Fallas);
ROLLBACK TRANSACTION;
EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = NULL;

IF @Fallas > 0
    THROW 50000, N'Pruebas de cálculo de funciones fallidas.', 1;
GO
