/*
    079_SP_Checkout.sql
    Checkout (RF-06): iniciar con reserva de inventario, consultar, registrar un pago rechazado
    y expirar los vencidos. El pago aprobado y el pedido están en 080_SP_Pedidos.sql.

    - Propietario: un cliente registrado (@IDUsuario) o un invitado (@TokenInvitadoHash), como
      en el carrito. Un checkout ajeno responde igual que uno inexistente.
    - Iniciar congela precios, cupón y envío, y reserva cada unidad por MINUTOS_RESERVA
      (Parametro). Mientras la reserva está vigente nadie más puede tomar esas unidades.
    - Idempotencia: (carrito, ClaveIdempotencia) es único. El frontend genera una clave por
      cada vez que el cliente pasa al pago; repetir la petición con la misma clave (doble clic,
      reintento de red) devuelve el mismo checkout.
    - Un solo checkout pendiente por carrito: iniciar otro cancela el anterior y libera sus
      reservas. Si el carrito cambia después de iniciar, el checkout deja de poder pagarse
      (FU_Checkout_Estado: CARRITO_MODIFICADO) y el frontend lo vuelve a iniciar.
    - Orden de bloqueo: Carrito → Checkout → Variante (por IDVariante) → ReservaInventario,
      el mismo que usa el pago.
    - Errores: ver docs/errores.md.
*/
:on error exit
SET NOCOUNT ON;
GO

/*
    Checkout con sus líneas en JSON: lo que muestra la página de pago. Estado es el efectivo
    (FU_Checkout_Estado): solo PENDIENTE se puede pagar. SegundosRestantes alimenta la cuenta
    regresiva. Si ya se pagó trae el pedido (IDPedido, NumeroPedido).
*/
CREATE OR ALTER PROCEDURE dbo.SP_Checkout_Obtener
    @IDUsuario         INT = NULL,
    @TokenInvitadoHash VARBINARY(64) = NULL,
    @IDCheckout        BIGINT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME(), @Token BINARY(32);

    IF (@IDUsuario IS NULL AND @TokenInvitadoHash IS NULL) OR (@IDUsuario IS NOT NULL AND @TokenInvitadoHash IS NOT NULL)
       OR DATALENGTH(@TokenInvitadoHash) <> 32
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el cliente o el hash SHA-256 del token de invitado, uno de los dos.', 1;

    IF @IDUsuario IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuario) AS a WHERE a.CodigoRol = 'CLIENTE')
        THROW 50201, N'PERMISO_DENEGADO: solo un cliente activo puede comprar.', 1;

    SET @Token = CAST(@TokenInvitadoHash AS BINARY(32));

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.Checkout AS ch
        JOIN dbo.Carrito AS c ON c.IDCarrito = ch.IDCarrito
        WHERE ch.IDCheckout = @IDCheckout
          AND ((@IDUsuario IS NOT NULL AND ch.IDUsuario = @IDUsuario)
               OR (@IDUsuario IS NULL AND ch.IDUsuario IS NULL AND c.TokenInvitadoHash = @Token))
    )
        THROW 50115, N'CHECKOUT_NO_ENCONTRADO: el checkout no existe.', 1;

    SELECT ch.IDCheckout, e.EstadoEfectivo AS Estado, ch.FechaCreacion, ch.FechaExpiracion,
           CASE WHEN e.EstadoEfectivo = 'PENDIENTE' THEN DATEDIFF(SECOND, @Ahora, ch.FechaExpiracion) ELSE 0 END AS SegundosRestantes,
           ch.CorreoContacto, ch.NombreContacto, ch.TelefonoContacto, ch.IDDireccion,
           ch.EnvioNombre, ch.EnvioTelefono, ch.EnvioLinea1, ch.EnvioLinea2, ch.EnvioMunicipio, ch.IDDepartamento,
           dep.Nombre AS Departamento, ch.EnvioCodigoPostal, ch.EnvioReferencias,
           ch.IDMetodoEnvio, me.Nombre AS MetodoEnvio, me.DiasEstimadosMin, me.DiasEstimadosMax, cu.Codigo AS CodigoCupon,
           ch.Subtotal, ch.Descuento, ch.CostoEnvio, ch.Total, iva.BaseImponible, iva.IVA,
           p.IDPedido, p.NumeroPedido,
           ISNULL((SELECT d.IDVariante, v.SKU, pr.Nombre AS Producto, pr.Slug,
                          ISNULL((SELECT STRING_AGG(av.Valor, N' / ') WITHIN GROUP (ORDER BY ISNULL(ca.Orden, 255), vav.IDAtributo)
                                  FROM dbo.VarianteAtributoValor AS vav
                                  JOIN dbo.AtributoValor AS av ON av.IDAtributoValor = vav.IDAtributoValor
                                  LEFT JOIN dbo.CategoriaAtributo AS ca ON ca.IDCategoria = pr.IDCategoria AND ca.IDAtributo = vav.IDAtributo
                                  WHERE vav.IDVariante = d.IDVariante), N'') AS Descripcion,
                          i.RutaImagen AS Imagen, i.TextoAlternativo, d.Cantidad, d.PrecioUnitario, d.DescuentoLinea,
                          CAST(d.Cantidad * d.PrecioUnitario - d.DescuentoLinea AS DECIMAL(12, 2)) AS TotalLinea
                   FROM dbo.CheckoutDetalle AS d
                   JOIN dbo.Variante AS v ON v.IDVariante = d.IDVariante
                   JOIN dbo.Producto AS pr ON pr.IDProducto = v.IDProducto
                   -- Imagen: la principal del valor de la variante (su color) o la general del producto.
                   OUTER APPLY (
                       SELECT TOP (1) pi.RutaImagen, pi.TextoAlternativo
                       FROM dbo.ProductoImagen AS pi
                       WHERE pi.IDProducto = pr.IDProducto AND pi.EsPrincipal = 1
                       ORDER BY CASE WHEN EXISTS (SELECT 1 FROM dbo.VarianteAtributoValor AS vav
                                                  WHERE vav.IDVariante = d.IDVariante AND vav.IDAtributoValor = pi.IDAtributoValor) THEN 0
                                     WHEN pi.IDAtributoValor IS NULL THEN 1
                                     ELSE 2 END,
                                pi.IDProductoImagen
                   ) AS i
                   WHERE d.IDCheckout = ch.IDCheckout
                   ORDER BY d.IDVariante
                   FOR JSON PATH, INCLUDE_NULL_VALUES), N'[]') AS Lineas
    FROM dbo.Checkout AS ch
    JOIN dbo.FU_Checkout_Estado(@IDCheckout, @Ahora) AS e ON e.IDCheckout = ch.IDCheckout
    JOIN dbo.Departamento AS dep ON dep.IDDepartamento = ch.IDDepartamento
    JOIN dbo.MetodoEnvio AS me ON me.IDMetodoEnvio = ch.IDMetodoEnvio
    LEFT JOIN dbo.Cupon AS cu ON cu.IDCupon = ch.IDCupon
    LEFT JOIN dbo.Pedido AS p ON p.IDCheckout = ch.IDCheckout
    OUTER APPLY dbo.FU_Pedidos_DesgloseIVA(ch.Total) AS iva
    WHERE ch.IDCheckout = @IDCheckout;
END;
GO

/*
    Inicia el checkout del carrito activo.
    - Cliente registrado: @IDDireccion de su libreta; el contacto sale de su cuenta (el
      teléfono, de la dirección si la cuenta no tiene uno válido).
    - Invitado: @Correo y la dirección escrita (mismas reglas que la libreta); quien recibe es
      también el contacto.
    Valida lo mismo que muestra el carrito (líneas a la venta, tope por línea, cupón válido; el
    límite por cliente del cupón ahora con el correo) y además reserva: con las variantes
    bloqueadas, cada línea debe caber en lo disponible. Rechaza con el primer problema.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Checkout_Iniciar
    @IDUsuario          INT = NULL,
    @TokenInvitadoHash  VARBINARY(64) = NULL,
    @ClaveIdempotencia  UNIQUEIDENTIFIER,
    @IDMetodoEnvio      INT,
    @IDDireccion        INT = NULL,
    @Correo             NVARCHAR(255) = NULL,
    @NombreDestinatario NVARCHAR(151) = NULL,
    @Telefono           NVARCHAR(21) = NULL,
    @Linea1             NVARCHAR(201) = NULL,
    @Linea2             NVARCHAR(201) = NULL,
    @IDMunicipio        SMALLINT = NULL,
    @CodigoPostal       NVARCHAR(6) = NULL,
    @Referencias        NVARCHAR(301) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME(), @Token BINARY(32), @Maximo INT, @Minutos INT,
            @IDCarrito INT, @IDCupon INT, @IDCheckout BIGINT, @Bloqueadas INT,
            @NombreContacto NVARCHAR(200), @TelefonoContacto NVARCHAR(20), @Municipio NVARCHAR(100), @IDDepartamento TINYINT,
            @CostoEnvio DECIMAL(12, 2), @Subtotal DECIMAL(12, 2), @Descuento DECIMAL(12, 2) = 0, @SubtotalCupon DECIMAL(12, 2),
            @ErrorCupon VARCHAR(40), @NumeroError INT, @MensajeError NVARCHAR(400);
    DECLARE @Cancelados TABLE (IDCheckout BIGINT PRIMARY KEY);

    IF (@IDUsuario IS NULL AND @TokenInvitadoHash IS NULL) OR (@IDUsuario IS NOT NULL AND @TokenInvitadoHash IS NOT NULL)
       OR DATALENGTH(@TokenInvitadoHash) <> 32
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el cliente o el hash SHA-256 del token de invitado, uno de los dos.', 1;

    IF @IDUsuario IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuario) AS a WHERE a.CodigoRol = 'CLIENTE')
        THROW 50201, N'PERMISO_DENEGADO: solo un cliente activo puede comprar.', 1;

    IF @ClaveIdempotencia IS NULL OR @IDMetodoEnvio IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere la clave de idempotencia y el método de envío.', 1;

    IF @IDUsuario IS NOT NULL
    BEGIN
        IF @IDDireccion IS NULL
            THROW 50006, N'PARAMETRO_REQUERIDO: se requiere la dirección de envío.', 1;

        SELECT @Correo = u.Correo,
               @NombreContacto = LEFT(CONCAT(u.Nombre, N' ', u.Apellido), 200),
               @TelefonoContacto = CASE WHEN LEN(u.Telefono) >= 8 THEN u.Telefono ELSE d.Telefono END,
               @NombreDestinatario = d.NombreDestinatario, @Telefono = d.Telefono, @Linea1 = d.Linea1, @Linea2 = d.Linea2,
               @IDMunicipio = d.IDMunicipio, @CodigoPostal = d.CodigoPostal, @Referencias = d.Referencias
        FROM dbo.Direccion AS d
        JOIN dbo.Usuario AS u ON u.IDUsuario = d.IDUsuario
        WHERE d.IDDireccion = @IDDireccion AND d.IDUsuario = @IDUsuario AND d.Activo = 1;

        IF @NombreDestinatario IS NULL
            THROW 50113, N'DIRECCION_NO_ENCONTRADA: la dirección no existe.', 1;
    END
    ELSE
    BEGIN
        SELECT @Correo             = LOWER(TRIM(ISNULL(@Correo, N''))),
               @NombreDestinatario = TRIM(ISNULL(@NombreDestinatario, N'')),
               @Telefono           = TRIM(ISNULL(@Telefono, N'')),
               @Linea1             = TRIM(ISNULL(@Linea1, N'')),
               @Linea2             = NULLIF(TRIM(@Linea2), N''),
               @CodigoPostal       = NULLIF(TRIM(@CodigoPostal), N''),
               @Referencias        = NULLIF(TRIM(@Referencias), N''),
               @IDDireccion        = NULL;

        SELECT @NumeroError = v.NumeroError, @MensajeError = v.MensajeError
        FROM dbo.FU_Usuarios_ValidarDatos(@Correo, NULL, NULL, NULL, NULL) AS v;
        IF @NumeroError IS NULL
            SELECT @NumeroError = v.NumeroError, @MensajeError = v.MensajeError
            FROM dbo.FU_Envios_ValidarDireccion(NULL, @NombreDestinatario, @Telefono, @Linea1, @Linea2, @CodigoPostal, @Referencias) AS v;
        IF @NumeroError IS NOT NULL
            THROW @NumeroError, @MensajeError, 1;

        SELECT @NombreContacto = @NombreDestinatario, @TelefonoContacto = @Telefono;
    END;

    SELECT @Municipio = m.Nombre, @IDDepartamento = m.IDDepartamento FROM dbo.Municipio AS m WHERE m.IDMunicipio = @IDMunicipio;
    IF @Municipio IS NULL
        THROW 50111, N'MUNICIPIO_NO_ENCONTRADO: el municipio no existe.', 1;

    SELECT @Maximo = c.MaximoPorLinea FROM dbo.FU_Carrito_Configuracion() AS c;
    SELECT @Minutos = c.MinutosReserva FROM dbo.FU_Checkout_Configuracion() AS c;
    IF @Maximo IS NULL OR @Minutos IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.FU_Pedidos_DesgloseIVA(1) AS iva)
        THROW 59001, N'CONFIGURACION_INCOMPLETA: faltan los parámetros MAXIMO_UNIDADES_POR_LINEA, MINUTOS_RESERVA (1–120) o TASA_IVA.', 1;

    SET @Token = CAST(@TokenInvitadoHash AS BINARY(32));

    BEGIN TRY
        BEGIN TRANSACTION;

        IF @IDUsuario IS NOT NULL
            SELECT @IDCarrito = c.IDCarrito, @IDCupon = c.IDCupon FROM dbo.Carrito AS c WITH (UPDLOCK, HOLDLOCK)
            WHERE c.IDUsuario = @IDUsuario AND c.Estado = 'ACTIVO';
        ELSE
            SELECT @IDCarrito = c.IDCarrito, @IDCupon = c.IDCupon FROM dbo.Carrito AS c WITH (UPDLOCK, HOLDLOCK)
            WHERE c.TokenInvitadoHash = @Token AND c.Estado = 'ACTIVO';

        IF @IDCarrito IS NULL
            THROW 50108, N'CARRITO_NO_ENCONTRADO: no hay un carrito activo.', 1;

        -- La misma clave en el mismo carrito: es una repetición, se devuelve el mismo checkout.
        SELECT @IDCheckout = ch.IDCheckout
        FROM dbo.Checkout AS ch
        WHERE ch.IDCarrito = @IDCarrito AND ch.ClaveIdempotencia = @ClaveIdempotencia;

        IF @IDCheckout IS NULL
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM dbo.CarritoItem AS ci WHERE ci.IDCarrito = @IDCarrito)
                THROW 51409, N'CARRITO_VACIO: el carrito no tiene productos.', 1;

            SELECT TOP (1) @MensajeError = CONCAT(N'VARIANTE_NO_DISPONIBLE: el SKU ', v.SKU, N' ya no está a la venta; quítelo del carrito.')
            FROM dbo.FU_Carrito_Lineas(@IDCarrito) AS l
            JOIN dbo.Variante AS v ON v.IDVariante = l.IDVariante
            WHERE l.EnVenta = 0
            ORDER BY l.IDVariante;
            IF @MensajeError IS NOT NULL
                THROW 51302, @MensajeError, 1;

            SELECT TOP (1) @MensajeError = CONCAT(N'CANTIDAD_EXCEDE_LIMITE: se permiten como máximo ', @Maximo, N' unidades del SKU ', v.SKU, N'.')
            FROM dbo.CarritoItem AS ci
            JOIN dbo.Variante AS v ON v.IDVariante = ci.IDVariante
            WHERE ci.IDCarrito = @IDCarrito AND ci.Cantidad > @Maximo
            ORDER BY ci.IDVariante;
            IF @MensajeError IS NOT NULL
                THROW 50027, @MensajeError, 1;

            SELECT @CostoEnvio = me.Costo FROM dbo.MetodoEnvio AS me WHERE me.IDMetodoEnvio = @IDMetodoEnvio AND me.Activo = 1;
            IF @CostoEnvio IS NULL
                THROW 50114, N'METODO_ENVIO_NO_ENCONTRADO: el método de envío no existe o no está disponible.', 1;

            -- El checkout pendiente anterior del carrito (otra clave) se cancela y libera sus reservas.
            UPDATE dbo.Checkout
            SET Estado = 'CANCELADO', FechaCierre = @Ahora
            OUTPUT inserted.IDCheckout INTO @Cancelados (IDCheckout)
            WHERE IDCarrito = @IDCarrito AND Estado = 'PENDIENTE';

            UPDATE r
            SET Estado = 'LIBERADA', FechaCierre = @Ahora
            FROM dbo.ReservaInventario AS r
            JOIN @Cancelados AS x ON x.IDCheckout = r.IDCheckout
            WHERE r.Estado = 'ACTIVA';

            -- Bloquea las variantes recorriendo el índice (IDCarrito, IDVariante): orden ascendente de IDVariante.
            SELECT @Bloqueadas = COUNT(*)
            FROM dbo.CarritoItem AS ci
            JOIN dbo.Variante AS v WITH (UPDLOCK, ROWLOCK) ON v.IDVariante = ci.IDVariante
            WHERE ci.IDCarrito = @IDCarrito
            OPTION (FORCE ORDER, LOOP JOIN);

            -- Con las variantes bloqueadas, la disponibilidad ya incluye las reservas de quien bloqueó antes.
            SELECT TOP (1) @MensajeError = CONCAT(N'STOCK_INSUFICIENTE: el SKU ', v.SKU, N' tiene ', d.Disponible, N' unidades disponibles.')
            FROM dbo.CarritoItem AS ci
            JOIN dbo.Variante AS v ON v.IDVariante = ci.IDVariante
            JOIN dbo.FU_Inventario_Disponibilidad(@Ahora) AS d ON d.IDVariante = ci.IDVariante
            WHERE ci.IDCarrito = @IDCarrito AND ci.Cantidad > d.Disponible
            ORDER BY ci.IDVariante;
            IF @MensajeError IS NOT NULL
                THROW 51301, @MensajeError, 1;

            IF @IDCupon IS NOT NULL
            BEGIN
                SELECT @ErrorCupon = COALESCE(v.CodigoError, d.CodigoError), @Descuento = ISNULL(d.Descuento, 0), @SubtotalCupon = d.Subtotal
                FROM dbo.FU_Cupones_Validar(@IDCupon, @IDUsuario, CASE WHEN @IDUsuario IS NULL THEN @Correo END, @Ahora) AS v
                OUTER APPLY dbo.FU_Cupones_CalculoDescuento(@IDCupon, @IDCarrito) AS d;

                IF @ErrorCupon IS NOT NULL
                BEGIN
                    SELECT @NumeroError = e.NumeroError, @MensajeError = e.MensajeError
                    FROM dbo.FU_Cupones_Error(@ErrorCupon, @IDCupon, @SubtotalCupon) AS e;
                    THROW @NumeroError, @MensajeError, 1;
                END;
            END;

            SELECT @Subtotal = SUM(l.Importe) FROM dbo.FU_Carrito_Lineas(@IDCarrito) AS l;

            INSERT INTO dbo.Checkout (IDCarrito, IDUsuario, ClaveIdempotencia, CorreoContacto, NombreContacto, TelefonoContacto,
                                      IDDireccion, EnvioNombre, EnvioTelefono, EnvioLinea1, EnvioLinea2, EnvioMunicipio, IDDepartamento,
                                      EnvioCodigoPostal, EnvioReferencias, IDMetodoEnvio, IDCupon,
                                      Subtotal, Descuento, CostoEnvio, Total, FechaCreacion, FechaExpiracion)
            VALUES (@IDCarrito, @IDUsuario, @ClaveIdempotencia, @Correo, @NombreContacto, @TelefonoContacto,
                    @IDDireccion, @NombreDestinatario, @Telefono, @Linea1, @Linea2, @Municipio, @IDDepartamento,
                    @CodigoPostal, @Referencias, @IDMetodoEnvio, @IDCupon,
                    @Subtotal, @Descuento, @CostoEnvio, @Subtotal - @Descuento + @CostoEnvio, @Ahora, DATEADD(MINUTE, @Minutos, @Ahora));
            SET @IDCheckout = SCOPE_IDENTITY();

            -- Precio congelado y descuento repartido por línea, cuadrado al centavo con el total.
            IF @IDCupon IS NOT NULL
                INSERT INTO dbo.CheckoutDetalle (IDCheckout, IDVariante, Cantidad, PrecioUnitario, DescuentoLinea)
                SELECT @IDCheckout, p.IDVariante, p.Cantidad, p.PrecioUnitario, p.DescuentoLinea
                FROM dbo.FU_Cupones_ProrrateoDescuento(@IDCupon, @IDCarrito, @Descuento) AS p;
            ELSE
                INSERT INTO dbo.CheckoutDetalle (IDCheckout, IDVariante, Cantidad, PrecioUnitario, DescuentoLinea)
                SELECT @IDCheckout, l.IDVariante, l.Cantidad, l.PrecioUnitario, 0
                FROM dbo.FU_Carrito_Lineas(@IDCarrito) AS l;

            INSERT INTO dbo.ReservaInventario (IDCheckout, IDVariante, Cantidad, FechaCreacion, FechaExpiracion)
            SELECT d.IDCheckout, d.IDVariante, d.Cantidad, @Ahora, DATEADD(MINUTE, @Minutos, @Ahora)
            FROM dbo.CheckoutDetalle AS d
            WHERE d.IDCheckout = @IDCheckout;
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    EXEC dbo.SP_Checkout_Obtener @IDUsuario = @IDUsuario, @TokenInvitadoHash = @TokenInvitadoHash, @IDCheckout = @IDCheckout;
END;
GO

/*
    Registra un intento de pago rechazado por la pasarela (marca, últimos 4 dígitos y motivo;
    nunca el número completo, el CVV ni el vencimiento). El checkout no cambia: el cliente puede
    reintentar mientras siga vigente. Idempotente por @ReferenciaExterna.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Checkout_RegistrarPagoRechazado
    @IDUsuario         INT = NULL,
    @TokenInvitadoHash VARBINARY(64) = NULL,
    @IDCheckout        BIGINT,
    @Marca             VARCHAR(13),
    @Ultimos4          VARCHAR(5),
    @MotivoRechazo     VARCHAR(41),
    @ReferenciaExterna VARCHAR(65)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Token BINARY(32), @Total DECIMAL(12, 2);

    IF (@IDUsuario IS NULL AND @TokenInvitadoHash IS NULL) OR (@IDUsuario IS NOT NULL AND @TokenInvitadoHash IS NOT NULL)
       OR DATALENGTH(@TokenInvitadoHash) <> 32
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el cliente o el hash SHA-256 del token de invitado, uno de los dos.', 1;

    IF @IDUsuario IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuario) AS a WHERE a.CodigoRol = 'CLIENTE')
        THROW 50201, N'PERMISO_DENEGADO: solo un cliente activo puede comprar.', 1;

    SELECT @Marca = UPPER(TRIM(@Marca)), @Ultimos4 = TRIM(@Ultimos4), @MotivoRechazo = UPPER(TRIM(@MotivoRechazo)),
           @ReferenciaExterna = TRIM(@ReferenciaExterna);

    IF ISNULL(@Marca, '') NOT IN ('VISA', 'MASTERCARD', 'AMEX')
       OR ISNULL(@Ultimos4, '') NOT LIKE '[0-9][0-9][0-9][0-9]'
       OR ISNULL(LEN(@MotivoRechazo), 0) NOT BETWEEN 1 AND 40
       OR ISNULL(LEN(@ReferenciaExterna), 0) NOT BETWEEN 1 AND 64
        THROW 50037, N'DATOS_PAGO_INVALIDOS: se requiere la marca (VISA, MASTERCARD o AMEX), los últimos 4 dígitos, el motivo (máximo 40) y la referencia (máximo 64).', 1;

    SET @Token = CAST(@TokenInvitadoHash AS BINARY(32));

    SELECT @Total = ch.Total
    FROM dbo.Checkout AS ch
    JOIN dbo.Carrito AS c ON c.IDCarrito = ch.IDCarrito
    WHERE ch.IDCheckout = @IDCheckout
      AND ((@IDUsuario IS NOT NULL AND ch.IDUsuario = @IDUsuario)
           OR (@IDUsuario IS NULL AND ch.IDUsuario IS NULL AND c.TokenInvitadoHash = @Token));

    IF @Total IS NULL
        THROW 50115, N'CHECKOUT_NO_ENCONTRADO: el checkout no existe.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF NOT EXISTS (SELECT 1 FROM dbo.Pago AS pg WITH (UPDLOCK, HOLDLOCK) WHERE pg.ReferenciaExterna = @ReferenciaExterna)
            INSERT INTO dbo.Pago (IDCheckout, Estado, Marca, Ultimos4, MotivoRechazo, Monto, ReferenciaExterna)
            VALUES (@IDCheckout, 'RECHAZADO', @Marca, @Ultimos4, @MotivoRechazo, @Total, @ReferenciaExterna);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    EXEC dbo.SP_Checkout_Obtener @IDUsuario = @IDUsuario, @TokenInvitadoHash = @TokenInvitadoHash, @IDCheckout = @IDCheckout;
END;
GO

/*
    Job (cada minuto, scheduler de la API): marca EXPIRADO cada checkout PENDIENTE vencido y
    libera sus reservas, en la misma transacción. Las reservas vencidas ya no restaban
    disponibilidad desde que vencieron; esto deja el estado consistente. Procesa hasta 1000 por
    ejecución y devuelve cuántos expiró.
    Bloquea primero los checkouts y después sus reservas, el mismo orden que el pago: un pago y
    la expiración del mismo checkout se ejecutan uno tras otro.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Checkout_ExpirarVencidos
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME(), @Reservas INT;
    DECLARE @Expirados TABLE (IDCheckout BIGINT PRIMARY KEY);

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE TOP (1000) dbo.Checkout
        SET Estado = 'EXPIRADO', FechaCierre = @Ahora
        OUTPUT inserted.IDCheckout INTO @Expirados (IDCheckout)
        WHERE Estado = 'PENDIENTE' AND FechaExpiracion <= @Ahora;

        UPDATE r
        SET Estado = 'LIBERADA', FechaCierre = @Ahora
        FROM dbo.ReservaInventario AS r
        JOIN @Expirados AS x ON x.IDCheckout = r.IDCheckout
        WHERE r.Estado = 'ACTIVA';
        SET @Reservas = @@ROWCOUNT;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    SELECT (SELECT COUNT(*) FROM @Expirados) AS CheckoutsExpirados, @Reservas AS ReservasLiberadas;
END;
GO
