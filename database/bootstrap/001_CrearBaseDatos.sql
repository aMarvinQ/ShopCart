/*
    001_CrearBaseDatos.sql
    Fase: bootstrap (requiere sysadmin). Idempotente.
    El nombre de la base llega en la variable de sqlcmd SHOPCART_BASE_DATOS (deploy.ps1
    -BaseDatos; por defecto ShopCart): así se crea también la base de pruebas de la API.

    - Collation Modern_Spanish_100_CI_AI: búsquedas sin distinguir mayúsculas ni tildes.
    - READ_COMMITTED_SNAPSHOT: las lecturas no bloquean escrituras (catálogo y reportes
      no esperan al checkout). Las lecturas que deciden escrituras usarán UPDLOCK.
*/
:on error exit
SET NOCOUNT ON;
USE master;
GO

IF DB_ID(N'$(SHOPCART_BASE_DATOS)') IS NULL
BEGIN
    CREATE DATABASE [$(SHOPCART_BASE_DATOS)] COLLATE Modern_Spanish_100_CI_AI;
    PRINT N'Base de datos $(SHOPCART_BASE_DATOS) creada.';
END
ELSE
    PRINT N'La base de datos $(SHOPCART_BASE_DATOS) ya existe.';
GO

IF EXISTS (SELECT 1 FROM sys.databases WHERE name = N'$(SHOPCART_BASE_DATOS)' AND is_read_committed_snapshot_on = 0)
BEGIN
    ALTER DATABASE [$(SHOPCART_BASE_DATOS)] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
    PRINT N'READ_COMMITTED_SNAPSHOT activado.';
END
GO

ALTER DATABASE [$(SHOPCART_BASE_DATOS)] SET AUTO_CLOSE OFF;
ALTER DATABASE [$(SHOPCART_BASE_DATOS)] SET AUTO_SHRINK OFF;
ALTER DATABASE [$(SHOPCART_BASE_DATOS)] SET PAGE_VERIFY CHECKSUM;
GO
