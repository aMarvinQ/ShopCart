/*
    022_Api_Estado.sql
    Se ejecuta conectado como shopcart_api (deploy.ps1 -Probar).
    La API obtiene el estado del sistema con SP_Sistema_Estado aunque no puede leer el
    esquema Despliegue directamente.
*/
:on error exit
SET NOCOUNT ON;

DECLARE @Fallas INT = 0;
DECLARE @Estado TABLE (BaseDatos SYSNAME, ScriptsAplicados INT, UltimoScript NVARCHAR(260), FechaUltimoScript DATETIME2(3),
                       FechaServidor DATETIME2(3));

INSERT INTO @Estado EXEC dbo.SP_Sistema_Estado;

IF (SELECT COUNT(*) FROM @Estado) = 1
   AND (SELECT BaseDatos FROM @Estado) = DB_NAME()
   AND (SELECT ScriptsAplicados FROM @Estado) >= 0
   AND (SELECT ABS(DATEDIFF(SECOND, FechaServidor, SYSUTCDATETIME())) FROM @Estado) < 5
    PRINT N'OK     SP_Sistema_Estado devuelve una fila con la base, los scripts aplicados y la hora del servidor.';
ELSE
BEGIN
    PRINT N'FALLA  SP_Sistema_Estado no devolvió el estado esperado.';
    SET @Fallas += 1;
END

IF HAS_PERMS_BY_NAME(N'Despliegue.VersionEsquema', N'OBJECT', N'SELECT') = 0
    PRINT N'OK     La API sigue sin poder leer Despliegue.VersionEsquema directamente.';
ELSE
BEGIN
    PRINT N'FALLA  La API puede leer Despliegue.VersionEsquema.';
    SET @Fallas += 1;
END

IF @Fallas > 0
    THROW 50000, N'Pruebas del estado del sistema fallidas.', 1;
GO
