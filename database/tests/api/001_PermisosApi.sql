/*
    001_PermisosApi.sql
    Se ejecuta conectado como shopcart_api (deploy.ps1 -Probar).
    Verifica que la API solo pueda ejecutar SPs del esquema dbo.
*/
:on error exit
SET NOCOUNT ON;

DECLARE @Fallas INT = 0;
DECLARE @Script NVARCHAR(260);

IF IS_SRVROLEMEMBER(N'sysadmin') = 0 AND IS_MEMBER(N'db_owner') = 0
    PRINT N'OK     shopcart_api no es sysadmin ni db_owner.';
ELSE
BEGIN
    PRINT N'FALLA  shopcart_api tiene privilegios administrativos.';
    SET @Fallas += 1;
END

IF HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'EXECUTE') = 1
    PRINT N'OK     Puede ejecutar SPs del esquema dbo.';
ELSE
BEGIN
    PRINT N'FALLA  No puede ejecutar SPs del esquema dbo.';
    SET @Fallas += 1;
END

IF HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'SELECT') = 0
   AND HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'INSERT') = 0
   AND HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'UPDATE') = 0
   AND HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'DELETE') = 0
    PRINT N'OK     No puede leer ni escribir tablas, vistas ni funciones de dbo directamente.';
ELSE
BEGIN
    PRINT N'FALLA  Tiene permisos directos de lectura o escritura sobre dbo.';
    SET @Fallas += 1;
END

-- Uso práctico de un TVP. La revisión de todos los tipos está en tests/integridad/005: un tipo
-- sin permiso es invisible para la API, así que desde aquí no se podría detectar.
BEGIN TRY
    DECLARE @Variantes dbo.TT_Catalogo_Variante;
    INSERT INTO @Variantes (NumeroLinea, SKU, Precio, ExistenciaInicial) VALUES (1, 'PRUEBA-TVP', 10.00, 0);
    PRINT N'OK     Puede declarar y llenar un TVP (dbo.TT_Catalogo_Variante).';
END TRY
BEGIN CATCH
    PRINT N'FALLA  No puede usar dbo.TT_Catalogo_Variante: ' + ERROR_MESSAGE();
    SET @Fallas += 1;
END CATCH

BEGIN TRY
    SELECT TOP (1) @Script = Script FROM Despliegue.VersionEsquema;
    PRINT N'FALLA  Pudo leer Despliegue.VersionEsquema.';
    SET @Fallas += 1;
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() <> 229 THROW;
    PRINT N'OK     SELECT sobre una tabla rechazado (error 229).';
END CATCH

BEGIN TRY
    EXEC Despliegue.SP_Despliegue_ObtenerScripts;
    PRINT N'FALLA  Pudo ejecutar SPs del esquema Despliegue.';
    SET @Fallas += 1;
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() <> 229 THROW;
    PRINT N'OK     EXECUTE sobre el esquema Despliegue rechazado (error 229).';
END CATCH

IF @Fallas > 0
    THROW 50000, N'Pruebas de permisos de la API fallidas.', 1;
GO
