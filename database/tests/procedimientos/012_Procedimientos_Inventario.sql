/*
    012_Procedimientos_Inventario.sql
    Se ejecuta conectado como shopcart_migrator (deploy.ps1 -Probar). Mismo esquema que
    009–011: el migrador prepara los datos y ejecuta cada SP haciéndose pasar por un miembro
    de RolApi; los casos de error usan #EsperarError. Los SKU de prueba empiezan con INV-PRUEBA.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT OFF;
GO

-- Permite ejecutar el script varias veces en la misma conexión (p. ej. en SSMS).
DROP TABLE IF EXISTS #Contexto, #Base, #Resultado, #Existencias, #Kardex, #Conciliacion;
DROP PROCEDURE IF EXISTS #Verificar;
DROP PROCEDURE IF EXISTS #Preparar;
DROP PROCEDURE IF EXISTS #EsperarError;
GO

CREATE TABLE #Contexto (UsuarioApi SYSNAME NOT NULL);
CREATE TABLE #Base (IDAdmin INT, IDOperador INT, IDCliente INT, IDCategoria INT, IDA INT, IDB INT, IDC INT);

-- Resultados de los SPs (misma forma que devuelven).
CREATE TABLE #Resultado (IDMovimientoInventario BIGINT, IDVariante INT, SKU VARCHAR(50), Producto NVARCHAR(200), CodigoTipo VARCHAR(30),
                         Cantidad INT, SaldoAnterior INT, SaldoNuevo INT, Disponible INT);
CREATE TABLE #Existencias (IDVariante INT, SKU VARCHAR(50), IDProducto INT, Producto NVARCHAR(200), Descripcion NVARCHAR(400),
                           Categoria NVARCHAR(100), ExistenciaFisica INT, Reservado INT, Disponible INT, Activo BIT, ProductoActivo BIT);
CREATE TABLE #Kardex (IDMovimientoInventario BIGINT, Fecha DATETIME2(3), IDVariante INT, SKU VARCHAR(50), Producto NVARCHAR(200),
                      CodigoTipo VARCHAR(30), Tipo NVARCHAR(50), Cantidad INT, SaldoAnterior INT, SaldoNuevo INT, Motivo NVARCHAR(300),
                      IDPedido INT, IDDevolucion INT, IDUsuario INT, Usuario NVARCHAR(201));
CREATE TABLE #Conciliacion (IDVariante INT, SKU VARCHAR(50), Producto NVARCHAR(200), ExistenciaFisica INT, SumaKardex INT,
                            UltimoSaldo INT, Movimientos INT, Saltos INT, Diferencia INT);
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
    - Roles y tipos de movimiento (si la semilla no los cargó; las marcas de motivo y registro
      manual se fijan con valores conocidos); un administrador, un operador y un cliente.
    - Variantes: A (10 por INVENTARIO_INICIAL), B (0, sin movimientos) y C desactivada (3).
    - Sobre A: un checkout en curso reserva 4 (vigente) y otro vencido sigue con 5 en ACTIVA
      (ya no cuenta). Disponible de A = 10 − 4 = 6.
*/
CREATE PROCEDURE #Preparar
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Hash VARCHAR(255) = '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA';
    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @IDAdmin INT, @IDOperador INT, @IDCliente INT, @IDCategoria INT, @IDProducto INT, @IDA INT, @IDB INT, @IDC INT,
            @IDInicial TINYINT, @IDCarrito INT, @IDMetodoEnvio INT, @IDCheckoutVigente BIGINT, @IDCheckoutVencido BIGINT;

    INSERT INTO dbo.Rol (IDRol, Codigo, Nombre)
    SELECT v.IDRol, v.Codigo, v.Nombre
    FROM (VALUES (201, 'CLIENTE', N'Cliente'), (202, 'OPERADOR', N'Operador'), (203, 'ADMIN', N'Administrador'))
         AS v (IDRol, Codigo, Nombre)
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Rol AS r WHERE r.Codigo = v.Codigo);

    DECLARE @Tipos TABLE (IDTipoMovimiento TINYINT, Codigo VARCHAR(30), Nombre NVARCHAR(50), Signo SMALLINT,
                          RequiereMotivo BIT, PermiteRegistroManual BIT);
    INSERT INTO @Tipos VALUES (201, 'INVENTARIO_INICIAL', N'Inventario inicial', 1, 0, 0),
                              (202, 'ENTRADA_COMPRA', N'Entrada por compra', 1, 0, 1),
                              (203, 'AJUSTE_ENTRADA', N'Ajuste de entrada', 1, 1, 1),
                              (204, 'AJUSTE_SALIDA', N'Ajuste de salida', -1, 1, 1),
                              (205, 'SALIDA_VENTA', N'Salida por venta', -1, 0, 0);
    UPDATE t SET RequiereMotivo = x.RequiereMotivo, PermiteRegistroManual = x.PermiteRegistroManual
    FROM dbo.TipoMovimiento AS t JOIN @Tipos AS x ON x.Codigo = t.Codigo;
    INSERT INTO dbo.TipoMovimiento (IDTipoMovimiento, Codigo, Nombre, Signo, RequiereMotivo, PermiteRegistroManual)
    SELECT x.IDTipoMovimiento, x.Codigo, x.Nombre, x.Signo, x.RequiereMotivo, x.PermiteRegistroManual
    FROM @Tipos AS x
    WHERE NOT EXISTS (SELECT 1 FROM dbo.TipoMovimiento AS t WHERE t.Codigo = x.Codigo);
    SET @IDInicial = (SELECT IDTipoMovimiento FROM dbo.TipoMovimiento WHERE Codigo = 'INVENTARIO_INICIAL');

    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'admin.inventario@shopcart.test', @Hash, N'Admin', N'Inventario' FROM dbo.Rol AS r WHERE r.Codigo = 'ADMIN';
    SET @IDAdmin = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'operador.inventario@shopcart.test', @Hash, N'Operador', N'Inventario' FROM dbo.Rol AS r WHERE r.Codigo = 'OPERADOR';
    SET @IDOperador = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'cliente.inventario@shopcart.test', @Hash, N'Cliente', N'Inventario' FROM dbo.Rol AS r WHERE r.Codigo = 'CLIENTE';
    SET @IDCliente = SCOPE_IDENTITY();

    INSERT INTO dbo.Categoria (Nombre, Slug) VALUES (N'Inventario Prueba', 'inventario-prueba');
    SET @IDCategoria = SCOPE_IDENTITY();
    INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug, Activo) VALUES (@IDCategoria, N'Vaso Inventario Prueba', 'vaso-inventario-prueba', 1);
    SET @IDProducto = SCOPE_IDENTITY();
    INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug) VALUES (@IDCategoria, N'Plato Inventario Prueba', 'plato-inventario-prueba');
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica) VALUES (@IDProducto, 'INV-PRUEBA-A', 50.00, 10);
    SET @IDA = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica)
    VALUES ((SELECT IDProducto FROM dbo.Producto WHERE Slug = 'plato-inventario-prueba'), 'INV-PRUEBA-B', 30.00, 0);
    SET @IDB = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica, Activo, ClaveCombinacion)
    VALUES ((SELECT IDProducto FROM dbo.Producto WHERE Slug = 'plato-inventario-prueba'), 'INV-PRUEBA-C', 30.00, 3, 0, '0');
    SET @IDC = SCOPE_IDENTITY();
    INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimiento, Signo, Cantidad, SaldoAnterior, SaldoNuevo, IDUsuario)
    VALUES (@IDA, @IDInicial, 1, 10, 0, 10, @IDAdmin), (@IDC, @IDInicial, 1, 3, 0, 3, @IDAdmin);

    -- Reservas sobre A: una vigente (4) y una vencida que el job aún no marcó (5).
    INSERT INTO dbo.Departamento (IDDepartamento, Nombre)
    SELECT 201, N'Departamento Inventario Prueba' WHERE NOT EXISTS (SELECT 1 FROM dbo.Departamento WHERE IDDepartamento = 201);
    INSERT INTO dbo.MetodoEnvio (Nombre, Costo, DiasEstimadosMin, DiasEstimadosMax) VALUES (N'Envío Inventario Prueba', 25.00, 1, 3);
    SET @IDMetodoEnvio = SCOPE_IDENTITY();
    INSERT INTO dbo.Carrito (IDUsuario, Estado) VALUES (@IDCliente, 'CONVERTIDO');
    SET @IDCarrito = SCOPE_IDENTITY();
    INSERT INTO dbo.Checkout (IDCarrito, IDUsuario, ClaveIdempotencia, CorreoContacto, NombreContacto, TelefonoContacto,
                              EnvioNombre, EnvioTelefono, EnvioLinea1, EnvioMunicipio, IDDepartamento, IDMetodoEnvio,
                              Subtotal, CostoEnvio, Total, Estado, FechaCreacion, FechaExpiracion)
    VALUES (@IDCarrito, @IDCliente, NEWID(), N'cliente.inventario@shopcart.test', N'Cliente Inventario', '5555-1234',
            N'Cliente Inventario', '5555-1234', N'1a calle 1-23 zona 1', N'Guatemala', 201, @IDMetodoEnvio,
            200.00, 25.00, 225.00, 'PENDIENTE', DATEADD(MINUTE, -5, @Ahora), DATEADD(MINUTE, 10, @Ahora));
    SET @IDCheckoutVigente = SCOPE_IDENTITY();
    INSERT INTO dbo.Checkout (IDCarrito, IDUsuario, ClaveIdempotencia, CorreoContacto, NombreContacto, TelefonoContacto,
                              EnvioNombre, EnvioTelefono, EnvioLinea1, EnvioMunicipio, IDDepartamento, IDMetodoEnvio,
                              Subtotal, CostoEnvio, Total, Estado, FechaCreacion, FechaExpiracion, FechaCierre)
    VALUES (@IDCarrito, @IDCliente, NEWID(), N'cliente.inventario@shopcart.test', N'Cliente Inventario', '5555-1234',
            N'Cliente Inventario', '5555-1234', N'1a calle 1-23 zona 1', N'Guatemala', 201, @IDMetodoEnvio,
            250.00, 25.00, 275.00, 'EXPIRADO', DATEADD(MINUTE, -40, @Ahora), DATEADD(MINUTE, -25, @Ahora), DATEADD(MINUTE, -25, @Ahora));
    SET @IDCheckoutVencido = SCOPE_IDENTITY();
    INSERT INTO dbo.CheckoutDetalle (IDCheckout, IDVariante, Cantidad, PrecioUnitario)
    VALUES (@IDCheckoutVigente, @IDA, 4, 50.00), (@IDCheckoutVencido, @IDA, 5, 50.00);
    INSERT INTO dbo.ReservaInventario (IDCheckout, IDVariante, Cantidad, FechaCreacion, FechaExpiracion)
    VALUES (@IDCheckoutVigente, @IDA, 4, DATEADD(MINUTE, -5, @Ahora), DATEADD(MINUTE, 10, @Ahora)),
           (@IDCheckoutVencido, @IDA, 5, DATEADD(MINUTE, -40, @Ahora), DATEADD(MINUTE, -25, @Ahora));

    DELETE FROM #Base;
    INSERT INTO #Base VALUES (@IDAdmin, @IDOperador, @IDCliente, @IDCategoria, @IDA, @IDB, @IDC);
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
DECLARE @IDAdmin INT, @IDOperador INT, @IDCategoria INT, @IDA INT, @IDB INT, @IDC INT, @Total INT;
DECLARE @Texto NVARCHAR(400), @Desde DATETIME2(3);
DECLARE @Lineas dbo.TT_Inventario_Movimiento;

/* === Movimientos ========================================================================= */
BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDAdmin = IDAdmin, @IDOperador = IDOperador, @IDCategoria = IDCategoria, @IDA = IDA, @IDB = IDB, @IDC = IDC FROM #Base;

-- Entrada por compra con dos líneas, sin motivo (no lo exige), registrada por un operador.
INSERT INTO @Lineas VALUES (@IDB, 2), (@IDA, 5);
EXECUTE AS USER = @Api;
INSERT INTO #Resultado EXEC dbo.SP_Inventario_RegistrarMovimiento @IDOperador, ' entrada_compra ', N'  ', @Lineas;
REVERT;
SET @Texto = (SELECT STRING_AGG(CONCAT(SKU, N':', CodigoTipo, N':', Cantidad, N':', SaldoAnterior, N'>', SaldoNuevo, N':', Disponible), N',')
                     WITHIN GROUP (ORDER BY IDVariante) FROM #Resultado);
EXEC #Verificar N'Entrada por compra: suma a cada variante y devuelve saldo y disponible (A tiene 4 reservadas)',
     N'INV-PRUEBA-A:ENTRADA_COMPRA:5:10>15:11,INV-PRUEBA-B:ENTRADA_COMPRA:2:0>2:2', @Texto;
SET @Texto = (SELECT CONCAT(COUNT(*), N'|', SUM(CASE WHEN m.IDUsuario = @IDOperador AND m.Motivo IS NULL AND m.Signo = 1 THEN 1 ELSE 0 END),
                            N'|', SUM(CASE WHEN v.ExistenciaFisica = m.SaldoNuevo THEN 1 ELSE 0 END))
              FROM dbo.MovimientoInventario AS m JOIN dbo.Variante AS v ON v.IDVariante = m.IDVariante
              WHERE m.IDMovimientoInventario IN (SELECT IDMovimientoInventario FROM #Resultado));
SET @Texto += N'|' + (SELECT CONCAT(COUNT(*), N':', MAX(JSON_VALUE(ValorNuevo, '$.TipoMovimiento'))) FROM dbo.Bitacora
                      WHERE IDUsuario = @IDOperador AND Modulo = 'INVENTARIO');
EXEC #Verificar N'Entrada por compra: kardex con usuario y sin motivo, existencia = saldo nuevo, bitácora por variante',
     N'2|2|2|2:ENTRADA_COMPRA', @Texto;

-- Ajuste de salida por exactamente lo disponible: las 4 reservadas no se tocan.
DELETE FROM @Lineas; DELETE FROM #Resultado;
INSERT INTO @Lineas VALUES (@IDA, 11);
EXECUTE AS USER = @Api;
INSERT INTO #Resultado EXEC dbo.SP_Inventario_RegistrarMovimiento @IDAdmin, 'AJUSTE_SALIDA', N' Venta fuera del sistema ', @Lineas;
REVERT;
SET @Texto = (SELECT CONCAT(Cantidad, N':', SaldoAnterior, N'>', SaldoNuevo, N':', Disponible, N'|',
                            (SELECT Motivo FROM dbo.MovimientoInventario AS m WHERE m.IDMovimientoInventario = r.IDMovimientoInventario))
              FROM #Resultado AS r);
EXEC #Verificar N'Ajuste de salida: retira hasta lo disponible, cantidad con signo negativo y motivo recortado',
     N'-11:15>4:0|Venta fuera del sistema', @Texto;

-- Ajuste de entrada sobre una variante desactivada: está permitido.
DELETE FROM @Lineas; DELETE FROM #Resultado;
INSERT INTO @Lineas VALUES (@IDC, 1);
EXECUTE AS USER = @Api;
INSERT INTO #Resultado EXEC dbo.SP_Inventario_RegistrarMovimiento @IDAdmin, 'AJUSTE_ENTRADA', N'Conteo físico', @Lineas;
REVERT;
SET @Texto = (SELECT CONCAT(SKU, N':', SaldoAnterior, N'>', SaldoNuevo) FROM #Resultado);
EXEC #Verificar N'Ajuste de entrada: también en una variante desactivada', N'INV-PRUEBA-C:3>4', @Texto;

/* === Existencias, kardex y conciliación ================================================== */
DELETE FROM #Existencias;
EXECUTE AS USER = @Api;
INSERT INTO #Existencias EXEC dbo.SP_Inventario_ListarExistencias @IDOperador, N'inv-prueba', NULL, 0, 1, 20, @Total OUTPUT;
REVERT;
SET @Texto = CONCAT(@Total, N'|', (SELECT STRING_AGG(CONCAT(SKU, N':', ExistenciaFisica, N'/', Reservado, N'/', Disponible, N':',
                                                            CAST(Activo AS INT), CAST(ProductoActivo AS INT)), N',')
                                          WITHIN GROUP (ORDER BY Producto, SKU) FROM #Existencias));
EXEC #Verificar N'Existencias: física/reservada/disponible (la reserva vencida no cuenta) e inactivas incluidas',
     N'3|INV-PRUEBA-B:2/0/2:10,INV-PRUEBA-C:4/0/4:00,INV-PRUEBA-A:4/4/0:11', @Texto;

DELETE FROM #Existencias;
EXECUTE AS USER = @Api;
INSERT INTO #Existencias EXEC dbo.SP_Inventario_ListarExistencias @IDOperador, NULL, @IDCategoria, 1, 1, 20, @Total OUTPUT;
REVERT;
SET @Texto = CONCAT(@Total, N'|', (SELECT STRING_AGG(SKU, ',') FROM #Existencias));
EXEC #Verificar N'Existencias: por categoría y solo agotadas (disponible 0 aunque haya físico reservado)', N'1|INV-PRUEBA-A', @Texto;

DELETE FROM #Kardex;
EXECUTE AS USER = @Api;
INSERT INTO #Kardex EXEC dbo.SP_Inventario_ListarKardex @IDOperador, @IDA, NULL, NULL, NULL, 1, 50, @Total OUTPUT;
REVERT;
SET @Texto = CONCAT(@Total, N'|', (SELECT STRING_AGG(CONCAT(CodigoTipo, N':', Cantidad, N':', SaldoNuevo, N':', Usuario), N',')
                                          WITHIN GROUP (ORDER BY IDMovimientoInventario DESC) FROM #Kardex));
EXEC #Verificar N'Kardex: movimientos de la variante del más reciente al más antiguo, con usuario',
     N'3|AJUSTE_SALIDA:-11:4:Admin Inventario,ENTRADA_COMPRA:5:15:Operador Inventario,INVENTARIO_INICIAL:10:10:Admin Inventario', @Texto;

SET @Desde = (SELECT MIN(Fecha) FROM #Kardex WHERE CodigoTipo = 'ENTRADA_COMPRA');
DELETE FROM #Kardex;
EXECUTE AS USER = @Api;
INSERT INTO #Kardex EXEC dbo.SP_Inventario_ListarKardex @IDOperador, NULL, 'entrada_compra', @Desde, NULL, 1, 50, @Total OUTPUT;
REVERT;
SET @Texto = CONCAT(@Total, N'|', (SELECT STRING_AGG(SKU, ',') WITHIN GROUP (ORDER BY SKU) FROM #Kardex));
EXEC #Verificar N'Kardex: por tipo y desde una fecha', N'2|INV-PRUEBA-A,INV-PRUEBA-B', @Texto;

DELETE FROM #Conciliacion;
EXECUTE AS USER = @Api;
INSERT INTO #Conciliacion EXEC dbo.SP_Inventario_Conciliar @IDOperador;
REVERT;
SET @Texto = CAST((SELECT COUNT(*) FROM #Conciliacion WHERE SKU LIKE 'INV-PRUEBA-%') AS NVARCHAR(10));
EXEC #Verificar N'Conciliación: después de los movimientos la existencia de cada variante cuadra con su kardex', N'0', @Texto;

-- Si alguien escribe el saldo sin kardex (lo que los SPs impiden), la conciliación lo detecta.
UPDATE dbo.Variante SET ExistenciaFisica = 9 WHERE IDVariante = @IDB;
DELETE FROM #Conciliacion;
EXECUTE AS USER = @Api;
INSERT INTO #Conciliacion EXEC dbo.SP_Inventario_Conciliar @IDAdmin;
REVERT;
SET @Texto = (SELECT STRING_AGG(CONCAT(SKU, N':', ExistenciaFisica, N'/', SumaKardex, N':', Diferencia), N',')
              FROM #Conciliacion WHERE SKU LIKE 'INV-PRUEBA-%');
EXEC #Verificar N'Conciliación: detecta una existencia escrita sin kardex', N'INV-PRUEBA-B:9/2:7', @Texto;
ROLLBACK TRANSACTION;

/* === Casos de error ====================================================================== */
DECLARE @D NVARCHAR(MAX) = N'
DECLARE @Admin INT, @Operador INT, @Cliente INT, @A INT, @B INT, @C INT, @Total INT;
DECLARE @L dbo.TT_Inventario_Movimiento;
SELECT @Admin = IDAdmin, @Operador = IDOperador, @Cliente = IDCliente, @A = IDA, @B = IDB, @C = IDC FROM #Base;
';

DECLARE @Errores TABLE (Orden INT IDENTITY, Descripcion NVARCHAR(300), Esperado INT, Sql NVARCHAR(MAX), Preparacion NVARCHAR(MAX));
INSERT INTO @Errores (Descripcion, Esperado, Sql, Preparacion) VALUES
    (N'Movimiento: un cliente → PERMISO_DENEGADO', 50201,
        N'INSERT INTO @L VALUES (@A, 1); EXEC dbo.SP_Inventario_RegistrarMovimiento @Cliente, ''ENTRADA_COMPRA'', NULL, @L;', NULL),
    (N'Movimiento: tipo de venta (no manual) → TIPO_MOVIMIENTO_INVALIDO', 50023,
        N'INSERT INTO @L VALUES (@A, 1); EXEC dbo.SP_Inventario_RegistrarMovimiento @Admin, ''SALIDA_VENTA'', N''x'', @L;', NULL),
    (N'Movimiento: inventario inicial (solo lo genera el alta) → TIPO_MOVIMIENTO_INVALIDO', 50023,
        N'INSERT INTO @L VALUES (@A, 1); EXEC dbo.SP_Inventario_RegistrarMovimiento @Admin, ''INVENTARIO_INICIAL'', NULL, @L;', NULL),
    (N'Movimiento: tipo inexistente → TIPO_MOVIMIENTO_INVALIDO', 50023,
        N'INSERT INTO @L VALUES (@A, 1); EXEC dbo.SP_Inventario_RegistrarMovimiento @Admin, ''REGALO'', NULL, @L;', NULL),
    (N'Ajuste de salida sin motivo → MOTIVO_INVALIDO', 50024,
        N'INSERT INTO @L VALUES (@A, 1); EXEC dbo.SP_Inventario_RegistrarMovimiento @Admin, ''AJUSTE_SALIDA'', NULL, @L;', NULL),
    (N'Ajuste de entrada con motivo en blanco → MOTIVO_INVALIDO', 50024,
        N'INSERT INTO @L VALUES (@A, 1); EXEC dbo.SP_Inventario_RegistrarMovimiento @Admin, ''AJUSTE_ENTRADA'', N''   '', @L;', NULL),
    (N'Movimiento: motivo de 301 caracteres → MOTIVO_INVALIDO', 50024,
        N'INSERT INTO @L VALUES (@A, 1); EXEC dbo.SP_Inventario_RegistrarMovimiento @Admin, ''ENTRADA_COMPRA'', N'''
        + REPLICATE(N'm', 301) + N''', @L;', NULL),
    (N'Movimiento: sin líneas → PARAMETRO_REQUERIDO', 50006,
        N'EXEC dbo.SP_Inventario_RegistrarMovimiento @Admin, ''ENTRADA_COMPRA'', NULL, @L;', NULL),
    (N'Movimiento: cantidad 0 → CANTIDAD_INVALIDA', 50025,
        N'INSERT INTO @L VALUES (@A, 0); EXEC dbo.SP_Inventario_RegistrarMovimiento @Admin, ''ENTRADA_COMPRA'', NULL, @L;', NULL),
    (N'Movimiento: cantidad negativa → CANTIDAD_INVALIDA', 50025,
        N'INSERT INTO @L VALUES (@A, -3); EXEC dbo.SP_Inventario_RegistrarMovimiento @Admin, ''AJUSTE_ENTRADA'', N''x'', @L;', NULL),
    (N'Movimiento: variante inexistente → VARIANTE_NO_ENCONTRADA', 50106,
        N'INSERT INTO @L VALUES (@A, 1), (-1, 1); EXEC dbo.SP_Inventario_RegistrarMovimiento @Admin, ''ENTRADA_COMPRA'', NULL, @L;', NULL),
    (N'Ajuste de salida: más que lo disponible aunque haya físico (toma unidades reservadas) → STOCK_INSUFICIENTE', 51301,
        N'INSERT INTO @L VALUES (@A, 7); EXEC dbo.SP_Inventario_RegistrarMovimiento @Admin, ''AJUSTE_SALIDA'', N''Merma'', @L;', NULL),
    (N'Ajuste de salida: variante sin existencia → STOCK_INSUFICIENTE', 51301,
        N'INSERT INTO @L VALUES (@B, 1); EXEC dbo.SP_Inventario_RegistrarMovimiento @Admin, ''AJUSTE_SALIDA'', N''Merma'', @L;', NULL),
    (N'Ajuste de salida: una línea válida y otra no → STOCK_INSUFICIENTE (no se aplica ninguna)', 51301,
        N'INSERT INTO @L VALUES (@A, 1), (@C, 4); EXEC dbo.SP_Inventario_RegistrarMovimiento @Admin, ''AJUSTE_SALIDA'', N''Merma'', @L;', NULL),
    (N'Ajuste de salida: la reserva vencida no cuenta, se pueden retirar las 6 disponibles (permitido)', 0,
        N'INSERT INTO @L VALUES (@A, 6);
          INSERT INTO #Resultado EXEC dbo.SP_Inventario_RegistrarMovimiento @Admin, ''AJUSTE_SALIDA'', N''Merma'', @L;', NULL),
    (N'Existencias: un cliente → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Inventario_ListarExistencias @Cliente;', NULL),
    (N'Existencias: búsqueda de 101 caracteres → BUSQUEDA_INVALIDA', 50008,
        N'EXEC dbo.SP_Inventario_ListarExistencias @Admin, N''' + REPLICATE(N'b', 101) + N''';', NULL),
    (N'Existencias: tamaño de página 0 → PAGINACION_INVALIDA', 50007,
        N'EXEC dbo.SP_Inventario_ListarExistencias @Admin, NULL, NULL, 0, 1, 0, @Total OUTPUT;', NULL),
    (N'Kardex: fecha inicial igual a la final → RANGO_FECHAS_INVALIDO', 50026,
        N'EXEC dbo.SP_Inventario_ListarKardex @Admin, NULL, NULL, ''2026-10-01'', ''2026-10-01'';', NULL),
    (N'Kardex: tipo inexistente → TIPO_MOVIMIENTO_INVALIDO', 50023,
        N'EXEC dbo.SP_Inventario_ListarKardex @Admin, NULL, ''REGALO'';', NULL),
    (N'Kardex: variante inexistente → VARIANTE_NO_ENCONTRADA', 50106,
        N'EXEC dbo.SP_Inventario_ListarKardex @Admin, -1;', NULL),
    (N'Kardex: un cliente → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Inventario_ListarKardex @Cliente;', NULL),
    (N'Conciliación: un cliente → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Inventario_Conciliar @Cliente;', NULL);

DECLARE @Orden INT = 1, @Descripcion NVARCHAR(300), @Esperado INT, @Sql NVARCHAR(MAX), @Preparacion NVARCHAR(MAX);
WHILE @Orden <= (SELECT MAX(Orden) FROM @Errores)
BEGIN
    SELECT @Descripcion = Descripcion, @Esperado = Esperado, @Sql = @D + Sql, @Preparacion = Preparacion
    FROM @Errores WHERE Orden = @Orden;
    EXEC #EsperarError @Descripcion, @Esperado, @Sql, @Preparacion;
    SET @Orden += 1;
END;

/* Ningún caso dejó datos: todos se revirtieron. */
SET @Texto = (SELECT CONCAT((SELECT COUNT(*) FROM dbo.Variante WHERE SKU LIKE 'INV-PRUEBA-%'), N'|',
                            (SELECT COUNT(*) FROM dbo.Usuario WHERE Correo LIKE N'%.inventario@shopcart.test')));
EXEC #Verificar N'Limpieza: no quedan datos de prueba', N'0|0', @Texto;

/* --- Resultado ---------------------------------------------------------------------------- */
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = NULL;

IF CAST(SESSION_CONTEXT(N'PruebasFallidas') AS INT) > 0
    THROW 50000, N'Pruebas de procedimientos de inventario fallidas.', 1;
EXEC sys.sp_set_session_context @key = N'PruebasFallidas', @value = NULL;
GO
