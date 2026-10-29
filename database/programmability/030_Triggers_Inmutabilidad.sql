/*
    030_Triggers_Inmutabilidad.sql
    Registros de auditoría append-only: kardex, historial de precios, historial de estados
    del pedido y bitácora. Ningún UPDATE ni DELETE se permite, ni siquiera desde un SP o
    desde una conexión con permisos de dueño: corregir un error se hace con un movimiento nuevo.
*/
:on error exit
SET NOCOUNT ON;
GO

CREATE OR ALTER TRIGGER dbo.TR_MovimientoInventario_Inmutable ON dbo.MovimientoInventario
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51900, N'REGISTRO_INMUTABLE: el kardex no admite modificaciones ni eliminaciones; registre un ajuste.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.TR_HistorialPrecio_Inmutable ON dbo.HistorialPrecio
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51900, N'REGISTRO_INMUTABLE: el historial de precios no admite modificaciones ni eliminaciones.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.TR_PedidoHistorialEstado_Inmutable ON dbo.PedidoHistorialEstado
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51900, N'REGISTRO_INMUTABLE: el historial de estados del pedido no admite modificaciones ni eliminaciones.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.TR_Bitacora_Inmutable ON dbo.Bitacora
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51900, N'REGISTRO_INMUTABLE: la bitácora no admite modificaciones ni eliminaciones.', 1;
END;
GO
