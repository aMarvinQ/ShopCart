/*
    013_Procedimientos_Carrito.sql
    Se ejecuta conectado como shopcart_migrator (deploy.ps1 -Probar). Mismo esquema que
    009–012: el migrador prepara los datos y ejecuta cada SP haciéndose pasar por un miembro
    de RolApi; los casos de error usan #EsperarError. Los SKU de prueba empiezan con CAR-PRUEBA.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT OFF;
GO

-- Permite ejecutar el script varias veces en la misma conexión (p. ej. en SSMS).
DROP TABLE IF EXISTS #Contexto, #Base, #Carrito;
DROP PROCEDURE IF EXISTS #Verificar;
DROP PROCEDURE IF EXISTS #Preparar;
DROP PROCEDURE IF EXISTS #EsperarError;
DROP PROCEDURE IF EXISTS #Resumen;
GO

CREATE TABLE #Contexto (UsuarioApi SYSNAME NOT NULL);
CREATE TABLE #Base (IDOperador INT, IDCliente INT, IDCliente2 INT, IDInactivo INT, IDA INT, IDB INT, IDC INT, IDD INT, IDE INT);

-- Resultado de los SPs del carrito (todos devuelven la misma forma).
CREATE TABLE #Carrito (IDCarrito INT, MaximoPorLinea INT, CantidadArticulos INT, Subtotal DECIMAL(12, 2), PuedeComprar BIT,
                       Items NVARCHAR(MAX));
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
    Resumen del último carrito devuelto: artículos|subtotal|puede comprar|SKU:cantidad:estado:tope,...
    y lo vacía para la siguiente llamada.
*/
CREATE PROCEDURE #Resumen
    @Texto NVARCHAR(400) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT @Texto = CONCAT(c.CantidadArticulos, N'|', c.Subtotal, N'|', CAST(c.PuedeComprar AS INT), N'|',
                           (SELECT STRING_AGG(CONCAT(j.SKU, N':', j.Cantidad, N':', j.Estado, N':', j.CantidadMaxima), N',')
                                   WITHIN GROUP (ORDER BY j.IDCarritoItem)
                            FROM OPENJSON(c.Items) WITH (IDCarritoItem INT, SKU VARCHAR(50), Cantidad INT, Estado VARCHAR(20),
                                                         CantidadMaxima INT) AS j))
    FROM #Carrito AS c;
    DELETE FROM #Carrito;
END;
GO

/*
    Datos de cada caso:
    - Roles; MAXIMO_UNIDADES_POR_LINEA = 5; un operador, dos clientes y un cliente desactivado.
    - "Taza Carrito Prueba" (con imagen principal): A 100.00 con 10 unidades, B 25.50 con 3,
      C desactivada con 5, D 40.00 con 4.
    - E: producto activo con 5 unidades, pero de una categoría oculta.
*/
CREATE PROCEDURE #Preparar
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Hash VARCHAR(255) = '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA';
    DECLARE @IDOperador INT, @IDCliente INT, @IDCliente2 INT, @IDInactivo INT, @IDCategoria INT, @IDOculta INT,
            @IDTaza INT, @IDLampara INT, @IDA INT, @IDB INT, @IDC INT, @IDD INT, @IDE INT;

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
    SELECT r.IDRol, N'operador.carrito@shopcart.test', @Hash, N'Operador', N'Carrito' FROM dbo.Rol AS r WHERE r.Codigo = 'OPERADOR';
    SET @IDOperador = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'cliente.carrito@shopcart.test', @Hash, N'Cliente', N'Carrito' FROM dbo.Rol AS r WHERE r.Codigo = 'CLIENTE';
    SET @IDCliente = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'cliente2.carrito@shopcart.test', @Hash, N'Cliente', N'Dos' FROM dbo.Rol AS r WHERE r.Codigo = 'CLIENTE';
    SET @IDCliente2 = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido, Activo)
    SELECT r.IDRol, N'inactivo.carrito@shopcart.test', @Hash, N'Cliente', N'Inactivo', 0 FROM dbo.Rol AS r WHERE r.Codigo = 'CLIENTE';
    SET @IDInactivo = SCOPE_IDENTITY();

    INSERT INTO dbo.Categoria (Nombre, Slug) VALUES (N'Carrito Prueba', 'carrito-prueba');
    SET @IDCategoria = SCOPE_IDENTITY();
    INSERT INTO dbo.Categoria (Nombre, Slug, Activo) VALUES (N'Carrito Prueba Oculta', 'carrito-prueba-oculta', 0);
    SET @IDOculta = SCOPE_IDENTITY();

    INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug, Activo) VALUES (@IDCategoria, N'Taza Carrito Prueba', 'taza-carrito-prueba', 1);
    SET @IDTaza = SCOPE_IDENTITY();
    INSERT INTO dbo.Producto (IDCategoria, Nombre, Slug, Activo) VALUES (@IDOculta, N'Lámpara Carrito Prueba', 'lampara-carrito-prueba', 1);
    SET @IDLampara = SCOPE_IDENTITY();
    INSERT INTO dbo.ProductoImagen (IDProducto, RutaImagen, TextoAlternativo, EsPrincipal)
    VALUES (@IDTaza, N'/uploads/taza-carrito-prueba.jpg', N'Taza blanca', 1);

    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica, ClaveCombinacion) VALUES (@IDTaza, 'CAR-PRUEBA-A', 100.00, 10, '1');
    SET @IDA = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica, ClaveCombinacion) VALUES (@IDTaza, 'CAR-PRUEBA-B', 25.50, 3, '2');
    SET @IDB = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica, ClaveCombinacion, Activo) VALUES (@IDTaza, 'CAR-PRUEBA-C', 10.00, 5, '3', 0);
    SET @IDC = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica, ClaveCombinacion) VALUES (@IDTaza, 'CAR-PRUEBA-D', 40.00, 4, '4');
    SET @IDD = SCOPE_IDENTITY();
    INSERT INTO dbo.Variante (IDProducto, SKU, Precio, ExistenciaFisica) VALUES (@IDLampara, 'CAR-PRUEBA-E', 80.00, 5);
    SET @IDE = SCOPE_IDENTITY();

    DELETE FROM #Base;
    INSERT INTO #Base VALUES (@IDOperador, @IDCliente, @IDCliente2, @IDInactivo, @IDA, @IDB, @IDC, @IDD, @IDE);
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
DECLARE @IDCliente INT, @IDCliente2 INT, @IDA INT, @IDB INT, @IDD INT, @IDCarrito INT, @IDInvitado INT;
DECLARE @Texto NVARCHAR(400), @Previo NVARCHAR(400);
DECLARE @Token1 VARBINARY(64) = HASHBYTES('SHA2_256', 'invitado-uno'),
        @Token2 VARBINARY(64) = HASHBYTES('SHA2_256', 'invitado-dos'),
        @Token3 VARBINARY(64) = HASHBYTES('SHA2_256', 'invitado-sin-carrito');

BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDCliente = IDCliente, @IDCliente2 = IDCliente2, @IDA = IDA, @IDB = IDB, @IDD = IDD FROM #Base;

/* === Cliente: agregar, cambiar, quitar y vaciar ========================================== */
EXECUTE AS USER = @Api;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_Obtener @IDUsuario = @IDCliente;
REVERT;
SET @Texto = (SELECT CONCAT(ISNULL(CAST(IDCarrito AS NVARCHAR(10)), N'NULL'), N'|', MaximoPorLinea, N'|', CantidadArticulos, N'|',
                            Subtotal, N'|', CAST(PuedeComprar AS INT), N'|', Items) FROM #Carrito);
DELETE FROM #Carrito;
EXEC #Verificar N'Obtener: sin carrito devuelve una fila vacía con el límite por línea', N'NULL|5|0|0.00|0|[]', @Texto;

EXECUTE AS USER = @Api;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @IDCliente, @IDVariante = @IDA, @Cantidad = 2;
REVERT;
SET @IDCarrito = (SELECT IDCarrito FROM #Carrito);
SET @Texto = (SELECT CONCAT(JSON_VALUE(Items, '$[0].Producto'), N'|', JSON_VALUE(Items, '$[0].Slug'), N'|',
                            JSON_VALUE(Items, '$[0].Imagen'), N'|', JSON_VALUE(Items, '$[0].PrecioUnitario'), N'|',
                            JSON_VALUE(Items, '$[0].Disponible')) FROM #Carrito);
EXEC #Verificar N'Agregar: la línea trae producto, slug, imagen principal, precio vigente y disponible',
     N'Taza Carrito Prueba|taza-carrito-prueba|/uploads/taza-carrito-prueba.jpg|100.00|10', @Texto;
EXEC #Resumen @Texto OUTPUT;
SET @Texto += N'|' + (SELECT CONCAT(COUNT(*), N':', MAX(Estado), N':', MAX(CASE WHEN TokenInvitadoHash IS NULL THEN 1 ELSE 0 END))
                      FROM dbo.Carrito WHERE IDUsuario = @IDCliente);
EXEC #Verificar N'Agregar: crea el carrito activo del cliente (sin token) con la línea; tope = límite 5',
     N'2|200.00|1|CAR-PRUEBA-A:2:DISPONIBLE:5|1:ACTIVO:1', @Texto;

EXECUTE AS USER = @Api;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @IDCliente, @IDVariante = @IDA, @Cantidad = 3;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @IDCliente, @IDVariante = @IDB, @Cantidad = 3;
REVERT;
DELETE FROM #Carrito WHERE CantidadArticulos = 5;
EXEC #Resumen @Texto OUTPUT;
SET @Texto += N'|' + CAST((SELECT COUNT(*) FROM dbo.Carrito WHERE IDUsuario = @IDCliente) AS NVARCHAR(10));
EXEC #Verificar N'Agregar: la misma variante suma hasta el límite (5); B llega a su disponible (3) en el mismo carrito',
     N'8|576.50|1|CAR-PRUEBA-A:5:DISPONIBLE:5,CAR-PRUEBA-B:3:DISPONIBLE:3|1', @Texto;

EXECUTE AS USER = @Api;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_ActualizarCantidad @IDUsuario = @IDCliente, @IDVariante = @IDB, @Cantidad = 1;
REVERT;
EXEC #Resumen @Texto OUTPUT;
EXEC #Verificar N'Actualizar cantidad: fija la cantidad de la línea', N'6|525.50|1|CAR-PRUEBA-A:5:DISPONIBLE:5,CAR-PRUEBA-B:1:DISPONIBLE:3', @Texto;

-- Cambios del catálogo después de agregar: el carrito marca cada línea en lugar de borrarla.
UPDATE dbo.Variante SET ExistenciaFisica = 2 WHERE IDVariante = @IDA;
UPDATE dbo.Variante SET ExistenciaFisica = 0 WHERE IDVariante = @IDB;
EXECUTE AS USER = @Api;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_Obtener @IDUsuario = @IDCliente;
REVERT;
EXEC #Resumen @Texto OUTPUT;
EXEC #Verificar N'Obtener: cantidad mayor que lo disponible y variante agotada no permiten comprar',
     N'6|525.50|0|CAR-PRUEBA-A:5:CANTIDAD_EXCEDIDA:2,CAR-PRUEBA-B:1:AGOTADO:0', @Texto;

UPDATE dbo.Categoria SET Activo = 0 WHERE Slug = 'carrito-prueba';
EXECUTE AS USER = @Api;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_Obtener @IDUsuario = @IDCliente;
REVERT;
EXEC #Resumen @Texto OUTPUT;
EXEC #Verificar N'Obtener: si se oculta la categoría las líneas quedan como no disponibles',
     N'6|525.50|0|CAR-PRUEBA-A:5:NO_DISPONIBLE:2,CAR-PRUEBA-B:1:NO_DISPONIBLE:0', @Texto;
UPDATE dbo.Categoria SET Activo = 1 WHERE Slug = 'carrito-prueba';
UPDATE dbo.Variante SET ExistenciaFisica = 10 WHERE IDVariante = @IDA;
UPDATE dbo.Variante SET ExistenciaFisica = 3 WHERE IDVariante = @IDB;

EXECUTE AS USER = @Api;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_QuitarItem @IDUsuario = @IDCliente, @IDVariante = @IDB;
DELETE FROM #Carrito;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_QuitarItem @IDUsuario = @IDCliente, @IDVariante = @IDB;
REVERT;
EXEC #Resumen @Texto OUTPUT;
EXEC #Verificar N'Quitar: elimina la línea; repetirlo no es error', N'5|500.00|1|CAR-PRUEBA-A:5:DISPONIBLE:5', @Texto;

EXECUTE AS USER = @Api;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_Vaciar @IDUsuario = @IDCliente;
REVERT;
SET @Previo = (SELECT CONCAT(CASE WHEN IDCarrito = @IDCarrito THEN N'mismo' ELSE N'otro' END, N'|', Items) FROM #Carrito);
EXEC #Resumen @Texto OUTPUT;
SET @Texto = @Previo + N'|' + @Texto;
EXEC #Verificar N'Vaciar: quita todas las líneas y conserva el carrito activo', N'mismo|[]|0|0.00|0|', @Texto;

/* === Invitado y fusión =================================================================== */
EXECUTE AS USER = @Api;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @TokenInvitadoHash = @Token1, @IDVariante = @IDA, @Cantidad = 2;
REVERT;
SET @IDInvitado = (SELECT IDCarrito FROM #Carrito);
DELETE FROM #Carrito;
SET @Texto = (SELECT CONCAT(ISNULL(CAST(IDUsuario AS NVARCHAR(10)), N'NULL'), N'|',
                            CASE WHEN TokenInvitadoHash = @Token1 THEN N'token' END, N'|', Estado)
              FROM dbo.Carrito WHERE IDCarrito = @IDInvitado);
EXEC #Verificar N'Invitado: el carrito se crea con el hash del token y sin usuario', N'NULL|token|ACTIVO', @Texto;

-- El cliente 2 no tiene carrito: el del invitado pasa a ser suyo.
EXECUTE AS USER = @Api;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_Fusionar @IDUsuario = @IDCliente2, @TokenInvitadoHash = @Token1;
REVERT;
SET @Previo = (SELECT CASE WHEN IDCarrito = @IDInvitado THEN N'mismo' ELSE N'otro' END FROM #Carrito);
EXEC #Resumen @Texto OUTPUT;
SET @Texto = @Previo + N'|' + @Texto + N'|' + (SELECT CONCAT(IDUsuario - @IDCliente2, N':', ISNULL(CAST(TokenInvitadoHash AS VARCHAR(10)), 'sin token'), N':', Estado)
                      FROM dbo.Carrito WHERE IDCarrito = @IDInvitado);
EXEC #Verificar N'Fusionar sin carrito del cliente: adopta el del invitado (mismo carrito, sin token)',
     N'mismo|2|200.00|1|CAR-PRUEBA-A:2:DISPONIBLE:5|0:sin token:ACTIVO', @Texto;

-- Ambos tienen carrito: se suman las repetidas y se topan; las nuevas se agregan.
EXECUTE AS USER = @Api;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @IDCliente, @IDVariante = @IDA, @Cantidad = 4;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @IDCliente, @IDVariante = @IDB, @Cantidad = 1;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @TokenInvitadoHash = @Token2, @IDVariante = @IDA, @Cantidad = 3;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @TokenInvitadoHash = @Token2, @IDVariante = @IDB, @Cantidad = 3;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @TokenInvitadoHash = @Token2, @IDVariante = @IDD, @Cantidad = 2;
SET @IDInvitado = (SELECT TOP (1) IDCarrito FROM #Carrito ORDER BY IDCarrito DESC);
DELETE FROM #Carrito;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_Fusionar @IDUsuario = @IDCliente, @TokenInvitadoHash = @Token2;
REVERT;
SET @Previo = (SELECT CASE WHEN IDCarrito = @IDCarrito THEN N'mismo' ELSE N'otro' END FROM #Carrito);
EXEC #Resumen @Texto OUTPUT;
SET @Texto = @Previo + N'|' + @Texto + N'|' + (SELECT CONCAT(Estado, N':', (SELECT COUNT(*) FROM dbo.CarritoItem WHERE IDCarrito = @IDInvitado))
                      FROM dbo.Carrito WHERE IDCarrito = @IDInvitado);
EXEC #Verificar N'Fusionar con ambos carritos: A 4+3 se topa al límite 5, B 1+3 a su disponible 3, D se agrega; el invitado queda FUSIONADO con su historial',
     N'mismo|10|656.50|1|CAR-PRUEBA-A:5:DISPONIBLE:5,CAR-PRUEBA-B:3:DISPONIBLE:3,CAR-PRUEBA-D:2:DISPONIBLE:4|FUSIONADO:3', @Texto;

-- Token sin carrito o ya fusionado: no hay nada que fusionar, devuelve el carrito del cliente.
EXECUTE AS USER = @Api;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_Fusionar @IDUsuario = @IDCliente, @TokenInvitadoHash = @Token3;
DELETE FROM #Carrito;
INSERT INTO #Carrito EXEC dbo.SP_Carrito_Fusionar @IDUsuario = @IDCliente, @TokenInvitadoHash = @Token2;
REVERT;
EXEC #Resumen @Texto OUTPUT;
EXEC #Verificar N'Fusionar sin carrito de invitado activo: no cambia nada',
     N'10|656.50|1|CAR-PRUEBA-A:5:DISPONIBLE:5,CAR-PRUEBA-B:3:DISPONIBLE:3,CAR-PRUEBA-D:2:DISPONIBLE:4', @Texto;
ROLLBACK TRANSACTION;

/* === Casos de error ====================================================================== */
DECLARE @D NVARCHAR(MAX) = N'
DECLARE @Operador INT, @Cliente INT, @Inactivo INT, @A INT, @B INT, @C INT, @E INT;
DECLARE @Token VARBINARY(64) = HASHBYTES(''SHA2_256'', ''invitado-error'');
SELECT @Operador = IDOperador, @Cliente = IDCliente, @Inactivo = IDInactivo, @A = IDA, @B = IDB, @C = IDC, @E = IDE FROM #Base;
';
DECLARE @PrepararLineaInactiva NVARCHAR(MAX) = N'
DECLARE @IDCarrito INT;
INSERT INTO dbo.Carrito (IDUsuario) SELECT IDCliente FROM #Base;
SET @IDCarrito = SCOPE_IDENTITY();
INSERT INTO dbo.CarritoItem (IDCarrito, IDVariante, Cantidad) SELECT @IDCarrito, IDA, 2 FROM #Base;
UPDATE dbo.Variante SET Activo = 0 WHERE IDVariante = (SELECT IDA FROM #Base);';

DECLARE @Errores TABLE (Orden INT IDENTITY, Descripcion NVARCHAR(300), Esperado INT, Sql NVARCHAR(MAX), Preparacion NVARCHAR(MAX));
INSERT INTO @Errores (Descripcion, Esperado, Sql, Preparacion) VALUES
    (N'Obtener: sin cliente ni token → PARAMETRO_REQUERIDO', 50006,
        N'EXEC dbo.SP_Carrito_Obtener;', NULL),
    (N'Obtener: cliente y token a la vez → PARAMETRO_REQUERIDO', 50006,
        N'EXEC dbo.SP_Carrito_Obtener @IDUsuario = @Cliente, @TokenInvitadoHash = @Token;', NULL),
    (N'Obtener: token que no es SHA-256 (16 bytes) → PARAMETRO_REQUERIDO', 50006,
        N'EXEC dbo.SP_Carrito_Obtener @TokenInvitadoHash = 0x00112233445566778899AABBCCDDEEFF;', NULL),
    (N'Obtener: un operador → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Carrito_Obtener @IDUsuario = @Operador;', NULL),
    (N'Agregar: cliente desactivado → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Inactivo, @IDVariante = @A;', NULL),
    (N'Agregar: sin variante → PARAMETRO_REQUERIDO', 50006,
        N'EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = NULL;', NULL),
    (N'Agregar: cantidad 0 → CANTIDAD_INVALIDA', 50025,
        N'EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = @A, @Cantidad = 0;', NULL),
    (N'Agregar: 6 unidades con límite 5 → CANTIDAD_EXCEDE_LIMITE', 50027,
        N'EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = @A, @Cantidad = 6;', NULL),
    (N'Agregar: 4 y luego 2 de la misma variante (suma 6) → CANTIDAD_EXCEDE_LIMITE', 50027,
        N'INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = @A, @Cantidad = 4;
          EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = @A, @Cantidad = 2;', NULL),
    (N'Agregar: 4 de B, que tiene 3 disponibles (menos que el límite) → STOCK_INSUFICIENTE', 51301,
        N'EXEC dbo.SP_Carrito_AgregarItem @TokenInvitadoHash = @Token, @IDVariante = @B, @Cantidad = 4;', NULL),
    (N'Agregar: 2 y luego 2 de B (suma 4, disponible 3) → STOCK_INSUFICIENTE', 51301,
        N'INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = @B, @Cantidad = 2;
          EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = @B, @Cantidad = 2;', NULL),
    (N'Agregar: variante desactivada → VARIANTE_NO_DISPONIBLE', 51302,
        N'EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = @C;', NULL),
    (N'Agregar: producto de una categoría oculta → VARIANTE_NO_DISPONIBLE', 51302,
        N'EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = @E;', NULL),
    (N'Agregar: variante inexistente → VARIANTE_NO_ENCONTRADA', 50106,
        N'EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = -1;', NULL),
    (N'Agregar: token de un carrito ya pagado → CARRITO_CERRADO', 51303,
        N'EXEC dbo.SP_Carrito_AgregarItem @TokenInvitadoHash = @Token, @IDVariante = @A;',
        N'INSERT INTO dbo.Carrito (TokenInvitadoHash, Estado) VALUES (HASHBYTES(''SHA2_256'', ''invitado-error''), ''CONVERTIDO'');'),
    (N'Agregar: sin el parámetro MAXIMO_UNIDADES_POR_LINEA → CONFIGURACION_INCOMPLETA', 59001,
        N'EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = @A;',
        N'DELETE FROM dbo.Parametro WHERE Clave = ''MAXIMO_UNIDADES_POR_LINEA'';'),
    (N'Obtener: MAXIMO_UNIDADES_POR_LINEA fuera de 1–999 → CONFIGURACION_INCOMPLETA', 59001,
        N'EXEC dbo.SP_Carrito_Obtener @IDUsuario = @Cliente;',
        N'UPDATE dbo.Parametro SET Valor = N''1000'' WHERE Clave = ''MAXIMO_UNIDADES_POR_LINEA'';'),
    (N'Actualizar: sin carrito → CARRITO_NO_ENCONTRADO', 50108,
        N'EXEC dbo.SP_Carrito_ActualizarCantidad @IDUsuario = @Cliente, @IDVariante = @A, @Cantidad = 1;', NULL),
    (N'Actualizar: variante que no está en el carrito → ITEM_NO_ENCONTRADO', 50109,
        N'INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = @A;
          EXEC dbo.SP_Carrito_ActualizarCantidad @IDUsuario = @Cliente, @IDVariante = @B, @Cantidad = 1;', NULL),
    (N'Actualizar: cantidad 0 → CANTIDAD_INVALIDA', 50025,
        N'EXEC dbo.SP_Carrito_ActualizarCantidad @IDUsuario = @Cliente, @IDVariante = @A, @Cantidad = 0;', NULL),
    (N'Actualizar: B a 4 (disponible 3) → STOCK_INSUFICIENTE', 51301,
        N'INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @TokenInvitadoHash = @Token, @IDVariante = @B;
          EXEC dbo.SP_Carrito_ActualizarCantidad @TokenInvitadoHash = @Token, @IDVariante = @B, @Cantidad = 4;', NULL),
    (N'Actualizar: A a 6 (límite 5) → CANTIDAD_EXCEDE_LIMITE', 50027,
        N'INSERT INTO #Carrito EXEC dbo.SP_Carrito_AgregarItem @IDUsuario = @Cliente, @IDVariante = @A;
          EXEC dbo.SP_Carrito_ActualizarCantidad @IDUsuario = @Cliente, @IDVariante = @A, @Cantidad = 6;', NULL),
    (N'Actualizar: línea cuya variante se desactivó (solo se puede quitar) → VARIANTE_NO_DISPONIBLE', 51302,
        N'EXEC dbo.SP_Carrito_ActualizarCantidad @IDUsuario = @Cliente, @IDVariante = @A, @Cantidad = 1;', @PrepararLineaInactiva),
    (N'Quitar: línea cuya variante se desactivó (permitido)', 0,
        N'INSERT INTO #Carrito EXEC dbo.SP_Carrito_QuitarItem @IDUsuario = @Cliente, @IDVariante = @A;', @PrepararLineaInactiva),
    (N'Quitar: sin carrito (permitido, idempotente)', 0,
        N'INSERT INTO #Carrito EXEC dbo.SP_Carrito_QuitarItem @TokenInvitadoHash = @Token, @IDVariante = @A;', NULL),
    (N'Quitar: sin variante → PARAMETRO_REQUERIDO', 50006,
        N'EXEC dbo.SP_Carrito_QuitarItem @IDUsuario = @Cliente, @IDVariante = NULL;', NULL),
    (N'Vaciar: sin cliente ni token → PARAMETRO_REQUERIDO', 50006,
        N'EXEC dbo.SP_Carrito_Vaciar;', NULL),
    (N'Fusionar: sin token → PARAMETRO_REQUERIDO', 50006,
        N'EXEC dbo.SP_Carrito_Fusionar @IDUsuario = @Cliente, @TokenInvitadoHash = NULL;', NULL),
    (N'Fusionar: un operador → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Carrito_Fusionar @IDUsuario = @Operador, @TokenInvitadoHash = @Token;', NULL);

DECLARE @Orden INT = 1, @Descripcion NVARCHAR(300), @Esperado INT, @Sql NVARCHAR(MAX), @Preparacion NVARCHAR(MAX);
WHILE @Orden <= (SELECT MAX(Orden) FROM @Errores)
BEGIN
    SELECT @Descripcion = Descripcion, @Esperado = Esperado, @Sql = @D + Sql, @Preparacion = Preparacion
    FROM @Errores WHERE Orden = @Orden;
    EXEC #EsperarError @Descripcion, @Esperado, @Sql, @Preparacion;
    SET @Orden += 1;
END;

/* Ningún caso dejó datos: todos se revirtieron. */
SET @Texto = (SELECT CONCAT((SELECT COUNT(*) FROM dbo.Variante WHERE SKU LIKE 'CAR-PRUEBA-%'), N'|',
                            (SELECT COUNT(*) FROM dbo.Usuario WHERE Correo LIKE N'%.carrito@shopcart.test'), N'|',
                            (SELECT COUNT(*) FROM dbo.Carrito WHERE TokenInvitadoHash IN (@Token1, @Token2))));
EXEC #Verificar N'Limpieza: no quedan datos de prueba', N'0|0|0', @Texto;

/* --- Resultado ---------------------------------------------------------------------------- */
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = NULL;

IF CAST(SESSION_CONTEXT(N'PruebasFallidas') AS INT) > 0
    THROW 50000, N'Pruebas de procedimientos del carrito fallidas.', 1;
EXEC sys.sp_set_session_context @key = N'PruebasFallidas', @value = NULL;
GO
