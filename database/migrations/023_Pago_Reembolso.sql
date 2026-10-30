/*
    023_Pago_Reembolso.sql
    Módulo: Pedidos (RF-07). Reembolso de un pago al cancelar un pedido (D38).

    - Pago admite el estado REEMBOLSADO: el reembolso (simulado) de un pago aprobado, por su
      mismo monto, ligado al pedido y al pago original (IDPagoOriginal).
    - FK compuesta (IDPagoOriginal, IDPedido): el pago original es del mismo pedido.
    - Un solo reembolso por pago (índice único filtrado).
    - Estado pasa a VARCHAR(12) ('REEMBOLSADO' tiene 11 caracteres); las restricciones y el
      índice que lo usan se quitan y se vuelven a crear.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
GO

ALTER TABLE dbo.Pago ADD IDPagoOriginal BIGINT NULL;
GO

ALTER TABLE dbo.Pago ADD CONSTRAINT UQ_Pago_IDPago_IDPedido UNIQUE (IDPago, IDPedido);
ALTER TABLE dbo.Pago ADD CONSTRAINT FK_Pago_PagoOriginalDelPedido FOREIGN KEY (IDPagoOriginal, IDPedido)
    REFERENCES dbo.Pago (IDPago, IDPedido);

ALTER TABLE dbo.Pago DROP CONSTRAINT CK_Pago_Estado;
ALTER TABLE dbo.Pago DROP CONSTRAINT CK_Pago_Resultado;
DROP INDEX UQ_Pago_CheckoutAprobado ON dbo.Pago;
ALTER TABLE dbo.Pago ALTER COLUMN Estado VARCHAR(12) NOT NULL;
GO

CREATE UNIQUE INDEX UQ_Pago_CheckoutAprobado ON dbo.Pago (IDCheckout) WHERE Estado = 'APROBADO';
ALTER TABLE dbo.Pago ADD CONSTRAINT CK_Pago_Estado CHECK (Estado IN ('APROBADO', 'RECHAZADO', 'REEMBOLSADO'));
ALTER TABLE dbo.Pago ADD CONSTRAINT CK_Pago_Resultado CHECK (
    (Estado = 'APROBADO' AND IDPedido IS NOT NULL AND CodigoAutorizacion IS NOT NULL AND MotivoRechazo IS NULL AND IDPagoOriginal IS NULL)
    OR (Estado = 'RECHAZADO' AND IDPedido IS NULL AND CodigoAutorizacion IS NULL AND MotivoRechazo IS NOT NULL AND IDPagoOriginal IS NULL)
    OR (Estado = 'REEMBOLSADO' AND IDPedido IS NOT NULL AND MotivoRechazo IS NULL AND IDPagoOriginal IS NOT NULL)
);

CREATE UNIQUE INDEX UQ_Pago_ReembolsoUnico ON dbo.Pago (IDPagoOriginal) WHERE IDPagoOriginal IS NOT NULL;
GO

COMMIT TRANSACTION;
GO
