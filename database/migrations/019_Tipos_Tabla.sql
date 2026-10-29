/*
    019_Tipos_Tabla.sql
    Tipos tabla (TVP) para enviar varias filas a un SP en una sola llamada y una sola
    transacción. Van en migrations porque SQL Server no permite CREATE OR ALTER TYPE y un
    tipo en uso por un SP no se puede eliminar: un cambio se hace con un tipo nuevo.

    Criterio: los tipos solo declaran estructura (tipos de dato iguales a las columnas de
    destino, NOT NULL y llave primaria). Las reglas de negocio las valida el SP con mensajes
    claros; un CHECK aquí fallaría al cargar el parámetro, antes de que el SP pueda explicar
    el error. La llave primaria impide filas repetidas y crea el índice que usan los JOIN.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
GO

/*
    Variantes de un producto nuevo o agregadas a uno existente. Como el IDVariante aún no
    existe, NumeroLinea enlaza cada variante con sus atributos (TT_Catalogo_VarianteAtributo).
    ExistenciaInicial > 0 genera un movimiento INVENTARIO_INICIAL en el kardex (D15).
*/
CREATE TYPE dbo.TT_Catalogo_Variante AS TABLE
(
    NumeroLinea       INT            NOT NULL PRIMARY KEY,
    SKU               VARCHAR(50)    NOT NULL,
    Precio            DECIMAL(12, 2) NOT NULL,
    ExistenciaInicial INT            NOT NULL
);
GO

/* Combinación de cada variante: un valor por atributo (misma regla que VarianteAtributoValor). */
CREATE TYPE dbo.TT_Catalogo_VarianteAtributo AS TABLE
(
    NumeroLinea     INT NOT NULL,
    IDAtributo      INT NOT NULL,
    IDAtributoValor INT NOT NULL,
    PRIMARY KEY (NumeroLinea, IDAtributo)
);
GO

/* Imágenes ya subidas por la API (D9). IDAtributoValor NULL = imagen general. */
CREATE TYPE dbo.TT_Catalogo_ProductoImagen AS TABLE
(
    NumeroLinea      INT           NOT NULL PRIMARY KEY,
    RutaImagen       NVARCHAR(500) NOT NULL,
    TextoAlternativo NVARCHAR(200) NOT NULL,
    IDAtributoValor  INT           NULL,
    Orden            TINYINT       NOT NULL,
    EsPrincipal      BIT           NOT NULL
);
GO

/*
    Líneas de un movimiento manual de inventario (p. ej. una entrada de compra con varias
    variantes). La llave por IDVariante impide repetir una variante y entrega las filas
    ordenadas, el mismo orden en que el SP bloquea las variantes (evita interbloqueos).
*/
CREATE TYPE dbo.TT_Inventario_Movimiento AS TABLE
(
    IDVariante INT NOT NULL PRIMARY KEY,
    Cantidad   INT NOT NULL
);
GO

/* Líneas de una devolución: cuántas unidades de cada línea del pedido se devuelven. */
CREATE TYPE dbo.TT_Devoluciones_Linea AS TABLE
(
    IDPedidoDetalle INT NOT NULL PRIMARY KEY,
    Cantidad        INT NOT NULL
);
GO

COMMIT TRANSACTION;
GO
