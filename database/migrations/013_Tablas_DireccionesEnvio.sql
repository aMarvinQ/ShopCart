/*
    013_Tablas_DireccionesEnvio.sql
    Módulo: Direcciones y envío (RF-06). Tablas: Departamento, Direccion, MetodoEnvio.

    El checkout copia la dirección elegida (snapshot): editar o desactivar una dirección
    nunca altera pedidos ya realizados.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
GO

/* Departamento: los 22 departamentos de Guatemala. Catálogo fijo cargado por semilla. */
CREATE TABLE dbo.Departamento
(
    IDDepartamento TINYINT      NOT NULL CONSTRAINT PK_Departamento PRIMARY KEY,
    Nombre         NVARCHAR(50) NOT NULL CONSTRAINT UQ_Departamento_Nombre UNIQUE,

    CONSTRAINT CK_Departamento_NombreNoVacio CHECK (LEN(Nombre) > 0)
);
GO

/*
    Direccion: libreta de direcciones del cliente registrado. No se elimina: se desactiva
    (un checkout puede referenciarla).
    - Una sola dirección predeterminada por usuario, y debe estar activa.
*/
CREATE TABLE dbo.Direccion
(
    IDDireccion        INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Direccion PRIMARY KEY,
    IDUsuario          INT           NOT NULL CONSTRAINT FK_Direccion_Usuario REFERENCES dbo.Usuario (IDUsuario),
    Alias              NVARCHAR(50)  NOT NULL,
    NombreDestinatario NVARCHAR(150) NOT NULL,
    Telefono           VARCHAR(20)   NOT NULL,
    Linea1             NVARCHAR(200) NOT NULL,
    Linea2             NVARCHAR(200) NULL,
    Municipio          NVARCHAR(100) NOT NULL,
    IDDepartamento     TINYINT       NOT NULL CONSTRAINT FK_Direccion_Departamento REFERENCES dbo.Departamento (IDDepartamento),
    CodigoPostal       VARCHAR(5)    NULL,
    Referencias        NVARCHAR(300) NULL,
    EsPredeterminada   BIT           NOT NULL CONSTRAINT DF_Direccion_EsPredeterminada DEFAULT (0),
    Activo             BIT           NOT NULL CONSTRAINT DF_Direccion_Activo DEFAULT (1),
    FechaCreacion      DATETIME2(3)  NOT NULL CONSTRAINT DF_Direccion_FechaCreacion DEFAULT (SYSUTCDATETIME()),
    FechaModificacion  DATETIME2(3)  NOT NULL CONSTRAINT DF_Direccion_FechaModificacion DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT CK_Direccion_TextosNoVacios CHECK (
        LEN(Alias) > 0 AND LEN(NombreDestinatario) > 0 AND LEN(Linea1) > 0 AND LEN(Municipio) > 0
    ),
    CONSTRAINT CK_Direccion_TelefonoFormato CHECK (Telefono NOT LIKE '%[^0-9+ -]%' AND LEN(Telefono) >= 8),
    CONSTRAINT CK_Direccion_CodigoPostalFormato CHECK (CodigoPostal IS NULL OR CodigoPostal LIKE '[0-9][0-9][0-9][0-9][0-9]'),
    CONSTRAINT CK_Direccion_PredeterminadaActiva CHECK (EsPredeterminada = 0 OR Activo = 1)
);
GO

CREATE UNIQUE INDEX UQ_Direccion_Predeterminada ON dbo.Direccion (IDUsuario) WHERE EsPredeterminada = 1;
CREATE INDEX IX_Direccion_IDUsuario ON dbo.Direccion (IDUsuario, Activo);
CREATE INDEX IX_Direccion_IDDepartamento ON dbo.Direccion (IDDepartamento);
GO

/*
    MetodoEnvio: tarifa fija con IVA incluido (D7). CRUD del Admin.
    Costo 0 se permite (envío gratis o recoger en tienda).
*/
CREATE TABLE dbo.MetodoEnvio
(
    IDMetodoEnvio     INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_MetodoEnvio PRIMARY KEY,
    Nombre            NVARCHAR(100)  NOT NULL CONSTRAINT UQ_MetodoEnvio_Nombre UNIQUE,
    Descripcion       NVARCHAR(300)  NULL,
    Costo             DECIMAL(12, 2) NOT NULL,
    DiasEstimadosMin  TINYINT        NOT NULL,
    DiasEstimadosMax  TINYINT        NOT NULL,
    Activo            BIT            NOT NULL CONSTRAINT DF_MetodoEnvio_Activo DEFAULT (1),
    FechaCreacion     DATETIME2(3)   NOT NULL CONSTRAINT DF_MetodoEnvio_FechaCreacion DEFAULT (SYSUTCDATETIME()),
    FechaModificacion DATETIME2(3)   NOT NULL CONSTRAINT DF_MetodoEnvio_FechaModificacion DEFAULT (SYSUTCDATETIME()),
    VersionFila       ROWVERSION     NOT NULL,

    CONSTRAINT CK_MetodoEnvio_NombreNoVacio CHECK (LEN(Nombre) > 0),
    CONSTRAINT CK_MetodoEnvio_CostoNoNegativo CHECK (Costo >= 0),
    CONSTRAINT CK_MetodoEnvio_DiasEstimados CHECK (DiasEstimadosMin <= DiasEstimadosMax)
);
GO

COMMIT TRANSACTION;
GO
