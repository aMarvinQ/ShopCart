/*
    016_Tablas_Checkout.sql
    Módulo: Checkout (RF-06). Tablas: Checkout, CheckoutDetalle, ReservaInventario.

    El checkout congela lo que el cliente vio (precios, descuento, envío y dirección) y reserva
    la existencia durante N minutos (Parametro). Un pago aprobado lo convierte en Pedido.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
GO

/* Requerida por la FK compuesta Checkout → Direccion: la dirección debe ser del mismo usuario. */
ALTER TABLE dbo.Direccion ADD CONSTRAINT UQ_Direccion_Usuario_IDDireccion UNIQUE (IDUsuario, IDDireccion);
GO

/*
    Checkout: un intento de compra, de cliente registrado o de invitado (IDUsuario NULL, D1).
    - (IDCarrito, ClaveIdempotencia) único: repetir la petición devuelve el mismo checkout.
    - Un solo checkout PENDIENTE por carrito: nunca se reserva dos veces lo mismo.
    - Datos de contacto y dirección copiados (snapshot); IDDireccion solo indica de cuál
      dirección guardada se copió, y la FK compuesta garantiza que sea del mismo usuario.
    - Montos: Total = Subtotal − Descuento + CostoEnvio. Sin cupón no hay descuento.
*/
CREATE TABLE dbo.Checkout
(
    IDCheckout        BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Checkout PRIMARY KEY,
    IDCarrito         INT              NOT NULL CONSTRAINT FK_Checkout_Carrito REFERENCES dbo.Carrito (IDCarrito),
    IDUsuario         INT              NULL CONSTRAINT FK_Checkout_Usuario REFERENCES dbo.Usuario (IDUsuario),
    ClaveIdempotencia UNIQUEIDENTIFIER NOT NULL,
    CorreoContacto    NVARCHAR(254)    NOT NULL,
    NombreContacto    NVARCHAR(200)    NOT NULL,
    TelefonoContacto  VARCHAR(20)      NOT NULL,
    IDDireccion       INT              NULL,
    EnvioNombre       NVARCHAR(150)    NOT NULL,
    EnvioTelefono     VARCHAR(20)      NOT NULL,
    EnvioLinea1       NVARCHAR(200)    NOT NULL,
    EnvioLinea2       NVARCHAR(200)    NULL,
    EnvioMunicipio    NVARCHAR(100)    NOT NULL,
    IDDepartamento    TINYINT          NOT NULL CONSTRAINT FK_Checkout_Departamento REFERENCES dbo.Departamento (IDDepartamento),
    EnvioCodigoPostal VARCHAR(5)       NULL,
    EnvioReferencias  NVARCHAR(300)    NULL,
    IDMetodoEnvio     INT              NOT NULL CONSTRAINT FK_Checkout_MetodoEnvio REFERENCES dbo.MetodoEnvio (IDMetodoEnvio),
    IDCupon           INT              NULL CONSTRAINT FK_Checkout_Cupon REFERENCES dbo.Cupon (IDCupon),
    Subtotal          DECIMAL(12, 2)   NOT NULL,
    Descuento         DECIMAL(12, 2)   NOT NULL CONSTRAINT DF_Checkout_Descuento DEFAULT (0),
    CostoEnvio        DECIMAL(12, 2)   NOT NULL,
    Total             DECIMAL(12, 2)   NOT NULL,
    Estado            VARCHAR(12)      NOT NULL CONSTRAINT DF_Checkout_Estado DEFAULT ('PENDIENTE'),
    FechaCreacion     DATETIME2(3)     NOT NULL CONSTRAINT DF_Checkout_FechaCreacion DEFAULT (SYSUTCDATETIME()),
    FechaExpiracion   DATETIME2(3)     NOT NULL,
    FechaCierre       DATETIME2(3)     NULL,

    CONSTRAINT UQ_Checkout_Carrito_ClaveIdempotencia UNIQUE (IDCarrito, ClaveIdempotencia),
    CONSTRAINT FK_Checkout_DireccionDelUsuario FOREIGN KEY (IDUsuario, IDDireccion)
        REFERENCES dbo.Direccion (IDUsuario, IDDireccion),
    CONSTRAINT CK_Checkout_DireccionSoloRegistrados CHECK (IDDireccion IS NULL OR IDUsuario IS NOT NULL),
    CONSTRAINT CK_Checkout_CorreoFormato CHECK (
        CorreoContacto LIKE N'_%@_%._%' AND CorreoContacto NOT LIKE N'% %'
        AND CorreoContacto COLLATE Latin1_General_100_BIN2 = LOWER(CorreoContacto)
    ),
    CONSTRAINT CK_Checkout_TextosNoVacios CHECK (
        LEN(NombreContacto) > 0 AND LEN(EnvioNombre) > 0 AND LEN(EnvioLinea1) > 0 AND LEN(EnvioMunicipio) > 0
    ),
    CONSTRAINT CK_Checkout_TelefonosFormato CHECK (
        TelefonoContacto NOT LIKE '%[^0-9+ -]%' AND LEN(TelefonoContacto) >= 8
        AND EnvioTelefono NOT LIKE '%[^0-9+ -]%' AND LEN(EnvioTelefono) >= 8
    ),
    CONSTRAINT CK_Checkout_CodigoPostalFormato CHECK (EnvioCodigoPostal IS NULL OR EnvioCodigoPostal LIKE '[0-9][0-9][0-9][0-9][0-9]'),
    CONSTRAINT CK_Checkout_Montos CHECK (
        Subtotal > 0 AND Descuento >= 0 AND Descuento <= Subtotal AND CostoEnvio >= 0
    ),
    CONSTRAINT CK_Checkout_Totales CHECK (Total = Subtotal - Descuento + CostoEnvio),
    CONSTRAINT CK_Checkout_DescuentoSinCupon CHECK (IDCupon IS NOT NULL OR Descuento = 0),
    CONSTRAINT CK_Checkout_Estado CHECK (Estado IN ('PENDIENTE', 'COMPLETADO', 'EXPIRADO', 'CANCELADO')),
    CONSTRAINT CK_Checkout_Vigencia CHECK (FechaExpiracion > FechaCreacion),
    CONSTRAINT CK_Checkout_Cierre CHECK (
        (Estado = 'PENDIENTE' AND FechaCierre IS NULL) OR (Estado <> 'PENDIENTE' AND FechaCierre IS NOT NULL)
    )
);
GO

CREATE UNIQUE INDEX UQ_Checkout_CarritoPendiente ON dbo.Checkout (IDCarrito) WHERE Estado = 'PENDIENTE';
CREATE INDEX IX_Checkout_PendientesPorVencer ON dbo.Checkout (FechaExpiracion) WHERE Estado = 'PENDIENTE';
CREATE INDEX IX_Checkout_IDUsuario ON dbo.Checkout (IDUsuario) WHERE IDUsuario IS NOT NULL;
GO

/*
    CheckoutDetalle: líneas con el precio congelado y el descuento del cupón prorrateado
    por línea (método del mayor residuo; la suma cuadra con Checkout.Descuento en el SP).
*/
CREATE TABLE dbo.CheckoutDetalle
(
    IDCheckout     BIGINT         NOT NULL CONSTRAINT FK_CheckoutDetalle_Checkout REFERENCES dbo.Checkout (IDCheckout),
    IDVariante     INT            NOT NULL CONSTRAINT FK_CheckoutDetalle_Variante REFERENCES dbo.Variante (IDVariante),
    Cantidad       INT            NOT NULL,
    PrecioUnitario DECIMAL(12, 2) NOT NULL,
    DescuentoLinea DECIMAL(12, 2) NOT NULL CONSTRAINT DF_CheckoutDetalle_DescuentoLinea DEFAULT (0),

    CONSTRAINT PK_CheckoutDetalle PRIMARY KEY (IDCheckout, IDVariante),
    CONSTRAINT CK_CheckoutDetalle_Cantidad CHECK (Cantidad BETWEEN 1 AND 999),
    CONSTRAINT CK_CheckoutDetalle_PrecioPositivo CHECK (PrecioUnitario > 0),
    CONSTRAINT CK_CheckoutDetalle_Descuento CHECK (DescuentoLinea >= 0 AND DescuentoLinea <= Cantidad * PrecioUnitario)
);
GO

CREATE INDEX IX_CheckoutDetalle_IDVariante ON dbo.CheckoutDetalle (IDVariante);
GO

/*
    ReservaInventario: unidades apartadas por un checkout hasta FechaExpiracion.
    - Disponible = Variante.ExistenciaFisica − reservas ACTIVA con FechaExpiracion > ahora:
      una reserva vencida deja de contar en el mismo instante en que vence, sin depender
      del job que solo la marca como LIBERADA.
    - FK compuesta a CheckoutDetalle: solo se reserva lo que está en el checkout.
*/
CREATE TABLE dbo.ReservaInventario
(
    IDReservaInventario BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_ReservaInventario PRIMARY KEY,
    IDCheckout          BIGINT       NOT NULL,
    IDVariante          INT          NOT NULL,
    Cantidad            INT          NOT NULL,
    Estado              VARCHAR(10)  NOT NULL CONSTRAINT DF_ReservaInventario_Estado DEFAULT ('ACTIVA'),
    FechaCreacion       DATETIME2(3) NOT NULL CONSTRAINT DF_ReservaInventario_FechaCreacion DEFAULT (SYSUTCDATETIME()),
    FechaExpiracion     DATETIME2(3) NOT NULL,
    FechaCierre         DATETIME2(3) NULL,

    CONSTRAINT UQ_ReservaInventario_Checkout_Variante UNIQUE (IDCheckout, IDVariante),
    CONSTRAINT FK_ReservaInventario_CheckoutDetalle FOREIGN KEY (IDCheckout, IDVariante)
        REFERENCES dbo.CheckoutDetalle (IDCheckout, IDVariante),
    CONSTRAINT CK_ReservaInventario_Cantidad CHECK (Cantidad > 0),
    CONSTRAINT CK_ReservaInventario_Estado CHECK (Estado IN ('ACTIVA', 'CONSUMIDA', 'LIBERADA')),
    CONSTRAINT CK_ReservaInventario_Vigencia CHECK (FechaExpiracion > FechaCreacion),
    CONSTRAINT CK_ReservaInventario_Cierre CHECK (
        (Estado = 'ACTIVA' AND FechaCierre IS NULL) OR (Estado <> 'ACTIVA' AND FechaCierre IS NOT NULL)
    )
);
GO

CREATE INDEX IX_ReservaInventario_ActivasPorVariante ON dbo.ReservaInventario (IDVariante, FechaExpiracion)
    INCLUDE (Cantidad) WHERE Estado = 'ACTIVA';
CREATE INDEX IX_ReservaInventario_ActivasPorVencer ON dbo.ReservaInventario (FechaExpiracion) WHERE Estado = 'ACTIVA';
GO

COMMIT TRANSACTION;
GO
