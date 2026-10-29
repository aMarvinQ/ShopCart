/*
    017_Tablas_Pedidos.sql
    Módulo: Pedidos, pagos y devoluciones (RF-06, RF-07). Tablas: EstadoPedido,
    TransicionEstadoPedido, Pedido, PedidoDetalle, PedidoHistorialEstado, Pago, CuponUso,
    Devolucion, DevolucionDetalle. Agrega las FK del kardex hacia Pedido y Devolucion.

    Las transiciones de estado y el historial los garantiza el trigger TR_Pedido_Estado
    (programmability), no solo los SPs.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
GO

/*
    EstadoPedido: catálogo fijo cargado por semilla.
    - EsInicial: estado con el que nace un pedido (PAGADO).
    - EsFinal: no admite más transiciones (CANCELADO, DEVUELTO).
    - CuentaComoVenta: lo consideran los reportes (D3).
*/
CREATE TABLE dbo.EstadoPedido
(
    IDEstadoPedido  TINYINT      NOT NULL CONSTRAINT PK_EstadoPedido PRIMARY KEY,
    Codigo          VARCHAR(20)  NOT NULL CONSTRAINT UQ_EstadoPedido_Codigo UNIQUE,
    Nombre          NVARCHAR(50) NOT NULL,
    Orden           TINYINT      NOT NULL,
    EsInicial       BIT          NOT NULL CONSTRAINT DF_EstadoPedido_EsInicial DEFAULT (0),
    EsFinal         BIT          NOT NULL CONSTRAINT DF_EstadoPedido_EsFinal DEFAULT (0),
    CuentaComoVenta BIT          NOT NULL,

    CONSTRAINT CK_EstadoPedido_CodigoFormato CHECK (Codigo COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Z_]%'),
    CONSTRAINT CK_EstadoPedido_NombreNoVacio CHECK (LEN(Nombre) > 0),
    CONSTRAINT CK_EstadoPedido_InicialNoFinal CHECK (NOT (EsInicial = 1 AND EsFinal = 1))
);
GO

/*
    TransicionEstadoPedido: lista blanca de transiciones (diagrama de estados del README).
    PermiteCliente: el cliente puede ejecutarla sobre su propio pedido (cancelar uno PAGADO);
    el resto solo Operador o Admin.
*/
CREATE TABLE dbo.TransicionEstadoPedido
(
    IDEstadoOrigen  TINYINT NOT NULL CONSTRAINT FK_TransicionEstadoPedido_Origen REFERENCES dbo.EstadoPedido (IDEstadoPedido),
    IDEstadoDestino TINYINT NOT NULL CONSTRAINT FK_TransicionEstadoPedido_Destino REFERENCES dbo.EstadoPedido (IDEstadoPedido),
    PermiteCliente  BIT     NOT NULL CONSTRAINT DF_TransicionEstadoPedido_PermiteCliente DEFAULT (0),

    CONSTRAINT PK_TransicionEstadoPedido PRIMARY KEY (IDEstadoOrigen, IDEstadoDestino),
    CONSTRAINT CK_TransicionEstadoPedido_EstadosDistintos CHECK (IDEstadoOrigen <> IDEstadoDestino)
);
GO

CREATE SEQUENCE dbo.SEQ_Pedido_Numero AS INT START WITH 1 INCREMENT BY 1 NO CYCLE;
GO

/*
    Pedido: se crea solo con un pago aprobado.
    - NumeroPedido: código visible (SC-000123) generado por secuencia.
    - IDCheckout único: un checkout produce como máximo un pedido, aun con doble clic o
      reintentos simultáneos (garantía de idempotencia en la BD).
    - TokenSeguimientoHash: SHA-256 del token del enlace de seguimiento (invitados, D1).
    - Snapshot de contacto, dirección, método de envío y cupón: el pedido no cambia aunque
      después cambien esos catálogos.
    - Montos: Total = Subtotal − Descuento + CostoEnvio y Total = BaseImponible + IVA
      (BaseImponible = ROUND(Total / 1.12, 2), calculado en el SP).
    - UQ (IDPedido, IDCheckout) y (IDPedido, IDCupon) son requeridas por FK compuestas de
      Pago y CuponUso.
*/
CREATE TABLE dbo.Pedido
(
    IDPedido             INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Pedido PRIMARY KEY,
    NumeroPedido         VARCHAR(15)    NOT NULL CONSTRAINT UQ_Pedido_NumeroPedido UNIQUE
                         CONSTRAINT DF_Pedido_NumeroPedido DEFAULT (CONCAT('SC-', FORMAT(NEXT VALUE FOR dbo.SEQ_Pedido_Numero, '000000'))),
    IDCheckout           BIGINT         NOT NULL CONSTRAINT UQ_Pedido_IDCheckout UNIQUE
                         CONSTRAINT FK_Pedido_Checkout REFERENCES dbo.Checkout (IDCheckout),
    IDUsuario            INT            NULL CONSTRAINT FK_Pedido_Usuario REFERENCES dbo.Usuario (IDUsuario),
    CorreoContacto       NVARCHAR(254)  NOT NULL,
    NombreContacto       NVARCHAR(200)  NOT NULL,
    TelefonoContacto     VARCHAR(20)    NOT NULL,
    TokenSeguimientoHash BINARY(32)     NOT NULL CONSTRAINT UQ_Pedido_TokenSeguimientoHash UNIQUE,
    IDEstadoPedido       TINYINT        NOT NULL CONSTRAINT FK_Pedido_EstadoPedido REFERENCES dbo.EstadoPedido (IDEstadoPedido),
    EnvioNombre          NVARCHAR(150)  NOT NULL,
    EnvioTelefono        VARCHAR(20)    NOT NULL,
    EnvioLinea1          NVARCHAR(200)  NOT NULL,
    EnvioLinea2          NVARCHAR(200)  NULL,
    EnvioMunicipio       NVARCHAR(100)  NOT NULL,
    IDDepartamento       TINYINT        NOT NULL CONSTRAINT FK_Pedido_Departamento REFERENCES dbo.Departamento (IDDepartamento),
    EnvioCodigoPostal    VARCHAR(5)     NULL,
    EnvioReferencias     NVARCHAR(300)  NULL,
    IDMetodoEnvio        INT            NOT NULL CONSTRAINT FK_Pedido_MetodoEnvio REFERENCES dbo.MetodoEnvio (IDMetodoEnvio),
    NombreMetodoEnvio    NVARCHAR(100)  NOT NULL,
    IDCupon              INT            NULL CONSTRAINT FK_Pedido_Cupon REFERENCES dbo.Cupon (IDCupon),
    CodigoCupon          VARCHAR(30)    NULL,
    Subtotal             DECIMAL(12, 2) NOT NULL,
    Descuento            DECIMAL(12, 2) NOT NULL CONSTRAINT DF_Pedido_Descuento DEFAULT (0),
    CostoEnvio           DECIMAL(12, 2) NOT NULL,
    Total                DECIMAL(12, 2) NOT NULL,
    BaseImponible        DECIMAL(12, 2) NOT NULL,
    IVA                  DECIMAL(12, 2) NOT NULL,
    FechaPedido          DATETIME2(3)   NOT NULL CONSTRAINT DF_Pedido_FechaPedido DEFAULT (SYSUTCDATETIME()),
    FechaModificacion    DATETIME2(3)   NOT NULL CONSTRAINT DF_Pedido_FechaModificacion DEFAULT (SYSUTCDATETIME()),
    VersionFila          ROWVERSION     NOT NULL,

    CONSTRAINT UQ_Pedido_IDPedido_IDCheckout UNIQUE (IDPedido, IDCheckout),
    CONSTRAINT UQ_Pedido_IDPedido_IDCupon UNIQUE (IDPedido, IDCupon),
    CONSTRAINT CK_Pedido_CorreoFormato CHECK (
        CorreoContacto LIKE N'_%@_%._%' AND CorreoContacto NOT LIKE N'% %'
        AND CorreoContacto COLLATE Latin1_General_100_BIN2 = LOWER(CorreoContacto)
    ),
    CONSTRAINT CK_Pedido_TextosNoVacios CHECK (
        LEN(NombreContacto) > 0 AND LEN(EnvioNombre) > 0 AND LEN(EnvioLinea1) > 0
        AND LEN(EnvioMunicipio) > 0 AND LEN(NombreMetodoEnvio) > 0
    ),
    CONSTRAINT CK_Pedido_Montos CHECK (
        Subtotal > 0 AND Descuento >= 0 AND Descuento <= Subtotal AND CostoEnvio >= 0
        AND BaseImponible >= 0 AND IVA >= 0
    ),
    CONSTRAINT CK_Pedido_Totales CHECK (Total = Subtotal - Descuento + CostoEnvio),
    CONSTRAINT CK_Pedido_Impuestos CHECK (Total = BaseImponible + IVA),
    CONSTRAINT CK_Pedido_Cupon CHECK (
        (IDCupon IS NULL AND CodigoCupon IS NULL AND Descuento = 0)
        OR (IDCupon IS NOT NULL AND CodigoCupon IS NOT NULL)
    )
);
GO

CREATE INDEX IX_Pedido_IDUsuario ON dbo.Pedido (IDUsuario, FechaPedido DESC) WHERE IDUsuario IS NOT NULL;
CREATE INDEX IX_Pedido_Estado ON dbo.Pedido (IDEstadoPedido, FechaPedido DESC);
CREATE INDEX IX_Pedido_FechaPedido ON dbo.Pedido (FechaPedido) INCLUDE (IDEstadoPedido, Total, Descuento);
CREATE INDEX IX_Pedido_IDCupon ON dbo.Pedido (IDCupon) WHERE IDCupon IS NOT NULL;
GO

/*
    PedidoDetalle: snapshot de cada línea vendida (SKU, nombre, variante y categoría al momento
    de la venta), para que los reportes no cambien si después se edita el catálogo.
    - TotalLinea = Cantidad × PrecioUnitario − DescuentoLinea.
    - CantidadDevuelta nunca supera lo vendido (RF-07).
    - UQ (IDPedidoDetalle, IDPedido) es requerida por la FK compuesta de DevolucionDetalle.
*/
CREATE TABLE dbo.PedidoDetalle
(
    IDPedidoDetalle     INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_PedidoDetalle PRIMARY KEY,
    IDPedido            INT            NOT NULL CONSTRAINT FK_PedidoDetalle_Pedido REFERENCES dbo.Pedido (IDPedido),
    IDVariante          INT            NOT NULL CONSTRAINT FK_PedidoDetalle_Variante REFERENCES dbo.Variante (IDVariante),
    IDCategoria         INT            NOT NULL CONSTRAINT FK_PedidoDetalle_Categoria REFERENCES dbo.Categoria (IDCategoria),
    SKU                 VARCHAR(50)    NOT NULL,
    NombreProducto      NVARCHAR(200)  NOT NULL,
    DescripcionVariante NVARCHAR(200)  NOT NULL CONSTRAINT DF_PedidoDetalle_DescripcionVariante DEFAULT (N''),
    Cantidad            INT            NOT NULL,
    PrecioUnitario      DECIMAL(12, 2) NOT NULL,
    DescuentoLinea      DECIMAL(12, 2) NOT NULL CONSTRAINT DF_PedidoDetalle_DescuentoLinea DEFAULT (0),
    TotalLinea          DECIMAL(12, 2) NOT NULL,
    CantidadDevuelta    INT            NOT NULL CONSTRAINT DF_PedidoDetalle_CantidadDevuelta DEFAULT (0),

    CONSTRAINT UQ_PedidoDetalle_Pedido_Variante UNIQUE (IDPedido, IDVariante),
    CONSTRAINT UQ_PedidoDetalle_IDPedidoDetalle_IDPedido UNIQUE (IDPedidoDetalle, IDPedido),
    CONSTRAINT CK_PedidoDetalle_Cantidad CHECK (Cantidad BETWEEN 1 AND 999),
    CONSTRAINT CK_PedidoDetalle_PrecioPositivo CHECK (PrecioUnitario > 0),
    CONSTRAINT CK_PedidoDetalle_Descuento CHECK (DescuentoLinea >= 0 AND DescuentoLinea <= Cantidad * PrecioUnitario),
    CONSTRAINT CK_PedidoDetalle_TotalLinea CHECK (TotalLinea = Cantidad * PrecioUnitario - DescuentoLinea),
    CONSTRAINT CK_PedidoDetalle_CantidadDevuelta CHECK (CantidadDevuelta BETWEEN 0 AND Cantidad)
);
GO

CREATE INDEX IX_PedidoDetalle_IDVariante ON dbo.PedidoDetalle (IDVariante) INCLUDE (Cantidad, TotalLinea);
CREATE INDEX IX_PedidoDetalle_IDCategoria ON dbo.PedidoDetalle (IDCategoria) INCLUDE (TotalLinea);
GO

/*
    PedidoHistorialEstado: cada cambio de estado con usuario, fecha, estado anterior y nuevo
    (RF-07). Lo inserta el trigger TR_Pedido_Estado; es inmutable.
    IDUsuario NULL solo en la creación del pedido de un invitado (no tiene cuenta).
*/
CREATE TABLE dbo.PedidoHistorialEstado
(
    IDPedidoHistorialEstado BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_PedidoHistorialEstado PRIMARY KEY,
    IDPedido                INT           NOT NULL CONSTRAINT FK_PedidoHistorialEstado_Pedido REFERENCES dbo.Pedido (IDPedido),
    IDEstadoAnterior        TINYINT       NULL CONSTRAINT FK_PedidoHistorialEstado_EstadoAnterior REFERENCES dbo.EstadoPedido (IDEstadoPedido),
    IDEstadoNuevo           TINYINT       NOT NULL CONSTRAINT FK_PedidoHistorialEstado_EstadoNuevo REFERENCES dbo.EstadoPedido (IDEstadoPedido),
    IDUsuario               INT           NULL CONSTRAINT FK_PedidoHistorialEstado_Usuario REFERENCES dbo.Usuario (IDUsuario),
    Comentario              NVARCHAR(500) NULL,
    Fecha                   DATETIME2(3)  NOT NULL CONSTRAINT DF_PedidoHistorialEstado_Fecha DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT CK_PedidoHistorialEstado_EstadosDistintos CHECK (IDEstadoAnterior IS NULL OR IDEstadoAnterior <> IDEstadoNuevo),
    CONSTRAINT CK_PedidoHistorialEstado_UsuarioRequerido CHECK (IDUsuario IS NOT NULL OR IDEstadoAnterior IS NULL)
);
GO

CREATE INDEX IX_PedidoHistorialEstado_IDPedido ON dbo.PedidoHistorialEstado (IDPedido, Fecha);
GO

/*
    Pago: intentos de cobro de un checkout (pasarela simulada, D2).
    - PCI DSS: solo marca, últimos 4 dígitos, código de autorización y referencia; nunca el
      número completo, el CVV ni el vencimiento.
    - Un solo pago APROBADO por checkout (índice único filtrado): imposible cobrar dos veces.
    - Un pago aprobado siempre pertenece a un pedido, y la FK compuesta garantiza que sea
      el pedido de ese mismo checkout.
*/
CREATE TABLE dbo.Pago
(
    IDPago             BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Pago PRIMARY KEY,
    IDCheckout         BIGINT         NOT NULL CONSTRAINT FK_Pago_Checkout REFERENCES dbo.Checkout (IDCheckout),
    IDPedido           INT            NULL,
    Estado             VARCHAR(10)    NOT NULL,
    Marca              VARCHAR(12)    NOT NULL,
    Ultimos4           CHAR(4)        NOT NULL,
    CodigoAutorizacion VARCHAR(20)    NULL,
    MotivoRechazo      VARCHAR(40)    NULL,
    Monto              DECIMAL(12, 2) NOT NULL,
    ReferenciaExterna  VARCHAR(64)    NOT NULL CONSTRAINT UQ_Pago_ReferenciaExterna UNIQUE,
    Fecha              DATETIME2(3)   NOT NULL CONSTRAINT DF_Pago_Fecha DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT FK_Pago_PedidoDelCheckout FOREIGN KEY (IDPedido, IDCheckout) REFERENCES dbo.Pedido (IDPedido, IDCheckout),
    CONSTRAINT CK_Pago_Estado CHECK (Estado IN ('APROBADO', 'RECHAZADO')),
    CONSTRAINT CK_Pago_Marca CHECK (Marca IN ('VISA', 'MASTERCARD', 'AMEX')),
    CONSTRAINT CK_Pago_Ultimos4 CHECK (Ultimos4 LIKE '[0-9][0-9][0-9][0-9]'),
    CONSTRAINT CK_Pago_MontoPositivo CHECK (Monto > 0),
    CONSTRAINT CK_Pago_Resultado CHECK (
        (Estado = 'APROBADO' AND IDPedido IS NOT NULL AND CodigoAutorizacion IS NOT NULL AND MotivoRechazo IS NULL)
        OR (Estado = 'RECHAZADO' AND IDPedido IS NULL AND CodigoAutorizacion IS NULL AND MotivoRechazo IS NOT NULL)
    )
);
GO

CREATE UNIQUE INDEX UQ_Pago_CheckoutAprobado ON dbo.Pago (IDCheckout) WHERE Estado = 'APROBADO';
CREATE INDEX IX_Pago_IDCheckout ON dbo.Pago (IDCheckout);
CREATE INDEX IX_Pago_IDPedido ON dbo.Pago (IDPedido) WHERE IDPedido IS NOT NULL;
GO

/*
    CuponUso: un uso consumido al pagar (D6).
    - Un cupón por pedido, y debe ser el mismo cupón que registra el pedido (FK compuesta).
    - El límite por cliente cuenta usos no revertidos por CorreoCliente (registrados e invitados, D19).
    - Al cancelar el pedido el uso se revierte (FechaReversion), no se borra.
*/
CREATE TABLE dbo.CuponUso
(
    IDCuponUso      INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_CuponUso PRIMARY KEY,
    IDCupon         INT            NOT NULL CONSTRAINT FK_CuponUso_Cupon REFERENCES dbo.Cupon (IDCupon),
    IDPedido        INT            NOT NULL CONSTRAINT UQ_CuponUso_IDPedido UNIQUE,
    IDUsuario       INT            NULL CONSTRAINT FK_CuponUso_Usuario REFERENCES dbo.Usuario (IDUsuario),
    CorreoCliente   NVARCHAR(254)  NOT NULL,
    MontoDescontado DECIMAL(12, 2) NOT NULL,
    Fecha           DATETIME2(3)   NOT NULL CONSTRAINT DF_CuponUso_Fecha DEFAULT (SYSUTCDATETIME()),
    FechaReversion  DATETIME2(3)   NULL,

    CONSTRAINT FK_CuponUso_PedidoCupon FOREIGN KEY (IDPedido, IDCupon) REFERENCES dbo.Pedido (IDPedido, IDCupon),
    CONSTRAINT CK_CuponUso_CorreoMinusculas CHECK (CorreoCliente COLLATE Latin1_General_100_BIN2 = LOWER(CorreoCliente)),
    CONSTRAINT CK_CuponUso_MontoNoNegativo CHECK (MontoDescontado >= 0),
    CONSTRAINT CK_CuponUso_Reversion CHECK (FechaReversion IS NULL OR FechaReversion >= Fecha)
);
GO

CREATE INDEX IX_CuponUso_CuponCliente ON dbo.CuponUso (IDCupon, CorreoCliente) WHERE FechaReversion IS NULL;
GO

/*
    Devolucion: total o parcial, por línea (RF-07). La registra un Operador.
    UQ (IDDevolucion, IDPedido) es requerida por la FK compuesta de DevolucionDetalle.
*/
CREATE TABLE dbo.Devolucion
(
    IDDevolucion   INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Devolucion PRIMARY KEY,
    IDPedido       INT            NOT NULL CONSTRAINT FK_Devolucion_Pedido REFERENCES dbo.Pedido (IDPedido),
    Motivo         NVARCHAR(500)  NOT NULL,
    MontoReembolso DECIMAL(12, 2) NOT NULL,
    IDUsuario      INT            NOT NULL CONSTRAINT FK_Devolucion_Usuario REFERENCES dbo.Usuario (IDUsuario),
    Fecha          DATETIME2(3)   NOT NULL CONSTRAINT DF_Devolucion_Fecha DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT UQ_Devolucion_IDDevolucion_IDPedido UNIQUE (IDDevolucion, IDPedido),
    CONSTRAINT CK_Devolucion_MotivoNoVacio CHECK (LEN(Motivo) > 0),
    CONSTRAINT CK_Devolucion_MontoPositivo CHECK (MontoReembolso > 0)
);
GO

CREATE INDEX IX_Devolucion_IDPedido ON dbo.Devolucion (IDPedido);
CREATE INDEX IX_Devolucion_Fecha ON dbo.Devolucion (Fecha) INCLUDE (MontoReembolso);
GO

/*
    DevolucionDetalle: líneas devueltas. Las dos FK compuestas por IDPedido garantizan que la
    línea devuelta pertenece al mismo pedido que la devolución.
*/
CREATE TABLE dbo.DevolucionDetalle
(
    IDDevolucionDetalle INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_DevolucionDetalle PRIMARY KEY,
    IDDevolucion        INT            NOT NULL,
    IDPedido            INT            NOT NULL,
    IDPedidoDetalle     INT            NOT NULL,
    Cantidad            INT            NOT NULL,
    MontoReembolso      DECIMAL(12, 2) NOT NULL,

    CONSTRAINT UQ_DevolucionDetalle_Devolucion_PedidoDetalle UNIQUE (IDDevolucion, IDPedidoDetalle),
    CONSTRAINT FK_DevolucionDetalle_Devolucion FOREIGN KEY (IDDevolucion, IDPedido)
        REFERENCES dbo.Devolucion (IDDevolucion, IDPedido),
    CONSTRAINT FK_DevolucionDetalle_PedidoDetalle FOREIGN KEY (IDPedidoDetalle, IDPedido)
        REFERENCES dbo.PedidoDetalle (IDPedidoDetalle, IDPedido),
    CONSTRAINT CK_DevolucionDetalle_Cantidad CHECK (Cantidad > 0),
    CONSTRAINT CK_DevolucionDetalle_MontoNoNegativo CHECK (MontoReembolso >= 0)
);
GO

CREATE INDEX IX_DevolucionDetalle_IDPedidoDetalle ON dbo.DevolucionDetalle (IDPedidoDetalle);
GO

/* Kardex: ahora que existen Pedido y Devolucion, se agregan sus FK (ver 012). */
ALTER TABLE dbo.MovimientoInventario ADD
    CONSTRAINT FK_MovimientoInventario_Pedido FOREIGN KEY (IDPedido) REFERENCES dbo.Pedido (IDPedido),
    CONSTRAINT FK_MovimientoInventario_Devolucion FOREIGN KEY (IDDevolucion) REFERENCES dbo.Devolucion (IDDevolucion);
GO

COMMIT TRANSACTION;
GO
