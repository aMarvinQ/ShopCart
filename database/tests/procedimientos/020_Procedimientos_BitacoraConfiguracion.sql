/*
    020_Procedimientos_BitacoraConfiguracion.sql
    Se ejecuta conectado como shopcart_migrator (deploy.ps1 -Probar). Mismo esquema que
    009–019: el migrador prepara los datos y ejecuta cada SP haciéndose pasar por un miembro
    de RolApi; los casos de error usan #EsperarError. Los usuarios de prueba terminan en
    .bitacora@shopcart.test; el parámetro de texto es PRUEBA_TEXTO.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT OFF;
GO

-- Permite ejecutar el script varias veces en la misma conexión (p. ej. en SSMS).
DROP TABLE IF EXISTS #Contexto, #Base, #Parametros, #RegistrosBitacora;
DROP PROCEDURE IF EXISTS #Verificar;
DROP PROCEDURE IF EXISTS #Preparar;
DROP PROCEDURE IF EXISTS #EsperarError;
GO

CREATE TABLE #Contexto (UsuarioApi SYSNAME NOT NULL);
-- Versiones de los parámetros para los casos de edición: las lee el migrador (la API no puede
-- consultar tablas).
CREATE TABLE #Base (IDAdmin INT, IDOperador INT, VersionHoras BINARY(8), VersionExistencia BINARY(8), VersionTasa BINARY(8), VersionInactividad BINARY(8),
                    VersionMaximo BINARY(8), VersionTexto BINARY(8));

-- Resultados de los SPs (misma forma que devuelven; #RegistrosBitacora agrega al final el orden de
-- llegada: una columna IDENTITY no se incluye en un INSERT sin lista de columnas).
CREATE TABLE #Parametros (IDParametro TINYINT, Clave VARCHAR(50), Valor NVARCHAR(200), TipoDato VARCHAR(10), Descripcion NVARCHAR(300),
                          ValorMinimo DECIMAL(18, 6), ValorMaximo DECIMAL(18, 6), FechaModificacion DATETIME2(3), VersionFila BINARY(8));
CREATE TABLE #RegistrosBitacora (IDBitacora BIGINT, Fecha DATETIME2(3), IDUsuario INT, Usuario NVARCHAR(201),
                                 Correo NVARCHAR(254), CodigoRol VARCHAR(20), Modulo VARCHAR(20), Entidad VARCHAR(50),
                                 IDEntidad VARCHAR(50), Accion VARCHAR(20), ValorAnterior NVARCHAR(MAX), ValorNuevo NVARCHAR(MAX),
                                 Orden INT IDENTITY);
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
    - Roles, un administrador y un operador.
    - Los 9 parámetros del sistema con su valor y rango (los mismos que cargará la semilla) y
      PRUEBA_TEXTO (texto, "Hola"). Si ya existen, se fijan esos valores y rangos.
*/
CREATE PROCEDURE #Preparar
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Hash VARCHAR(255) = '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA';
    DECLARE @IDAdmin INT, @IDOperador INT;

    INSERT INTO dbo.Rol (IDRol, Codigo, Nombre)
    SELECT v.IDRol, v.Codigo, v.Nombre
    FROM (VALUES (201, 'CLIENTE', N'Cliente'), (202, 'OPERADOR', N'Operador'), (203, 'ADMIN', N'Administrador'))
         AS v (IDRol, Codigo, Nombre)
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Rol AS r WHERE r.Codigo = v.Codigo);

    DECLARE @Parametros TABLE (IDParametro TINYINT, Clave VARCHAR(50), Valor NVARCHAR(200), TipoDato VARCHAR(10),
                               ValorMinimo DECIMAL(18, 6), ValorMaximo DECIMAL(18, 6));
    INSERT INTO @Parametros VALUES (220, 'MINUTOS_RESERVA', N'15', 'ENTERO', 1, 120),
                                   (221, 'HORAS_CARRITO_ABANDONADO', N'24', 'ENTERO', 1, 720),
                                   (222, 'EXISTENCIA_MINIMA', N'5', 'ENTERO', 0, 999),
                                   (223, 'MAXIMO_UNIDADES_POR_LINEA', N'10', 'ENTERO', 1, 999),
                                   (224, 'DIAS_DEVOLUCION', N'30', 'ENTERO', 1, 365),
                                   (225, 'SESION_DIAS_INACTIVIDAD', N'7', 'ENTERO', 1, 30),
                                   (226, 'SESION_DIAS_MAXIMO', N'30', 'ENTERO', 1, 90),
                                   (227, 'SESION_SEGUNDOS_GRACIA', N'30', 'ENTERO', 0, 300),
                                   (228, 'TASA_IVA', N'0.12', 'DECIMAL', 0, 0.3),
                                   (229, 'PRUEBA_TEXTO', N'Hola', 'TEXTO', NULL, NULL);
    UPDATE p SET Valor = v.Valor, ValorMinimo = v.ValorMinimo, ValorMaximo = v.ValorMaximo
    FROM dbo.Parametro AS p JOIN @Parametros AS v ON v.Clave = p.Clave;
    INSERT INTO dbo.Parametro (IDParametro, Clave, Valor, TipoDato, Descripcion, ValorMinimo, ValorMaximo)
    SELECT v.IDParametro, v.Clave, v.Valor, v.TipoDato, N'Prueba', v.ValorMinimo, v.ValorMaximo
    FROM @Parametros AS v
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Parametro AS p WHERE p.Clave = v.Clave);

    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'admin.bitacora@shopcart.test', @Hash, N'Admin', N'Bitacora' FROM dbo.Rol AS r WHERE r.Codigo = 'ADMIN';
    SET @IDAdmin = SCOPE_IDENTITY();
    INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido)
    SELECT r.IDRol, N'operador.bitacora@shopcart.test', @Hash, N'Operador', N'Bitacora' FROM dbo.Rol AS r WHERE r.Codigo = 'OPERADOR';
    SET @IDOperador = SCOPE_IDENTITY();

    DELETE FROM #Base;
    INSERT INTO #Base (IDAdmin, IDOperador) VALUES (@IDAdmin, @IDOperador);
    UPDATE #Base SET VersionHoras = (SELECT VersionFila FROM dbo.Parametro WHERE Clave = 'HORAS_CARRITO_ABANDONADO'),
                     VersionExistencia = (SELECT VersionFila FROM dbo.Parametro WHERE Clave = 'EXISTENCIA_MINIMA'),
                     VersionTasa = (SELECT VersionFila FROM dbo.Parametro WHERE Clave = 'TASA_IVA'),
                     VersionInactividad = (SELECT VersionFila FROM dbo.Parametro WHERE Clave = 'SESION_DIAS_INACTIVIDAD'),
                     VersionMaximo = (SELECT VersionFila FROM dbo.Parametro WHERE Clave = 'SESION_DIAS_MAXIMO'),
                     VersionTexto = (SELECT VersionFila FROM dbo.Parametro WHERE Clave = 'PRUEBA_TEXTO');
END;
GO

/*
    Caso de error: prepara, aplica @Preparacion (como el migrador), ejecuta @Sql como la API y
    compara el número de error (0 = no falló). Todo se revierte.
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
    DELETE FROM #Parametros; DELETE FROM #RegistrosBitacora;

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
DECLARE @IDAdmin INT, @Version BINARY(8), @VersionAntes BINARY(8), @FechaAntes DATETIME2(3), @Total INT, @Hoy DATE;
DECLARE @Texto NVARCHAR(400);

BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDAdmin = IDAdmin FROM #Base;

/* === Parámetros ========================================================================== */
EXECUTE AS USER = @Api;
INSERT INTO #Parametros EXEC dbo.SP_Configuracion_ListarParametros @IDAdmin;
REVERT;
SET @Texto = (SELECT CONCAT((SELECT COUNT(*) FROM #Parametros WHERE IDParametro BETWEEN 220 AND 229 OR Clave IN ('MINUTOS_RESERVA', 'HORAS_CARRITO_ABANDONADO',
                                    'EXISTENCIA_MINIMA', 'MAXIMO_UNIDADES_POR_LINEA', 'DIAS_DEVOLUCION', 'SESION_DIAS_INACTIVIDAD',
                                    'SESION_DIAS_MAXIMO', 'SESION_SEGUNDOS_GRACIA', 'TASA_IVA', 'PRUEBA_TEXTO')), N'|',
                            Valor, N'|', TipoDato, N'|', CAST(ValorMinimo AS INT), N'-', CAST(ValorMaximo AS INT))
              FROM #Parametros WHERE Clave = 'HORAS_CARRITO_ABANDONADO');
EXEC #Verificar N'Listar: incluye cada parámetro con su tipo y rango', N'10|24|ENTERO|1-720', @Texto;

-- Editar: el valor se normaliza, cambia la versión, la función lo lee de inmediato y queda en la bitácora.
SET @VersionAntes = (SELECT VersionHoras FROM #Base);
DELETE FROM #Parametros;
EXECUTE AS USER = @Api;
INSERT INTO #Parametros EXEC dbo.SP_Configuracion_ActualizarParametro @IDAdmin, 'HORAS_CARRITO_ABANDONADO', N' 048 ', @VersionAntes;
REVERT;
SET @Texto = (SELECT CONCAT(p.Valor, N'|', CASE WHEN p.VersionFila <> @VersionAntes THEN N'versión nueva' END, N'|',
                            (SELECT c.HorasCarritoAbandonado FROM dbo.FU_Reportes_Configuracion() AS c), N'|',
                            (SELECT COUNT(*) FROM dbo.Bitacora WHERE IDUsuario = @IDAdmin), N'|',
                            (SELECT CONCAT(Modulo, N':', Entidad, N':', IDEntidad, N':', Accion, N':', ValorAnterior, N'>', ValorNuevo)
                             FROM dbo.Bitacora WHERE IDUsuario = @IDAdmin))
              FROM #Parametros AS p);
EXEC #Verificar N'Editar: " 048 " se guarda como 48, nueva versión, efecto inmediato y registro en bitácora',
     N'48|versión nueva|48|1|CONFIGURACION:Parametro:HORAS_CARRITO_ABANDONADO:MODIFICAR:{"Valor":"24"}>{"Valor":"48"}', @Texto;

-- El mismo valor no modifica nada (D54).
SELECT @Version = VersionFila, @FechaAntes = FechaModificacion FROM dbo.Parametro WHERE Clave = 'HORAS_CARRITO_ABANDONADO';
DELETE FROM #Parametros;
EXECUTE AS USER = @Api;
INSERT INTO #Parametros EXEC dbo.SP_Configuracion_ActualizarParametro @IDAdmin, 'HORAS_CARRITO_ABANDONADO', N'48', @Version;
REVERT;
SET @Texto = (SELECT CONCAT(CASE WHEN p.VersionFila = @Version AND p.FechaModificacion = @FechaAntes THEN N'sin cambios' END, N'|',
                            (SELECT COUNT(*) FROM dbo.Bitacora WHERE IDUsuario = @IDAdmin))
              FROM #Parametros AS p);
EXEC #Verificar N'Editar: el mismo valor no cambia la versión ni la fecha ni escribe en la bitácora', N'sin cambios|1', @Texto;

-- Decimal: se guarda sin ceros sobrantes; el IVA nuevo aplica de inmediato a los cálculos (D53, D55).
SET @Version = (SELECT VersionTasa FROM #Base);
DELETE FROM #Parametros;
EXECUTE AS USER = @Api;
INSERT INTO #Parametros EXEC dbo.SP_Configuracion_ActualizarParametro @IDAdmin, 'TASA_IVA', N'0.150', @Version;
REVERT;
SET @Texto = (SELECT CONCAT(p.Valor, N'|', d.BaseImponible, N':', d.IVA)
              FROM #Parametros AS p CROSS APPLY dbo.FU_Pedidos_DesgloseIVA(115.00) AS d);
SET @Version = (SELECT VersionFila FROM #Parametros);
DELETE FROM #Parametros;
EXECUTE AS USER = @Api;
INSERT INTO #Parametros EXEC dbo.SP_Configuracion_ActualizarParametro @IDAdmin, 'TASA_IVA', N'.3', @Version;
REVERT;
SET @Texto = CONCAT(@Texto, N'|', (SELECT Valor FROM #Parametros));
EXEC #Verificar N'Editar IVA: "0.150" se guarda 0.15 y Q115 se desglosa en 100 + 15; el máximo ".3" se acepta como 0.3',
     N'0.15|100.00:15.00|0.3', @Texto;

-- Sesión: la vigencia puede igualar a la inactividad (D52).
SET @Version = (SELECT VersionMaximo FROM #Base);
DELETE FROM #Parametros;
EXECUTE AS USER = @Api;
INSERT INTO #Parametros EXEC dbo.SP_Configuracion_ActualizarParametro @IDAdmin, 'SESION_DIAS_MAXIMO', N'7', @Version;
REVERT;
SET @Texto = (SELECT CONCAT(p.Valor, N'|', s.DiasInactividad, N':', s.DiasMaximo)
              FROM #Parametros AS p CROSS APPLY dbo.FU_Seguridad_ParametrosSesion() AS s);
EXEC #Verificar N'Editar sesión: vigencia de 7 días igual a la inactividad', N'7|7:7', @Texto;

-- Texto: se recortan los espacios; un cambio solo de mayúsculas también es un cambio.
SET @Version = (SELECT VersionTexto FROM #Base);
DELETE FROM #Parametros;
EXECUTE AS USER = @Api;
INSERT INTO #Parametros EXEC dbo.SP_Configuracion_ActualizarParametro @IDAdmin, 'PRUEBA_TEXTO', N'  hola  ', @Version;
REVERT;
SET @Texto = (SELECT CONCAT(Valor, N'|', (SELECT COUNT(*) FROM dbo.Bitacora WHERE IDUsuario = @IDAdmin AND IDEntidad = 'PRUEBA_TEXTO'))
              FROM #Parametros);
EXEC #Verificar N'Editar texto: "  hola  " reemplaza a "Hola" y queda en la bitácora', N'hola|1', @Texto;

/* === Bitácora ============================================================================ */
-- Registro de otro módulo con fecha de 2001-03-05 05:30 UTC = domingo 4 de marzo, 23:30 en Guatemala.
INSERT INTO dbo.Bitacora (Fecha, IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorNuevo)
VALUES ('2001-03-05T05:30:00', @IDAdmin, 'CATALOGO', 'Producto', '1', 'CREAR', N'{"Nombre":"Producto Bitacora"}');
SET @Hoy = CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'Central America Standard Time' AS DATE);

EXECUTE AS USER = @Api;
INSERT INTO #RegistrosBitacora
EXEC dbo.SP_Bitacora_Listar @IDAdmin, @Modulo = 'CONFIGURACION', @IDUsuario = @IDAdmin, @TotalRegistros = @Total OUTPUT;
REVERT;
SET @Texto = CONCAT(@Total, N'|', (SELECT STRING_AGG(IDEntidad, ',') WITHIN GROUP (ORDER BY Orden) FROM #RegistrosBitacora), N'|',
                    (SELECT CONCAT(Usuario, N':', Correo, N':', CodigoRol) FROM #RegistrosBitacora WHERE Orden = 1));
EXEC #Verificar N'Listar por módulo y autor: del más reciente al más antiguo, con nombre, correo y rol del autor',
     N'5|PRUEBA_TEXTO,SESION_DIAS_MAXIMO,TASA_IVA,TASA_IVA,HORAS_CARRITO_ABANDONADO|Admin Bitacora:admin.bitacora@shopcart.test:ADMIN', @Texto;

DELETE FROM #RegistrosBitacora;
EXECUTE AS USER = @Api;
INSERT INTO #RegistrosBitacora
EXEC dbo.SP_Bitacora_Listar @IDAdmin, @IDUsuario = @IDAdmin, @Pagina = 2, @TamanoPagina = 2, @TotalRegistros = @Total OUTPUT;
REVERT;
SET @Texto = CONCAT(@Total, N'|', (SELECT STRING_AGG(CONCAT(IDEntidad, N':', ValorNuevo), N',') WITHIN GROUP (ORDER BY Orden) FROM #RegistrosBitacora));
EXEC #Verificar N'Paginación: página 2 de tamaño 2 (el total incluye el registro de catálogo)',
     N'6|TASA_IVA:{"Valor":"0.3"},TASA_IVA:{"Valor":"0.15"}', @Texto;

DECLARE @PorEntidad INT, @PorAccion INT, @Domingo INT, @Lunes INT, @PorModulo INT, @HoyTotal INT;
EXECUTE AS USER = @Api;
INSERT INTO #RegistrosBitacora EXEC dbo.SP_Bitacora_Listar @IDAdmin, @IDUsuario = @IDAdmin, @Entidad = 'Parametro', @IDEntidad = 'TASA_IVA', @TamanoPagina = 1,
                                                       @TotalRegistros = @PorEntidad OUTPUT;
INSERT INTO #RegistrosBitacora EXEC dbo.SP_Bitacora_Listar @IDAdmin, @IDUsuario = @IDAdmin, @Accion = 'CREAR', @TamanoPagina = 1, @TotalRegistros = @PorAccion OUTPUT;
INSERT INTO #RegistrosBitacora EXEC dbo.SP_Bitacora_Listar @IDAdmin, @IDUsuario = @IDAdmin, @Modulo = 'CATALOGO', @TamanoPagina = 1, @TotalRegistros = @PorModulo OUTPUT;
INSERT INTO #RegistrosBitacora EXEC dbo.SP_Bitacora_Listar @IDAdmin, @IDUsuario = @IDAdmin, @FechaDesde = '2001-03-04', @FechaHasta = '2001-03-04', @TamanoPagina = 1,
                                                       @TotalRegistros = @Domingo OUTPUT;
INSERT INTO #RegistrosBitacora EXEC dbo.SP_Bitacora_Listar @IDAdmin, @IDUsuario = @IDAdmin, @FechaDesde = '2001-03-05', @TamanoPagina = 1, @TotalRegistros = @Lunes OUTPUT;
INSERT INTO #RegistrosBitacora EXEC dbo.SP_Bitacora_Listar @IDAdmin, @IDUsuario = @IDAdmin, @FechaDesde = @Hoy, @FechaHasta = @Hoy, @TamanoPagina = 1,
                                                       @TotalRegistros = @HoyTotal OUTPUT;
REVERT;
SET @Texto = CONCAT(@PorEntidad, N'|', @PorAccion, N'|', @PorModulo, N'|', @Domingo, N'|', @Lunes, N'|', @HoyTotal);
EXEC #Verificar N'Filtros: entidad e ID 2, acción CREAR 1, módulo CATALOGO 1, domingo 4 en Guatemala 1, desde el lunes 5 los 5 de hoy, hoy 5',
     N'2|1|1|1|5|5', @Texto;
ROLLBACK TRANSACTION;

-- El mensaje indica el rango, sin ceros sobrantes. Transacción propia: el error la condena.
DECLARE @Mensaje NVARCHAR(400);
BEGIN TRANSACTION;
EXEC #Preparar;
SELECT @IDAdmin = IDAdmin, @Version = VersionTasa FROM #Base;
BEGIN TRY
    EXECUTE AS USER = @Api;
    EXEC dbo.SP_Configuracion_ActualizarParametro @IDAdmin, 'TASA_IVA', N'0.31', @Version;
    REVERT;
END TRY
BEGIN CATCH
    SET @Mensaje = ERROR_MESSAGE();
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    REVERT;
END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
EXEC #Verificar N'Mensaje de valor fuera de rango',
     N'VALOR_PARAMETRO_INVALIDO: TASA_IVA debe ser un número con hasta 6 decimales entre 0 y 0.3.', @Mensaje;

/* === Casos de error ====================================================================== */
DECLARE @D NVARCHAR(MAX) = N'
DECLARE @Admin INT, @Operador INT, @VHoras BINARY(8), @VExistencia BINARY(8), @VTasa BINARY(8), @VInactividad BINARY(8), @VMaximo BINARY(8), @VTexto BINARY(8);
SELECT @Admin = IDAdmin, @Operador = IDOperador, @VHoras = VersionHoras, @VExistencia = VersionExistencia, @VTasa = VersionTasa, @VInactividad = VersionInactividad,
       @VMaximo = VersionMaximo, @VTexto = VersionTexto
FROM #Base;
';

DECLARE @Errores TABLE (Orden INT IDENTITY, Descripcion NVARCHAR(300), Esperado INT, Sql NVARCHAR(MAX), Preparacion NVARCHAR(MAX));
INSERT INTO @Errores (Descripcion, Esperado, Sql, Preparacion) VALUES
    (N'Bitácora: un operador → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Bitacora_Listar @Operador;', NULL),
    (N'Bitácora: módulo VENTAS → MODULO_INVALIDO', 50042,
        N'EXEC dbo.SP_Bitacora_Listar @Admin, @Modulo = ''VENTAS'';', NULL),
    (N'Bitácora: acción BORRAR → ACCION_INVALIDA', 50043,
        N'EXEC dbo.SP_Bitacora_Listar @Admin, @Accion = ''BORRAR'';', NULL),
    (N'Bitácora: ID sin entidad → PARAMETRO_REQUERIDO', 50006,
        N'EXEC dbo.SP_Bitacora_Listar @Admin, @IDEntidad = ''5'';', NULL),
    (N'Bitácora: tamaño de página 101 → PAGINACION_INVALIDA', 50007,
        N'EXEC dbo.SP_Bitacora_Listar @Admin, @TamanoPagina = 101;', NULL),
    (N'Bitácora: fecha inicial posterior a la final → RANGO_FECHAS_INVALIDO', 50026,
        N'EXEC dbo.SP_Bitacora_Listar @Admin, @FechaDesde = ''2001-03-02'', @FechaHasta = ''2001-03-01'';', NULL),
    (N'Parámetros: un operador lista → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Configuracion_ListarParametros @Operador;', NULL),
    (N'Parámetros: obtener una clave inexistente → PARAMETRO_NO_ENCONTRADO', 50118,
        N'EXEC dbo.SP_Configuracion_ObtenerParametro @Admin, ''NO_EXISTE'';', NULL),
    (N'Editar: un operador → PERMISO_DENEGADO', 50201,
        N'EXEC dbo.SP_Configuracion_ActualizarParametro @Operador, ''HORAS_CARRITO_ABANDONADO'', N''48'', @VHoras;', NULL),
    (N'Editar: sin versión → PARAMETRO_REQUERIDO', 50006,
        N'EXEC dbo.SP_Configuracion_ActualizarParametro @Admin, ''HORAS_CARRITO_ABANDONADO'', N''48'', NULL;', NULL),
    (N'Editar: clave inexistente → PARAMETRO_NO_ENCONTRADO', 50118,
        N'EXEC dbo.SP_Configuracion_ActualizarParametro @Admin, ''NO_EXISTE'', N''48'', @VHoras;', NULL),
    (N'Editar: versión anterior → EDICION_CONCURRENTE', 51203,
        N'EXEC dbo.SP_Configuracion_ActualizarParametro @Admin, ''HORAS_CARRITO_ABANDONADO'', N''48'', 0x0000000000000001;', NULL),
    (N'Editar: entero con letras → VALOR_PARAMETRO_INVALIDO', 50041,
        N'EXEC dbo.SP_Configuracion_ActualizarParametro @Admin, ''HORAS_CARRITO_ABANDONADO'', N''abc'', @VHoras;', NULL),
    (N'Editar: entero con decimales → VALOR_PARAMETRO_INVALIDO', 50041,
        N'EXEC dbo.SP_Configuracion_ActualizarParametro @Admin, ''HORAS_CARRITO_ABANDONADO'', N''7.5'', @VHoras;', NULL),
    (N'Editar: sobre el máximo (721) → VALOR_PARAMETRO_INVALIDO', 50041,
        N'EXEC dbo.SP_Configuracion_ActualizarParametro @Admin, ''HORAS_CARRITO_ABANDONADO'', N''721'', @VHoras;', NULL),
    (N'Editar: bajo el mínimo (0) → VALOR_PARAMETRO_INVALIDO', 50041,
        N'EXEC dbo.SP_Configuracion_ActualizarParametro @Admin, ''HORAS_CARRITO_ABANDONADO'', N''0'', @VHoras;', NULL),
    (N'Editar: vacío en un parámetro que admite 0 → VALOR_PARAMETRO_INVALIDO (no se toma como 0)', 50041,
        N'EXEC dbo.SP_Configuracion_ActualizarParametro @Admin, ''EXISTENCIA_MINIMA'', NULL, @VExistencia;', NULL),
    (N'Editar: solo un signo en un parámetro que admite 0 → VALOR_PARAMETRO_INVALIDO', 50041,
        N'EXEC dbo.SP_Configuracion_ActualizarParametro @Admin, ''EXISTENCIA_MINIMA'', N''-'', @VExistencia;', NULL),
    (N'Editar: notación científica → VALOR_PARAMETRO_INVALIDO', 50041,
        N'EXEC dbo.SP_Configuracion_ActualizarParametro @Admin, ''EXISTENCIA_MINIMA'', N''1e2'', @VExistencia;', NULL),
    (N'Editar IVA: 7 decimales → VALOR_PARAMETRO_INVALIDO (no se redondea)', 50041,
        N'EXEC dbo.SP_Configuracion_ActualizarParametro @Admin, ''TASA_IVA'', N''0.1234567'', @VTasa;', NULL),
    (N'Editar IVA: negativo → VALOR_PARAMETRO_INVALIDO', 50041,
        N'EXEC dbo.SP_Configuracion_ActualizarParametro @Admin, ''TASA_IVA'', N''-0.01'', @VTasa;', NULL),
    (N'Editar texto: solo espacios → VALOR_PARAMETRO_INVALIDO', 50041,
        N'EXEC dbo.SP_Configuracion_ActualizarParametro @Admin, ''PRUEBA_TEXTO'', N''   '', @VTexto;', NULL),
    (N'Editar sesión: inactividad de 31 días → VALOR_PARAMETRO_INVALIDO', 50041,
        N'EXEC dbo.SP_Configuracion_ActualizarParametro @Admin, ''SESION_DIAS_INACTIVIDAD'', N''31'', @VInactividad;', NULL),
    (N'Editar sesión: vigencia de 6 días con inactividad de 7 → PARAMETROS_INCOHERENTES', 51801,
        N'EXEC dbo.SP_Configuracion_ActualizarParametro @Admin, ''SESION_DIAS_MAXIMO'', N''6'', @VMaximo;', NULL),
    (N'Editar sesión: inactividad de 8 días con vigencia de 7 → PARAMETROS_INCOHERENTES', 51801,
        N'EXEC dbo.SP_Configuracion_ActualizarParametro @Admin, ''SESION_DIAS_INACTIVIDAD'', N''8'', @VInactividad;',
        N'UPDATE dbo.Parametro SET Valor = N''7'' WHERE Clave = ''SESION_DIAS_MAXIMO'';'),
    (N'Editar: parámetro numérico sin rango → CONFIGURACION_INCOMPLETA', 59001,
        N'EXEC dbo.SP_Configuracion_ActualizarParametro @Admin, ''TASA_IVA'', N''0.12'', @VTasa;',
        N'UPDATE dbo.Parametro SET ValorMinimo = NULL, ValorMaximo = NULL WHERE Clave = ''TASA_IVA'';
          UPDATE #Base SET VersionTasa = (SELECT VersionFila FROM dbo.Parametro WHERE Clave = ''TASA_IVA'');');

DECLARE @Orden INT = 1, @Descripcion NVARCHAR(300), @Esperado INT, @Sql NVARCHAR(MAX), @Preparacion NVARCHAR(MAX);
WHILE @Orden <= (SELECT MAX(Orden) FROM @Errores)
BEGIN
    SELECT @Descripcion = Descripcion, @Esperado = Esperado, @Sql = @D + Sql, @Preparacion = Preparacion
    FROM @Errores WHERE Orden = @Orden;
    EXEC #EsperarError @Descripcion, @Esperado, @Sql, @Preparacion;
    SET @Orden += 1;
END;

/* Ningún caso dejó datos: todos se revirtieron. */
SET @Texto = (SELECT CONCAT((SELECT COUNT(*) FROM dbo.Usuario WHERE Correo LIKE N'%.bitacora@shopcart.test'), N'|',
                            (SELECT COUNT(*) FROM dbo.Parametro WHERE Clave = 'PRUEBA_TEXTO'), N'|',
                            (SELECT COUNT(*) FROM dbo.Bitacora WHERE IDEntidad = 'PRUEBA_TEXTO')));
EXEC #Verificar N'Limpieza: no quedan datos de prueba', N'0|0|0', @Texto;

/* --- Resultado ---------------------------------------------------------------------------- */
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = NULL;

IF CAST(SESSION_CONTEXT(N'PruebasFallidas') AS INT) > 0
    THROW 50000, N'Pruebas de procedimientos de bitácora y configuración fallidas.', 1;
EXEC sys.sp_set_session_context @key = N'PruebasFallidas', @value = NULL;
GO
