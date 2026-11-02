/*
    EliminarBaseDatos.sql
    Solo desarrollo: lo ejecuta deploy.ps1 -Bootstrap -Recrear para probar un despliegue desde cero.
    No elimina los logins; el bootstrap los vuelve a mapear.
*/
:on error exit
SET NOCOUNT ON;
USE master;
GO

IF DB_ID(N'$(SHOPCART_BASE_DATOS)') IS NOT NULL
BEGIN
    ALTER DATABASE [$(SHOPCART_BASE_DATOS)] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [$(SHOPCART_BASE_DATOS)];
    PRINT N'Base de datos $(SHOPCART_BASE_DATOS) eliminada.';
END
GO
