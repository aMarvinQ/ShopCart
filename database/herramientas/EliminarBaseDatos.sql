/*
    EliminarBaseDatos.sql
    Solo desarrollo: lo ejecuta deploy.ps1 -Bootstrap -Recrear para probar un despliegue desde cero.
    No elimina los logins; el bootstrap los vuelve a mapear.
*/
:on error exit
SET NOCOUNT ON;
USE master;
GO

IF DB_ID(N'ShopCart') IS NOT NULL
BEGIN
    ALTER DATABASE ShopCart SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE ShopCart;
    PRINT N'Base de datos ShopCart eliminada.';
END
GO
