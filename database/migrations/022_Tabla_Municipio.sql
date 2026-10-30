/*
    022_Tabla_Municipio.sql
    Módulo: Direcciones y envío (RF-06). Catálogo de municipios de Guatemala y su uso en la
    libreta de direcciones.

    - Municipio pertenece a un Departamento (FK). IDs con el código del INE: departamento
      01–22 y municipio DDMM (p. ej. 0101 Guatemala, 0301 Antigua Guatemala). Catálogo fijo,
      cargado por semilla.
    - Direccion guarda el municipio (IDMunicipio) en lugar de texto libre; el departamento se
      deduce del municipio, así "Mixco, Petén" no se puede guardar.
    - Checkout y Pedido no cambian: copian el nombre del municipio y el departamento (snapshot).

    Direccion aún no tiene datos (los SPs de direcciones llegan con esta migración); si los
    tuviera, la migración se detiene en lugar de perderlos.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
GO

IF EXISTS (SELECT 1 FROM dbo.Direccion)
    THROW 50000, N'Direccion tiene datos: convertir Municipio (texto) a IDMunicipio requiere una migración de datos.', 1;
GO

CREATE TABLE dbo.Municipio
(
    IDMunicipio    SMALLINT      NOT NULL CONSTRAINT PK_Municipio PRIMARY KEY,
    IDDepartamento TINYINT       NOT NULL CONSTRAINT FK_Municipio_Departamento REFERENCES dbo.Departamento (IDDepartamento),
    Nombre         NVARCHAR(100) NOT NULL,

    CONSTRAINT UQ_Municipio_Departamento_Nombre UNIQUE (IDDepartamento, Nombre),
    CONSTRAINT CK_Municipio_NombreNoVacio CHECK (LEN(Nombre) > 0)
);
GO

ALTER TABLE dbo.Direccion DROP CONSTRAINT CK_Direccion_TextosNoVacios;
ALTER TABLE dbo.Direccion DROP CONSTRAINT FK_Direccion_Departamento;
DROP INDEX IX_Direccion_IDDepartamento ON dbo.Direccion;
ALTER TABLE dbo.Direccion DROP COLUMN Municipio, IDDepartamento;
GO

ALTER TABLE dbo.Direccion ADD IDMunicipio SMALLINT NOT NULL
    CONSTRAINT FK_Direccion_Municipio REFERENCES dbo.Municipio (IDMunicipio);
GO

ALTER TABLE dbo.Direccion ADD CONSTRAINT CK_Direccion_TextosNoVacios CHECK (
    LEN(Alias) > 0 AND LEN(NombreDestinatario) > 0 AND LEN(Linea1) > 0
);
CREATE INDEX IX_Direccion_IDMunicipio ON dbo.Direccion (IDMunicipio);
GO

COMMIT TRANSACTION;
GO
