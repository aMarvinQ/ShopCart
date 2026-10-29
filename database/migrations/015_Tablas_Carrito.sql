/*
    015_Tablas_Carrito.sql
    Módulo: Carrito (RF-04). Tablas: Carrito, CarritoItem.

    El carrito no guarda precios: siempre muestra el precio vigente de la variante.
    El precio se congela al iniciar el checkout.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
GO

/*
    Carrito: de un cliente registrado (IDUsuario) o de un invitado (TokenInvitadoHash), nunca
    de ambos ni de ninguno. Del token solo se guarda el SHA-256; el token vive en una cookie.
    - Estado: ACTIVO → CONVERTIDO (se pagó) o FUSIONADO (el invitado inició sesión y sus
      ítems pasaron a su carrito de cliente).
    - Un solo carrito ACTIVO por usuario.
    - IDCupon: cupón aplicado; se revalida en el checkout y al pagar.
    - "Abandonado" = ACTIVO con ítems y sin actividad en N horas (Parametro).
*/
CREATE TABLE dbo.Carrito
(
    IDCarrito            INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Carrito PRIMARY KEY,
    IDUsuario            INT          NULL CONSTRAINT FK_Carrito_Usuario REFERENCES dbo.Usuario (IDUsuario),
    TokenInvitadoHash    BINARY(32)   NULL,
    IDCupon              INT          NULL CONSTRAINT FK_Carrito_Cupon REFERENCES dbo.Cupon (IDCupon),
    Estado               VARCHAR(12)  NOT NULL CONSTRAINT DF_Carrito_Estado DEFAULT ('ACTIVO'),
    FechaCreacion        DATETIME2(3) NOT NULL CONSTRAINT DF_Carrito_FechaCreacion DEFAULT (SYSUTCDATETIME()),
    FechaUltimaActividad DATETIME2(3) NOT NULL CONSTRAINT DF_Carrito_FechaUltimaActividad DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT CK_Carrito_Propietario CHECK (
        (IDUsuario IS NOT NULL AND TokenInvitadoHash IS NULL)
        OR (IDUsuario IS NULL AND TokenInvitadoHash IS NOT NULL)
    ),
    CONSTRAINT CK_Carrito_Estado CHECK (Estado IN ('ACTIVO', 'CONVERTIDO', 'FUSIONADO'))
);
GO

CREATE UNIQUE INDEX UQ_Carrito_UsuarioActivo ON dbo.Carrito (IDUsuario) WHERE Estado = 'ACTIVO' AND IDUsuario IS NOT NULL;
CREATE UNIQUE INDEX UQ_Carrito_TokenInvitadoHash ON dbo.Carrito (TokenInvitadoHash) WHERE TokenInvitadoHash IS NOT NULL;
CREATE INDEX IX_Carrito_EstadoActividad ON dbo.Carrito (Estado, FechaUltimaActividad);
CREATE INDEX IX_Carrito_IDCupon ON dbo.Carrito (IDCupon) WHERE IDCupon IS NOT NULL;
GO

/*
    CarritoItem: una línea por variante (agregar la misma variante suma cantidad).
    El tope de 999 por línea es un límite de cordura; la existencia disponible se valida en el SP.
*/
CREATE TABLE dbo.CarritoItem
(
    IDCarritoItem     INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_CarritoItem PRIMARY KEY,
    IDCarrito         INT          NOT NULL CONSTRAINT FK_CarritoItem_Carrito REFERENCES dbo.Carrito (IDCarrito),
    IDVariante        INT          NOT NULL CONSTRAINT FK_CarritoItem_Variante REFERENCES dbo.Variante (IDVariante),
    Cantidad          INT          NOT NULL,
    FechaAgregado     DATETIME2(3) NOT NULL CONSTRAINT DF_CarritoItem_FechaAgregado DEFAULT (SYSUTCDATETIME()),
    FechaModificacion DATETIME2(3) NOT NULL CONSTRAINT DF_CarritoItem_FechaModificacion DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT UQ_CarritoItem_Carrito_Variante UNIQUE (IDCarrito, IDVariante),
    CONSTRAINT CK_CarritoItem_Cantidad CHECK (Cantidad BETWEEN 1 AND 999)
);
GO

CREATE INDEX IX_CarritoItem_IDVariante ON dbo.CarritoItem (IDVariante);
GO

COMMIT TRANSACTION;
GO
