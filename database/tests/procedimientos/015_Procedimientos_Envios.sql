/*
    015_Procedimientos_Envios.sql
    Se ejecuta conectado como shopcart_migrator (deploy.ps1 -Probar). Mismo esquema que
    009–014: el migrador prepara los datos y ejecuta cada SP haciéndose pasar por un miembro
    de RolApi; los casos de error usan #EsperarError. Los datos de prueba llevan "Envios Prueba".
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT OFF;
GO

-- Permite ejecutar el script varias veces en la misma conexión (p. ej. en SSMS).
DROP TABLE IF EXISTS #Contexto, #Base, #Version, #Ultima, #Departamentos, #Municipios, #MetodosTienda, #Direcciones, #Metodo, #Metodos;
DROP PROCEDURE IF EXISTS #Verificar;
DROP PROCEDURE IF EXISTS #Preparar;
DROP PROCEDURE IF EXISTS #EsperarError;
GO

CREATE TABLE #Contexto (UsuarioApi SYSNAME NOT NULL);
CREATE TABLE #Base (IDAdmin INT, IDOperador INT, IDCliente INT, IDCliente2 INT, IDEstandar INT, IDExpres INT, IDInactivo INT,
                    IDDireccionAjena INT);
-- Versión de un método para los casos de edición: la lee el migrador (la API no puede consultar tablas).
CREATE TABLE #Version (Version BINARY(8));
CREATE TABLE #Ultima (IDDireccion INT);

-- Resultados de los SPs (misma forma que devuelven).
CREATE TABLE #Departamentos (IDDepartamento TINYINT, Nombre NVARCHAR(50));
CREATE TABLE #Municipios (IDMunicipio SMALLINT, Nombre NVARCHAR(100));
CREATE TABLE #MetodosTienda (IDMetodoEnvio INT, Nombre NVARCHAR(100), Descripcion NVARCHAR(300), Costo DECIMAL(12, 2),
                             DiasEstimadosMin TINYINT, DiasEstimadosMax TINYINT);
CREATE TABLE #Direcciones (IDDireccion INT, Alias NVARCHAR(50), NombreDestinatario NVARCHAR(150), Telefono VARCHAR(20),
                           Linea1 NVARCHAR(200), Linea2 NVARCHAR(200), IDMunicipio SMALLINT, Municipio NVARCHAR(100),
                           IDDepartamento TINYINT, Departamento NVARCHAR(50), CodigoPostal VARCHAR(5), Referencias NVARCHAR(300),
                           EsPredeterminada BIT, FechaCreacion DATETIME2(3), FechaModificacion DATETIME2(3));
CREATE TABLE #Metodo (IDMetodoEnvio INT, Nombre NVARCHAR(100), Descripcion NVARCHAR(300), Costo DECIMAL(12, 2), DiasEstimadosMin TINYINT,
                      DiasEstimadosMax TINYINT, Activo BIT, Pedidos INT, FechaCreacion DATETIME2(3), FechaModificacion DATETIME2(3),
                      VersionFila BINARY(8));
CREATE TABLE #Metodos (IDMetodoEnvio INT, Nombre NVARCHAR(100), Descripcion NVARCHAR(300), Costo DECIMAL(12, 2), DiasEstimadosMin TINYINT,
                       DiasEstimadosMax TINYINT, Activo BIT, FechaCreacion DATETIME2(3), FechaModificacion DATETIME2(3));
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
    - Roles; un administrador, un operador y dos clientes (el segundo con una dirección).
    - Departamentos 210 "Alta Envios Prueba" y 211 "Baja Envios Prueba"; municipios 21001 Uno y
      21002 Dos (del 210) y 21101 Tres (del 211).
    - Métodos: Estándar Q25 y Exprés Q60 activos, uno inactivo.
*/
CREATE PROCEDURE #Preparar
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Hash VARCHAR(255) = '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA';
    DECLARE @IDAdmin INT, @IDOperador INT, @IDCliente INT, @IDCliente2 INT, @IDEstandar INT, @IDExpres INT, @IDInactivo INT,
            @IDDireccionAjena INT;

    INSERT INTO dbo.Rol (IDRol, Codigo, Nombre)
    SELECT v.IDRol, v.Codigo, v.Nombre
    FROM (VALUES (201, 'CLIENTE', N'Cliente'), (202, 'OPERADOR', N'Operador'), (203, 'ADMIN', N'Administrador'))
         AS v (IDRol, Codigo, Nombre)
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Rol AS r WHERE r.Codigo = v.Codigo);

    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'admin.envios@shopcart.test', @Hash, N'Admin', N'Envios' FROM dbo.Rol AS r WHERE r.Codigo = 'ADMIN';
    SET @IDAdmin = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'operador.envios@shopcart.test', @Hash, N'Operador', N'Envios' FROM dbo.Rol AS r WHERE r.Codigo = 'OPERADOR';
    SET @IDOperador = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'cliente.envios@shopcart.test', @Hash, N'Cliente', N'Envios' FROM dbo.Rol AS r WHERE r.Codigo = 'CLIENTE';
    SET @IDCliente = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'cliente2.envios@shopcart.test', @Hash, N'Cliente', N'Dos' FROM dbo.Rol AS r WHERE r.Codigo = 'CLIENTE';
    SET @IDCliente2 = SCOPE_IDENTITY();

    INSERT INTO dbo.Departamento (IDDepartamento, Nombre) VALUES (210, N'Alta Envios Prueba'), (211, N'Baja Envios Prueba');
    INSERT INTO dbo.Municipio (IDMunicipio, IDDepartamento, Nombre)
    VALUES (21001, 210, N'Uno Envios Prueba'), (21002, 210, N'Dos Envios Prueba'), (21101, 211, N'Tres Envios Prueba');

    INSERT INTO dbo.Direccion (IDUsuario, Alias, NombreDestinatario, Telefono, Linea1, IDMunicipio, EsPredeterminada)
    VALUES (@IDCliente2, N'Casa', N'Cliente Dos', '5555-0000', N'9a calle 9-99 zona 9', 21001, 1);
    SET @IDDireccionAjena = SCOPE_IDENTITY();

    INSERT INTO dbo.MetodoEnvio (Nombre, Descripcion, Costo, DiasEstimadosMin, DiasEstimadosMax)
    VALUES (N'Estándar Envios Prueba', N'De 3 a 5 días', 25.00, 3, 5);
    SET @IDEstandar = SCOPE_IDENTITY();
    INSERT INTO dbo.MetodoEnvio (Nombre, Costo, DiasEstimadosMin, DiasEstimadosMax) VALUES (N'Exprés Envios Prueba', 60.00, 1, 1);
    SET @IDExpres = SCOPE_IDENTITY();
    INSERT INTO dbo.MetodoEnvio (Nombre, Costo, DiasEstimadosMin, DiasEstimadosMax, Activo) VALUES (N'Inactivo Envios Prueba', 5.00, 7, 10, 0);
    SET @IDInactivo = SCOPE_IDENTITY();

    DELETE FROM #Base;
    INSERT INTO #Base VALUES (@IDAdmin, @IDOperador, @IDCliente, @IDCliente2, @IDEstandar, @IDExpres, @IDInactivo, @IDDireccionAjena);
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
    DELETE FROM #Direcciones;
    DELETE FROM #Metodo;

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
DECLARE @IDAdmin INT, @IDCliente INT, @IDEstandar INT, @Primera INT, @Segunda INT, @Tercera INT, @IDNuevo INT;
DECLARE @Texto NVARCHAR(400), @Version BINARY(8);

BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDAdmin = IDAdmin, @IDCliente = IDCliente, @IDEstandar = IDEstandar FROM #Base;

/* === Catálogos ============================================================================ */
EXECUTE AS USER = @Api;
INSERT INTO #Departamentos EXEC dbo.SP_Envios_ListarDepartamentos;
INSERT INTO #Municipios EXEC dbo.SP_Envios_ListarMunicipios 210;
INSERT INTO #MetodosTienda EXEC dbo.SP_Envios_ListarMetodosTienda;
REVERT;
SET @Texto = CONCAT((SELECT STRING_AGG(Nombre, N',') WITHIN GROUP (ORDER BY Nombre) FROM #Departamentos WHERE Nombre LIKE N'%Envios Prueba'), N'|',
                    (SELECT STRING_AGG(CONCAT(IDMunicipio, N':', Nombre), N',') WITHIN GROUP (ORDER BY Nombre) FROM #Municipios), N'|',
                    (SELECT STRING_AGG(CONCAT(Nombre, N':', Costo, N':', DiasEstimadosMin, N'-', DiasEstimadosMax), N',') WITHIN GROUP (ORDER BY Costo)
                     FROM #MetodosTienda WHERE Nombre LIKE N'%Envios Prueba'));
EXEC #Verificar N'Catálogos: departamentos, municipios de un departamento y métodos activos (sin sesión), ordenados',
     N'Alta Envios Prueba,Baja Envios Prueba|21002:Dos Envios Prueba,21001:Uno Envios Prueba|Estándar Envios Prueba:25.00:3-5,Exprés Envios Prueba:60.00:1-1',
     @Texto;

/* === Libreta de direcciones =============================================================== */
EXECUTE AS USER = @Api;
INSERT INTO #Direcciones EXEC dbo.SP_Direcciones_Crear @IDCliente, N' Casa ', N' Cliente Envios ', N' 5555-1234 ', N' 1a calle 1-23 zona 1 ',
                                                      N'  ', 21001, N' 01001 ', N' Portón negro ', 0, @Primera OUTPUT;
REVERT;
SET @Texto = (SELECT CONCAT(CASE WHEN IDDireccion = @Primera THEN N'id devuelto' END, N'|', Alias, N'|', NombreDestinatario, N'|', Telefono,
                            N'|', Linea1, N'|', ISNULL(Linea2, N'sin línea 2'), N'|', Municipio, N', ', Departamento, N'|', CodigoPostal,
                            N'|', Referencias, N'|', CAST(EsPredeterminada AS INT)) FROM #Direcciones);
DELETE FROM #Direcciones;
EXEC #Verificar N'Crear: recorta los textos, devuelve el ID y la primera queda predeterminada aunque no se pida',
     N'id devuelto|Casa|Cliente Envios|5555-1234|1a calle 1-23 zona 1|sin línea 2|Uno Envios Prueba, Alta Envios Prueba|01001|Portón negro|1',
     @Texto;

EXECUTE AS USER = @Api;
INSERT INTO #Direcciones EXEC dbo.SP_Direcciones_Crear @IDCliente, N'Oficina', N'Cliente Envios', N'5555-1234', N'2a avenida 3-45 zona 4',
                                                      NULL, 21002, NULL, NULL, 1, @Segunda OUTPUT;
DELETE FROM #Direcciones;
INSERT INTO #Direcciones EXEC dbo.SP_Direcciones_Crear @IDCliente, N'Mamá', N'Madre Envios', N'+502 5555 4321', N'3a calle 5-67 zona 2',
                                                      N'Apartamento 4', 21002, NULL, NULL, NULL, @Tercera OUTPUT;
REVERT;
SET @Texto = (SELECT STRING_AGG(CONCAT(Alias, N':', CAST(EsPredeterminada AS INT)), N',')
                     WITHIN GROUP (ORDER BY EsPredeterminada DESC, FechaCreacion DESC, IDDireccion DESC) FROM #Direcciones);
DELETE FROM #Direcciones;
EXEC #Verificar N'Crear como predeterminada: la anterior deja de serlo; la lista trae la predeterminada y luego la más reciente',
     N'Oficina:1,Mamá:0,Casa:0', @Texto;

EXECUTE AS USER = @Api;
INSERT INTO #Direcciones EXEC dbo.SP_Direcciones_Actualizar @IDCliente, @Primera, N'Casa nueva', N'Cliente Envios', N'5555-1234',
                                                           N'4a calle 7-89 zona 3', NULL, 21101, NULL, NULL;
REVERT;
SET @Texto = (SELECT CONCAT(Alias, N'|', Linea1, N'|', Municipio, N', ', Departamento, N'|', COALESCE(CodigoPostal, N'sin código'), N'|',
                            CAST(EsPredeterminada AS INT)) FROM #Direcciones WHERE IDDireccion = @Primera);
DELETE FROM #Direcciones;
EXEC #Verificar N'Actualizar: cambia datos y municipio (el departamento se deduce de él); no cambia la predeterminada',
     N'Casa nueva|4a calle 7-89 zona 3|Tres Envios Prueba, Baja Envios Prueba|sin código|0', @Texto;

EXECUTE AS USER = @Api;
INSERT INTO #Direcciones EXEC dbo.SP_Direcciones_MarcarPredeterminada @IDCliente, @Tercera;
DELETE FROM #Direcciones;
INSERT INTO #Direcciones EXEC dbo.SP_Direcciones_MarcarPredeterminada @IDCliente, @Tercera;
REVERT;
SET @Texto = (SELECT STRING_AGG(CONCAT(Alias, N':', CAST(EsPredeterminada AS INT)), N',')
                     WITHIN GROUP (ORDER BY EsPredeterminada DESC, FechaCreacion DESC, IDDireccion DESC) FROM #Direcciones);
DELETE FROM #Direcciones;
EXEC #Verificar N'Marcar predeterminada: una sola a la vez; repetirlo no cambia nada', N'Mamá:1,Oficina:0,Casa nueva:0', @Texto;

EXECUTE AS USER = @Api;
INSERT INTO #Direcciones EXEC dbo.SP_Direcciones_Eliminar @IDCliente, @Tercera;
DELETE FROM #Direcciones;
INSERT INTO #Direcciones EXEC dbo.SP_Direcciones_Eliminar @IDCliente, @Tercera;
REVERT;
SET @Texto = (SELECT STRING_AGG(CONCAT(Alias, N':', CAST(EsPredeterminada AS INT)), N',')
                     WITHIN GROUP (ORDER BY EsPredeterminada DESC, FechaCreacion DESC, IDDireccion DESC) FROM #Direcciones);
SET @Texto += N'|' + (SELECT CONCAT(CAST(Activo AS INT), CAST(EsPredeterminada AS INT)) FROM dbo.Direccion WHERE IDDireccion = @Tercera);
DELETE FROM #Direcciones;
EXEC #Verificar N'Eliminar la predeterminada: se desactiva y la más reciente de las restantes pasa a serlo; repetirlo no es error',
     N'Oficina:1,Casa nueva:0|00', @Texto;

/* === Métodos de envío ===================================================================== */
EXECUTE AS USER = @Api;
INSERT INTO #Metodo EXEC dbo.SP_Envios_CrearMetodo @IDAdmin, N'  Recoger Envios Prueba ', N'   ', 0, 0, 2;
REVERT;
SELECT @IDNuevo = IDMetodoEnvio, @Version = VersionFila FROM #Metodo;
SET @Texto = (SELECT CONCAT(Nombre, N'|', ISNULL(Descripcion, N'sin descripción'), N'|', Costo, N'|', DiasEstimadosMin, N'-', DiasEstimadosMax,
                            N'|', CAST(Activo AS INT), N'|', Pedidos) FROM #Metodo);
SET @Texto += N'|' + (SELECT CONCAT(COUNT(*), N':', MAX(Accion)) FROM dbo.Bitacora
                      WHERE Modulo = 'ENVIOS' AND IDEntidad = CAST(@IDNuevo AS VARCHAR(50)));
DELETE FROM #Metodo;
EXEC #Verificar N'Crear método: recorta el nombre, costo 0 permitido, queda activo y en bitácora',
     N'Recoger Envios Prueba|sin descripción|0.00|0-2|1|0|1:CREAR', @Texto;

EXECUTE AS USER = @Api;
INSERT INTO #Metodo EXEC dbo.SP_Envios_ActualizarMetodo @IDAdmin, @IDNuevo, N'Recoger Envios Prueba', NULL, 0, 0, 2, @Version;
DELETE FROM #Metodo;
INSERT INTO #Metodo EXEC dbo.SP_Envios_ActualizarMetodo @IDAdmin, @IDNuevo, N'Recoger Envios Prueba', N'En tienda', 15, 0, 2, @Version;
REVERT;
SET @Texto = (SELECT CONCAT(Descripcion, N'|', Costo) FROM #Metodo);
SET @Texto += N'|' + (SELECT STRING_AGG(CONCAT(Accion, N':', ISNULL(JSON_VALUE(ValorAnterior, '$.Costo'), N'-'), N'>',
                                               ISNULL(JSON_VALUE(ValorNuevo, '$.Costo'), N'-')), N',') WITHIN GROUP (ORDER BY IDBitacora)
                      FROM dbo.Bitacora WHERE Modulo = 'ENVIOS' AND IDEntidad = CAST(@IDNuevo AS VARCHAR(50)));
DELETE FROM #Metodo;
EXEC #Verificar N'Actualizar método: sin cambios no registra; con cambios guarda antes y después',
     N'En tienda|15.00|CREAR:->0.00,MODIFICAR:0.00>15.00', @Texto;

EXECUTE AS USER = @Api;
INSERT INTO #Metodo EXEC dbo.SP_Envios_CambiarEstadoMetodo @IDAdmin, @IDEstandar, 0;
DELETE FROM #Metodo;
INSERT INTO #Metodo EXEC dbo.SP_Envios_CambiarEstadoMetodo @IDAdmin, @IDEstandar, 0;
DELETE FROM #MetodosTienda;
INSERT INTO #MetodosTienda EXEC dbo.SP_Envios_ListarMetodosTienda;
INSERT INTO #Metodos EXEC dbo.SP_Envios_ListarMetodos @IDAdmin;
REVERT;
SET @Texto = CONCAT((SELECT COUNT(*) FROM dbo.Bitacora WHERE Modulo = 'ENVIOS' AND Accion = 'DESACTIVAR' AND IDEntidad = CAST(@IDEstandar AS VARCHAR(50))),
                    N'|', (SELECT STRING_AGG(Nombre, N',') WITHIN GROUP (ORDER BY Costo) FROM #MetodosTienda WHERE Nombre LIKE N'%Envios Prueba'),
                    N'|', (SELECT STRING_AGG(CONCAT(LEFT(Nombre, CHARINDEX(N' ', Nombre) - 1), N':', CAST(Activo AS INT)), N',')
                                  WITHIN GROUP (ORDER BY Activo DESC, Costo, Nombre)
                           FROM #Metodos WHERE Nombre LIKE N'%Envios Prueba'));
EXEC #Verificar N'Desactivar método: deja de ofrecerse en la tienda; el panel lista todos, activos primero',
     N'1|Recoger Envios Prueba,Exprés Envios Prueba|Recoger:1,Exprés:1,Inactivo:0,Estándar:0', @Texto;
ROLLBACK TRANSACTION;

/* === Casos de error ====================================================================== */
DECLARE @D NVARCHAR(MAX) = N'
DECLARE @Admin INT, @Operador INT, @Cliente INT, @Estandar INT, @Expres INT, @Ajena INT, @V BINARY(8), @ID INT;
SELECT @Admin = IDAdmin, @Operador = IDOperador, @Cliente = IDCliente, @Estandar = IDEstandar, @Expres = IDExpres,
       @Ajena = IDDireccionAjena FROM #Base;
';
DECLARE @Crear NVARCHAR(MAX) = N'EXEC dbo.SP_Direcciones_Crear @Cliente, ';
DECLARE @CincoDirecciones NVARCHAR(MAX) = N'
INSERT INTO dbo.Direccion (IDUsuario, Alias, NombreDestinatario, Telefono, Linea1, IDMunicipio, EsPredeterminada)
SELECT b.IDCliente, CONCAT(N''Dirección '', n.n), N''Cliente Envios'', ''5555-1234'', N''Calle'', 21001, CASE n.n WHEN 1 THEN 1 ELSE 0 END
FROM #Base AS b CROSS JOIN (VALUES (1), (2), (3), (4), (5)) AS n (n);';
DECLARE @VersionEstandar NVARCHAR(MAX) = N'DELETE FROM #Version; INSERT INTO #Version SELECT VersionFila FROM dbo.MetodoEnvio WHERE IDMetodoEnvio = (SELECT IDEstandar FROM #Base);';

DECLARE @Errores TABLE (Orden INT IDENTITY, Descripcion NVARCHAR(300), Esperado INT, Sql NVARCHAR(MAX), Preparacion NVARCHAR(MAX));
INSERT INTO @Errores (Descripcion, Esperado, Sql, Preparacion) VALUES
    (N'Municipios: departamento inexistente → DEPARTAMENTO_NO_ENCONTRADO', 50112,
        N'EXEC dbo.SP_Envios_ListarMunicipios 99;', NULL),
    (N'Direcciones: un operador → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Direcciones_Listar @Operador;', NULL),
    (N'Crear dirección: un operador → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Direcciones_Crear @Operador, N''Casa'', N''X'', ''5555-1234'', N''Calle'', NULL, 21001;', NULL),
    (N'Crear dirección: alias en blanco → DIRECCION_INVALIDA', 50034,
        @Crear + N'N''  '', N''X'', ''5555-1234'', N''Calle'', NULL, 21001;', NULL),
    (N'Crear dirección: alias de 51 caracteres → DIRECCION_INVALIDA', 50034,
        @Crear + N'N''' + REPLICATE(N'a', 51) + N''', N''X'', ''5555-1234'', N''Calle'', NULL, 21001;', NULL),
    (N'Crear dirección: sin destinatario → NOMBRE_INVALIDO', 50003,
        @Crear + N'N''Casa'', NULL, ''5555-1234'', N''Calle'', NULL, 21001;', NULL),
    (N'Crear dirección: teléfono de 7 caracteres → TELEFONO_INVALIDO', 50004,
        @Crear + N'N''Casa'', N''X'', ''555-123'', N''Calle'', NULL, 21001;', NULL),
    (N'Crear dirección: teléfono con letras → TELEFONO_INVALIDO', 50004,
        @Crear + N'N''Casa'', N''X'', ''5555-ABCD'', N''Calle'', NULL, 21001;', NULL),
    (N'Crear dirección: teléfono con un superíndice (dígito en la intercalación de la BD) → TELEFONO_INVALIDO', 50004,
        @Crear + N'N''Casa'', N''X'', N''5555-12²4'', N''Calle'', NULL, 21001;', NULL),
    (N'Crear dirección: sin línea 1 → DIRECCION_INVALIDA', 50034,
        @Crear + N'N''Casa'', N''X'', ''5555-1234'', N''  '', NULL, 21001;', NULL),
    (N'Crear dirección: línea 2 de 201 caracteres → DIRECCION_INVALIDA', 50034,
        @Crear + N'N''Casa'', N''X'', ''5555-1234'', N''Calle'', N''' + REPLICATE(N'l', 201) + N''', 21001;', NULL),
    (N'Crear dirección: código postal con letra → DIRECCION_INVALIDA', 50034,
        @Crear + N'N''Casa'', N''X'', ''5555-1234'', N''Calle'', NULL, 21001, N''0101A'';', NULL),
    (N'Crear dirección: código postal de 4 dígitos → DIRECCION_INVALIDA', 50034,
        @Crear + N'N''Casa'', N''X'', ''5555-1234'', N''Calle'', NULL, 21001, N''0101'';', NULL),
    (N'Crear dirección: referencias de 301 caracteres → DIRECCION_INVALIDA', 50034,
        @Crear + N'N''Casa'', N''X'', ''5555-1234'', N''Calle'', NULL, 21001, NULL, N''' + REPLICATE(N'r', 301) + N''';', NULL),
    (N'Crear dirección: municipio inexistente → MUNICIPIO_NO_ENCONTRADO', 50111,
        @Crear + N'N''Casa'', N''X'', ''5555-1234'', N''Calle'', NULL, 32000;', NULL),
    (N'Crear dirección: la sexta → LIMITE_DIRECCIONES', 51501,
        @Crear + N'N''Sexta'', N''X'', ''5555-1234'', N''Calle'', NULL, 21001;', @CincoDirecciones),
    (N'Crear dirección: con 5, eliminar una y agregar otra (permitido)', 0,
        N'SET @ID = (SELECT TOP (1) IDDireccion FROM #Ultima);
          INSERT INTO #Direcciones EXEC dbo.SP_Direcciones_Eliminar @Cliente, @ID;
          INSERT INTO #Direcciones EXEC dbo.SP_Direcciones_Crear @Cliente, N''Sexta'', N''X'', ''5555-1234'', N''Calle'', NULL, 21001;',
        @CincoDirecciones + N' DELETE FROM #Ultima; INSERT INTO #Ultima SELECT TOP (1) IDDireccion FROM dbo.Direccion ORDER BY IDDireccion DESC;'),
    (N'Actualizar dirección: de otro cliente → DIRECCION_NO_ENCONTRADA', 50113,
        N'EXEC dbo.SP_Direcciones_Actualizar @Cliente, @Ajena, N''Casa'', N''X'', ''5555-1234'', N''Calle'', NULL, 21001;', NULL),
    (N'Actualizar dirección: inexistente → DIRECCION_NO_ENCONTRADA', 50113,
        N'EXEC dbo.SP_Direcciones_Actualizar @Cliente, -1, N''Casa'', N''X'', ''5555-1234'', N''Calle'', NULL, 21001;', NULL),
    (N'Actualizar dirección: eliminada → DIRECCION_NO_ENCONTRADA', 50113,
        N'INSERT INTO #Direcciones EXEC dbo.SP_Direcciones_Crear @Cliente, N''Casa'', N''X'', ''5555-1234'', N''Calle'', NULL, 21001, NULL, NULL, 0, @ID OUTPUT;
          INSERT INTO #Direcciones EXEC dbo.SP_Direcciones_Eliminar @Cliente, @ID;
          EXEC dbo.SP_Direcciones_Actualizar @Cliente, @ID, N''Casa'', N''X'', ''5555-1234'', N''Calle'', NULL, 21001;', NULL),
    (N'Marcar predeterminada: dirección de otro cliente → DIRECCION_NO_ENCONTRADA', 50113,
        N'EXEC dbo.SP_Direcciones_MarcarPredeterminada @Cliente, @Ajena;', NULL),
    (N'Eliminar: dirección de otro cliente → DIRECCION_NO_ENCONTRADA', 50113,
        N'EXEC dbo.SP_Direcciones_Eliminar @Cliente, @Ajena;', NULL),
    (N'Crear método: un operador → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Envios_CrearMetodo @Operador, N''Nuevo Envios Prueba'', NULL, 10, 1, 2;', NULL),
    (N'Crear método: nombre en blanco → NOMBRE_INVALIDO', 50003,
        N'EXEC dbo.SP_Envios_CrearMetodo @Admin, N''  '', NULL, 10, 1, 2;', NULL),
    (N'Crear método: descripción de 301 caracteres → DESCRIPCION_INVALIDA', 50010,
        N'EXEC dbo.SP_Envios_CrearMetodo @Admin, N''Nuevo Envios Prueba'', N''' + REPLICATE(N'd', 301) + N''', 10, 1, 2;', NULL),
    (N'Crear método: costo negativo → COSTO_INVALIDO', 50035,
        N'EXEC dbo.SP_Envios_CrearMetodo @Admin, N''Nuevo Envios Prueba'', NULL, -1, 1, 2;', NULL),
    (N'Crear método: sin costo → COSTO_INVALIDO', 50035,
        N'EXEC dbo.SP_Envios_CrearMetodo @Admin, N''Nuevo Envios Prueba'', NULL, NULL, 1, 2;', NULL),
    (N'Crear método: días mínimos mayores que los máximos → DIAS_ESTIMADOS_INVALIDOS', 50036,
        N'EXEC dbo.SP_Envios_CrearMetodo @Admin, N''Nuevo Envios Prueba'', NULL, 10, 5, 2;', NULL),
    (N'Crear método: 256 días → DIAS_ESTIMADOS_INVALIDOS', 50036,
        N'EXEC dbo.SP_Envios_CrearMetodo @Admin, N''Nuevo Envios Prueba'', NULL, 10, 1, 256;', NULL),
    (N'Crear método: nombre existente en minúsculas y sin tildes → NOMBRE_REGISTRADO', 51201,
        N'EXEC dbo.SP_Envios_CrearMetodo @Admin, N''estandar envios prueba'', NULL, 10, 1, 2;', NULL),
    (N'Actualizar método: sin versión → PARAMETRO_REQUERIDO', 50006,
        N'EXEC dbo.SP_Envios_ActualizarMetodo @Admin, @Estandar, N''X'', NULL, 10, 1, 2, NULL;', NULL),
    (N'Actualizar método: versión desactualizada → EDICION_CONCURRENTE', 51203,
        N'EXEC dbo.SP_Envios_ActualizarMetodo @Admin, @Estandar, N''X'', NULL, 10, 1, 2, 0x0000000000000001;', NULL),
    (N'Actualizar método: inexistente → METODO_ENVIO_NO_ENCONTRADO', 50114,
        N'EXEC dbo.SP_Envios_ActualizarMetodo @Admin, -1, N''X'', NULL, 10, 1, 2, 0x0000000000000001;', NULL),
    (N'Actualizar método: nombre de otro método → NOMBRE_REGISTRADO', 51201,
        N'SET @V = (SELECT Version FROM #Version);
          EXEC dbo.SP_Envios_ActualizarMetodo @Admin, @Estandar, N''Exprés Envios Prueba'', NULL, 10, 1, 2, @V;', @VersionEstandar),
    (N'Cambiar estado: sin estado → PARAMETRO_REQUERIDO', 50006,
        N'EXEC dbo.SP_Envios_CambiarEstadoMetodo @Admin, @Estandar, NULL;', NULL),
    (N'Cambiar estado: método inexistente → METODO_ENVIO_NO_ENCONTRADO', 50114,
        N'EXEC dbo.SP_Envios_CambiarEstadoMetodo @Admin, -1, 0;', NULL),
    (N'Cambiar estado: desactivar el último método activo → ULTIMO_METODO_ENVIO', 51502,
        N'INSERT INTO #Metodo EXEC dbo.SP_Envios_CambiarEstadoMetodo @Admin, @Expres, 0;
          EXEC dbo.SP_Envios_CambiarEstadoMetodo @Admin, @Estandar, 0;',
        N'UPDATE dbo.MetodoEnvio SET Activo = 0 WHERE Nombre NOT LIKE N''%Envios Prueba'';'),
    (N'Obtener método: inexistente → METODO_ENVIO_NO_ENCONTRADO', 50114,
        N'EXEC dbo.SP_Envios_ObtenerMetodo @Admin, -1;', NULL),
    (N'Listar métodos (panel): un cliente → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Envios_ListarMetodos @Cliente;', NULL);

DECLARE @Orden INT = 1, @Descripcion NVARCHAR(300), @Esperado INT, @Sql NVARCHAR(MAX), @Preparacion NVARCHAR(MAX);
WHILE @Orden <= (SELECT MAX(Orden) FROM @Errores)
BEGIN
    SELECT @Descripcion = Descripcion, @Esperado = Esperado, @Sql = @D + Sql, @Preparacion = Preparacion
    FROM @Errores WHERE Orden = @Orden;
    EXEC #EsperarError @Descripcion, @Esperado, @Sql, @Preparacion;
    SET @Orden += 1;
END;

/* Ningún caso dejó datos: todos se revirtieron. */
SET @Texto = (SELECT CONCAT((SELECT COUNT(*) FROM dbo.MetodoEnvio WHERE Nombre LIKE N'%Envios Prueba'), N'|',
                            (SELECT COUNT(*) FROM dbo.Usuario WHERE Correo LIKE N'%.envios@shopcart.test'), N'|',
                            (SELECT COUNT(*) FROM dbo.Departamento WHERE IDDepartamento IN (210, 211))));
EXEC #Verificar N'Limpieza: no quedan datos de prueba', N'0|0|0', @Texto;

/* --- Resultado ---------------------------------------------------------------------------- */
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = NULL;

IF CAST(SESSION_CONTEXT(N'PruebasFallidas') AS INT) > 0
    THROW 50000, N'Pruebas de procedimientos de envíos fallidas.', 1;
EXEC sys.sp_set_session_context @key = N'PruebasFallidas', @value = NULL;
GO
