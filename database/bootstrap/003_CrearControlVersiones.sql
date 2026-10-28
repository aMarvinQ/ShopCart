/*
    003_CrearControlVersiones.sql
    Fase: bootstrap (requiere sysadmin). Idempotente.

    Esquema Despliegue: infraestructura de despliegue separada del esquema de la aplicación.
    RolApi no tiene ningún permiso sobre él (además se deniega explícitamente).
    deploy.ps1 registra aquí cada script aplicado con su checksum SHA-256.
*/
:on error exit
SET NOCOUNT ON;
USE ShopCart;
GO

IF SCHEMA_ID(N'Despliegue') IS NULL
    EXEC sys.sp_executesql N'CREATE SCHEMA Despliegue AUTHORIZATION dbo;';
GO

IF OBJECT_ID(N'Despliegue.VersionEsquema', N'U') IS NULL
BEGIN
    CREATE TABLE Despliegue.VersionEsquema
    (
        IDVersionEsquema INT IDENTITY(1, 1) NOT NULL
            CONSTRAINT PK_VersionEsquema PRIMARY KEY,
        Script           NVARCHAR(260) NOT NULL
            CONSTRAINT UQ_VersionEsquema_Script UNIQUE,
        Tipo             VARCHAR(15) NOT NULL
            CONSTRAINT CK_VersionEsquema_Tipo CHECK (Tipo IN ('MIGRACION', 'PROGRAMABLE', 'SEMILLA')),
        Checksum         CHAR(64) NOT NULL,
        FechaAplicacion  DATETIME2(3) NOT NULL
            CONSTRAINT DF_VersionEsquema_FechaAplicacion DEFAULT SYSUTCDATETIME(),
        AplicadoPor      SYSNAME NOT NULL
            CONSTRAINT DF_VersionEsquema_AplicadoPor DEFAULT SUSER_SNAME()
    );
    PRINT N'Tabla Despliegue.VersionEsquema creada.';
END
GO

CREATE OR ALTER PROCEDURE Despliegue.SP_Despliegue_ObtenerScripts
AS
BEGIN
    SET NOCOUNT ON;

    SELECT Script, Checksum
    FROM Despliegue.VersionEsquema
    ORDER BY Script;
END
GO

CREATE OR ALTER PROCEDURE Despliegue.SP_Despliegue_RegistrarScript
    @Script   NVARCHAR(260),
    @Tipo     VARCHAR(15),
    @Checksum CHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE Despliegue.VersionEsquema WITH (UPDLOCK, SERIALIZABLE)
        SET Checksum        = @Checksum,
            Tipo            = @Tipo,
            FechaAplicacion = SYSUTCDATETIME(),
            AplicadoPor     = SUSER_SNAME()
        WHERE Script = @Script;

        IF @@ROWCOUNT = 0
            INSERT INTO Despliegue.VersionEsquema (Script, Tipo, Checksum)
            VALUES (@Script, @Tipo, @Checksum);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

DENY SELECT, INSERT, UPDATE, DELETE, EXECUTE ON SCHEMA::Despliegue TO RolApi;
GO
