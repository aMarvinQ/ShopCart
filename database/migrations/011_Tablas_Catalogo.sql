/*
    011_Tablas_Catalogo.sql
    Módulo: Catálogo (RF-02). Tablas: Categoria, Atributo, AtributoValor, CategoriaAtributo,
    Producto, Variante, VarianteAtributoValor, ProductoImagen, HistorialPrecio.

    Modelo: el Producto es lo que se muestra; la Variante es lo que se vende y se almacena
    (SKU, precio, existencia). Todo producto tiene al menos una variante; un producto sin
    opciones tiene una sola variante sin atributos.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
GO

/* Categoria: plana, sin subcategorías (D5). Slug = identificador para URLs de la tienda. */
CREATE TABLE dbo.Categoria
(
    IDCategoria       INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Categoria PRIMARY KEY,
    Nombre            NVARCHAR(100) NOT NULL CONSTRAINT UQ_Categoria_Nombre UNIQUE,
    Slug              VARCHAR(120)  NOT NULL CONSTRAINT UQ_Categoria_Slug UNIQUE,
    Descripcion       NVARCHAR(500) NULL,
    Activo            BIT           NOT NULL CONSTRAINT DF_Categoria_Activo DEFAULT (1),
    FechaCreacion     DATETIME2(3)  NOT NULL CONSTRAINT DF_Categoria_FechaCreacion DEFAULT (SYSUTCDATETIME()),
    FechaModificacion DATETIME2(3)  NOT NULL CONSTRAINT DF_Categoria_FechaModificacion DEFAULT (SYSUTCDATETIME()),
    VersionFila       ROWVERSION    NOT NULL,

    CONSTRAINT CK_Categoria_NombreNoVacio CHECK (LEN(Nombre) > 0),
    CONSTRAINT CK_Categoria_SlugFormato CHECK (
        Slug COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^a-z0-9-]%'
        AND Slug NOT LIKE '-%' AND Slug NOT LIKE '%-' AND Slug NOT LIKE '%--%' AND LEN(Slug) > 0
    )
);
GO

/* Atributo: dimensión de una variante (Talla, Color, Almacenamiento). CRUD del Admin. */
CREATE TABLE dbo.Atributo
(
    IDAtributo    INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Atributo PRIMARY KEY,
    Nombre        NVARCHAR(50) NOT NULL CONSTRAINT UQ_Atributo_Nombre UNIQUE,
    Activo        BIT          NOT NULL CONSTRAINT DF_Atributo_Activo DEFAULT (1),
    FechaCreacion DATETIME2(3) NOT NULL CONSTRAINT DF_Atributo_FechaCreacion DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT CK_Atributo_NombreNoVacio CHECK (LEN(Nombre) > 0)
);
GO

/*
    AtributoValor: valores compartidos entre productos (un solo "M", un solo "Azul") — D16.
    - Orden: orden lógico en los selectores (S=1, M=2, L=3, XL=4).
    - CodigoHex: muestra de color opcional (#RRGGBB).
    - UQ (IDAtributo, IDAtributoValor) es requerida por la FK compuesta de VarianteAtributoValor.
*/
CREATE TABLE dbo.AtributoValor
(
    IDAtributoValor INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_AtributoValor PRIMARY KEY,
    IDAtributo      INT          NOT NULL CONSTRAINT FK_AtributoValor_Atributo REFERENCES dbo.Atributo (IDAtributo),
    Valor           NVARCHAR(50) NOT NULL,
    Orden           TINYINT      NOT NULL CONSTRAINT DF_AtributoValor_Orden DEFAULT (0),
    CodigoHex       CHAR(7)      NULL,
    Activo          BIT          NOT NULL CONSTRAINT DF_AtributoValor_Activo DEFAULT (1),
    FechaCreacion   DATETIME2(3) NOT NULL CONSTRAINT DF_AtributoValor_FechaCreacion DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT UQ_AtributoValor_Atributo_Valor UNIQUE (IDAtributo, Valor),
    CONSTRAINT UQ_AtributoValor_Atributo_IDAtributoValor UNIQUE (IDAtributo, IDAtributoValor),
    CONSTRAINT CK_AtributoValor_ValorNoVacio CHECK (LEN(Valor) > 0),
    CONSTRAINT CK_AtributoValor_CodigoHexFormato CHECK (
        CodigoHex IS NULL
        OR CodigoHex COLLATE Latin1_General_100_BIN2 LIKE '#[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F]'
    )
);
GO

/*
    CategoriaAtributo: atributos disponibles para los productos de cada categoría
    (Ropa → Color, Talla). Orden define el orden de los selectores en la tienda.
*/
CREATE TABLE dbo.CategoriaAtributo
(
    IDCategoria INT     NOT NULL CONSTRAINT FK_CategoriaAtributo_Categoria REFERENCES dbo.Categoria (IDCategoria),
    IDAtributo  INT     NOT NULL CONSTRAINT FK_CategoriaAtributo_Atributo REFERENCES dbo.Atributo (IDAtributo),
    Orden       TINYINT NOT NULL CONSTRAINT DF_CategoriaAtributo_Orden DEFAULT (0),

    CONSTRAINT PK_CategoriaAtributo PRIMARY KEY (IDCategoria, IDAtributo)
);
GO

CREATE INDEX IX_CategoriaAtributo_IDAtributo ON dbo.CategoriaAtributo (IDAtributo);
GO

/*
    Producto: nace inactivo; solo se activa con al menos una imagen (D17, validado en el SP).
    Con ventas asociadas no se elimina: se desactiva.
*/
CREATE TABLE dbo.Producto
(
    IDProducto        INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Producto PRIMARY KEY,
    IDCategoria       INT            NOT NULL CONSTRAINT FK_Producto_Categoria REFERENCES dbo.Categoria (IDCategoria),
    Nombre            NVARCHAR(200)  NOT NULL,
    Slug              VARCHAR(220)   NOT NULL CONSTRAINT UQ_Producto_Slug UNIQUE,
    Descripcion       NVARCHAR(4000) NULL,
    Activo            BIT            NOT NULL CONSTRAINT DF_Producto_Activo DEFAULT (0),
    FechaCreacion     DATETIME2(3)   NOT NULL CONSTRAINT DF_Producto_FechaCreacion DEFAULT (SYSUTCDATETIME()),
    FechaModificacion DATETIME2(3)   NOT NULL CONSTRAINT DF_Producto_FechaModificacion DEFAULT (SYSUTCDATETIME()),
    VersionFila       ROWVERSION     NOT NULL,

    CONSTRAINT CK_Producto_NombreNoVacio CHECK (LEN(Nombre) > 0),
    CONSTRAINT CK_Producto_SlugFormato CHECK (
        Slug COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^a-z0-9-]%'
        AND Slug NOT LIKE '-%' AND Slug NOT LIKE '%-' AND Slug NOT LIKE '%--%' AND LEN(Slug) > 0
    )
);
GO

CREATE INDEX IX_Producto_IDCategoria ON dbo.Producto (IDCategoria, Activo);
GO

/*
    Variante: unidad vendible.
    - Precio incluye IVA (12 %). DECIMAL, nunca FLOAT.
    - ExistenciaFisica es el saldo materializado del kardex: solo lo modifican los SPs de
      inventario en la misma transacción que insertan el movimiento. Nunca negativo.
    - ClaveCombinacion: IDs de los valores de atributo ordenados por IDAtributo y unidos con '|'
      (p. ej. '3|17'; '' si no tiene atributos). La UQ impide combinaciones repetidas en un producto.
      Una variante desactivada conserva su combinación: para volver a venderla se reactiva.
*/
CREATE TABLE dbo.Variante
(
    IDVariante        INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Variante PRIMARY KEY,
    IDProducto        INT            NOT NULL CONSTRAINT FK_Variante_Producto REFERENCES dbo.Producto (IDProducto),
    SKU               VARCHAR(50)    NOT NULL CONSTRAINT UQ_Variante_SKU UNIQUE,
    Precio            DECIMAL(12, 2) NOT NULL,
    ExistenciaFisica  INT            NOT NULL CONSTRAINT DF_Variante_ExistenciaFisica DEFAULT (0),
    ClaveCombinacion  VARCHAR(100)   NOT NULL CONSTRAINT DF_Variante_ClaveCombinacion DEFAULT (''),
    Activo            BIT            NOT NULL CONSTRAINT DF_Variante_Activo DEFAULT (1),
    FechaCreacion     DATETIME2(3)   NOT NULL CONSTRAINT DF_Variante_FechaCreacion DEFAULT (SYSUTCDATETIME()),
    FechaModificacion DATETIME2(3)   NOT NULL CONSTRAINT DF_Variante_FechaModificacion DEFAULT (SYSUTCDATETIME()),
    VersionFila       ROWVERSION     NOT NULL,

    CONSTRAINT UQ_Variante_Producto_Combinacion UNIQUE (IDProducto, ClaveCombinacion),
    CONSTRAINT CK_Variante_SKUFormato CHECK (SKU COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Z0-9-]%' AND LEN(SKU) >= 3),
    CONSTRAINT CK_Variante_PrecioPositivo CHECK (Precio > 0),
    CONSTRAINT CK_Variante_ExistenciaNoNegativa CHECK (ExistenciaFisica >= 0),
    CONSTRAINT CK_Variante_ClaveCombinacionFormato CHECK (ClaveCombinacion NOT LIKE '%[^0-9|]%')
);
GO

CREATE INDEX IX_Variante_IDProducto ON dbo.Variante (IDProducto, Activo)
    INCLUDE (Precio, ExistenciaFisica, ClaveCombinacion);
GO

/*
    VarianteAtributoValor: combinación de una variante (Rojo + M).
    - PK (IDVariante, IDAtributo): una variante tiene un solo valor por atributo.
    - FK compuesta (IDAtributo, IDAtributoValor): el valor pertenece a ese atributo
      (no se puede guardar "Rojo" como Talla).
*/
CREATE TABLE dbo.VarianteAtributoValor
(
    IDVariante      INT NOT NULL CONSTRAINT FK_VarianteAtributoValor_Variante REFERENCES dbo.Variante (IDVariante),
    IDAtributo      INT NOT NULL,
    IDAtributoValor INT NOT NULL,

    CONSTRAINT PK_VarianteAtributoValor PRIMARY KEY (IDVariante, IDAtributo),
    CONSTRAINT FK_VarianteAtributoValor_AtributoValor FOREIGN KEY (IDAtributo, IDAtributoValor)
        REFERENCES dbo.AtributoValor (IDAtributo, IDAtributoValor)
);
GO

CREATE INDEX IX_VarianteAtributoValor_IDAtributoValor ON dbo.VarianteAtributoValor (IDAtributoValor);
GO

/*
    ProductoImagen: archivos subidos a la API (D9); se guarda solo la ruta relativa.
    - IDAtributoValor NULL = imagen general; con valor = imagen de ese color (D17).
    - Una sola imagen principal por (producto, valor). En índices únicos SQL Server trata los
      NULL como iguales, así que también hay una sola principal general.
*/
CREATE TABLE dbo.ProductoImagen
(
    IDProductoImagen INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_ProductoImagen PRIMARY KEY,
    IDProducto       INT           NOT NULL CONSTRAINT FK_ProductoImagen_Producto REFERENCES dbo.Producto (IDProducto),
    IDAtributoValor  INT           NULL CONSTRAINT FK_ProductoImagen_AtributoValor REFERENCES dbo.AtributoValor (IDAtributoValor),
    RutaImagen       NVARCHAR(500) NOT NULL CONSTRAINT UQ_ProductoImagen_RutaImagen UNIQUE,
    TextoAlternativo NVARCHAR(200) NOT NULL,
    Orden            TINYINT       NOT NULL CONSTRAINT DF_ProductoImagen_Orden DEFAULT (0),
    EsPrincipal      BIT           NOT NULL CONSTRAINT DF_ProductoImagen_EsPrincipal DEFAULT (0),
    FechaCreacion    DATETIME2(3)  NOT NULL CONSTRAINT DF_ProductoImagen_FechaCreacion DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT CK_ProductoImagen_RutaFormato CHECK (RutaImagen LIKE N'/uploads/%' AND RutaImagen NOT LIKE N'%..%'),
    CONSTRAINT CK_ProductoImagen_TextoAlternativoNoVacio CHECK (LEN(TextoAlternativo) > 0)
);
GO

CREATE UNIQUE INDEX UQ_ProductoImagen_Principal ON dbo.ProductoImagen (IDProducto, IDAtributoValor) WHERE EsPrincipal = 1;
CREATE INDEX IX_ProductoImagen_IDProducto ON dbo.ProductoImagen (IDProducto, IDAtributoValor, Orden);
CREATE INDEX IX_ProductoImagen_IDAtributoValor ON dbo.ProductoImagen (IDAtributoValor) WHERE IDAtributoValor IS NOT NULL;
GO

/*
    HistorialPrecio: cada cambio de precio de una variante. Append-only (trigger en programmability).
    PrecioAnterior NULL = precio inicial al crear la variante.
*/
CREATE TABLE dbo.HistorialPrecio
(
    IDHistorialPrecio BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_HistorialPrecio PRIMARY KEY,
    IDVariante        INT            NOT NULL CONSTRAINT FK_HistorialPrecio_Variante REFERENCES dbo.Variante (IDVariante),
    PrecioAnterior    DECIMAL(12, 2) NULL,
    PrecioNuevo       DECIMAL(12, 2) NOT NULL,
    IDUsuario         INT            NOT NULL CONSTRAINT FK_HistorialPrecio_Usuario REFERENCES dbo.Usuario (IDUsuario),
    Fecha             DATETIME2(3)   NOT NULL CONSTRAINT DF_HistorialPrecio_Fecha DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT CK_HistorialPrecio_PrecioPositivo CHECK (PrecioNuevo > 0 AND (PrecioAnterior IS NULL OR PrecioAnterior > 0)),
    CONSTRAINT CK_HistorialPrecio_HayCambio CHECK (PrecioAnterior IS NULL OR PrecioAnterior <> PrecioNuevo)
);
GO

CREATE INDEX IX_HistorialPrecio_IDVariante ON dbo.HistorialPrecio (IDVariante, Fecha DESC);
GO

COMMIT TRANSACTION;
GO
