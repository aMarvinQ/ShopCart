/*
    012_Tablas_Inventario.sql
    Módulo: Inventario (RF-03). Tablas: TipoMovimiento, MovimientoInventario (kardex).

    ReservaInventario se crea junto con Checkout (depende de él). Las FK de
    MovimientoInventario hacia Pedido y Devolucion se agregan en la migración de Pedidos,
    cuando esas tablas existen.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
GO

/*
    TipoMovimiento: catálogo fijo cargado por semilla (INVENTARIO_INICIAL, ENTRADA_COMPRA,
    SALIDA_VENTA, AJUSTE_ENTRADA, AJUSTE_SALIDA, DEVOLUCION, CANCELACION).
    - Signo: +1 suma existencia, -1 la resta.
    - RequiereMotivo: el SP exige un motivo escrito (ajustes).
    - PermiteRegistroManual: tipos que un Operador puede registrar desde el panel; el resto
      solo lo generan los procesos (venta, cancelación, devolución, alta de variante).
    - UQ (IDTipoMovimiento, Signo) es requerida por la FK compuesta del kardex.
*/
CREATE TABLE dbo.TipoMovimiento
(
    IDTipoMovimiento      TINYINT      NOT NULL CONSTRAINT PK_TipoMovimiento PRIMARY KEY,
    Codigo                VARCHAR(30)  NOT NULL CONSTRAINT UQ_TipoMovimiento_Codigo UNIQUE,
    Nombre                NVARCHAR(50) NOT NULL,
    Signo                 SMALLINT     NOT NULL,
    RequiereMotivo        BIT          NOT NULL CONSTRAINT DF_TipoMovimiento_RequiereMotivo DEFAULT (0),
    PermiteRegistroManual BIT          NOT NULL CONSTRAINT DF_TipoMovimiento_PermiteRegistroManual DEFAULT (0),

    CONSTRAINT UQ_TipoMovimiento_IDTipoMovimiento_Signo UNIQUE (IDTipoMovimiento, Signo),
    CONSTRAINT CK_TipoMovimiento_CodigoFormato CHECK (Codigo COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Z_]%'),
    CONSTRAINT CK_TipoMovimiento_NombreNoVacio CHECK (LEN(Nombre) > 0),
    CONSTRAINT CK_TipoMovimiento_Signo CHECK (Signo IN (-1, 1))
);
GO

/*
    MovimientoInventario (kardex): append-only (trigger de inmutabilidad en programmability).
    - Cantidad lleva signo y debe coincidir con el Signo del tipo: la FK compuesta
      (IDTipoMovimiento, Signo) + CK impiden, por ejemplo, una SALIDA_VENTA que sume existencia.
    - SaldoNuevo = SaldoAnterior + Cantidad y nunca negativo: cada fila cuadra por sí misma.
      Variante.ExistenciaFisica se actualiza en la misma transacción con SaldoNuevo.
    - Documento de origen: IDPedido (venta, cancelación) o IDDevolucion (devolución), nunca ambos.
*/
CREATE TABLE dbo.MovimientoInventario
(
    IDMovimientoInventario BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_MovimientoInventario PRIMARY KEY,
    IDVariante             INT           NOT NULL CONSTRAINT FK_MovimientoInventario_Variante REFERENCES dbo.Variante (IDVariante),
    IDTipoMovimiento       TINYINT       NOT NULL,
    Signo                  SMALLINT      NOT NULL,
    Cantidad               INT           NOT NULL,
    SaldoAnterior          INT           NOT NULL,
    SaldoNuevo             INT           NOT NULL,
    Motivo                 NVARCHAR(300) NULL,
    IDPedido               INT           NULL,
    IDDevolucion           INT           NULL,
    IDUsuario              INT           NOT NULL CONSTRAINT FK_MovimientoInventario_Usuario REFERENCES dbo.Usuario (IDUsuario),
    Fecha                  DATETIME2(3)  NOT NULL CONSTRAINT DF_MovimientoInventario_Fecha DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT FK_MovimientoInventario_TipoMovimiento FOREIGN KEY (IDTipoMovimiento, Signo)
        REFERENCES dbo.TipoMovimiento (IDTipoMovimiento, Signo),
    CONSTRAINT CK_MovimientoInventario_CantidadConSigno CHECK (Cantidad <> 0 AND SIGN(Cantidad) = Signo),
    CONSTRAINT CK_MovimientoInventario_SaldoCuadra CHECK (SaldoNuevo = SaldoAnterior + Cantidad),
    CONSTRAINT CK_MovimientoInventario_SaldoNoNegativo CHECK (SaldoAnterior >= 0 AND SaldoNuevo >= 0),
    CONSTRAINT CK_MovimientoInventario_MotivoNoVacio CHECK (Motivo IS NULL OR LEN(Motivo) > 0),
    CONSTRAINT CK_MovimientoInventario_UnDocumento CHECK (IDPedido IS NULL OR IDDevolucion IS NULL)
);
GO

CREATE INDEX IX_MovimientoInventario_IDVariante ON dbo.MovimientoInventario (IDVariante, IDMovimientoInventario)
    INCLUDE (IDTipoMovimiento, Cantidad, SaldoNuevo, Fecha);
CREATE INDEX IX_MovimientoInventario_Fecha ON dbo.MovimientoInventario (Fecha) INCLUDE (IDVariante, IDTipoMovimiento, Cantidad);
CREATE INDEX IX_MovimientoInventario_IDPedido ON dbo.MovimientoInventario (IDPedido) WHERE IDPedido IS NOT NULL;
CREATE INDEX IX_MovimientoInventario_IDDevolucion ON dbo.MovimientoInventario (IDDevolucion) WHERE IDDevolucion IS NOT NULL;
GO

COMMIT TRANSACTION;
GO
