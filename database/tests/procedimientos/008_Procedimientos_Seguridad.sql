/*
    008_Procedimientos_Seguridad.sql
    Se ejecuta conectado como shopcart_migrator (deploy.ps1 -Probar).
    El migrador prepara los datos y ejecuta cada SP haciéndose pasar por un miembro de RolApi:
    cada prueba demuestra que el SP funciona y que la API tiene permiso para usarlo.

    Cada caso corre en su propia transacción y se revierte: un error dentro de un SP
    (XACT_ABORT ON) condena la transacción que lo envuelve. Por eso el CATCH primero revierte
    y después hace REVERT (en una transacción condenada REVERT falla).
    Las fechas de los tokens se mueven con UPDATE para simular el paso del tiempo.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT OFF;
GO

-- Permite ejecutar el script varias veces en la misma conexión (p. ej. en SSMS).
DROP TABLE IF EXISTS #Contexto, #Base, #Usuario, #Credenciales, #Sesion, #Rotacion, #Conteo, #Perfil, #Detalle, #Estado;
DROP PROCEDURE IF EXISTS #Verificar;
DROP PROCEDURE IF EXISTS #Preparar;
DROP PROCEDURE IF EXISTS #IniciarSesion;
DROP PROCEDURE IF EXISTS #Rotar;
GO

CREATE TABLE #Contexto (UsuarioApi SYSNAME NOT NULL);
CREATE TABLE #Base (IDAdmin INT NOT NULL, IDOperador INT NOT NULL, IDCliente INT NOT NULL, IDSistema INT NOT NULL);

-- Resultados de los SPs (misma forma que devuelven).
CREATE TABLE #Usuario (IDUsuario INT, Correo NVARCHAR(254), Nombre NVARCHAR(100), Apellido NVARCHAR(100),
                       Telefono VARCHAR(20), CodigoRol VARCHAR(20));
CREATE TABLE #Credenciales (IDUsuario INT, HashContrasena VARCHAR(255), CodigoRol VARCHAR(20), Activo BIT);
CREATE TABLE #Sesion (IDUsuario INT, Correo NVARCHAR(254), Nombre NVARCHAR(100), Apellido NVARCHAR(100),
                      CodigoRol VARCHAR(20), FechaExpiracion DATETIME2(3), FechaExpiracionSesion DATETIME2(3));
CREATE TABLE #Rotacion (Resultado VARCHAR(25), IDUsuario INT, Correo NVARCHAR(254), Nombre NVARCHAR(100),
                        Apellido NVARCHAR(100), CodigoRol VARCHAR(20), FechaExpiracion DATETIME2(3),
                        FechaExpiracionSesion DATETIME2(3));
CREATE TABLE #Conteo (Cantidad INT);
CREATE TABLE #Perfil (IDUsuario INT, Correo NVARCHAR(254), Nombre NVARCHAR(100), Apellido NVARCHAR(100),
                      Telefono VARCHAR(20), CodigoRol VARCHAR(20), NombreRol NVARCHAR(50),
                      UltimoAcceso DATETIME2(3), FechaCreacion DATETIME2(3));
CREATE TABLE #Detalle (IDUsuario INT, Correo NVARCHAR(254), Nombre NVARCHAR(100), Apellido NVARCHAR(100),
                       Telefono VARCHAR(20), CodigoRol VARCHAR(20), NombreRol NVARCHAR(50), Activo BIT,
                       UltimoAcceso DATETIME2(3), FechaCreacion DATETIME2(3));
CREATE TABLE #Estado (IDUsuario INT, Correo NVARCHAR(254), Nombre NVARCHAR(100), Apellido NVARCHAR(100),
                      Telefono VARCHAR(20), CodigoRol VARCHAR(20), NombreRol NVARCHAR(50), Activo BIT,
                      UltimoAcceso DATETIME2(3), FechaCreacion DATETIME2(3), EstadoCambiado BIT, SesionesRevocadas INT);
GO

/*
    Compara como texto; muestra esperado y obtenido cuando no coinciden. Las fallas se cuentan
    en SESSION_CONTEXT y no en una tabla temporal: muchas verificaciones ocurren dentro de la
    transacción del caso, y su ROLLBACK borraría también el registro de la falla.
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
    Datos de cada caso: roles y parámetros (si la semilla no los cargó; los parámetros se fijan
    con valores conocidos), un administrador, un operador, un cliente y el usuario de sistema.
*/
CREATE PROCEDURE #Preparar
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Hash VARCHAR(255) = '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA';
    DECLARE @IDAdmin INT, @IDOperador INT, @IDCliente INT, @IDSistema INT;

    INSERT INTO dbo.Rol (IDRol, Codigo, Nombre)
    SELECT v.IDRol, v.Codigo, v.Nombre
    FROM (VALUES (201, 'CLIENTE', N'Cliente'), (202, 'OPERADOR', N'Operador'), (203, 'ADMIN', N'Administrador'))
         AS v (IDRol, Codigo, Nombre)
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Rol AS r WHERE r.Codigo = v.Codigo);

    DECLARE @Parametros TABLE (IDParametro TINYINT, Clave VARCHAR(50), Valor NVARCHAR(200));
    INSERT INTO @Parametros VALUES (201, 'SESION_DIAS_INACTIVIDAD', N'7'), (202, 'SESION_DIAS_MAXIMO', N'30'),
                                   (203, 'SESION_SEGUNDOS_GRACIA', N'30');
    UPDATE p SET Valor = v.Valor
    FROM dbo.Parametro AS p JOIN @Parametros AS v ON v.Clave = p.Clave;
    INSERT INTO dbo.Parametro (IDParametro, Clave, Valor, TipoDato, Descripcion)
    SELECT v.IDParametro, v.Clave, v.Valor, 'ENTERO', N'Prueba'
    FROM @Parametros AS v
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Parametro AS p WHERE p.Clave = v.Clave);

    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'admin.prueba@shopcart.test', @Hash, N'Admin', N'Prueba' FROM dbo.Rol AS r WHERE r.Codigo = 'ADMIN';
    SET @IDAdmin = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'operador.prueba@shopcart.test', @Hash, N'Operador', N'Prueba' FROM dbo.Rol AS r WHERE r.Codigo = 'OPERADOR';
    SET @IDOperador = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido, Telefono)
    SELECT r.IDRol, N'cliente.prueba@shopcart.test', @Hash, N'Cliente', N'Prueba', '5555-1234' FROM dbo.Rol AS r WHERE r.Codigo = 'CLIENTE';
    SET @IDCliente = SCOPE_IDENTITY();

    SET @IDSistema = (SELECT u.IDUsuario FROM dbo.Usuario AS u WHERE u.EsSistema = 1);
    IF @IDSistema IS NULL
    BEGIN
        INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido, EsSistema)
        SELECT r.IDRol, N'sistema.prueba@shopcart.test', NULL, N'Sistema', N'Prueba', 1 FROM dbo.Rol AS r WHERE r.Codigo = 'ADMIN';
        SET @IDSistema = SCOPE_IDENTITY();
    END;

    DELETE FROM #Base;
    INSERT INTO #Base VALUES (@IDAdmin, @IDOperador, @IDCliente, @IDSistema);
END;
GO

/* Inicia sesión como la API. EXECUTE AS dentro de un procedimiento se revierte al salir de él. */
CREATE PROCEDURE #IniciarSesion
    @IDUsuario INT,
    @Token     VARBINARY(64)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Api SYSNAME = (SELECT UsuarioApi FROM #Contexto);
    EXECUTE AS USER = @Api;
    INSERT INTO #Sesion EXEC dbo.SP_Seguridad_IniciarSesion @IDUsuario = @IDUsuario, @TokenHash = @Token;
    REVERT;
END;
GO

/* Rota como la API y devuelve el Resultado. */
CREATE PROCEDURE #Rotar
    @Actual    VARBINARY(64),
    @Nuevo     VARBINARY(64),
    @Resultado VARCHAR(25) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Api SYSNAME = (SELECT UsuarioApi FROM #Contexto);
    DELETE FROM #Rotacion;
    EXECUTE AS USER = @Api;
    INSERT INTO #Rotacion EXEC dbo.SP_Seguridad_RotarSesion @TokenHashActual = @Actual, @TokenHashNuevo = @Nuevo;
    REVERT;
    SET @Resultado = (SELECT Resultado FROM #Rotacion);
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
DECLARE @Hash VARCHAR(255) = '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA';
DECLARE @HashNuevo VARCHAR(255) = '$argon2id$v=19$m=65536,t=3,p=4$bnVldmE$bnVldm8';
DECLARE @TokenA BINARY(32) = HASHBYTES('SHA2_256', 'token-a'),
        @TokenB BINARY(32) = HASHBYTES('SHA2_256', 'token-b'),
        @TokenC BINARY(32) = HASHBYTES('SHA2_256', 'token-c'),
        @TokenD BINARY(32) = HASHBYTES('SHA2_256', 'token-d');
DECLARE @IDAdmin INT, @IDOperador INT, @IDCliente INT, @IDSistema INT, @IDNuevo INT;
DECLARE @Error INT, @Texto NVARCHAR(400), @Resultado VARCHAR(25), @Total INT, @Ahora DATETIME2(3);

/* === SP_Seguridad_RegistrarCliente ======================================================== */
BEGIN TRANSACTION;
EXEC #Preparar;
EXECUTE AS USER = @Api;
INSERT INTO #Usuario EXEC dbo.SP_Seguridad_RegistrarCliente
    @Correo = N'  Ana.Lopez@ShopCart.TEST ', @HashContrasena = @Hash, @Nombre = N' Ana ', @Apellido = N'López', @Telefono = N'  ';
REVERT;
SELECT @Texto = CONCAT(Correo, N'|', Nombre, N'|', ISNULL(Telefono, 'NULL'), N'|', CodigoRol) FROM #Usuario;
EXEC #Verificar N'Registrar: correo normalizado, textos recortados, teléfono vacío = NULL, rol CLIENTE',
     N'ana.lopez@shopcart.test|Ana|NULL|CLIENTE', @Texto;
SET @Texto = (SELECT CONCAT(COUNT(*), N'|', MAX(CAST(u.Activo AS INT))) FROM dbo.Usuario AS u
              JOIN #Usuario AS r ON r.IDUsuario = u.IDUsuario WHERE u.HashContrasena = @Hash);
EXEC #Verificar N'Registrar: se guarda activo con el hash recibido', N'1|1', @Texto;

SET @Error = 0;
BEGIN TRY
    EXECUTE AS USER = @Api;
    EXEC dbo.SP_Seguridad_RegistrarCliente N'ANA.LOPEZ@shopcart.test', @Hash, N'Otra', N'Persona';
    REVERT;
END TRY
BEGIN CATCH
    SET @Error = ERROR_NUMBER();
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    REVERT;
END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
EXEC #Verificar N'Registrar: correo repetido (otras mayúsculas) → CORREO_REGISTRADO', N'51101', @Error;

/* Validaciones: cada una en su transacción (el error la condena). */
DECLARE @Casos TABLE (Orden INT IDENTITY, Descripcion NVARCHAR(200), Correo NVARCHAR(400), HashContrasena VARCHAR(300),
                      Nombre NVARCHAR(200), Apellido NVARCHAR(200), Telefono NVARCHAR(100), Esperado INT);
INSERT INTO @Casos (Descripcion, Correo, HashContrasena, Nombre, Apellido, Telefono, Esperado) VALUES
    (N'correo sin arroba',                       N'ana.shopcart.test',  @Hash,             N'Ana', N'López', NULL,          50001),
    (N'correo con espacio interno',              N'ana lopez@shop.test', @Hash,            N'Ana', N'López', NULL,          50001),
    (N'correo NULL',                             NULL,                  @Hash,             N'Ana', N'López', NULL,          50001),
    (N'correo de más de 254 caracteres (no se recorta)', REPLICATE(N'a', 243) + N'@shopcart.test', @Hash, N'Ana', N'López', NULL, 50001),
    (N'contraseña en texto plano',               N'ana@shop.test',      'MiClave12345',    N'Ana', N'López', NULL,          50002),
    (N'hash NULL',                               N'ana@shop.test',      NULL,              N'Ana', N'López', NULL,          50002),
    (N'nombre solo con espacios',                N'ana@shop.test',      @Hash,             N'   ', N'López', NULL,          50003),
    (N'apellido de 101 caracteres',              N'ana@shop.test',      @Hash,             N'Ana', REPLICATE(N'x', 101), NULL, 50003),
    (N'teléfono con letras',                     N'ana@shop.test',      @Hash,             N'Ana', N'López', N'5555-ABCD',  50004),
    (N'teléfono con dígito superíndice',         N'ana@shop.test',      @Hash,             N'Ana', N'López', N'5555²',      50004);

DECLARE @Orden INT = 1, @Descripcion NVARCHAR(200), @Correo NVARCHAR(400), @HashCaso VARCHAR(300),
        @Nombre NVARCHAR(200), @Apellido NVARCHAR(200), @Telefono NVARCHAR(100), @Esperado INT;
WHILE @Orden <= (SELECT MAX(Orden) FROM @Casos)
BEGIN
    SELECT @Descripcion = Descripcion, @Correo = Correo, @HashCaso = HashContrasena, @Nombre = Nombre,
           @Apellido = Apellido, @Telefono = Telefono, @Esperado = Esperado
    FROM @Casos WHERE Orden = @Orden;

    BEGIN TRANSACTION;
    EXEC #Preparar;
    SET @Error = 0;
    BEGIN TRY
        EXECUTE AS USER = @Api;
        EXEC dbo.SP_Seguridad_RegistrarCliente @Correo, @HashCaso, @Nombre, @Apellido, @Telefono;
        REVERT;
    END TRY
    BEGIN CATCH
        SET @Error = ERROR_NUMBER();
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        REVERT;
    END CATCH;
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;

    SET @Descripcion = N'Registrar: ' + @Descripcion;
    SET @Texto = CAST(@Esperado AS NVARCHAR(10));
    DECLARE @Obtenido NVARCHAR(10) = CAST(@Error AS NVARCHAR(10));
    EXEC #Verificar @Descripcion, @Texto, @Obtenido;
    SET @Orden += 1;
END;

/* === SP_Seguridad_ObtenerCredenciales ===================================================== */
BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDCliente = IDCliente, @IDSistema = IDSistema FROM #Base;
EXECUTE AS USER = @Api;
INSERT INTO #Credenciales EXEC dbo.SP_Seguridad_ObtenerCredenciales @Correo = N' CLIENTE.Prueba@shopcart.test ';
INSERT INTO #Credenciales EXEC dbo.SP_Seguridad_ObtenerCredenciales @IDUsuario = @IDCliente;
INSERT INTO #Credenciales EXEC dbo.SP_Seguridad_ObtenerCredenciales @Correo = N'no.existe@shopcart.test';
INSERT INTO #Credenciales EXEC dbo.SP_Seguridad_ObtenerCredenciales @IDUsuario = @IDSistema;
REVERT;
SET @Texto = (SELECT CONCAT(COUNT(*), N'|', MIN(CodigoRol), N'|', SUM(CASE WHEN IDUsuario = @IDCliente AND HashContrasena = @Hash THEN 1 ELSE 0 END))
              FROM #Credenciales);
EXEC #Verificar N'Credenciales: por correo (sin normalizar) y por ID; ni el correo inexistente ni el sistema devuelven fila',
     N'2|CLIENTE|2', @Texto;
ROLLBACK TRANSACTION;

SET @Error = 0;
BEGIN TRY
    EXECUTE AS USER = @Api;
    EXEC dbo.SP_Seguridad_ObtenerCredenciales @Correo = N'a@b.com', @IDUsuario = 1;
    REVERT;
END TRY
BEGIN CATCH
    SET @Error = ERROR_NUMBER();
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    REVERT;
END CATCH;
EXEC #Verificar N'Credenciales: correo y usuario a la vez → PARAMETRO_REQUERIDO', N'50006', @Error;

/* === SP_Seguridad_IniciarSesion =========================================================== */
BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDCliente = IDCliente FROM #Base;
SET @Ahora = SYSUTCDATETIME();
EXEC #IniciarSesion @IDCliente, @TokenA;
SET @Texto = (SELECT CONCAT(s.CodigoRol, N'|', DATEDIFF(DAY, t.FechaCreacion, s.FechaExpiracion), N'|',
                            DATEDIFF(DAY, t.FechaCreacion, s.FechaExpiracionSesion), N'|',
                            CASE WHEN t.FechaExpiracion = s.FechaExpiracion AND t.FechaRevocacion IS NULL THEN N'guardado' END, N'|',
                            CASE WHEN u.UltimoAcceso >= @Ahora THEN N'acceso' END)
              FROM #Sesion AS s
              JOIN dbo.RefreshToken AS t ON t.TokenHash = @TokenA
              JOIN dbo.Usuario AS u ON u.IDUsuario = s.IDUsuario);
EXEC #Verificar N'Iniciar sesión: token de 7 días, sesión de 30, guardado vigente y UltimoAcceso actualizado',
     N'CLIENTE|7|30|guardado|acceso', @Texto;

-- Si la inactividad supera el máximo, el token no puede vencer después de la sesión.
UPDATE dbo.Parametro SET Valor = N'40' WHERE Clave = 'SESION_DIAS_INACTIVIDAD';
DELETE FROM #Sesion;
EXEC #IniciarSesion @IDCliente, @TokenB;
SET @Texto = (SELECT CASE WHEN FechaExpiracion = FechaExpiracionSesion THEN N'sí' ELSE N'no' END FROM #Sesion);
EXEC #Verificar N'Iniciar sesión: con inactividad de 40 días el token vence con la sesión (30)', N'sí', @Texto;
ROLLBACK TRANSACTION;

DECLARE @Sesiones TABLE (Orden INT IDENTITY, Descripcion NVARCHAR(200), Preparacion VARCHAR(20), Token VARBINARY(64), Esperado INT);
INSERT INTO @Sesiones (Descripcion, Preparacion, Token, Esperado) VALUES
    (N'usuario desactivado → USUARIO_INACTIVO',          'INACTIVO',   @TokenA,           50301),
    (N'usuario de sistema → USUARIO_INACTIVO',           'SISTEMA',    @TokenA,           50301),
    (N'hash de 16 bytes → PARAMETRO_REQUERIDO',          NULL,         0x0102030405060708090A0B0C0D0E0F10, 50006),
    (N'sin SESION_DIAS_MAXIMO → CONFIGURACION_INCOMPLETA', 'SIN_PARAMETRO', @TokenA,      59001);

SET @Orden = 1;
DECLARE @Preparacion VARCHAR(20), @Token VARBINARY(64), @IDUsuarioCaso INT;
WHILE @Orden <= (SELECT MAX(Orden) FROM @Sesiones)
BEGIN
    SELECT @Descripcion = Descripcion, @Preparacion = Preparacion, @Token = Token, @Esperado = Esperado
    FROM @Sesiones WHERE Orden = @Orden;

    BEGIN TRANSACTION;
    EXEC #Preparar;
    SELECT @IDUsuarioCaso = CASE @Preparacion WHEN 'SISTEMA' THEN IDSistema ELSE IDCliente END FROM #Base;
    IF @Preparacion = 'INACTIVO'      UPDATE dbo.Usuario SET Activo = 0 WHERE IDUsuario = @IDUsuarioCaso;
    IF @Preparacion = 'SIN_PARAMETRO' DELETE FROM dbo.Parametro WHERE Clave = 'SESION_DIAS_MAXIMO';

    SET @Error = 0;
    BEGIN TRY
        EXECUTE AS USER = @Api;
        EXEC dbo.SP_Seguridad_IniciarSesion @IDUsuarioCaso, @Token;
        REVERT;
    END TRY
    BEGIN CATCH
        SET @Error = ERROR_NUMBER();
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        REVERT;
    END CATCH;
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;

    SET @Descripcion = N'Iniciar sesión: ' + @Descripcion;
    SET @Texto = CAST(@Esperado AS NVARCHAR(10));
    SET @Obtenido = CAST(@Error AS NVARCHAR(10));
    EXEC #Verificar @Descripcion, @Texto, @Obtenido;
    SET @Orden += 1;
END;

/* === SP_Seguridad_RotarSesion ============================================================= */
BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDCliente = IDCliente FROM #Base;
EXEC #IniciarSesion @IDCliente, @TokenA;

EXEC #Rotar @TokenA, @TokenB, @Resultado OUTPUT;
SET @Texto = (SELECT CONCAT(r.Resultado, N'|', r.Correo, N'|',
                            CASE WHEN nuevo.Familia = actual.Familia THEN N'misma familia' END, N'|',
                            CASE WHEN nuevo.FechaExpiracionSesion = actual.FechaExpiracionSesion
                                      AND r.FechaExpiracionSesion = actual.FechaExpiracionSesion THEN N'mismo máximo' END, N'|',
                            actual.MotivoRevocacion, N'|',
                            CASE WHEN actual.IDRefreshTokenReemplazo = nuevo.IDRefreshToken THEN N'enlazado' END, N'|',
                            CASE WHEN nuevo.FechaRevocacion IS NULL AND r.FechaExpiracion = nuevo.FechaExpiracion THEN N'nuevo vigente' END)
              FROM #Rotacion AS r
              JOIN dbo.RefreshToken AS actual ON actual.TokenHash = @TokenA
              JOIN dbo.RefreshToken AS nuevo ON nuevo.TokenHash = @TokenB);
EXEC #Verificar N'Rotar: emite el nuevo en la misma familia, conserva el máximo y revoca el actual enlazado',
     N'ROTADO|cliente.prueba@shopcart.test|misma familia|mismo máximo|ROTACION|enlazado|nuevo vigente', @Texto;

-- Otra pestaña presenta el token recién rotado: se rechaza sin cerrar la sesión.
EXEC #Rotar @TokenA, @TokenC, @Resultado OUTPUT;
SET @Texto = (SELECT CONCAT(@Resultado, N'|', ISNULL(r.Correo, N'sin datos'), N'|',
                            (SELECT COUNT(*) FROM dbo.RefreshToken WHERE TokenHash = @TokenC), N'|',
                            (SELECT CASE WHEN FechaRevocacion IS NULL THEN N'B vigente' END FROM dbo.RefreshToken WHERE TokenHash = @TokenB))
              FROM #Rotacion AS r);
EXEC #Verificar N'Rotar: token rotado dentro de la gracia → ROTACION_CONCURRENTE, sin datos, sin token nuevo y B sigue vigente',
     N'ROTACION_CONCURRENTE|sin datos|0|B vigente', @Texto;

-- El mismo token presentado 5 minutos después: se asume robado.
UPDATE dbo.RefreshToken SET FechaRevocacion = DATEADD(MINUTE, -5, FechaRevocacion) WHERE TokenHash = @TokenA;
EXEC #Rotar @TokenA, @TokenC, @Resultado OUTPUT;
SET @Texto = (SELECT CONCAT(@Resultado, N'|', MotivoRevocacion) FROM dbo.RefreshToken WHERE TokenHash = @TokenB);
EXEC #Verificar N'Rotar: token rotado fuera de la gracia → REUSO_DETECTADO y revoca la familia (B)',
     N'REUSO_DETECTADO|REUSO_DETECTADO', @Texto;

EXEC #Rotar @TokenB, @TokenC, @Resultado OUTPUT;
EXEC #Verificar N'Rotar: el token revocado por reúso ya no sirve → SESION_INVALIDA', N'SESION_INVALIDA', @Resultado;

EXEC #Rotar @TokenD, @TokenC, @Resultado OUTPUT;
EXEC #Verificar N'Rotar: token desconocido → SESION_INVALIDA', N'SESION_INVALIDA', @Resultado;
ROLLBACK TRANSACTION;

BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDCliente = IDCliente FROM #Base;
EXEC #IniciarSesion @IDCliente, @TokenA;
UPDATE dbo.RefreshToken
SET FechaCreacion = DATEADD(DAY, -8, FechaCreacion), FechaExpiracion = DATEADD(DAY, -1, SYSUTCDATETIME())
WHERE TokenHash = @TokenA;
EXEC #Rotar @TokenA, @TokenB, @Resultado OUTPUT;
SET @Texto = CONCAT(@Resultado, N'|', (SELECT COUNT(*) FROM dbo.RefreshToken WHERE TokenHash = @TokenB));
EXEC #Verificar N'Rotar: token vencido por inactividad → SESION_EXPIRADA, sin token nuevo', N'SESION_EXPIRADA|0', @Texto;
ROLLBACK TRANSACTION;

BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDCliente = IDCliente FROM #Base;
EXEC #IniciarSesion @IDCliente, @TokenA;
-- Sesión iniciada hace 28 días: quedan 2 para el máximo, menos que la inactividad (7).
UPDATE dbo.RefreshToken
SET FechaCreacion = DATEADD(DAY, -28, FechaCreacion), FechaExpiracionSesion = DATEADD(DAY, 2, SYSUTCDATETIME()),
    FechaExpiracion = DATEADD(DAY, 1, SYSUTCDATETIME())
WHERE TokenHash = @TokenA;
EXEC #Rotar @TokenA, @TokenB, @Resultado OUTPUT;
SET @Texto = (SELECT CONCAT(@Resultado, N'|', CASE WHEN FechaExpiracion = FechaExpiracionSesion THEN N'tope en el máximo' END)
              FROM dbo.RefreshToken WHERE TokenHash = @TokenB);
EXEC #Verificar N'Rotar: cerca del máximo, el nuevo token vence con la sesión (D11)', N'ROTADO|tope en el máximo', @Texto;
ROLLBACK TRANSACTION;

BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDCliente = IDCliente FROM #Base;
EXEC #IniciarSesion @IDCliente, @TokenA;
UPDATE dbo.Usuario SET Activo = 0 WHERE IDUsuario = @IDCliente;  -- sin pasar por el SP: el token quedó vigente
EXEC #Rotar @TokenA, @TokenB, @Resultado OUTPUT;
SET @Texto = (SELECT CONCAT(@Resultado, N'|', MotivoRevocacion) FROM dbo.RefreshToken WHERE TokenHash = @TokenA);
EXEC #Verificar N'Rotar: usuario desactivado → USUARIO_INACTIVO y revoca la familia', N'USUARIO_INACTIVO|USUARIO_DESACTIVADO', @Texto;
ROLLBACK TRANSACTION;

BEGIN TRANSACTION;
EXEC #Preparar;
DELETE FROM dbo.Parametro WHERE Clave = 'SESION_SEGUNDOS_GRACIA';
SET @Error = 0;
BEGIN TRY
    EXEC #Rotar @TokenA, @TokenB, @Resultado OUTPUT;
END TRY
BEGIN CATCH
    SET @Error = ERROR_NUMBER();
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
EXEC #Verificar N'Rotar: sin SESION_SEGUNDOS_GRACIA → CONFIGURACION_INCOMPLETA', N'59001', @Error;

SET @Error = 0;
BEGIN TRY
    EXEC #Rotar @TokenA, 0x01, @Resultado OUTPUT;
END TRY
BEGIN CATCH
    SET @Error = ERROR_NUMBER();
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
END CATCH;
EXEC #Verificar N'Rotar: hash nuevo de 1 byte → PARAMETRO_REQUERIDO', N'50006', @Error;

/* === SP_Seguridad_CerrarSesion ============================================================ */
BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDCliente = IDCliente FROM #Base;
EXEC #IniciarSesion @IDCliente, @TokenA;
EXEC #IniciarSesion @IDCliente, @TokenD;              -- otra sesión (otro dispositivo)
EXEC #Rotar @TokenA, @TokenB, @Resultado OUTPUT;      -- B es el vigente de la primera sesión
EXECUTE AS USER = @Api;
INSERT INTO #Conteo EXEC dbo.SP_Seguridad_CerrarSesion @TokenHash = @TokenA;  -- la otra pestaña aún tenía A
REVERT;
SET @Texto = CONCAT((SELECT Cantidad FROM #Conteo), N'|',
                    (SELECT MotivoRevocacion FROM dbo.RefreshToken WHERE TokenHash = @TokenB), N'|',
                    (SELECT ISNULL(MotivoRevocacion, N'D vigente') FROM dbo.RefreshToken WHERE TokenHash = @TokenD));
EXEC #Verificar N'Cerrar sesión: con un token ya rotado revoca el vigente de su familia y no toca otras sesiones',
     N'1|CIERRE_SESION|D vigente', @Texto;

EXEC #Rotar @TokenB, @TokenC, @Resultado OUTPUT;
EXEC #Verificar N'Cerrar sesión: el token cerrado ya no rota', N'SESION_INVALIDA', @Resultado;

DELETE FROM #Conteo;
EXECUTE AS USER = @Api;
INSERT INTO #Conteo EXEC dbo.SP_Seguridad_CerrarSesion @TokenHash = @TokenC;
INSERT INTO #Conteo EXEC dbo.SP_Seguridad_CerrarSesion @TokenHash = NULL;
REVERT;
SET @Texto = (SELECT CONCAT(COUNT(*), N'|', SUM(Cantidad)) FROM #Conteo);
EXEC #Verificar N'Cerrar sesión: token desconocido o NULL termina sin error y sin cambios', N'2|0', @Texto;
ROLLBACK TRANSACTION;

/* === SP_Seguridad_CambiarContrasena ======================================================= */
BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDCliente = IDCliente FROM #Base;
EXEC #IniciarSesion @IDCliente, @TokenA;
EXEC #IniciarSesion @IDCliente, @TokenB;
EXEC #IniciarSesion @IDCliente, @TokenC;
EXECUTE AS USER = @Api;
INSERT INTO #Conteo EXEC dbo.SP_Seguridad_CambiarContrasena @IDCliente, @HashNuevo, @TokenA;
REVERT;
SET @Texto = CONCAT((SELECT Cantidad FROM #Conteo), N'|',
                    (SELECT CASE WHEN HashContrasena = @HashNuevo THEN N'hash nuevo' END FROM dbo.Usuario WHERE IDUsuario = @IDCliente), N'|',
                    (SELECT ISNULL(MotivoRevocacion, N'A vigente') FROM dbo.RefreshToken WHERE TokenHash = @TokenA), N'|',
                    (SELECT MotivoRevocacion FROM dbo.RefreshToken WHERE TokenHash = @TokenC));
EXEC #Verificar N'Cambiar contraseña: guarda el hash y cierra las otras sesiones, no la actual',
     N'2|hash nuevo|A vigente|CAMBIO_CONTRASENA', @Texto;
ROLLBACK TRANSACTION;

BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDCliente = IDCliente FROM #Base;
SET @Error = 0;
BEGIN TRY
    EXECUTE AS USER = @Api;
    EXEC dbo.SP_Seguridad_CambiarContrasena @IDCliente, 'MiClave12345';
    REVERT;
END TRY
BEGIN CATCH
    SET @Error = ERROR_NUMBER();
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    REVERT;
END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
EXEC #Verificar N'Cambiar contraseña: texto plano → HASH_INVALIDO', N'50002', @Error;

BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDCliente = IDCliente FROM #Base;
UPDATE dbo.Usuario SET Activo = 0 WHERE IDUsuario = @IDCliente;
SET @Error = 0;
BEGIN TRY
    EXECUTE AS USER = @Api;
    EXEC dbo.SP_Seguridad_CambiarContrasena @IDCliente, @HashNuevo;
    REVERT;
END TRY
BEGIN CATCH
    SET @Error = ERROR_NUMBER();
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    REVERT;
END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
EXEC #Verificar N'Cambiar contraseña: usuario desactivado → USUARIO_NO_ENCONTRADO', N'50101', @Error;

/* === SP_Usuarios_ObtenerPerfil / SP_Usuarios_ActualizarPerfil ============================= */
BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDCliente = IDCliente FROM #Base;
EXECUTE AS USER = @Api;
INSERT INTO #Perfil EXEC dbo.SP_Usuarios_ObtenerPerfil @IDUsuarioSolicitante = @IDCliente;
INSERT INTO #Perfil EXEC dbo.SP_Usuarios_ActualizarPerfil @IDCliente, N' Carla ', N' Méndez ', N'';
REVERT;
SET @Texto = (SELECT STRING_AGG(CONCAT(Nombre, N' ', Apellido, N' ', ISNULL(Telefono, 'NULL'), N' ', CodigoRol), N' → ')
                     WITHIN GROUP (ORDER BY CASE WHEN Nombre = N'Cliente' THEN 1 ELSE 2 END)
              FROM #Perfil);
EXEC #Verificar N'Perfil: lo devuelve y lo actualiza (recorta textos, teléfono vacío = NULL)',
     N'Cliente Prueba 5555-1234 CLIENTE → Carla Méndez NULL CLIENTE', @Texto;
ROLLBACK TRANSACTION;

BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDCliente = IDCliente FROM #Base;
SET @Error = 0;
BEGIN TRY
    EXECUTE AS USER = @Api;
    EXEC dbo.SP_Usuarios_ActualizarPerfil @IDCliente, N'Carla', NULL;
    REVERT;
END TRY
BEGIN CATCH
    SET @Error = ERROR_NUMBER();
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    REVERT;
END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
EXEC #Verificar N'Perfil: apellido NULL → NOMBRE_INVALIDO', N'50003', @Error;

BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDSistema = IDSistema FROM #Base;
SET @Error = 0;
BEGIN TRY
    EXECUTE AS USER = @Api;
    EXEC dbo.SP_Usuarios_ObtenerPerfil @IDSistema;
    REVERT;
END TRY
BEGIN CATCH
    SET @Error = ERROR_NUMBER();
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    REVERT;
END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
EXEC #Verificar N'Perfil: el usuario de sistema no tiene perfil → USUARIO_NO_ENCONTRADO', N'50101', @Error;

/* === SP_Usuarios_CrearInterno ============================================================= */
BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDAdmin = IDAdmin FROM #Base;
EXECUTE AS USER = @Api;
INSERT INTO #Detalle EXEC dbo.SP_Usuarios_CrearInterno
    @IDUsuarioAccion = @IDAdmin, @Correo = N'Nuevo.Operador@ShopCart.test', @HashContrasena = @Hash,
    @Nombre = N'Nuevo', @Apellido = N'Operador', @CodigoRol = 'OPERADOR';
REVERT;
SELECT @IDNuevo = IDUsuario, @Texto = CONCAT(Correo, N'|', CodigoRol, N'|', Activo) FROM #Detalle;
EXEC #Verificar N'Crear interno: crea el operador activo con el correo normalizado',
     N'nuevo.operador@shopcart.test|OPERADOR|1', @Texto;
SET @Texto = (SELECT CONCAT(COUNT(*), N'|', MIN(b.Accion), N'|', MIN(JSON_VALUE(b.ValorNuevo, '$.CodigoRol')), N'|',
                            SUM(CASE WHEN b.ValorNuevo LIKE N'%argon2id%' OR b.ValorNuevo LIKE N'%HashContrasena%' THEN 1 ELSE 0 END))
              FROM dbo.Bitacora AS b
              WHERE b.Modulo = 'USUARIOS' AND b.IDEntidad = CAST(@IDNuevo AS VARCHAR(50)) AND b.IDUsuario = @IDAdmin);
EXEC #Verificar N'Crear interno: bitácora CREAR por el admin, sin el hash', N'1|CREAR|OPERADOR|0', @Texto;
ROLLBACK TRANSACTION;

DECLARE @Internos TABLE (Orden INT IDENTITY, Descripcion NVARCHAR(200), Actor VARCHAR(20), Correo NVARCHAR(254),
                         CodigoRol VARCHAR(20), Esperado INT);
INSERT INTO @Internos (Descripcion, Actor, Correo, CodigoRol, Esperado) VALUES
    (N'un operador no puede crear usuarios → PERMISO_DENEGADO',       'OPERADOR',       N'x@shopcart.test', 'OPERADOR', 50201),
    (N'un cliente no puede crear usuarios → PERMISO_DENEGADO',        'CLIENTE',        N'x@shopcart.test', 'OPERADOR', 50201),
    (N'un admin desactivado no puede crear usuarios → PERMISO_DENEGADO', 'ADMIN_INACTIVO', N'x@shopcart.test', 'OPERADOR', 50201),
    (N'rol CLIENTE → ROL_INVALIDO',                                   'ADMIN',          N'x@shopcart.test', 'CLIENTE',  50005),
    (N'rol inexistente → ROL_INVALIDO',                               'ADMIN',          N'x@shopcart.test', 'SUPERVISOR', 50005),
    (N'correo de otro usuario → CORREO_REGISTRADO',                   'ADMIN',          N'Cliente.Prueba@shopcart.test', 'ADMIN', 51101);

SET @Orden = 1;
DECLARE @Actor VARCHAR(20), @CodigoRol VARCHAR(20), @IDActor INT;
WHILE @Orden <= (SELECT MAX(Orden) FROM @Internos)
BEGIN
    SELECT @Descripcion = Descripcion, @Actor = Actor, @Correo = Correo, @CodigoRol = CodigoRol, @Esperado = Esperado
    FROM @Internos WHERE Orden = @Orden;

    BEGIN TRANSACTION;
    EXEC #Preparar;
    SELECT @IDActor = CASE @Actor WHEN 'OPERADOR' THEN IDOperador WHEN 'CLIENTE' THEN IDCliente ELSE IDAdmin END FROM #Base;
    IF @Actor = 'ADMIN_INACTIVO' UPDATE dbo.Usuario SET Activo = 0 WHERE IDUsuario = @IDActor;

    SET @Error = 0;
    BEGIN TRY
        EXECUTE AS USER = @Api;
        EXEC dbo.SP_Usuarios_CrearInterno @IDActor, @Correo, @Hash, N'Nuevo', N'Usuario', NULL, @CodigoRol;
        REVERT;
    END TRY
    BEGIN CATCH
        SET @Error = ERROR_NUMBER();
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        REVERT;
    END CATCH;
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;

    SET @Descripcion = N'Crear interno: ' + @Descripcion;
    SET @Texto = CAST(@Esperado AS NVARCHAR(10));
    SET @Obtenido = CAST(@Error AS NVARCHAR(10));
    EXEC #Verificar @Descripcion, @Texto, @Obtenido;
    SET @Orden += 1;
END;

/* === SP_Usuarios_CambiarEstado ============================================================ */
BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDAdmin = IDAdmin, @IDCliente = IDCliente FROM #Base;
EXEC #IniciarSesion @IDCliente, @TokenA;
EXEC #IniciarSesion @IDCliente, @TokenB;
EXECUTE AS USER = @Api;
INSERT INTO #Estado EXEC dbo.SP_Usuarios_CambiarEstado @IDAdmin, @IDCliente, 0;
INSERT INTO #Estado EXEC dbo.SP_Usuarios_CambiarEstado @IDAdmin, @IDCliente, 0;
REVERT;
SET @Texto = (SELECT STRING_AGG(CONCAT(Activo, N'/', EstadoCambiado, N'/', SesionesRevocadas), N' ') FROM #Estado);
EXEC #Verificar N'Cambiar estado: desactiva y revoca 2 sesiones; repetirlo no cambia nada', N'0/1/2 0/0/0', @Texto;
SET @Texto = (SELECT CONCAT(COUNT(*), N'|', MIN(MotivoRevocacion)) FROM dbo.RefreshToken WHERE IDUsuario = @IDCliente);
EXEC #Verificar N'Cambiar estado: las sesiones quedan revocadas por USUARIO_DESACTIVADO', N'2|USUARIO_DESACTIVADO', @Texto;

EXEC #Rotar @TokenA, @TokenC, @Resultado OUTPUT;
EXEC #Verificar N'Cambiar estado: la sesión del usuario desactivado ya no rota', N'SESION_INVALIDA', @Resultado;

DELETE FROM #Estado;
EXECUTE AS USER = @Api;
INSERT INTO #Estado EXEC dbo.SP_Usuarios_CambiarEstado @IDAdmin, @IDCliente, 1;
REVERT;
SET @Texto = (SELECT STRING_AGG(CONCAT(b.Accion, N' ', b.ValorAnterior, N'→', b.ValorNuevo), N' · ') WITHIN GROUP (ORDER BY b.IDBitacora)
              FROM dbo.Bitacora AS b
              WHERE b.Modulo = 'USUARIOS' AND b.IDEntidad = CAST(@IDCliente AS VARCHAR(50)) AND b.IDUsuario = @IDAdmin);
EXEC #Verificar N'Cambiar estado: bitácora de desactivar y activar (la repetición no se registra)',
     N'DESACTIVAR {"Activo":true}→{"Activo":false,"SesionesRevocadas":2} · ACTIVAR {"Activo":false}→{"Activo":true,"SesionesRevocadas":0}', @Texto;
ROLLBACK TRANSACTION;

DECLARE @Estados TABLE (Orden INT IDENTITY, Descripcion NVARCHAR(200), Actor VARCHAR(20), Objetivo VARCHAR(20), Activo BIT, Esperado INT);
INSERT INTO @Estados (Descripcion, Actor, Objetivo, Activo, Esperado) VALUES
    (N'un operador no puede cambiar estados → PERMISO_DENEGADO',   'OPERADOR', 'CLIENTE',    0, 50201),
    (N'usuario inexistente → USUARIO_NO_ENCONTRADO',               'ADMIN',    'INEXISTENTE', 0, 50101),
    (N'usuario de sistema → USUARIO_SISTEMA_PROTEGIDO',            'ADMIN',    'SISTEMA',    0, 51102),
    (N'el admin no puede desactivarse → AUTODESACTIVACION_NO_PERMITIDA', 'ADMIN', 'ADMIN',   0, 51103),
    (N'estado NULL → PARAMETRO_REQUERIDO',                         'ADMIN',    'CLIENTE',    NULL, 50006);

SET @Orden = 1;
DECLARE @Objetivo VARCHAR(20), @IDObjetivo INT, @ActivoCaso BIT;
WHILE @Orden <= (SELECT MAX(Orden) FROM @Estados)
BEGIN
    SELECT @Descripcion = Descripcion, @Actor = Actor, @Objetivo = Objetivo, @ActivoCaso = Activo, @Esperado = Esperado
    FROM @Estados WHERE Orden = @Orden;

    BEGIN TRANSACTION;
    EXEC #Preparar;
    SELECT @IDActor = CASE @Actor WHEN 'OPERADOR' THEN IDOperador ELSE IDAdmin END,
           @IDObjetivo = CASE @Objetivo WHEN 'CLIENTE' THEN IDCliente WHEN 'SISTEMA' THEN IDSistema
                                        WHEN 'ADMIN' THEN IDAdmin ELSE -1 END
    FROM #Base;

    SET @Error = 0;
    BEGIN TRY
        EXECUTE AS USER = @Api;
        EXEC dbo.SP_Usuarios_CambiarEstado @IDActor, @IDObjetivo, @ActivoCaso;
        REVERT;
    END TRY
    BEGIN CATCH
        SET @Error = ERROR_NUMBER();
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        REVERT;
    END CATCH;
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;

    SET @Descripcion = N'Cambiar estado: ' + @Descripcion;
    SET @Texto = CAST(@Esperado AS NVARCHAR(10));
    SET @Obtenido = CAST(@Error AS NVARCHAR(10));
    EXEC #Verificar @Descripcion, @Texto, @Obtenido;
    SET @Orden += 1;
END;

/* === SP_Usuarios_Listar =================================================================== */
BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDAdmin = IDAdmin, @IDCliente = IDCliente FROM #Base;
INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido, Activo)
SELECT r.IDRol, v.Correo, @Hash, v.Nombre, N'Listado', v.Activo
FROM dbo.Rol AS r
CROSS JOIN (VALUES (N'listado.uno@shopcart.test', N'Uno', 1), (N'listado.dos@shopcart.test', N'Dos', 1),
                   (N'listado.tres@shopcart.test', N'Tres', 0), (N'listado_100%@shopcart.test', N'Cien', 1)) AS v (Correo, Nombre, Activo)
WHERE r.Codigo = 'CLIENTE';

EXECUTE AS USER = @Api;
INSERT INTO #Detalle EXEC dbo.SP_Usuarios_Listar @IDAdmin, @CodigoRol = 'CLIENTE', @Busqueda = N'listado',
                                                 @Pagina = 1, @TamanoPagina = 2, @TotalRegistros = @Total OUTPUT;
REVERT;
SET @Texto = CONCAT(@Total, N'|', (SELECT COUNT(*) FROM #Detalle), N'|',
                    (SELECT STRING_AGG(Nombre, N',') WITHIN GROUP (ORDER BY IDUsuario DESC) FROM #Detalle));
EXEC #Verificar N'Listar: total filtrado, página de 2, más recientes primero', N'4|2|Cien,Tres', @Texto;

DELETE FROM #Detalle;
EXECUTE AS USER = @Api;
INSERT INTO #Detalle EXEC dbo.SP_Usuarios_Listar @IDAdmin, @Busqueda = N'listado', @Activo = 0, @TotalRegistros = @Total OUTPUT;
INSERT INTO #Detalle EXEC dbo.SP_Usuarios_Listar @IDAdmin, @Busqueda = N'_100%', @TotalRegistros = @Total OUTPUT;
INSERT INTO #Detalle EXEC dbo.SP_Usuarios_Listar @IDAdmin, @Busqueda = N'Dos Listado', @TotalRegistros = @Total OUTPUT;
INSERT INTO #Detalle EXEC dbo.SP_Usuarios_Listar @IDAdmin, @Busqueda = N'listado', @Pagina = 3, @TamanoPagina = 2,
                                                 @TotalRegistros = @Total OUTPUT;
REVERT;
SET @Texto = (SELECT STRING_AGG(Nombre, N',') WITHIN GROUP (ORDER BY Nombre DESC) FROM #Detalle);
EXEC #Verificar N'Listar: filtro inactivos, % y _ como texto, nombre completo y página fuera de rango vacía',
     N'Tres,Dos,Cien', @Texto;
EXEC #Verificar N'Listar: la página fuera de rango igual informa el total', N'4', @Total;

DELETE FROM #Detalle;
EXECUTE AS USER = @Api;
INSERT INTO #Detalle EXEC dbo.SP_Usuarios_Listar @IDAdmin, @TamanoPagina = 100, @TotalRegistros = @Total OUTPUT;
REVERT;
SET @Texto = CONCAT((SELECT COUNT(*) FROM #Detalle d JOIN dbo.Usuario u ON u.IDUsuario = d.IDUsuario WHERE u.EsSistema = 1), N'|',
                    CASE WHEN @Total = (SELECT COUNT(*) FROM dbo.Usuario WHERE EsSistema = 0) THEN N'todos' END);
EXEC #Verificar N'Listar: sin filtros incluye a todos menos al usuario de sistema', N'0|todos', @Texto;
ROLLBACK TRANSACTION;

DECLARE @Listados TABLE (Orden INT IDENTITY, Descripcion NVARCHAR(200), Actor VARCHAR(20), Pagina INT, TamanoPagina INT,
                         Busqueda NVARCHAR(200), Esperado INT);
INSERT INTO @Listados (Descripcion, Actor, Pagina, TamanoPagina, Busqueda, Esperado) VALUES
    (N'un cliente no puede listar → PERMISO_DENEGADO',   'CLIENTE', 1, 20,  NULL, 50201),
    (N'página 0 → PAGINACION_INVALIDA',                  'ADMIN',   0, 20,  NULL, 50007),
    (N'tamaño 101 → PAGINACION_INVALIDA',                'ADMIN',   1, 101, NULL, 50007),
    (N'búsqueda de 101 caracteres → BUSQUEDA_INVALIDA',  'ADMIN',   1, 20,  REPLICATE(N'b', 101), 50008);

SET @Orden = 1;
DECLARE @Pagina INT, @TamanoPagina INT, @Busqueda NVARCHAR(200);
WHILE @Orden <= (SELECT MAX(Orden) FROM @Listados)
BEGIN
    SELECT @Descripcion = Descripcion, @Actor = Actor, @Pagina = Pagina, @TamanoPagina = TamanoPagina,
           @Busqueda = Busqueda, @Esperado = Esperado
    FROM @Listados WHERE Orden = @Orden;

    BEGIN TRANSACTION;
    EXEC #Preparar;
    SELECT @IDActor = CASE @Actor WHEN 'CLIENTE' THEN IDCliente ELSE IDAdmin END FROM #Base;

    SET @Error = 0;
    BEGIN TRY
        EXECUTE AS USER = @Api;
        EXEC dbo.SP_Usuarios_Listar @IDActor, NULL, NULL, @Busqueda, @Pagina, @TamanoPagina;
        REVERT;
    END TRY
    BEGIN CATCH
        SET @Error = ERROR_NUMBER();
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        REVERT;
    END CATCH;
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;

    SET @Descripcion = N'Listar: ' + @Descripcion;
    SET @Texto = CAST(@Esperado AS NVARCHAR(10));
    SET @Obtenido = CAST(@Error AS NVARCHAR(10));
    EXEC #Verificar @Descripcion, @Texto, @Obtenido;
    SET @Orden += 1;
END;

/* --- Resultado ---------------------------------------------------------------------------- */
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = NULL;

IF CAST(SESSION_CONTEXT(N'PruebasFallidas') AS INT) > 0
    THROW 50000, N'Pruebas de procedimientos de seguridad fallidas.', 1;
EXEC sys.sp_set_session_context @key = N'PruebasFallidas', @value = NULL;
GO
