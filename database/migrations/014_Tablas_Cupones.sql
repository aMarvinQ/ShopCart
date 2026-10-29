/*
    014_Tablas_Cupones.sql
    Módulo: Cupones y promociones (RF-05, D10). Tabla: Cupon.

    CuponUso se crea junto con Pedido (depende de él). Un uso se consume solo al pagar;
    aplicar el cupón al carrito o abandonar un checkout no consume usos (D6).
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
GO

/*
    Cupon:
    - Codigo en mayúsculas; la tienda normaliza lo que escribe el cliente.
    - TipoDescuento PORCENTAJE (Valor 0–100) o MONTO_FIJO (Valor en quetzales).
    - IDCategoria NULL = aplica a todo el carrito; con valor = solo a productos de esa categoría.
    - SoloRegistrados: no aplica a invitados (D19).
    - UsosActuales <= LimiteUsosTotal: aun con dos pagos simultáneos, la BD rechaza el uso
      que excede el límite. Por la misma regla no se puede bajar el límite por debajo de los usos.
*/
CREATE TABLE dbo.Cupon
(
    IDCupon              INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Cupon PRIMARY KEY,
    Codigo               VARCHAR(30)    NOT NULL CONSTRAINT UQ_Cupon_Codigo UNIQUE,
    Descripcion          NVARCHAR(300)  NOT NULL,
    TipoDescuento        VARCHAR(12)    NOT NULL,
    Valor                DECIMAL(12, 2) NOT NULL,
    MontoMinimo          DECIMAL(12, 2) NOT NULL CONSTRAINT DF_Cupon_MontoMinimo DEFAULT (0),
    FechaInicio          DATETIME2(3)   NOT NULL,
    FechaFin             DATETIME2(3)   NOT NULL,
    LimiteUsosTotal      INT            NULL,
    LimiteUsosPorCliente INT            NULL,
    UsosActuales         INT            NOT NULL CONSTRAINT DF_Cupon_UsosActuales DEFAULT (0),
    IDCategoria          INT            NULL CONSTRAINT FK_Cupon_Categoria REFERENCES dbo.Categoria (IDCategoria),
    SoloRegistrados      BIT            NOT NULL CONSTRAINT DF_Cupon_SoloRegistrados DEFAULT (0),
    Activo               BIT            NOT NULL CONSTRAINT DF_Cupon_Activo DEFAULT (1),
    FechaCreacion        DATETIME2(3)   NOT NULL CONSTRAINT DF_Cupon_FechaCreacion DEFAULT (SYSUTCDATETIME()),
    FechaModificacion    DATETIME2(3)   NOT NULL CONSTRAINT DF_Cupon_FechaModificacion DEFAULT (SYSUTCDATETIME()),
    VersionFila          ROWVERSION     NOT NULL,

    CONSTRAINT CK_Cupon_CodigoFormato CHECK (Codigo COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Z0-9_-]%' AND LEN(Codigo) >= 3),
    CONSTRAINT CK_Cupon_DescripcionNoVacia CHECK (LEN(Descripcion) > 0),
    CONSTRAINT CK_Cupon_TipoDescuento CHECK (TipoDescuento IN ('PORCENTAJE', 'MONTO_FIJO')),
    CONSTRAINT CK_Cupon_Valor CHECK (Valor > 0 AND (TipoDescuento <> 'PORCENTAJE' OR Valor <= 100)),
    CONSTRAINT CK_Cupon_MontoMinimoNoNegativo CHECK (MontoMinimo >= 0),
    CONSTRAINT CK_Cupon_Vigencia CHECK (FechaFin > FechaInicio),
    CONSTRAINT CK_Cupon_Limites CHECK (
        (LimiteUsosTotal IS NULL OR LimiteUsosTotal > 0)
        AND (LimiteUsosPorCliente IS NULL OR LimiteUsosPorCliente > 0)
    ),
    CONSTRAINT CK_Cupon_UsosDentroDelLimite CHECK (UsosActuales >= 0 AND (LimiteUsosTotal IS NULL OR UsosActuales <= LimiteUsosTotal))
);
GO

CREATE INDEX IX_Cupon_IDCategoria ON dbo.Cupon (IDCategoria) WHERE IDCategoria IS NOT NULL;
GO

COMMIT TRANSACTION;
GO
