/*
    046_Funciones_Envios.sql
    Validación de datos de envío (RF-06):
    - FU_Envios_ValidarDireccion: una dirección de la libreta del cliente o la que escribe un
      invitado en el checkout (mismas reglas en ambos casos).
    - FU_Envios_ValidarMetodo: un método de envío que captura el administrador.

    Reciben los datos ya normalizados por el SP (textos sin espacios en los extremos y '' en
    lugar de NULL para los obligatorios). Devuelven el primer error en orden de prioridad, o
    ninguna fila si los datos son válidos. Los SPs declaran los textos con un carácter más que
    la columna: un valor más largo llega truncado a ese tamaño y la regla de longitud lo rechaza
    en lugar de guardarlo recortado.
*/
:on error exit
SET NOCOUNT ON;
GO

/*
    @Alias NULL = no se valida (la dirección de un invitado no lleva alias). El teléfono se
    compara en BIN2 (en la intercalación de la BD, '²' o '½' cuentan como dígitos) y el guion va
    primero en la clase de caracteres.
*/
CREATE OR ALTER FUNCTION dbo.FU_Envios_ValidarDireccion
(
    @Alias              NVARCHAR(51),
    @NombreDestinatario NVARCHAR(151),
    @Telefono           NVARCHAR(21),
    @Linea1             NVARCHAR(201),
    @Linea2             NVARCHAR(201),
    @CodigoPostal       NVARCHAR(6),
    @Referencias        NVARCHAR(301)
)
RETURNS TABLE
AS
RETURN
    SELECT TOP (1) v.NumeroError, v.MensajeError
    FROM (VALUES
        (1, 50034, N'DIRECCION_INVALIDA: el alias es obligatorio (máximo 50 caracteres).',
            CASE WHEN @Alias IS NOT NULL AND (LEN(@Alias) = 0 OR LEN(@Alias) > 50) THEN 1 ELSE 0 END),
        (2, 50003, N'NOMBRE_INVALIDO: el nombre de quien recibe es obligatorio (máximo 150 caracteres).',
            CASE WHEN ISNULL(LEN(@NombreDestinatario), 0) NOT BETWEEN 1 AND 150 THEN 1 ELSE 0 END),
        (3, 50004, N'TELEFONO_INVALIDO: el teléfono lleva de 8 a 20 caracteres: dígitos, espacios, + y -.',
            CASE WHEN ISNULL(LEN(@Telefono), 0) NOT BETWEEN 8 AND 20
                   OR @Telefono COLLATE Latin1_General_100_BIN2 LIKE N'%[^-0-9+ ]%' THEN 1 ELSE 0 END),
        (4, 50034, N'DIRECCION_INVALIDA: la dirección es obligatoria (máximo 200 caracteres por línea).',
            CASE WHEN ISNULL(LEN(@Linea1), 0) NOT BETWEEN 1 AND 200 OR LEN(@Linea2) > 200 THEN 1 ELSE 0 END),
        (5, 50034, N'DIRECCION_INVALIDA: el código postal lleva 5 dígitos.',
            CASE WHEN @CodigoPostal IS NOT NULL
                       AND @CodigoPostal COLLATE Latin1_General_100_BIN2 NOT LIKE N'[0-9][0-9][0-9][0-9][0-9]' THEN 1 ELSE 0 END),
        (6, 50034, N'DIRECCION_INVALIDA: las referencias admiten como máximo 300 caracteres.',
            CASE WHEN LEN(@Referencias) > 300 THEN 1 ELSE 0 END)
    ) AS v (Prioridad, NumeroError, MensajeError, Falla)
    WHERE v.Falla = 1
    ORDER BY v.Prioridad;
GO

/*
    Costo 0 se permite (envío gratis o recoger en tienda). Los días estimados van de 0 a 255
    (el tamaño de la columna) y el mínimo no supera al máximo.
*/
CREATE OR ALTER FUNCTION dbo.FU_Envios_ValidarMetodo
(
    @Nombre           NVARCHAR(101),
    @Descripcion      NVARCHAR(301),
    @Costo            DECIMAL(12, 2),
    @DiasEstimadosMin INT,
    @DiasEstimadosMax INT
)
RETURNS TABLE
AS
RETURN
    SELECT TOP (1) v.NumeroError, v.MensajeError
    FROM (VALUES
        (1, 50003, N'NOMBRE_INVALIDO: el nombre es obligatorio (máximo 100 caracteres).',
            CASE WHEN ISNULL(LEN(@Nombre), 0) NOT BETWEEN 1 AND 100 THEN 1 ELSE 0 END),
        (2, 50010, N'DESCRIPCION_INVALIDA: la descripción admite como máximo 300 caracteres.',
            CASE WHEN LEN(@Descripcion) > 300 THEN 1 ELSE 0 END),
        (3, 50035, N'COSTO_INVALIDO: el costo es obligatorio y no puede ser negativo.',
            CASE WHEN @Costo IS NULL OR @Costo < 0 THEN 1 ELSE 0 END),
        (4, 50036, N'DIAS_ESTIMADOS_INVALIDOS: los días van de 0 a 255 y el mínimo no puede superar al máximo.',
            CASE WHEN @DiasEstimadosMin IS NULL OR @DiasEstimadosMax IS NULL
                   OR @DiasEstimadosMin NOT BETWEEN 0 AND 255 OR @DiasEstimadosMax NOT BETWEEN 0 AND 255
                   OR @DiasEstimadosMin > @DiasEstimadosMax THEN 1 ELSE 0 END)
    ) AS v (Prioridad, NumeroError, MensajeError, Falla)
    WHERE v.Falla = 1
    ORDER BY v.Prioridad;
GO
