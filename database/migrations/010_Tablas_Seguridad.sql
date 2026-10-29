/*
    010_Tablas_Seguridad.sql
    Módulo: Seguridad (RF-01). Tablas: Rol, Usuario, RefreshToken.

    La migración es atómica: si cualquier sentencia falla, sqlcmd termina la conexión
    y la transacción abierta se revierte completa.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
GO

/* Rol: catálogo fijo (CLIENTE, OPERADOR, ADMIN). Sus valores se cargan por semilla. */
CREATE TABLE dbo.Rol
(
    IDRol  TINYINT       NOT NULL CONSTRAINT PK_Rol PRIMARY KEY,
    Codigo VARCHAR(20)   NOT NULL CONSTRAINT UQ_Rol_Codigo UNIQUE,
    Nombre NVARCHAR(50)  NOT NULL,

    CONSTRAINT CK_Rol_CodigoFormato CHECK (Codigo COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Z_]%'),
    CONSTRAINT CK_Rol_NombreNoVacio CHECK (LEN(Nombre) > 0)
);
GO

/*
    Usuario: clientes, operadores y administradores. Nunca se elimina: se desactiva.
    - Correo se guarda normalizado en minúsculas (la comparación binaria lo garantiza).
    - HashContrasena solo acepta el formato Argon2id: impide guardar una contraseña en claro.
    - EsSistema identifica al único usuario técnico (procesos automáticos, p. ej. liberar
      reservas vencidas); no tiene contraseña y no puede iniciar sesión.
*/
CREATE TABLE dbo.Usuario
(
    IDUsuario         INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Usuario PRIMARY KEY,
    IDRol             TINYINT        NOT NULL CONSTRAINT FK_Usuario_Rol REFERENCES dbo.Rol (IDRol),
    Correo            NVARCHAR(254)  NOT NULL CONSTRAINT UQ_Usuario_Correo UNIQUE,
    HashContrasena    VARCHAR(255)   NULL,
    Nombre            NVARCHAR(100)  NOT NULL,
    Apellido          NVARCHAR(100)  NOT NULL,
    Telefono          VARCHAR(20)    NULL,
    EsSistema         BIT            NOT NULL CONSTRAINT DF_Usuario_EsSistema DEFAULT (0),
    Activo            BIT            NOT NULL CONSTRAINT DF_Usuario_Activo DEFAULT (1),
    UltimoAcceso      DATETIME2(3)   NULL,
    FechaCreacion     DATETIME2(3)   NOT NULL CONSTRAINT DF_Usuario_FechaCreacion DEFAULT (SYSUTCDATETIME()),
    FechaModificacion DATETIME2(3)   NOT NULL CONSTRAINT DF_Usuario_FechaModificacion DEFAULT (SYSUTCDATETIME()),
    VersionFila       ROWVERSION     NOT NULL,

    CONSTRAINT CK_Usuario_CorreoFormato CHECK (Correo LIKE N'_%@_%._%' AND Correo NOT LIKE N'% %'),
    CONSTRAINT CK_Usuario_CorreoMinusculas CHECK (Correo COLLATE Latin1_General_100_BIN2 = LOWER(Correo)),
    -- Un CHECK solo rechaza FALSE; con NULL una comparación da UNKNOWN y pasaría.
    -- Por eso cada rama exige IS NOT NULL de forma explícita.
    CONSTRAINT CK_Usuario_Contrasena CHECK (
        (EsSistema = 1 AND HashContrasena IS NULL)
        OR (EsSistema = 0 AND HashContrasena IS NOT NULL AND HashContrasena LIKE '$argon2id$%')
    ),
    CONSTRAINT CK_Usuario_NombreNoVacio CHECK (LEN(Nombre) > 0 AND LEN(Apellido) > 0),
    CONSTRAINT CK_Usuario_TelefonoFormato CHECK (Telefono IS NULL OR Telefono NOT LIKE '%[^0-9+ -]%')
);
GO

CREATE UNIQUE INDEX UQ_Usuario_UnicoSistema ON dbo.Usuario (EsSistema) WHERE EsSistema = 1;
CREATE INDEX IX_Usuario_IDRol ON dbo.Usuario (IDRol) INCLUDE (Activo);
GO

/*
    RefreshToken: sesiones con rotación.
    - Solo se guarda el SHA-256 del token; el token en claro vive únicamente en la cookie.
    - Familia agrupa todos los tokens de una misma sesión: reutilizar un token ya rotado
      revoca la familia completa.
    - FechaExpiracion: 7 días desde la última rotación (inactividad).
      FechaExpiracionSesion: 30 días desde el inicio de sesión (máximo absoluto, D11).
*/
CREATE TABLE dbo.RefreshToken
(
    IDRefreshToken          BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_RefreshToken PRIMARY KEY,
    IDUsuario               INT              NOT NULL CONSTRAINT FK_RefreshToken_Usuario REFERENCES dbo.Usuario (IDUsuario),
    TokenHash               BINARY(32)       NOT NULL CONSTRAINT UQ_RefreshToken_TokenHash UNIQUE,
    Familia                 UNIQUEIDENTIFIER NOT NULL,
    FechaCreacion           DATETIME2(3)     NOT NULL CONSTRAINT DF_RefreshToken_FechaCreacion DEFAULT (SYSUTCDATETIME()),
    FechaExpiracion         DATETIME2(3)     NOT NULL,
    FechaExpiracionSesion   DATETIME2(3)     NOT NULL,
    FechaRevocacion         DATETIME2(3)     NULL,
    MotivoRevocacion        VARCHAR(25)      NULL,
    IDRefreshTokenReemplazo BIGINT           NULL CONSTRAINT FK_RefreshToken_Reemplazo REFERENCES dbo.RefreshToken (IDRefreshToken),
    DireccionIP             VARCHAR(45)      NULL,
    AgenteUsuario           NVARCHAR(400)    NULL,

    CONSTRAINT CK_RefreshToken_Vigencia CHECK (
        FechaExpiracion > FechaCreacion AND FechaExpiracion <= FechaExpiracionSesion
    ),
    CONSTRAINT CK_RefreshToken_Revocacion CHECK (
        (FechaRevocacion IS NULL AND MotivoRevocacion IS NULL)
        OR (FechaRevocacion IS NOT NULL AND MotivoRevocacion IS NOT NULL AND MotivoRevocacion IN
            ('ROTACION', 'CIERRE_SESION', 'REUSO_DETECTADO', 'USUARIO_DESACTIVADO', 'CAMBIO_CONTRASENA'))
    )
);
GO

CREATE INDEX IX_RefreshToken_Familia ON dbo.RefreshToken (Familia) INCLUDE (FechaRevocacion);
CREATE INDEX IX_RefreshToken_IDUsuarioVigente ON dbo.RefreshToken (IDUsuario) WHERE FechaRevocacion IS NULL;
GO

COMMIT TRANSACTION;
GO
