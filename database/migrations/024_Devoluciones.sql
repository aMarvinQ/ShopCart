/*
    024_Devoluciones.sql
    Módulo: Devoluciones (RF-07).

    - DevolucionDetalle.Reingresa (D41): la unidad devuelta vuelve al inventario (buen estado,
      kardex DEVOLUCION) o no (dañada: se registra la devolución y el reembolso, la existencia
      no cambia).
    - TT_Devoluciones_Linea: las líneas a devolver en una sola llamada (mismo criterio que 019:
      solo estructura; las reglas las valida el SP). 019 la creó sin Reingresa; un tipo tabla no
      se puede modificar, y como ningún SP la usaba todavía se elimina y se vuelve a crear.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
GO

ALTER TABLE dbo.DevolucionDetalle ADD Reingresa BIT NOT NULL CONSTRAINT DF_DevolucionDetalle_Reingresa DEFAULT (1);
GO

DROP TYPE dbo.TT_Devoluciones_Linea;
GO

/* Una fila por línea del pedido: cuántas unidades se devuelven y si vuelven al inventario. */
CREATE TYPE dbo.TT_Devoluciones_Linea AS TABLE
(
    IDPedidoDetalle INT NOT NULL PRIMARY KEY,
    Cantidad        INT NOT NULL,
    Reingresa       BIT NOT NULL
);
GO

COMMIT TRANSACTION;
GO
