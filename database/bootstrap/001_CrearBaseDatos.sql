/*
    001_CrearBaseDatos.sql
    Fase: bootstrap (requiere sysadmin). Idempotente.

    - Collation Modern_Spanish_100_CI_AI: búsquedas sin distinguir mayúsculas ni tildes.
    - READ_COMMITTED_SNAPSHOT: las lecturas no bloquean escrituras (catálogo y reportes
      no esperan al checkout). Las lecturas que deciden escrituras usarán UPDLOCK.
*/
:on error exit
SET NOCOUNT ON;
USE master;
GO

IF DB_ID(N'ShopCart') IS NULL
BEGIN
    CREATE DATABASE ShopCart COLLATE Modern_Spanish_100_CI_AI;
    PRINT N'Base de datos ShopCart creada.';
END
ELSE
    PRINT N'La base de datos ShopCart ya existe.';
GO

IF EXISTS (SELECT 1 FROM sys.databases WHERE name = N'ShopCart' AND is_read_committed_snapshot_on = 0)
BEGIN
    ALTER DATABASE ShopCart SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
    PRINT N'READ_COMMITTED_SNAPSHOT activado.';
END
GO

ALTER DATABASE ShopCart SET AUTO_CLOSE OFF;
ALTER DATABASE ShopCart SET AUTO_SHRINK OFF;
ALTER DATABASE ShopCart SET PAGE_VERIFY CHECKSUM;
GO
