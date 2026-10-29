/*
    043_Funciones_Cupones.sql
    Reglas de cupones (RF-05) en tres funciones:
    - FU_Cupones_Validar: reglas del cupón y del cliente (vigencia, usos, solo registrados).
      Se revalida al aplicar el cupón, al iniciar el checkout y al pagar.
    - FU_Cupones_CalculoDescuento: reglas que dependen del carrito (monto mínimo, categoría)
      y el monto del descuento.
    - FU_Cupones_ProrrateoDescuento: reparte el descuento por línea, cuadrado al centavo.

    Devuelven un CodigoError estable (NULL = válido) en lugar de lanzar errores: el SP decide
    el número de error y la API lo convierte en el mensaje para el cliente.
*/
:on error exit
SET NOCOUNT ON;
GO

/*
    @IDUsuario NULL = invitado. El correo para el límite por cliente se toma del usuario
    registrado o, si es invitado, de @CorreoInvitado (normalizado en minúsculas por el SP).
    Si aún no se conoce el correo del invitado, el límite por cliente se valida en el
    checkout, cuando lo captura.
    Siempre devuelve una fila (también si el cupón no existe), en el orden de prioridad de
    los mensajes: inválido, no vigente, vencido, agotado, solo registrados, límite por cliente.
*/
CREATE OR ALTER FUNCTION dbo.FU_Cupones_Validar
(
    @IDCupon        INT,
    @IDUsuario      INT,
    @CorreoInvitado NVARCHAR(254),
    @Ahora          DATETIME2(3)
)
RETURNS TABLE
AS
RETURN
    SELECT
        c.IDCupon,
        c.Codigo,
        c.FechaInicio,
        c.FechaFin,
        u.UsosCliente,
        CASE
            WHEN c.IDCupon IS NULL OR c.Activo = 0                     THEN 'CUPON_INVALIDO'
            WHEN @Ahora < c.FechaInicio                                THEN 'CUPON_NO_VIGENTE'
            WHEN @Ahora >= c.FechaFin                                  THEN 'CUPON_VENCIDO'
            WHEN c.UsosActuales >= c.LimiteUsosTotal                   THEN 'CUPON_AGOTADO'
            WHEN c.SoloRegistrados = 1 AND @IDUsuario IS NULL          THEN 'CUPON_SOLO_REGISTRADOS'
            WHEN u.UsosCliente >= c.LimiteUsosPorCliente               THEN 'CUPON_LIMITE_CLIENTE'
        END AS CodigoError
    FROM (VALUES (@IDCupon)) AS solicitud (IDCupon)
    LEFT JOIN dbo.Cupon AS c ON c.IDCupon = solicitud.IDCupon
    OUTER APPLY (
        SELECT COUNT(*) AS UsosCliente
        FROM dbo.CuponUso AS cu
        WHERE cu.IDCupon = c.IDCupon
          AND cu.FechaReversion IS NULL
          AND cu.CorreoCliente = COALESCE((SELECT us.Correo FROM dbo.Usuario AS us WHERE us.IDUsuario = @IDUsuario),
                                          @CorreoInvitado)
    ) AS u;
GO

/*
    Monto mínimo: se compara con el subtotal de todo el carrito.
    Elegible: todo el carrito, o solo las líneas de la categoría del cupón.
    PORCENTAJE: ROUND(elegible × valor / 100, 2). MONTO_FIJO: el valor, sin exceder lo elegible.
    El descuento nunca supera el subtotal elegible (ni, por lo tanto, el subtotal).
    Sin fila si el cupón no existe (FU_Cupones_Validar ya lo reporta).
*/
CREATE OR ALTER FUNCTION dbo.FU_Cupones_CalculoDescuento (@IDCupon INT, @IDCarrito INT)
RETURNS TABLE
AS
RETURN
    WITH Lineas AS
    (
        SELECT
            l.Importe,
            CASE WHEN c.IDCategoria IS NULL OR l.IDCategoria = c.IDCategoria THEN l.Importe ELSE 0 END AS ImporteElegible
        FROM dbo.FU_Carrito_Lineas(@IDCarrito) AS l
        CROSS JOIN dbo.Cupon AS c
        WHERE c.IDCupon = @IDCupon
    ),
    Sumas AS
    (
        SELECT SUM(Importe) AS Subtotal, SUM(ImporteElegible) AS SubtotalElegible
        FROM Lineas
    ),
    Totales AS
    (
        SELECT
            c.IDCupon,
            c.TipoDescuento,
            c.Valor,
            c.MontoMinimo,
            ISNULL(s.Subtotal, 0) AS Subtotal,
            ISNULL(s.SubtotalElegible, 0) AS SubtotalElegible
        FROM dbo.Cupon AS c
        CROSS JOIN Sumas AS s
        WHERE c.IDCupon = @IDCupon
    ),
    Resultado AS
    (
        SELECT
            IDCupon,
            TipoDescuento,
            Valor,
            Subtotal,
            SubtotalElegible,
            CASE
                WHEN Subtotal = 0             THEN 'CARRITO_VACIO'
                WHEN Subtotal < MontoMinimo   THEN 'CUPON_MONTO_MINIMO'
                WHEN SubtotalElegible = 0     THEN 'CUPON_SIN_PRODUCTOS_ELEGIBLES'
            END AS CodigoError
        FROM Totales
    )
    SELECT
        IDCupon,
        Subtotal,
        SubtotalElegible,
        CAST(
            CASE
                WHEN CodigoError IS NOT NULL       THEN 0
                WHEN TipoDescuento = 'PORCENTAJE'  THEN ROUND(SubtotalElegible * Valor / 100, 2)
                WHEN Valor < SubtotalElegible      THEN Valor
                ELSE SubtotalElegible
            END AS DECIMAL(12, 2)) AS Descuento,
        CodigoError
    FROM Resultado;
GO

/*
    Reparte @Descuento entre las líneas elegibles, proporcional a su importe, con el método
    del mayor residuo en centavos: cada línea recibe la parte entera de su cuota y los
    centavos sobrantes van a las líneas con mayor residuo (empate: menor IDVariante).
    Garantías: SUM(DescuentoLinea) = @Descuento exacto, ninguna línea recibe más que su
    importe y las no elegibles reciben 0. Ej.: Q10.00 entre 3 líneas iguales = 3.34 + 3.33 + 3.33.
    Aritmética entera en DECIMAL(38, 0): sin redondeos intermedios.
    Precondición: 0 <= @Descuento <= subtotal elegible (lo garantiza FU_Cupones_CalculoDescuento).
*/
CREATE OR ALTER FUNCTION dbo.FU_Cupones_ProrrateoDescuento
(
    @IDCupon   INT,
    @IDCarrito INT,
    @Descuento DECIMAL(12, 2)
)
RETURNS TABLE
AS
RETURN
    WITH Lineas AS
    (
        SELECT
            l.IDVariante,
            l.Cantidad,
            l.PrecioUnitario,
            l.Importe,
            CAST(CASE WHEN c.IDCategoria IS NULL OR l.IDCategoria = c.IDCategoria THEN 1 ELSE 0 END AS BIT) AS Elegible
        FROM dbo.FU_Carrito_Lineas(@IDCarrito) AS l
        CROSS JOIN dbo.Cupon AS c
        WHERE c.IDCupon = @IDCupon
    ),
    Centavos AS
    (
        SELECT
            IDVariante, Cantidad, PrecioUnitario, Importe, Elegible,
            CAST(CASE WHEN Elegible = 1 THEN Importe * 100 ELSE 0 END AS DECIMAL(38, 0)) AS ImporteCentavos,
            CAST(@Descuento * 100 AS DECIMAL(38, 0)) AS DescuentoCentavos
        FROM Lineas
    ),
    Cuotas AS
    (
        SELECT
            IDVariante, Cantidad, PrecioUnitario, Importe, Elegible, ImporteCentavos, DescuentoCentavos,
            SUM(ImporteCentavos) OVER () AS ElegibleCentavos
        FROM Centavos
    ),
    Partes AS
    (
        SELECT
            IDVariante, Cantidad, PrecioUnitario, Importe, Elegible,
            q.CuotaEntera,
            DescuentoCentavos * ImporteCentavos - q.CuotaEntera * ElegibleCentavos AS Residuo,
            DescuentoCentavos
        FROM Cuotas
        CROSS APPLY (
            SELECT CAST(CASE WHEN ElegibleCentavos > 0
                             THEN FLOOR(DescuentoCentavos * ImporteCentavos / ElegibleCentavos)
                             ELSE 0 END AS DECIMAL(38, 0)) AS CuotaEntera
        ) AS q
    ),
    Repartidos AS
    (
        SELECT
            IDVariante, Cantidad, PrecioUnitario, Importe, Elegible, CuotaEntera,
            DescuentoCentavos - SUM(CuotaEntera) OVER () AS CentavosSobrantes,
            ROW_NUMBER() OVER (ORDER BY Residuo DESC, IDVariante) AS OrdenResiduo
        FROM Partes
    )
    SELECT
        IDVariante,
        Cantidad,
        PrecioUnitario,
        Importe,
        Elegible,
        CAST((CuotaEntera + CASE WHEN OrdenResiduo <= CentavosSobrantes THEN 1 ELSE 0 END) / 100 AS DECIMAL(12, 2)) AS DescuentoLinea
    FROM Repartidos;
GO
