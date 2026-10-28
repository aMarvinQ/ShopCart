/*
    002_CrearLoginsUsuarios.sql
    Fase: bootstrap (requiere sysadmin). Idempotente: si los logins existen, actualiza su contraseña.

    Las contraseñas llegan como variables de sqlcmd desde variables de entorno que
    define deploy.ps1 a partir de database/.env; nunca se escriben en el repositorio.

    Principio de mínimo privilegio:
    - shopcart_migrator: db_owner solo de ShopCart. Crea y modifica objetos. No es sysadmin.
    - shopcart_api (RolApi): solo EXECUTE sobre el esquema dbo. No puede leer ni escribir
      tablas, vistas ni funciones directamente; los SPs acceden a ellas por ownership chaining.
*/
:on error exit
SET NOCOUNT ON;
USE master;
GO

IF SUSER_ID(N'shopcart_migrator') IS NULL
    CREATE LOGIN shopcart_migrator
        WITH PASSWORD = N'$(SHOPCART_MIGRATOR_PASSWORD)',
             DEFAULT_DATABASE = ShopCart,
             CHECK_POLICY = ON,
             CHECK_EXPIRATION = OFF;
ELSE
    ALTER LOGIN shopcart_migrator WITH PASSWORD = N'$(SHOPCART_MIGRATOR_PASSWORD)';

ALTER LOGIN shopcart_migrator ENABLE;
GO

IF SUSER_ID(N'shopcart_api') IS NULL
    CREATE LOGIN shopcart_api
        WITH PASSWORD = N'$(SHOPCART_API_PASSWORD)',
             DEFAULT_DATABASE = ShopCart,
             CHECK_POLICY = ON,
             CHECK_EXPIRATION = OFF;
ELSE
    ALTER LOGIN shopcart_api WITH PASSWORD = N'$(SHOPCART_API_PASSWORD)';

ALTER LOGIN shopcart_api ENABLE;
GO

USE ShopCart;
GO

-- Migrador: dueño de la base de datos (no del servidor)
IF DATABASE_PRINCIPAL_ID(N'shopcart_migrator') IS NULL
    CREATE USER shopcart_migrator FOR LOGIN shopcart_migrator WITH DEFAULT_SCHEMA = dbo;
ELSE
    ALTER USER shopcart_migrator WITH LOGIN = shopcart_migrator;  -- repara usuario huérfano si el login se recreó

IF IS_ROLEMEMBER(N'db_owner', N'shopcart_migrator') = 0
    ALTER ROLE db_owner ADD MEMBER shopcart_migrator;
GO

-- API: solo ejecución de stored procedures
IF DATABASE_PRINCIPAL_ID(N'RolApi') IS NULL
    CREATE ROLE RolApi AUTHORIZATION dbo;

IF DATABASE_PRINCIPAL_ID(N'shopcart_api') IS NULL
    CREATE USER shopcart_api FOR LOGIN shopcart_api WITH DEFAULT_SCHEMA = dbo;
ELSE
    ALTER USER shopcart_api WITH LOGIN = shopcart_api;

IF IS_ROLEMEMBER(N'RolApi', N'shopcart_api') = 0
    ALTER ROLE RolApi ADD MEMBER shopcart_api;
GO

-- Permisos a nivel de esquema: aplican también a los objetos que se creen después.
GRANT EXECUTE ON SCHEMA::dbo TO RolApi;
DENY SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO RolApi;
GO

PRINT N'Logins, usuarios y RolApi configurados.';
GO
