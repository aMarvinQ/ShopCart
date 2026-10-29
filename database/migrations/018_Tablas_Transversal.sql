/*
    018_Tablas_Transversal.sql
    Tablas transversales: Parametro (configuración) y Bitacora (RF-09).
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
GO

/*
    Parametro: configuración del sistema cargada por semilla (MINUTOS_RESERVA,
    HORAS_CARRITO_ABANDONADO, TASA_IVA...). El valor se guarda como texto y la BD valida
    que sea convertible al tipo declarado.
*/
CREATE TABLE dbo.Parametro
(
    IDParametro       TINYINT       NOT NULL CONSTRAINT PK_Parametro PRIMARY KEY,
    Clave             VARCHAR(50)   NOT NULL CONSTRAINT UQ_Parametro_Clave UNIQUE,
    Valor             NVARCHAR(200) NOT NULL,
    TipoDato          VARCHAR(10)   NOT NULL,
    Descripcion       NVARCHAR(300) NOT NULL,
    FechaModificacion DATETIME2(3)  NOT NULL CONSTRAINT DF_Parametro_FechaModificacion DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT CK_Parametro_ClaveFormato CHECK (Clave COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Z0-9_]%'),
    CONSTRAINT CK_Parametro_TipoDato CHECK (TipoDato IN ('ENTERO', 'DECIMAL', 'TEXTO')),
    CONSTRAINT CK_Parametro_ValorSegunTipo CHECK (
        (TipoDato = 'ENTERO' AND TRY_CAST(Valor AS INT) IS NOT NULL)
        OR (TipoDato = 'DECIMAL' AND TRY_CAST(Valor AS DECIMAL(18, 6)) IS NOT NULL)
        OR (TipoDato = 'TEXTO' AND LEN(Valor) > 0)
    ),
    CONSTRAINT CK_Parametro_DescripcionNoVacia CHECK (LEN(Descripcion) > 0)
);
GO

/*
    Bitacora: creación, modificación y desactivación en productos, precios, existencias,
    cupones y estados de pedido (RF-09), con valores anterior y nuevo en JSON.
    Append-only (trigger de inmutabilidad en programmability). Consultable por módulo.
*/
CREATE TABLE dbo.Bitacora
(
    IDBitacora    BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Bitacora PRIMARY KEY,
    Fecha         DATETIME2(3)  NOT NULL CONSTRAINT DF_Bitacora_Fecha DEFAULT (SYSUTCDATETIME()),
    IDUsuario     INT           NOT NULL CONSTRAINT FK_Bitacora_Usuario REFERENCES dbo.Usuario (IDUsuario),
    Modulo        VARCHAR(20)   NOT NULL,
    Entidad       VARCHAR(50)   NOT NULL,
    IDEntidad     VARCHAR(50)   NOT NULL,
    Accion        VARCHAR(20)   NOT NULL,
    ValorAnterior NVARCHAR(MAX) NULL,
    ValorNuevo    NVARCHAR(MAX) NULL,

    CONSTRAINT CK_Bitacora_Modulo CHECK (Modulo IN ('CATALOGO', 'INVENTARIO', 'CUPONES', 'PEDIDOS', 'USUARIOS', 'ENVIOS')),
    CONSTRAINT CK_Bitacora_Accion CHECK (Accion IN ('CREAR', 'MODIFICAR', 'ACTIVAR', 'DESACTIVAR', 'CAMBIAR_ESTADO')),
    CONSTRAINT CK_Bitacora_EntidadNoVacia CHECK (LEN(Entidad) > 0 AND LEN(IDEntidad) > 0),
    CONSTRAINT CK_Bitacora_ValoresJSON CHECK (
        (ValorAnterior IS NULL OR ISJSON(ValorAnterior) = 1)
        AND (ValorNuevo IS NULL OR ISJSON(ValorNuevo) = 1)
        AND (ValorAnterior IS NOT NULL OR ValorNuevo IS NOT NULL)
    )
);
GO

CREATE INDEX IX_Bitacora_ModuloFecha ON dbo.Bitacora (Modulo, Fecha DESC);
CREATE INDEX IX_Bitacora_Fecha ON dbo.Bitacora (Fecha DESC);
CREATE INDEX IX_Bitacora_Entidad ON dbo.Bitacora (Entidad, IDEntidad);
CREATE INDEX IX_Bitacora_IDUsuario ON dbo.Bitacora (IDUsuario);
GO

COMMIT TRANSACTION;
GO
