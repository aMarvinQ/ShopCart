/*
    025_Configuracion.sql
    Módulo: Configuración (edición de parámetros, D20) y Bitácora (RF-09).

    - Parametro.ValorMinimo / ValorMaximo (D51): rango válido de cada parámetro numérico, cargado
      por la semilla junto con la clave. La tabla rechaza un valor fuera de su rango, así que ni
      la semilla ni una edición pueden dejarlo inválido. Los parámetros de texto no tienen rango.
      Son opcionales para no exigirlos a los datos de prueba; el SP de edición rechaza editar un
      parámetro numérico sin rango (configuración incompleta).
    - Parametro.VersionFila: control de edición concurrente, igual que en las demás entidades
      editables desde el panel.
    - Bitacora: nuevo módulo CONFIGURACION para los cambios de parámetros.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
GO

ALTER TABLE dbo.Parametro ADD
    ValorMinimo DECIMAL(18, 6) NULL,
    ValorMaximo DECIMAL(18, 6) NULL,
    VersionFila ROWVERSION     NOT NULL;
GO

ALTER TABLE dbo.Parametro ADD
    -- Ambos límites o ninguno; solo en parámetros numéricos; el mínimo no supera al máximo.
    CONSTRAINT CK_Parametro_RangoValido CHECK (
        (ValorMinimo IS NULL AND ValorMaximo IS NULL)
        OR (TipoDato IN ('ENTERO', 'DECIMAL') AND ValorMinimo IS NOT NULL AND ValorMaximo IS NOT NULL AND ValorMinimo <= ValorMaximo)
    ),
    CONSTRAINT CK_Parametro_ValorEnRango CHECK (
        ValorMinimo IS NULL OR TRY_CAST(Valor AS DECIMAL(18, 6)) BETWEEN ValorMinimo AND ValorMaximo
    );
GO

ALTER TABLE dbo.Bitacora DROP CONSTRAINT CK_Bitacora_Modulo;
ALTER TABLE dbo.Bitacora ADD CONSTRAINT CK_Bitacora_Modulo
    CHECK (Modulo IN ('CATALOGO', 'INVENTARIO', 'CUPONES', 'PEDIDOS', 'USUARIOS', 'ENVIOS', 'CONFIGURACION'));
GO

COMMIT TRANSACTION;
GO
