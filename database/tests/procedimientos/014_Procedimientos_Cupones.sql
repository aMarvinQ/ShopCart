/*
    014_Procedimientos_Cupones.sql
    Se ejecuta conectado como shopcart_migrator (deploy.ps1 -Probar). Mismo esquema que
    009–013: el migrador prepara los datos y ejecuta cada SP haciéndose pasar por un miembro
    de RolApi; los casos de error usan #EsperarError. Los códigos de prueba empiezan con CUP-PRUEBA.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT OFF;
GO

-- Permite ejecutar el script varias veces en la misma conexión (p. ej. en SSMS).
DROP TABLE IF EXISTS #Contexto, #Base, #Cupon, #Lista, #Carrito, #Version;
DROP PROCEDURE IF EXISTS #Verificar;
DROP PROCEDURE IF EXISTS #Preparar;
DROP PROCEDURE IF EXISTS #EsperarError;
GO

CREATE TABLE #Contexto (UsuarioApi SYSNAME NOT NULL);
-- Versión de un cupón para los casos de edición: la lee el migrador (la API no puede consultar tablas).
CREATE TABLE #Version (Version BINARY(8));
CREATE TABLE #Base (IDAdmin INT, IDOperador INT, IDCliente INT, IDRopa INT, IDHogar INT, IDInactiva INT, IDR INT, IDH INT,
                    IDDiez INT, IDUsado INT);

-- Resultados de los SPs (misma forma que devuelven).
CREATE TABLE #Cupon (IDCupon INT, Codigo VARCHAR(30), Descripcion NVARCHAR(300), TipoDescuento VARCHAR(12), Valor DECIMAL(12, 2),
                     MontoMinimo DECIMAL(12, 2), FechaInicio DATETIME2(3), FechaFin DATETIME2(3), LimiteUsosTotal INT,
                     LimiteUsosPorCliente INT, UsosActuales INT, IDCategoria INT, Categoria NVARCHAR(100), SoloRegistrados BIT,
                     Activo BIT, Situacion VARCHAR(11), MontoDescontado DECIMAL(12, 2), TerminosBloqueados BIT,
                     FechaCreacion DATETIME2(3), FechaModificacion DATETIME2(3), VersionFila BINARY(8));
CREATE TABLE #Lista (IDCupon INT, Codigo VARCHAR(30), Descripcion NVARCHAR(300), TipoDescuento VARCHAR(12), Valor DECIMAL(12, 2),
                     MontoMinimo DECIMAL(12, 2), FechaInicio DATETIME2(3), FechaFin DATETIME2(3), LimiteUsosTotal INT,
                     LimiteUsosPorCliente INT, UsosActuales INT, IDCategoria INT, Categoria NVARCHAR(100), SoloRegistrados BIT,
                     Activo BIT, Situacion VARCHAR(11));
CREATE TABLE #Carrito (IDCarrito INT, MaximoPorLinea INT, CantidadArticulos INT, Subtotal DECIMAL(12, 2), Descuento DECIMAL(12, 2),
                       Total DECIMAL(12, 2), PuedeComprar BIT, Cupon NVARCHAR(MAX), Items NVARCHAR(MAX));
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
    - Roles; MAXIMO_UNIDADES_POR_LINEA = 5; un administrador, un operador y un cliente.
    - Categorías Ropa y Hogar (activas) e Inactiva. R: camisa de Ropa a 100.00; H: taza de Hogar a 50.00.
    - Cupones: DIEZ (10 %), MIN (Q30 desde Q300), ROPA (20 % solo Ropa), REG (5 %, solo registrados),
      VENC (vencido), PROG (programado), AGOT (límite total alcanzado), INAC (desactivado) y
      USADO (10 %, 2 usos de 5, uno por cliente, ya usado por el cliente en un pedido de Q10.00).
*/
CREATE PROCEDURE #Preparar
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Hash VARCHAR(255) = '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA';
    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @IDAdmin INT, @IDOperador INT, @IDCliente INT, @IDRopa INT, @IDHogar INT, @IDInactiva INT, @IDCamisa INT, @IDTaza INT,
            @IDR INT, @IDH INT, @IDDiez INT, @IDUsado INT, @IDMetodoEnvio INT, @IDEstado TINYINT, @IDCarrito INT, @IDCheckout BIGINT,
            @IDPedido INT;

    INSERT INTO dbo.Rol (IDRol, Codigo, Nombre)
    SELECT v.IDRol, v.Codigo, v.Nombre
    FROM (VALUES (201, 'CLIENTE', N'Cliente'), (202, 'OPERADOR', N'Operador'), (203, 'ADMIN', N'Administrador'))
         AS v (IDRol, Codigo, Nombre)
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Rol AS r WHERE r.Codigo = v.Codigo);

    UPDATE dbo.Parametro SET Valor = N'5' WHERE Clave = 'MAXIMO_UNIDADES_POR_LINEA';
    INSERT INTO dbo.Parametro (IDParametro, Clave, Valor, TipoDato, Descripcion)
    SELECT 210, 'MAXIMO_UNIDADES_POR_LINEA', N'5', 'ENTERO', N'Prueba'
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Parametro WHERE Clave = 'MAXIMO_UNIDADES_POR_LINEA');

    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'admin.cupones@shopcart.test', @Hash, N'Admin', N'Cupones' FROM dbo.Rol AS r WHERE r.Codigo = 'ADMIN';
    SET @IDAdmin = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'operador.cupones@shopcart.test', @Hash, N'Operador', N'Cupones' FROM dbo.Rol AS r WHERE r.Codigo = 'OPERADOR';
    SET @IDOperador = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'cliente.cupones@shopcart.test', @Hash, N'Cliente', N'Cupones' FROM dbo.Rol AS r WHERE r.Codigo = 'CLIENTE';
    SET @IDCliente = SCOPE_IDENTITY();

    INSERT INTO dbo.Categoria (Nombre, Slug) VALUES (N'Ropa Cupones Prueba', 'ropa-cupones-prueba');
    SET @IDRopa = SCOPE_IDENTITY();
    INSERT INTO dbo.Categoria (Nombre, Slug) VALUES (N'Hogar Cupones Prueba', 'hogar-cupones-prueba');
    SET @IDHogar = SCOPE_IDENTITY();
    INSERT INTO dbo.Categoria (Nombre, Slug, Activo) VALUES (N'Inactiva Cupones Prueba', 'inactiva-cupones-prueba', 0);
    SET @IDInactiva = SCOPE_IDENTITY();

    INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug, Activo) VALUES (@IDRopa, N'Camisa Cupones Prueba', 'camisa-cupones-prueba', 1);
    SET @IDCamisa = SCOPE_IDENTITY();
    INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug, Activo) VALUES (@IDHogar, N'Taza Cupones Prueba', 'taza-cupones-prueba', 1);
    SET @IDTaza = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica) VALUES (@IDCamisa, 'CUP-PRUEBA-R', 100.00, 10);
    SET @IDR = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica) VALUES (@IDTaza, 'CUP-PRUEBA-H', 50.00, 10);
    SET @IDH = SCOPE_IDENTITY();

    INSERT INTO dbo.Cupon (Codigo, Descripcion, TipoDescuento, Valor, MontoMinimo, FechaInicio, FechaFin,
                           LimiteUsosTotal, LimiteUsosPorCliente, UsosActuales, IDCategoria, SoloRegistrados, Activo)
    VALUES ('CUP-PRUEBA-DIEZ', N'Diez por ciento', 'PORCENTAJE', 10, 0, DATEADD(DAY, -1, @Ahora), DATEADD(DAY, 30, @Ahora), NULL, NULL, 0, NULL, 0, 1),
           ('CUP-PRUEBA-MIN', N'Q30 desde Q300', 'MONTO_FIJO', 30, 300, DATEADD(DAY, -1, @Ahora), DATEADD(DAY, 30, @Ahora), NULL, NULL, 0, NULL, 0, 1),
           ('CUP-PRUEBA-ROPA', N'Veinte por ciento en ropa', 'PORCENTAJE', 20, 0, DATEADD(DAY, -1, @Ahora), DATEADD(DAY, 30, @Ahora), NULL, NULL, 0, @IDRopa, 0, 1),
           ('CUP-PRUEBA-REG', N'Solo registrados', 'PORCENTAJE', 5, 0, DATEADD(DAY, -1, @Ahora), DATEADD(DAY, 30, @Ahora), NULL, NULL, 0, NULL, 1, 1),
           ('CUP-PRUEBA-VENC', N'Vencido', 'PORCENTAJE', 10, 0, DATEADD(DAY, -10, @Ahora), DATEADD(DAY, -1, @Ahora), NULL, NULL, 0, NULL, 0, 1),
           ('CUP-PRUEBA-PROG', N'Programado', 'PORCENTAJE', 10, 0, DATEADD(DAY, 1, @Ahora), DATEADD(DAY, 10, @Ahora), NULL, NULL, 0, NULL, 0, 1),
           ('CUP-PRUEBA-AGOT', N'Agotado', 'PORCENTAJE', 10, 0, DATEADD(DAY, -1, @Ahora), DATEADD(DAY, 30, @Ahora), 1, NULL, 1, NULL, 0, 1),
           ('CUP-PRUEBA-INAC', N'Inactivo', 'PORCENTAJE', 10, 0, DATEADD(DAY, -1, @Ahora), DATEADD(DAY, 30, @Ahora), NULL, NULL, 0, NULL, 0, 0),
           ('CUP-PRUEBA-USADO', N'Usado', 'PORCENTAJE', 10, 0, DATEADD(DAY, -1, @Ahora), DATEADD(DAY, 30, @Ahora), 5, 1, 2, NULL, 0, 1);
    SELECT @IDDiez = IDCupon FROM dbo.Cupon WHERE Codigo = 'CUP-PRUEBA-DIEZ';
    SELECT @IDUsado = IDCupon FROM dbo.Cupon WHERE Codigo = 'CUP-PRUEBA-USADO';

    -- Pedido pagado del cliente con el cupón USADO (Q100 − Q10 + Q25 de envío).
    INSERT INTO dbo.Departamento (IDDepartamento, Nombre)
    SELECT 210, N'Departamento Cupones Prueba' WHERE NOT EXISTS (SELECT 1 FROM dbo.Departamento WHERE IDDepartamento = 210);
    INSERT INTO dbo.MetodoEnvio (Nombre, Costo, DiasEstimadosMin, DiasEstimadosMax) VALUES (N'Envío Cupones Prueba', 25.00, 1, 3);
    SET @IDMetodoEnvio = SCOPE_IDENTITY();
    SELECT TOP (1) @IDEstado = IDEstadoPedido FROM dbo.EstadoPedido WHERE EsInicial = 1 ORDER BY IDEstadoPedido;
    IF @IDEstado IS NULL
    BEGIN
        INSERT INTO dbo.EstadoPedido (IDEstadoPedido, Codigo, Nombre, Orden, EsInicial, CuentaComoVenta)
        VALUES (210, 'PRUEBA_CUPONES', N'Pagado (prueba)', 1, 1, 1);
        SET @IDEstado = 210;
    END;
    INSERT INTO dbo.Carrito (IDUsuario, Estado) VALUES (@IDCliente, 'CONVERTIDO');
    SET @IDCarrito = SCOPE_IDENTITY();
    INSERT INTO dbo.Checkout (IDCarrito, IDUsuario, ClaveIdempotencia, CorreoContacto, NombreContacto, TelefonoContacto,
                              EnvioNombre, EnvioTelefono, EnvioLinea1, EnvioMunicipio, IDDepartamento, IDMetodoEnvio, IDCupon,
                              Subtotal, Descuento, CostoEnvio, Total, Estado, FechaExpiracion, FechaCierre)
    VALUES (@IDCarrito, @IDCliente, NEWID(), N'cliente.cupones@shopcart.test', N'Cliente Cupones', '5555-1234',
            N'Cliente Cupones', '5555-1234', N'1a calle 1-23 zona 1', N'Guatemala', 210, @IDMetodoEnvio, @IDUsado,
            100.00, 10.00, 25.00, 115.00, 'COMPLETADO', DATEADD(MINUTE, 15, @Ahora), @Ahora);
    SET @IDCheckout = SCOPE_IDENTITY();
    INSERT INTO dbo.CheckoutDetalle (IDCheckout, IDVariante, Cantidad, PrecioUnitario, DescuentoLinea)
    VALUES (@IDCheckout, @IDR, 1, 100.00, 10.00);
    EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDAdmin;
    INSERT INTO dbo.Pedido (IDCheckout, IDUsuario, CorreoContacto, NombreContacto, TelefonoContacto, TokenSeguimientoHash,
                            IDEstadoPedido, EnvioNombre, EnvioTelefono, EnvioLinea1, EnvioMunicipio, IDDepartamento,
                            IDMetodoEnvio, NombreMetodoEnvio, IDCupon, CodigoCupon,
                            Subtotal, Descuento, CostoEnvio, Total, BaseImponible, IVA)
    VALUES (@IDCheckout, @IDCliente, N'cliente.cupones@shopcart.test', N'Cliente Cupones', '5555-1234',
            HASHBYTES('SHA2_256', CONVERT(VARCHAR(36), NEWID())),
            @IDEstado, N'Cliente Cupones', '5555-1234', N'1a calle 1-23 zona 1', N'Guatemala', 210,
            @IDMetodoEnvio, N'Envío Cupones Prueba', @IDUsado, 'CUP-PRUEBA-USADO',
            100.00, 10.00, 25.00, 115.00, 102.68, 12.32);
    SET @IDPedido = SCOPE_IDENTITY();
    EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = NULL;
    INSERT INTO dbo.CuponUso (IDCupon, IDPedido, IDUsuario, CorreoCliente, MontoDescontado)
    VALUES (@IDUsado, @IDPedido, @IDCliente, N'cliente.cupones@shopcart.test', 10.00);

    DELETE FROM #Base;
    INSERT INTO #Base VALUES (@IDAdmin, @IDOperador, @IDCliente, @IDRopa, @IDHogar, @IDInactiva, @IDR, @IDH, @IDDiez, @IDUsado);
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
    DELETE FROM #Cupon;
    DELETE FROM #Carrito;

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
DECLARE @IDAdmin INT, @IDCliente INT, @IDRopa INT, @IDR INT, @IDH INT, @IDDiez INT, @IDUsado INT, @IDNuevo INT, @Total INT;
DECLARE @Texto NVARCHAR(400), @Version BINARY(8), @Inicio DATETIME2(3), @Fin DATETIME2(3);
DECLARE @Token VARBINARY(64) = HASHBYTES('SHA2_256', 'invitado-cupones');

BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDAdmin = IDAdmin, @IDCliente = IDCliente, @IDRopa = IDRopa, @IDR = IDR, @IDH = IDH, @IDDiez = IDDiez, @IDUsado = IDUsado
FROM #Base;
SELECT @Inicio = DATEADD(HOUR, -1, SYSUTCDATETIME()), @Fin = DATEADD(DAY, 30, SYSUTCDATETIME());

/* === Administración ====================================================================== */
EXECUTE AS USER = @Api;
INSERT INTO #Cupon EXEC dbo.SP_Cupones_Crear @IDAdmin, ' cup-prueba-nuevo ', N'  Quince por ciento en ropa  ', ' porcentaje ', 15, 100,
                                             @Inicio, @Fin, 100, 2, @IDRopa, 1;
REVERT;
SELECT @IDNuevo = IDCupon, @Version = VersionFila FROM #Cupon;
SET @Texto = (SELECT CONCAT(Codigo, N'|', Descripcion, N'|', TipoDescuento, N':', Valor, N'|', MontoMinimo, N'|', LimiteUsosTotal, N'/',
                            LimiteUsosPorCliente, N'|', Categoria, N'|', CAST(SoloRegistrados AS INT), CAST(Activo AS INT), N'|', Situacion,
                            N'|', UsosActuales, N':', MontoDescontado, N':', CAST(TerminosBloqueados AS INT)) FROM #Cupon);
SET @Texto += N'|' + (SELECT CONCAT(COUNT(*), N':', MAX(Accion), N':', MAX(JSON_VALUE(ValorNuevo, '$.Codigo'))) FROM dbo.Bitacora
                      WHERE Modulo = 'CUPONES' AND IDEntidad = CAST(@IDNuevo AS VARCHAR(50)));
EXEC #Verificar N'Crear: normaliza código y tipo a mayúsculas, recorta la descripción, queda vigente y en bitácora',
     N'CUP-PRUEBA-NUEVO|Quince por ciento en ropa|PORCENTAJE:15.00|100.00|100/2|Ropa Cupones Prueba|11|VIGENTE|0:0.00:0|1:CREAR:CUP-PRUEBA-NUEVO',
     @Texto;

-- Guardar los mismos valores no es un cambio.
DELETE FROM #Cupon;
EXECUTE AS USER = @Api;
INSERT INTO #Cupon EXEC dbo.SP_Cupones_Actualizar @IDAdmin, @IDNuevo, 'CUP-PRUEBA-NUEVO', N'Quince por ciento en ropa', 'PORCENTAJE', 15, 100,
                                                  @Inicio, @Fin, 100, 2, @IDRopa, 1, @Version;
REVERT;
SET @Texto = CONCAT(CASE WHEN (SELECT VersionFila FROM #Cupon) = @Version THEN N'misma versión' ELSE N'otra versión' END, N'|',
                    (SELECT COUNT(*) FROM dbo.Bitacora WHERE Modulo = 'CUPONES' AND IDEntidad = CAST(@IDNuevo AS VARCHAR(50))));
EXEC #Verificar N'Actualizar con los mismos valores: no modifica ni registra en bitácora', N'misma versión|1', @Texto;

DELETE FROM #Cupon;
EXECUTE AS USER = @Api;
INSERT INTO #Cupon EXEC dbo.SP_Cupones_Actualizar @IDAdmin, @IDNuevo, 'CUP-PRUEBA-NUEVO', N'Veinte por ciento en ropa', 'PORCENTAJE', 20, 100,
                                                  @Inicio, @Fin, 100, 2, NULL, 0, @Version;
REVERT;
SET @Texto = (SELECT CONCAT(Valor, N'|', ISNULL(Categoria, N'todo el carrito'), N'|', CAST(SoloRegistrados AS INT)) FROM #Cupon);
SET @Texto += N'|' + (SELECT CONCAT(JSON_VALUE(ValorAnterior, '$.Valor'), N'>', JSON_VALUE(ValorNuevo, '$.Valor'), N':',
                                    ISNULL(JSON_VALUE(ValorNuevo, '$.IDCategoria'), N'null'))
                      FROM dbo.Bitacora WHERE Modulo = 'CUPONES' AND Accion = 'MODIFICAR' AND IDEntidad = CAST(@IDNuevo AS VARCHAR(50)));
EXEC #Verificar N'Actualizar un cupón sin usos: cambia valor y categoría; la bitácora guarda antes y después',
     N'20.00|todo el carrito|0|15.00>20.00:null', @Texto;

-- Un cupón usado acepta cambios de descripción y límites (no de sus términos).
SET @Version = (SELECT VersionFila FROM dbo.Cupon WHERE IDCupon = @IDUsado);
DELETE FROM #Cupon;
EXECUTE AS USER = @Api;
INSERT INTO #Cupon EXEC dbo.SP_Cupones_Actualizar @IDAdmin, @IDUsado, 'cup-prueba-usado', N'Usado, ampliado', 'PORCENTAJE', 10, 0,
                                                  @Inicio, @Fin, 2, NULL, NULL, 0, @Version;
REVERT;
SET @Texto = (SELECT CONCAT(Descripcion, N'|', LimiteUsosTotal, N'/', ISNULL(CAST(LimiteUsosPorCliente AS NVARCHAR(10)), N'sin límite'),
                            N'|', UsosActuales, N'|', Situacion, N'|', MontoDescontado, N'|', CAST(TerminosBloqueados AS INT)) FROM #Cupon);
EXEC #Verificar N'Actualizar un cupón usado: descripción y límites (hasta sus 2 usos); queda agotado y con términos bloqueados',
     N'Usado, ampliado|2/sin límite|2|AGOTADO|10.00|1', @Texto;

DELETE FROM #Cupon;
EXECUTE AS USER = @Api;
INSERT INTO #Cupon EXEC dbo.SP_Cupones_CambiarEstado @IDAdmin, @IDNuevo, 0;
DELETE FROM #Cupon;
INSERT INTO #Cupon EXEC dbo.SP_Cupones_CambiarEstado @IDAdmin, @IDNuevo, 0;
REVERT;
SET @Texto = (SELECT CONCAT(CAST(Activo AS INT), N'|', Situacion) FROM #Cupon);
SET @Texto += N'|' + (SELECT STRING_AGG(Accion, ',') WITHIN GROUP (ORDER BY IDBitacora) FROM dbo.Bitacora
                      WHERE Modulo = 'CUPONES' AND IDEntidad = CAST(@IDNuevo AS VARCHAR(50)));
EXEC #Verificar N'Desactivar: queda inactivo; repetirlo no registra de nuevo', N'0|INACTIVO|CREAR,MODIFICAR,DESACTIVAR', @Texto;

EXECUTE AS USER = @Api;
INSERT INTO #Lista EXEC dbo.SP_Cupones_Listar @IDAdmin, N'cup-prueba', NULL, 1, 20, @Total OUTPUT;
REVERT;
SET @Texto = CONCAT(@Total, N'|', (SELECT STRING_AGG(CONCAT(REPLACE(Codigo, 'CUP-PRUEBA-', ''), N':', Situacion), N',')
                                          WITHIN GROUP (ORDER BY Codigo) FROM #Lista));
EXEC #Verificar N'Listar: situación de cada cupón',
     N'10|AGOT:AGOTADO,DIEZ:VIGENTE,INAC:INACTIVO,MIN:VIGENTE,NUEVO:INACTIVO,PROG:PROGRAMADO,REG:VIGENTE,ROPA:VIGENTE,USADO:AGOTADO,VENC:VENCIDO',
     @Texto;

DELETE FROM #Lista;
EXECUTE AS USER = @Api;
INSERT INTO #Lista EXEC dbo.SP_Cupones_Listar @IDAdmin, N'CUP-PRUEBA', ' agotado ', 1, 1, @Total OUTPUT;
REVERT;
SET @Texto = CONCAT(@Total, N'|', (SELECT STRING_AGG(Codigo, ',') FROM #Lista));
EXEC #Verificar N'Listar: por situación, paginado y del más reciente al más antiguo', N'2|CUP-PRUEBA-USADO', @Texto;

/* === Cupón en el carrito ================================================================= */
EXECUTE AS USER = @Api;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @IDCliente, @IDVariante = @IDR, @Cantidad = 2;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @IDCliente, @IDVariante = @IDH, @Cantidad = 1;
DELETE FROM #Carrito;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AplicarCupon @IDUsuario = @IDCliente, @Codigo = ' cup-prueba-diez ';
REVERT;
SET @Texto = (SELECT CONCAT(Subtotal, N'-', Descuento, N'=', Total, N'|', CAST(PuedeComprar AS INT), N'|', JSON_VALUE(Cupon, '$.Codigo'), N':',
                            JSON_VALUE(Cupon, '$.Aplicable'), N':', ISNULL(JSON_VALUE(Cupon, '$.CodigoError'), N'sin error')) FROM #Carrito);
DELETE FROM #Carrito;
EXEC #Verificar N'Aplicar: 10 % sobre Q250, sin distinguir mayúsculas', N'250.00-25.00=225.00|1|CUP-PRUEBA-DIEZ:true:sin error', @Texto;

EXECUTE AS USER = @Api;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AplicarCupon @IDUsuario = @IDCliente, @Codigo = 'CUP-PRUEBA-ROPA';
REVERT;
SET @Texto = (SELECT CONCAT(Subtotal, N'-', Descuento, N'=', Total, N'|', JSON_VALUE(Cupon, '$.Codigo')) FROM #Carrito);
DELETE FROM #Carrito;
EXEC #Verificar N'Aplicar otro: reemplaza al anterior; el de categoría descuenta solo la ropa (20 % de Q200)',
     N'250.00-40.00=210.00|CUP-PRUEBA-ROPA', @Texto;

-- Q30 desde Q300: con Q350 aplica; si el carrito baja a Q150 deja de aplicar sin quitarse.
EXECUTE AS USER = @Api;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @IDCliente, @IDVariante = @IDR, @Cantidad = 1;
DELETE FROM #Carrito;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AplicarCupon @IDUsuario = @IDCliente, @Codigo = 'CUP-PRUEBA-MIN';
REVERT;
SET @Texto = (SELECT CONCAT(Subtotal, N'-', Descuento, N'=', Total) FROM #Carrito);
DELETE FROM #Carrito;
EXECUTE AS USER = @Api;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_ActualizarCantidad @IDUsuario = @IDCliente, @IDVariante = @IDR, @Cantidad = 1;
REVERT;
SET @Texto += N'|' + (SELECT CONCAT(Subtotal, N'-', Descuento, N'=', Total, N'|', CAST(PuedeComprar AS INT), N'|',
                                    JSON_VALUE(Cupon, '$.Aplicable'), N':', JSON_VALUE(Cupon, '$.CodigoError'), N':',
                                    JSON_VALUE(Cupon, '$.MontoFaltante')) FROM #Carrito);
DELETE FROM #Carrito;
EXEC #Verificar N'Monto mínimo: aplica con Q350; al bajar a Q150 el cupón queda sin efecto, con lo que falta, y no se puede comprar',
     N'350.00-30.00=320.00|150.00-0.00=150.00|0|false:CUPON_MONTO_MINIMO:150.00', @Texto;

EXECUTE AS USER = @Api;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_QuitarCupon @IDUsuario = @IDCliente;
DELETE FROM #Carrito;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_QuitarCupon @IDUsuario = @IDCliente;
REVERT;
SET @Texto = (SELECT CONCAT(Subtotal, N'-', Descuento, N'=', Total, N'|', CAST(PuedeComprar AS INT), N'|', ISNULL(Cupon, N'sin cupón')) FROM #Carrito);
DELETE FROM #Carrito;
EXEC #Verificar N'Quitar cupón: vuelve a poder comprar; repetirlo no es error', N'150.00-0.00=150.00|1|sin cupón', @Texto;

-- El administrador desactiva un cupón que el cliente tiene aplicado.
EXECUTE AS USER = @Api;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AplicarCupon @IDUsuario = @IDCliente, @Codigo = 'CUP-PRUEBA-DIEZ';
INSERT INTO #Cupon EXEC dbo.SP_Cupones_CambiarEstado @IDAdmin, @IDDiez, 0;
DELETE FROM #Carrito;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_Obtener @IDUsuario = @IDCliente;
REVERT;
SET @Texto = (SELECT CONCAT(Descuento, N'|', CAST(PuedeComprar AS INT), N'|', JSON_VALUE(Cupon, '$.CodigoError')) FROM #Carrito);
DELETE FROM #Carrito;
EXEC #Verificar N'Cupón desactivado después de aplicarlo: sigue en el carrito sin descuento y bloquea la compra',
     N'0.00|0|CUPON_INVALIDO', @Texto;
ROLLBACK TRANSACTION;

/* === Casos de error ====================================================================== */
DECLARE @D NVARCHAR(MAX) = N'
DECLARE @Admin INT, @Operador INT, @Cliente INT, @Ropa INT, @Inactiva INT, @R INT, @H INT, @Diez INT, @Usado INT, @V BINARY(8);
DECLARE @Token VARBINARY(64) = HASHBYTES(''SHA2_256'', ''invitado-error''), @Ini DATETIME2(3) = DATEADD(HOUR, -1, SYSUTCDATETIME()),
        @Fin DATETIME2(3) = DATEADD(DAY, 30, SYSUTCDATETIME());
SELECT @Admin = IDAdmin, @Operador = IDOperador, @Cliente = IDCliente, @Ropa = IDRopa, @Inactiva = IDInactiva, @R = IDR, @H = IDH,
       @Diez = IDDiez, @Usado = IDUsado FROM #Base;
';
DECLARE @Crear NVARCHAR(MAX) = N'EXEC dbo.SP_Cupones_Crear @Admin, ';

DECLARE @Errores TABLE (Orden INT IDENTITY, Descripcion NVARCHAR(300), Esperado INT, Sql NVARCHAR(MAX), Preparacion NVARCHAR(MAX));
INSERT INTO @Errores (Descripcion, Esperado, Sql, Preparacion) VALUES
    (N'Crear: un operador → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Cupones_Crear @Operador, ''CUP-PRUEBA-X'', N''x'', ''PORCENTAJE'', 10, 0, @Ini, @Fin;', NULL),
    (N'Crear: código de 2 caracteres → CODIGO_CUPON_INVALIDO', 50028,
        @Crear + N'''AB'', N''x'', ''PORCENTAJE'', 10, 0, @Ini, @Fin;', NULL),
    (N'Crear: código con espacio → CODIGO_CUPON_INVALIDO', 50028,
        @Crear + N'''CUP PRUEBA'', N''x'', ''PORCENTAJE'', 10, 0, @Ini, @Fin;', NULL),
    (N'Crear: código con ñ → CODIGO_CUPON_INVALIDO', 50028,
        @Crear + N'''CUP-PRUEBA-AÑO'', N''x'', ''PORCENTAJE'', 10, 0, @Ini, @Fin;', NULL),
    (N'Crear: código de 31 caracteres → CODIGO_CUPON_INVALIDO', 50028,
        @Crear + N'''' + REPLICATE(N'C', 31) + N''', N''x'', ''PORCENTAJE'', 10, 0, @Ini, @Fin;', NULL),
    (N'Crear: descripción en blanco → DESCRIPCION_INVALIDA', 50010,
        @Crear + N'''CUP-PRUEBA-X'', N''   '', ''PORCENTAJE'', 10, 0, @Ini, @Fin;', NULL),
    (N'Crear: descripción de 301 caracteres → DESCRIPCION_INVALIDA', 50010,
        @Crear + N'''CUP-PRUEBA-X'', N''' + REPLICATE(N'd', 301) + N''', ''PORCENTAJE'', 10, 0, @Ini, @Fin;', NULL),
    (N'Crear: tipo inexistente → TIPO_DESCUENTO_INVALIDO', 50029,
        @Crear + N'''CUP-PRUEBA-X'', N''x'', ''REGALO'', 10, 0, @Ini, @Fin;', NULL),
    (N'Crear: valor 0 → VALOR_DESCUENTO_INVALIDO', 50030,
        @Crear + N'''CUP-PRUEBA-X'', N''x'', ''MONTO_FIJO'', 0, 0, @Ini, @Fin;', NULL),
    (N'Crear: porcentaje de 101 → VALOR_DESCUENTO_INVALIDO', 50030,
        @Crear + N'''CUP-PRUEBA-X'', N''x'', ''PORCENTAJE'', 101, 0, @Ini, @Fin;', NULL),
    (N'Crear: monto mínimo negativo → MONTO_MINIMO_INVALIDO', 50031,
        @Crear + N'''CUP-PRUEBA-X'', N''x'', ''PORCENTAJE'', 10, -1, @Ini, @Fin;', NULL),
    (N'Crear: fin antes del inicio → RANGO_FECHAS_INVALIDO', 50026,
        @Crear + N'''CUP-PRUEBA-X'', N''x'', ''PORCENTAJE'', 10, 0, @Fin, @Ini;', NULL),
    (N'Crear: sin fecha de inicio → RANGO_FECHAS_INVALIDO', 50026,
        @Crear + N'''CUP-PRUEBA-X'', N''x'', ''PORCENTAJE'', 10, 0, NULL, @Fin;', NULL),
    (N'Crear: cupón que ya venció → RANGO_FECHAS_INVALIDO', 50026,
        @Crear + N'''CUP-PRUEBA-X'', N''x'', ''PORCENTAJE'', 10, 0, ''2020-01-01'', ''2020-02-01'';', NULL),
    (N'Crear: límite total 0 → LIMITE_USOS_INVALIDO', 50032,
        @Crear + N'''CUP-PRUEBA-X'', N''x'', ''PORCENTAJE'', 10, 0, @Ini, @Fin, 0;', NULL),
    (N'Crear: límite por cliente mayor que el total → LIMITE_USOS_INVALIDO', 50032,
        @Crear + N'''CUP-PRUEBA-X'', N''x'', ''PORCENTAJE'', 10, 0, @Ini, @Fin, 5, 6;', NULL),
    (N'Crear: categoría inactiva → CATEGORIA_NO_ENCONTRADA', 50102,
        @Crear + N'''CUP-PRUEBA-X'', N''x'', ''PORCENTAJE'', 10, 0, @Ini, @Fin, NULL, NULL, @Inactiva;', NULL),
    (N'Crear: categoría inexistente → CATEGORIA_NO_ENCONTRADA', 50102,
        @Crear + N'''CUP-PRUEBA-X'', N''x'', ''PORCENTAJE'', 10, 0, @Ini, @Fin, NULL, NULL, -1;', NULL),
    (N'Crear: código existente en minúsculas → CODIGO_REGISTRADO', 51410,
        @Crear + N'''cup-prueba-diez'', N''x'', ''PORCENTAJE'', 10, 0, @Ini, @Fin;', NULL),
    (N'Actualizar: sin versión → PARAMETRO_REQUERIDO', 50006,
        N'EXEC dbo.SP_Cupones_Actualizar @Admin, @Diez, ''CUP-PRUEBA-DIEZ'', N''x'', ''PORCENTAJE'', 10, 0, @Ini, @Fin, NULL, NULL, NULL, 0, NULL;', NULL),
    (N'Actualizar: versión desactualizada → EDICION_CONCURRENTE', 51203,
        N'EXEC dbo.SP_Cupones_Actualizar @Admin, @Diez, ''CUP-PRUEBA-DIEZ'', N''x'', ''PORCENTAJE'', 10, 0, @Ini, @Fin, NULL, NULL, NULL, 0, 0x0000000000000001;', NULL),
    (N'Actualizar: cupón inexistente → CUPON_NO_ENCONTRADO', 50110,
        N'EXEC dbo.SP_Cupones_Actualizar @Admin, -1, ''CUP-PRUEBA-DIEZ'', N''x'', ''PORCENTAJE'', 10, 0, @Ini, @Fin, NULL, NULL, NULL, 0, 0x0000000000000001;', NULL),
    (N'Actualizar: código de otro cupón → CODIGO_REGISTRADO', 51410,
        N'SET @V = (SELECT Version FROM #Version);
          EXEC dbo.SP_Cupones_Actualizar @Admin, @Diez, ''CUP-PRUEBA-MIN'', N''x'', ''PORCENTAJE'', 10, 0, @Ini, @Fin, NULL, NULL, NULL, 0, @V;',
        N'DELETE FROM #Version; INSERT INTO #Version SELECT VersionFila FROM dbo.Cupon WHERE Codigo = ''CUP-PRUEBA-DIEZ'';'),
    (N'Actualizar: cupón usado, cambia el valor → CUPON_CON_USOS', 51411,
        N'SET @V = (SELECT Version FROM #Version);
          EXEC dbo.SP_Cupones_Actualizar @Admin, @Usado, ''CUP-PRUEBA-USADO'', N''Usado'', ''PORCENTAJE'', 15, 0, @Ini, @Fin, 5, 1, NULL, 0, @V;',
        N'DELETE FROM #Version; INSERT INTO #Version SELECT VersionFila FROM dbo.Cupon WHERE Codigo = ''CUP-PRUEBA-USADO'';'),
    (N'Actualizar: cupón usado, cambia el código → CUPON_CON_USOS', 51411,
        N'SET @V = (SELECT Version FROM #Version);
          EXEC dbo.SP_Cupones_Actualizar @Admin, @Usado, ''CUP-PRUEBA-USADO2'', N''Usado'', ''PORCENTAJE'', 10, 0, @Ini, @Fin, 5, 1, NULL, 0, @V;',
        N'DELETE FROM #Version; INSERT INTO #Version SELECT VersionFila FROM dbo.Cupon WHERE Codigo = ''CUP-PRUEBA-USADO'';'),
    (N'Actualizar: cupón usado, cambia la categoría → CUPON_CON_USOS', 51411,
        N'SET @V = (SELECT Version FROM #Version);
          EXEC dbo.SP_Cupones_Actualizar @Admin, @Usado, ''CUP-PRUEBA-USADO'', N''Usado'', ''PORCENTAJE'', 10, 0, @Ini, @Fin, 5, 1, @Ropa, 0, @V;',
        N'DELETE FROM #Version; INSERT INTO #Version SELECT VersionFila FROM dbo.Cupon WHERE Codigo = ''CUP-PRUEBA-USADO'';'),
    (N'Actualizar: límite total menor que sus 2 usos → LIMITE_MENOR_QUE_USOS', 51412,
        N'SET @V = (SELECT Version FROM #Version);
          EXEC dbo.SP_Cupones_Actualizar @Admin, @Usado, ''CUP-PRUEBA-USADO'', N''Usado'', ''PORCENTAJE'', 10, 0, @Ini, @Fin, 1, NULL, NULL, 0, @V;',
        N'DELETE FROM #Version; INSERT INTO #Version SELECT VersionFila FROM dbo.Cupon WHERE Codigo = ''CUP-PRUEBA-USADO'';'),
    (N'Actualizar: pasar a una categoría inactiva → CATEGORIA_NO_ENCONTRADA', 50102,
        N'SET @V = (SELECT Version FROM #Version);
          EXEC dbo.SP_Cupones_Actualizar @Admin, @Diez, ''CUP-PRUEBA-DIEZ'', N''x'', ''PORCENTAJE'', 10, 0, @Ini, @Fin, NULL, NULL, @Inactiva, 0, @V;',
        N'DELETE FROM #Version; INSERT INTO #Version SELECT VersionFila FROM dbo.Cupon WHERE Codigo = ''CUP-PRUEBA-DIEZ'';'),
    (N'Actualizar: un cupón vencido puede corregir su descripción (permitido)', 0,
        N'SET @V = (SELECT Version FROM #Version);
          INSERT INTO #Cupon EXEC dbo.SP_Cupones_Actualizar @Admin, @Diez, ''CUP-PRUEBA-DIEZ'', N''Corregido'', ''PORCENTAJE'', 10, 0,
                                                            ''2020-01-01'', ''2020-02-01'', NULL, NULL, NULL, 0, @V;',
        N'DELETE FROM #Version; INSERT INTO #Version SELECT VersionFila FROM dbo.Cupon WHERE Codigo = ''CUP-PRUEBA-DIEZ'';'),
    (N'Cambiar estado: sin estado → PARAMETRO_REQUERIDO', 50006,
        N'EXEC dbo.SP_Cupones_CambiarEstado @Admin, @Diez, NULL;', NULL),
    (N'Cambiar estado: cupón inexistente → CUPON_NO_ENCONTRADO', 50110,
        N'EXEC dbo.SP_Cupones_CambiarEstado @Admin, -1, 0;', NULL),
    (N'Cambiar estado: un operador → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Cupones_CambiarEstado @Operador, @Diez, 0;', NULL),
    (N'Obtener: cupón inexistente → CUPON_NO_ENCONTRADO', 50110,
        N'EXEC dbo.SP_Cupones_Obtener @Admin, -1;', NULL),
    (N'Listar: situación inexistente → SITUACION_INVALIDA', 50033,
        N'EXEC dbo.SP_Cupones_Listar @Admin, NULL, ''CADUCADO'';', NULL),
    (N'Listar: tamaño de página 0 → PAGINACION_INVALIDA', 50007,
        N'EXEC dbo.SP_Cupones_Listar @Admin, NULL, NULL, 1, 0;', NULL),
    (N'Listar: un cliente → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Cupones_Listar @Cliente;', NULL),
    (N'Aplicar: sin carrito → CARRITO_NO_ENCONTRADO', 50108,
        N'EXEC dbo.SP_Carrito_AplicarCupon @IDUsuario = @Cliente, @Codigo = ''CUP-PRUEBA-DIEZ'';', NULL),
    (N'Aplicar: sin código → PARAMETRO_REQUERIDO', 50006,
        N'EXEC dbo.SP_Carrito_AplicarCupon @IDUsuario = @Cliente, @Codigo = ''  '';', NULL),
    (N'Aplicar: un operador → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Carrito_AplicarCupon @IDUsuario = @Operador, @Codigo = ''CUP-PRUEBA-DIEZ'';', NULL),
    (N'Aplicar: código inexistente → CUPON_INVALIDO', 51401,
        N'INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = @R;
          EXEC dbo.SP_Carrito_AplicarCupon @IDUsuario = @Cliente, @Codigo = ''NO-EXISTE'';', NULL),
    (N'Aplicar: cupón desactivado (responde igual que inexistente) → CUPON_INVALIDO', 51401,
        N'INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = @R;
          EXEC dbo.SP_Carrito_AplicarCupon @IDUsuario = @Cliente, @Codigo = ''CUP-PRUEBA-INAC'';', NULL),
    (N'Aplicar: cupón programado → CUPON_NO_VIGENTE', 51402,
        N'INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = @R;
          EXEC dbo.SP_Carrito_AplicarCupon @IDUsuario = @Cliente, @Codigo = ''CUP-PRUEBA-PROG'';', NULL),
    (N'Aplicar: cupón vencido → CUPON_VENCIDO', 51403,
        N'INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = @R;
          EXEC dbo.SP_Carrito_AplicarCupon @IDUsuario = @Cliente, @Codigo = ''CUP-PRUEBA-VENC'';', NULL),
    (N'Aplicar: cupón agotado → CUPON_AGOTADO', 51404,
        N'INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = @R;
          EXEC dbo.SP_Carrito_AplicarCupon @IDUsuario = @Cliente, @Codigo = ''CUP-PRUEBA-AGOT'';', NULL),
    (N'Aplicar: invitado con un cupón solo para registrados → CUPON_SOLO_REGISTRADOS', 51405,
        N'INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @TokenInvitadoHash = @Token, @IDVariante = @R;
          EXEC dbo.SP_Carrito_AplicarCupon @TokenInvitadoHash = @Token, @Codigo = ''CUP-PRUEBA-REG'';', NULL),
    (N'Aplicar: el cliente ya usó el cupón su única vez → CUPON_LIMITE_CLIENTE', 51406,
        N'INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = @R;
          EXEC dbo.SP_Carrito_AplicarCupon @IDUsuario = @Cliente, @Codigo = ''CUP-PRUEBA-USADO'';', NULL),
    (N'Aplicar: Q100 con un cupón desde Q300 → CUPON_MONTO_MINIMO', 51407,
        N'INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = @R;
          EXEC dbo.SP_Carrito_AplicarCupon @IDUsuario = @Cliente, @Codigo = ''CUP-PRUEBA-MIN'';', NULL),
    (N'Aplicar: cupón de ropa a un carrito solo con hogar → CUPON_SIN_PRODUCTOS_ELEGIBLES', 51408,
        N'INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = @H;
          EXEC dbo.SP_Carrito_AplicarCupon @IDUsuario = @Cliente, @Codigo = ''CUP-PRUEBA-ROPA'';', NULL),
    (N'Aplicar: carrito vaciado → CARRITO_VACIO', 51409,
        N'INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = @R;
          INSERT INTO #Carrito EXEC dbo.SP_Carrito_Vaciar @IDUsuario = @Cliente;
          EXEC dbo.SP_Carrito_AplicarCupon @IDUsuario = @Cliente, @Codigo = ''CUP-PRUEBA-DIEZ'';', NULL),
    (N'Aplicar: invitado con un cupón general (permitido)', 0,
        N'INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @TokenInvitadoHash = @Token, @IDVariante = @R;
          INSERT INTO #Carrito EXEC dbo.SP_Carrito_AplicarCupon @TokenInvitadoHash = @Token, @Codigo = ''CUP-PRUEBA-DIEZ'';', NULL),
    (N'Quitar cupón: sin carrito (permitido, idempotente)', 0,
        N'INSERT INTO #Carrito EXEC dbo.SP_Carrito_QuitarCupon @TokenInvitadoHash = @Token;', NULL);

DECLARE @Orden INT = 1, @Descripcion NVARCHAR(300), @Esperado INT, @Sql NVARCHAR(MAX), @Preparacion NVARCHAR(MAX);
WHILE @Orden <= (SELECT MAX(Orden) FROM @Errores)
BEGIN
    SELECT @Descripcion = Descripcion, @Esperado = Esperado, @Sql = @D + Sql, @Preparacion = Preparacion
    FROM @Errores WHERE Orden = @Orden;
    EXEC #EsperarError @Descripcion, @Esperado, @Sql, @Preparacion;
    SET @Orden += 1;
END;

/* Ningún caso dejó datos: todos se revirtieron. */
SET @Texto = (SELECT CONCAT((SELECT COUNT(*) FROM dbo.Cupon WHERE Codigo LIKE 'CUP-PRUEBA-%'), N'|',
                            (SELECT COUNT(*) FROM dbo.Usuario WHERE Correo LIKE N'%.cupones@shopcart.test'), N'|',
                            (SELECT COUNT(*) FROM dbo.Variante WHERE SKU LIKE 'CUP-PRUEBA-%')));
EXEC #Verificar N'Limpieza: no quedan datos de prueba', N'0|0|0', @Texto;

/* --- Resultado ---------------------------------------------------------------------------- */
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = NULL;

IF CAST(SESSION_CONTEXT(N'PruebasFallidas') AS INT) > 0
    THROW 50000, N'Pruebas de procedimientos de cupones fallidas.', 1;
EXEC sys.sp_set_session_context @key = N'PruebasFallidas', @value = NULL;
GO
