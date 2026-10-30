/*
    080_SP_Pedidos.sql
    Pedidos (RF-06, RF-07): crear el pedido con el pago aprobado, consultas del cliente, del
    invitado (enlace de seguimiento) y del panel, cambios de estado y cancelación.

    - El pedido se crea solo con un pago aprobado, en una transacción: pago, pedido, detalle,
      salida de inventario (kardex SALIDA_VENTA), reservas consumidas, uso del cupón, carrito
      convertido y checkout completado. Un doble clic o dos pagos simultáneos del mismo checkout
      producen un solo pedido (además de la lógica, lo garantizan los índices únicos).
    - Orden de bloqueo: Carrito → Checkout → Cupon → Variante (por IDVariante); la cancelación
      usa Pedido → Cupon → Variante.
    - El historial de estados lo escribe el trigger TR_Pedido_Estado con el actor y el
      comentario de SESSION_CONTEXT. La API reutiliza conexiones, así que cada SP que cambia un
      estado fija los dos valores (aunque sean NULL) y deja el comentario en NULL al terminar.
    - Los movimientos de inventario de un invitado se registran a nombre del usuario de sistema.
    - Errores: ver docs/errores.md.
*/
:on error exit
SET NOCOUNT ON;
GO

/* === Consultas ============================================================================ */

/* Detalle completo para el panel: con quién hizo cada cambio de estado y los pagos. */
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_Obtener
    @IDUsuarioAccion INT,
    @IDPedido        INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol IN ('OPERADOR', 'ADMIN'))
        THROW 50201, N'PERMISO_DENEGADO: solo un operador o administrador activo puede consultar los pedidos.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.Pedido AS p WHERE p.IDPedido = @IDPedido)
        THROW 50116, N'PEDIDO_NO_ENCONTRADO: el pedido no existe.', 1;

    SELECT d.IDPedido, d.NumeroPedido, d.FechaPedido, d.CodigoEstado, d.Estado, d.IDUsuario, d.CorreoContacto, d.NombreContacto,
           d.TelefonoContacto, d.EnvioNombre, d.EnvioTelefono, d.EnvioLinea1, d.EnvioLinea2, d.EnvioMunicipio, d.IDDepartamento,
           d.Departamento, d.EnvioCodigoPostal, d.EnvioReferencias, d.NombreMetodoEnvio, d.CodigoCupon, d.Subtotal, d.Descuento,
           d.CostoEnvio, d.Total, d.BaseImponible, d.IVA, d.PuedeCancelar, d.Lineas, d.Historial, d.Pagos
    FROM dbo.FU_Pedidos_Detalle(@IDPedido, 1) AS d;
END;
GO

/*
    Listado del panel, del más reciente al más antiguo. Filtros opcionales (NULL = sin filtro):
    estado, rango de fechas en UTC [desde, hasta) y búsqueda por número de pedido, correo o
    nombre del contacto (comodines escapados).
*/
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_Listar
    @IDUsuarioAccion INT,
    @CodigoEstado    VARCHAR(21) = NULL,
    @FechaDesde      DATETIME2(3) = NULL,
    @FechaHasta      DATETIME2(3) = NULL,
    @Busqueda        NVARCHAR(101) = NULL,
    @Pagina          INT = 1,
    @TamanoPagina    INT = 20,
    @TotalRegistros  INT = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @IDEstado TINYINT, @Patron NVARCHAR(410);

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol IN ('OPERADOR', 'ADMIN'))
        THROW 50201, N'PERMISO_DENEGADO: solo un operador o administrador activo puede consultar los pedidos.', 1;

    IF @Pagina IS NULL OR @Pagina < 1 OR @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50007, N'PAGINACION_INVALIDA: la página inicia en 1 y el tamaño va de 1 a 100.', 1;

    IF @FechaDesde >= @FechaHasta
        THROW 50026, N'RANGO_FECHAS_INVALIDO: la fecha inicial debe ser anterior a la final.', 1;

    SET @CodigoEstado = NULLIF(UPPER(TRIM(@CodigoEstado)), '');
    IF @CodigoEstado IS NOT NULL
    BEGIN
        SELECT @IDEstado = e.IDEstadoPedido FROM dbo.EstadoPedido AS e WHERE e.Codigo = @CodigoEstado;
        IF @IDEstado IS NULL
            THROW 50038, N'ESTADO_PEDIDO_INVALIDO: el estado no existe.', 1;
    END;

    SET @Busqueda = NULLIF(TRIM(@Busqueda), N'');
    IF LEN(@Busqueda) > 100
        THROW 50008, N'BUSQUEDA_INVALIDA: la búsqueda admite como máximo 100 caracteres.', 1;

    SET @Patron = N'%' + REPLACE(REPLACE(REPLACE(REPLACE(@Busqueda,
                      N'\', N'\\'), N'%', N'\%'), N'_', N'\_'), N'[', N'\[') + N'%';

    SELECT @TotalRegistros = COUNT(*)
    FROM dbo.Pedido AS p
    WHERE (@IDEstado IS NULL OR p.IDEstadoPedido = @IDEstado)
      AND (@FechaDesde IS NULL OR p.FechaPedido >= @FechaDesde)
      AND (@FechaHasta IS NULL OR p.FechaPedido < @FechaHasta)
      AND (@Patron IS NULL OR p.NumeroPedido LIKE @Patron ESCAPE N'\' OR p.CorreoContacto LIKE @Patron ESCAPE N'\'
           OR p.NombreContacto LIKE @Patron ESCAPE N'\')
    OPTION (RECOMPILE);

    SELECT p.IDPedido, p.NumeroPedido, p.FechaPedido, e.Codigo AS CodigoEstado, e.Nombre AS Estado, p.NombreContacto,
           p.CorreoContacto, CAST(CASE WHEN p.IDUsuario IS NULL THEN 1 ELSE 0 END AS BIT) AS EsInvitado, p.Total,
           (SELECT SUM(pd.Cantidad) FROM dbo.PedidoDetalle AS pd WHERE pd.IDPedido = p.IDPedido) AS Articulos
    FROM dbo.Pedido AS p
    JOIN dbo.EstadoPedido AS e ON e.IDEstadoPedido = p.IDEstadoPedido
    WHERE (@IDEstado IS NULL OR p.IDEstadoPedido = @IDEstado)
      AND (@FechaDesde IS NULL OR p.FechaPedido >= @FechaDesde)
      AND (@FechaHasta IS NULL OR p.FechaPedido < @FechaHasta)
      AND (@Patron IS NULL OR p.NumeroPedido LIKE @Patron ESCAPE N'\' OR p.CorreoContacto LIKE @Patron ESCAPE N'\'
           OR p.NombreContacto LIKE @Patron ESCAPE N'\')
    ORDER BY p.FechaPedido DESC, p.IDPedido DESC
    OFFSET CAST(@Pagina - 1 AS BIGINT) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY
    OPTION (RECOMPILE);
END;
GO

/* "Mis pedidos": los del cliente, del más reciente al más antiguo. */
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_ListarCliente
    @IDUsuario      INT,
    @Pagina         INT = 1,
    @TamanoPagina   INT = 10,
    @TotalRegistros INT = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuario) AS a WHERE a.CodigoRol = 'CLIENTE')
        THROW 50201, N'PERMISO_DENEGADO: solo un cliente activo tiene pedidos.', 1;

    IF @Pagina IS NULL OR @Pagina < 1 OR @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50007, N'PAGINACION_INVALIDA: la página inicia en 1 y el tamaño va de 1 a 100.', 1;

    SELECT @TotalRegistros = COUNT(*) FROM dbo.Pedido AS p WHERE p.IDUsuario = @IDUsuario;

    SELECT p.IDPedido, p.NumeroPedido, p.FechaPedido, e.Codigo AS CodigoEstado, e.Nombre AS Estado, p.Total,
           (SELECT SUM(pd.Cantidad) FROM dbo.PedidoDetalle AS pd WHERE pd.IDPedido = p.IDPedido) AS Articulos
    FROM dbo.Pedido AS p
    JOIN dbo.EstadoPedido AS e ON e.IDEstadoPedido = p.IDEstadoPedido
    WHERE p.IDUsuario = @IDUsuario
    ORDER BY p.FechaPedido DESC, p.IDPedido DESC
    OFFSET CAST(@Pagina - 1 AS BIGINT) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY;
END;
GO

/* Un pedido propio. Uno ajeno responde igual que uno inexistente. */
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_ObtenerCliente
    @IDUsuario INT,
    @IDPedido  INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuario) AS a WHERE a.CodigoRol = 'CLIENTE')
        THROW 50201, N'PERMISO_DENEGADO: solo un cliente activo tiene pedidos.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.Pedido AS p WHERE p.IDPedido = @IDPedido AND p.IDUsuario = @IDUsuario)
        THROW 50116, N'PEDIDO_NO_ENCONTRADO: el pedido no existe.', 1;

    SELECT d.* FROM dbo.FU_Pedidos_DetalleCliente(@IDPedido) AS d;
END;
GO

/*
    Seguimiento sin sesión (invitado o enlace del correo): @TokenSeguimientoHash es el SHA-256
    del token del enlace. Un token desconocido responde igual que un pedido inexistente.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_ObtenerSeguimiento
    @TokenSeguimientoHash VARBINARY(64)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @IDPedido INT;

    IF @TokenSeguimientoHash IS NULL OR DATALENGTH(@TokenSeguimientoHash) <> 32
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el hash SHA-256 del token de seguimiento.', 1;

    SELECT @IDPedido = p.IDPedido FROM dbo.Pedido AS p WHERE p.TokenSeguimientoHash = CAST(@TokenSeguimientoHash AS BINARY(32));
    IF @IDPedido IS NULL
        THROW 50116, N'PEDIDO_NO_ENCONTRADO: el pedido no existe.', 1;

    SELECT d.* FROM dbo.FU_Pedidos_DetalleCliente(@IDPedido) AS d;
END;
GO

/* === Crear el pedido (pago aprobado) ====================================================== */

/*
    La API lo llama después de que la pasarela aprobó el cobro, con los datos no sensibles del
    pago y el hash del token de seguimiento que generó (el enlace se muestra una sola vez).
    - Checkout ya pagado con la misma referencia: es un reintento; devuelve el mismo pedido.
      Con otra referencia es un segundo cobro: CHECKOUT_YA_PAGADO y la API lo anula.
    - Cancelado o con el carrito modificado: CHECKOUT_NO_PAGABLE (la API anula el cobro).
    - Vencido (D39): se acepta si todas las líneas siguen cabiendo en lo disponible; si no,
      CHECKOUT_EXPIRADO.
    - El cupón se bloquea y se revalida (vigencia, usos, cliente): de dos pagos simultáneos por
      el último uso, solo uno lo obtiene.
    Devuelve el pedido como lo ve el cliente.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_Crear
    @IDUsuario            INT = NULL,
    @TokenInvitadoHash    VARBINARY(64) = NULL,
    @IDCheckout           BIGINT,
    @Marca                VARCHAR(13),
    @Ultimos4             VARCHAR(5),
    @CodigoAutorizacion   VARCHAR(21),
    @ReferenciaExterna    VARCHAR(65),
    @TokenSeguimientoHash VARBINARY(64)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME(), @Token BINARY(32), @IDCarrito INT, @IDPedido INT, @Estado VARCHAR(12),
            @EstadoEfectivo VARCHAR(20), @CarritoModificado BIT, @IDCupon INT, @Correo NVARCHAR(254), @Total DECIMAL(12, 2),
            @Descuento DECIMAL(12, 2), @IDEstadoInicial TINYINT, @IDSalida TINYINT, @IDActor INT, @Bloqueadas INT,
            @ReferenciaPagada VARCHAR(64), @NumeroPedido VARCHAR(15), @ErrorCupon VARCHAR(40), @NumeroError INT,
            @MensajeError NVARCHAR(400);
    DECLARE @Movimientos TABLE (IDVariante INT PRIMARY KEY, SaldoNuevo INT NOT NULL);
    DECLARE @OtrosPendientes TABLE (IDCheckout BIGINT PRIMARY KEY);

    IF (@IDUsuario IS NULL AND @TokenInvitadoHash IS NULL) OR (@IDUsuario IS NOT NULL AND @TokenInvitadoHash IS NOT NULL)
       OR DATALENGTH(@TokenInvitadoHash) <> 32
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el cliente o el hash SHA-256 del token de invitado, uno de los dos.', 1;

    IF @IDUsuario IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuario) AS a WHERE a.CodigoRol = 'CLIENTE')
        THROW 50201, N'PERMISO_DENEGADO: solo un cliente activo puede comprar.', 1;

    IF @IDCheckout IS NULL OR @TokenSeguimientoHash IS NULL OR DATALENGTH(@TokenSeguimientoHash) <> 32
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el checkout y el hash SHA-256 del token de seguimiento.', 1;

    SELECT @Marca = UPPER(TRIM(@Marca)), @Ultimos4 = TRIM(@Ultimos4), @CodigoAutorizacion = TRIM(@CodigoAutorizacion),
           @ReferenciaExterna = TRIM(@ReferenciaExterna);

    IF ISNULL(@Marca, '') NOT IN ('VISA', 'MASTERCARD', 'AMEX')
       OR ISNULL(@Ultimos4, '') NOT LIKE '[0-9][0-9][0-9][0-9]'
       OR ISNULL(LEN(@CodigoAutorizacion), 0) NOT BETWEEN 1 AND 20
       OR ISNULL(LEN(@ReferenciaExterna), 0) NOT BETWEEN 1 AND 64
        THROW 50037, N'DATOS_PAGO_INVALIDOS: se requiere la marca (VISA, MASTERCARD o AMEX), los últimos 4 dígitos, el código de autorización (máximo 20) y la referencia (máximo 64).', 1;

    SELECT @IDEstadoInicial = e.IDEstadoPedido FROM dbo.EstadoPedido AS e WHERE e.EsInicial = 1;
    SELECT @IDSalida = t.IDTipoMovimiento FROM dbo.TipoMovimiento AS t WHERE t.Codigo = 'SALIDA_VENTA' AND t.Signo = -1;
    SET @IDActor = ISNULL(@IDUsuario, (SELECT u.IDUsuario FROM dbo.Usuario AS u WHERE u.EsSistema = 1));
    IF @IDEstadoInicial IS NULL OR @IDSalida IS NULL OR @IDActor IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.FU_Pedidos_DesgloseIVA(1) AS iva)
        THROW 59001, N'CONFIGURACION_INCOMPLETA: falta el estado inicial del pedido, el tipo de movimiento SALIDA_VENTA, el usuario de sistema o TASA_IVA.', 1;

    SET @Token = CAST(@TokenInvitadoHash AS BINARY(32));

    SELECT @IDCarrito = ch.IDCarrito
    FROM dbo.Checkout AS ch
    JOIN dbo.Carrito AS c ON c.IDCarrito = ch.IDCarrito
    WHERE ch.IDCheckout = @IDCheckout
      AND ((@IDUsuario IS NOT NULL AND ch.IDUsuario = @IDUsuario)
           OR (@IDUsuario IS NULL AND ch.IDUsuario IS NULL AND c.TokenInvitadoHash = @Token));

    IF @IDCarrito IS NULL
        THROW 50115, N'CHECKOUT_NO_ENCONTRADO: el checkout no existe.', 1;

    BEGIN TRY
        -- Actor del historial de estados (NULL = invitado) y sin comentario.
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuario;
        EXEC sys.sp_set_session_context @key = N'ComentarioEstado', @value = NULL;

        BEGIN TRANSACTION;

        SELECT @IDCarrito = c.IDCarrito FROM dbo.Carrito AS c WITH (UPDLOCK) WHERE c.IDCarrito = @IDCarrito;

        SELECT @Estado = ch.Estado, @IDCupon = ch.IDCupon, @Correo = ch.CorreoContacto, @Total = ch.Total, @Descuento = ch.Descuento
        FROM dbo.Checkout AS ch WITH (UPDLOCK)
        WHERE ch.IDCheckout = @IDCheckout;

        IF @Estado = 'COMPLETADO'
        BEGIN
            SELECT @IDPedido = p.IDPedido, @NumeroPedido = p.NumeroPedido, @ReferenciaPagada = pg.ReferenciaExterna
            FROM dbo.Pedido AS p
            JOIN dbo.Pago AS pg ON pg.IDPedido = p.IDPedido AND pg.Estado = 'APROBADO'
            WHERE p.IDCheckout = @IDCheckout;

            IF @ReferenciaPagada <> @ReferenciaExterna
            BEGIN
                SET @MensajeError = CONCAT(N'CHECKOUT_YA_PAGADO: este checkout ya se pagó (pedido ', @NumeroPedido, N'); anule el segundo cobro.');
                THROW 51602, @MensajeError, 1;
            END;
        END
        ELSE
        BEGIN
            SELECT @EstadoEfectivo = e.EstadoEfectivo, @CarritoModificado = e.CarritoModificado
            FROM dbo.FU_Checkout_Estado(@IDCheckout, @Ahora) AS e;

            IF @Estado = 'CANCELADO' OR @CarritoModificado = 1
                THROW 51603, N'CHECKOUT_NO_PAGABLE: el checkout se canceló o el carrito cambió; inicie el pago de nuevo.', 1;

            IF @IDCupon IS NOT NULL
            BEGIN
                SELECT @IDCupon = cu.IDCupon FROM dbo.Cupon AS cu WITH (UPDLOCK) WHERE cu.IDCupon = @IDCupon;

                SELECT @ErrorCupon = v.CodigoError
                FROM dbo.FU_Cupones_Validar(@IDCupon, @IDUsuario, CASE WHEN @IDUsuario IS NULL THEN @Correo END, @Ahora) AS v;

                IF @ErrorCupon IS NOT NULL
                BEGIN
                    SELECT @NumeroError = e.NumeroError, @MensajeError = e.MensajeError
                    FROM dbo.FU_Cupones_Error(@ErrorCupon, @IDCupon, NULL) AS e;
                    THROW @NumeroError, @MensajeError, 1;
                END;
            END;

            -- Bloquea las variantes recorriendo la llave (IDCheckout, IDVariante): orden ascendente de IDVariante.
            SELECT @Bloqueadas = COUNT(*)
            FROM dbo.CheckoutDetalle AS d
            JOIN dbo.Variante AS v WITH (UPDLOCK, ROWLOCK) ON v.IDVariante = d.IDVariante
            WHERE d.IDCheckout = @IDCheckout
            OPTION (FORCE ORDER, LOOP JOIN);

            -- Vencido: su reserva ya no cuenta; se acepta solo si todo sigue cabiendo en lo disponible.
            IF @EstadoEfectivo = 'EXPIRADO'
               AND EXISTS (SELECT 1
                           FROM dbo.CheckoutDetalle AS d
                           JOIN dbo.FU_Inventario_Disponibilidad(@Ahora) AS di ON di.IDVariante = d.IDVariante
                           WHERE d.IDCheckout = @IDCheckout AND d.Cantidad > di.Disponible)
                THROW 51601, N'CHECKOUT_EXPIRADO: el tiempo para pagar venció y ya no hay existencia para todo el pedido; anule el cobro.', 1;

            INSERT INTO dbo.Pedido (IDCheckout, IDUsuario, CorreoContacto, NombreContacto, TelefonoContacto, TokenSeguimientoHash,
                                    IDEstadoPedido, EnvioNombre, EnvioTelefono, EnvioLinea1, EnvioLinea2, EnvioMunicipio, IDDepartamento,
                                    EnvioCodigoPostal, EnvioReferencias, IDMetodoEnvio, NombreMetodoEnvio, IDCupon, CodigoCupon,
                                    Subtotal, Descuento, CostoEnvio, Total, BaseImponible, IVA, FechaPedido)
            SELECT ch.IDCheckout, ch.IDUsuario, ch.CorreoContacto, ch.NombreContacto, ch.TelefonoContacto,
                   CAST(@TokenSeguimientoHash AS BINARY(32)), @IDEstadoInicial, ch.EnvioNombre, ch.EnvioTelefono, ch.EnvioLinea1,
                   ch.EnvioLinea2, ch.EnvioMunicipio, ch.IDDepartamento, ch.EnvioCodigoPostal, ch.EnvioReferencias, ch.IDMetodoEnvio,
                   me.Nombre, ch.IDCupon, cu.Codigo, ch.Subtotal, ch.Descuento, ch.CostoEnvio, ch.Total, iva.BaseImponible, iva.IVA, @Ahora
            FROM dbo.Checkout AS ch
            JOIN dbo.MetodoEnvio AS me ON me.IDMetodoEnvio = ch.IDMetodoEnvio
            LEFT JOIN dbo.Cupon AS cu ON cu.IDCupon = ch.IDCupon
            CROSS APPLY dbo.FU_Pedidos_DesgloseIVA(ch.Total) AS iva
            WHERE ch.IDCheckout = @IDCheckout;
            SET @IDPedido = SCOPE_IDENTITY();

            -- Copia de cada línea: SKU, nombre, variante y categoría como estaban al comprar.
            INSERT INTO dbo.PedidoDetalle (IDPedido, IDVariante, IDCategoria, SKU, NombreProducto, DescripcionVariante, Cantidad,
                                           PrecioUnitario, DescuentoLinea, TotalLinea)
            SELECT @IDPedido, d.IDVariante, pr.IDCategoria, v.SKU, pr.Nombre,
                   LEFT(ISNULL((SELECT STRING_AGG(av.Valor, N' / ') WITHIN GROUP (ORDER BY ISNULL(ca.Orden, 255), vav.IDAtributo)
                                FROM dbo.VarianteAtributoValor AS vav
                                JOIN dbo.AtributoValor AS av ON av.IDAtributoValor = vav.IDAtributoValor
                                LEFT JOIN dbo.CategoriaAtributo AS ca ON ca.IDCategoria = pr.IDCategoria AND ca.IDAtributo = vav.IDAtributo
                                WHERE vav.IDVariante = d.IDVariante), N''), 200),
                   d.Cantidad, d.PrecioUnitario, d.DescuentoLinea, d.Cantidad * d.PrecioUnitario - d.DescuentoLinea
            FROM dbo.CheckoutDetalle AS d
            JOIN dbo.Variante AS v ON v.IDVariante = d.IDVariante
            JOIN dbo.Producto AS pr ON pr.IDProducto = v.IDProducto
            WHERE d.IDCheckout = @IDCheckout;

            INSERT INTO dbo.Pago (IDCheckout, IDPedido, Estado, Marca, Ultimos4, CodigoAutorizacion, Monto, ReferenciaExterna, Fecha)
            VALUES (@IDCheckout, @IDPedido, 'APROBADO', @Marca, @Ultimos4, @CodigoAutorizacion, @Total, @ReferenciaExterna, @Ahora);

            INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimiento, Signo, Cantidad, SaldoAnterior, SaldoNuevo, IDPedido, IDUsuario, Fecha)
            OUTPUT inserted.IDVariante, inserted.SaldoNuevo INTO @Movimientos (IDVariante, SaldoNuevo)
            SELECT d.IDVariante, @IDSalida, -1, -d.Cantidad, v.ExistenciaFisica, v.ExistenciaFisica - d.Cantidad, @IDPedido, @IDActor, @Ahora
            FROM dbo.CheckoutDetalle AS d
            JOIN dbo.Variante AS v ON v.IDVariante = d.IDVariante
            WHERE d.IDCheckout = @IDCheckout;

            UPDATE v
            SET ExistenciaFisica = m.SaldoNuevo
            FROM dbo.Variante AS v
            JOIN @Movimientos AS m ON m.IDVariante = v.IDVariante;

            UPDATE dbo.ReservaInventario SET Estado = 'CONSUMIDA', FechaCierre = @Ahora
            WHERE IDCheckout = @IDCheckout AND Estado = 'ACTIVA';

            IF @IDCupon IS NOT NULL
            BEGIN
                INSERT INTO dbo.CuponUso (IDCupon, IDPedido, IDUsuario, CorreoCliente, MontoDescontado, Fecha)
                VALUES (@IDCupon, @IDPedido, @IDUsuario, LOWER(@Correo), @Descuento, @Ahora);

                UPDATE dbo.Cupon SET UsosActuales = UsosActuales + 1 WHERE IDCupon = @IDCupon;
            END;

            UPDATE dbo.Carrito SET Estado = 'CONVERTIDO', FechaUltimaActividad = @Ahora WHERE IDCarrito = @IDCarrito;
            UPDATE dbo.Checkout SET Estado = 'COMPLETADO', FechaCierre = @Ahora WHERE IDCheckout = @IDCheckout;

            -- Otro checkout pendiente del mismo carrito (se pagó uno que acababa de vencer): ya no
            -- se podrá pagar, así que se cancela y libera sus reservas (checkout antes que reservas,
            -- como el job de expiración).
            UPDATE dbo.Checkout SET Estado = 'CANCELADO', FechaCierre = @Ahora
            OUTPUT inserted.IDCheckout INTO @OtrosPendientes (IDCheckout)
            WHERE IDCarrito = @IDCarrito AND Estado = 'PENDIENTE';

            UPDATE r SET Estado = 'LIBERADA', FechaCierre = @Ahora
            FROM dbo.ReservaInventario AS r
            JOIN @OtrosPendientes AS x ON x.IDCheckout = r.IDCheckout
            WHERE r.Estado = 'ACTIVA';
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    SELECT d.* FROM dbo.FU_Pedidos_DetalleCliente(@IDPedido) AS d;
END;
GO

/* === Cambios de estado ==================================================================== */

/*
    Avance operativo (operador o administrador): PAGADO → EN_PREPARACION → ENVIADO → ENTREGADO,
    solo por las transiciones de TransicionEstadoPedido. La cancelación y las devoluciones
    tienen sus propios SPs (mueven inventario y dinero). Pedir el estado actual no es error
    (doble clic). Queda en el historial (trigger) y en la bitácora (módulo PEDIDOS).
*/
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_CambiarEstado
    @IDUsuarioAccion INT,
    @IDPedido        INT,
    @CodigoEstado    VARCHAR(21),
    @Comentario      NVARCHAR(501) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDDestino TINYINT, @IDActual TINYINT, @EstadoActual NVARCHAR(50), @EstadoDestino NVARCHAR(50), @MensajeError NVARCHAR(400);

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol IN ('OPERADOR', 'ADMIN'))
        THROW 50201, N'PERMISO_DENEGADO: solo un operador o administrador activo puede cambiar el estado de un pedido.', 1;

    SELECT @CodigoEstado = UPPER(TRIM(@CodigoEstado)), @Comentario = NULLIF(TRIM(@Comentario), N'');

    SELECT @IDDestino = e.IDEstadoPedido, @EstadoDestino = e.Nombre
    FROM dbo.EstadoPedido AS e
    WHERE e.Codigo = @CodigoEstado AND e.Codigo NOT IN ('CANCELADO', 'DEVUELTO_PARCIAL', 'DEVUELTO');
    IF @IDDestino IS NULL
        THROW 50038, N'ESTADO_PEDIDO_INVALIDO: el estado no existe o tiene su propio proceso (cancelación o devolución).', 1;

    IF LEN(@Comentario) > 500
        THROW 50024, N'MOTIVO_INVALIDO: el comentario admite como máximo 500 caracteres.', 1;

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;
        EXEC sys.sp_set_session_context @key = N'ComentarioEstado', @value = @Comentario;

        BEGIN TRANSACTION;

        SELECT @IDActual = p.IDEstadoPedido, @EstadoActual = e.Nombre
        FROM dbo.Pedido AS p WITH (UPDLOCK)
        JOIN dbo.EstadoPedido AS e ON e.IDEstadoPedido = p.IDEstadoPedido
        WHERE p.IDPedido = @IDPedido;

        IF @IDActual IS NULL
            THROW 50116, N'PEDIDO_NO_ENCONTRADO: el pedido no existe.', 1;

        IF @IDActual <> @IDDestino
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM dbo.TransicionEstadoPedido AS t WHERE t.IDEstadoOrigen = @IDActual AND t.IDEstadoDestino = @IDDestino)
            BEGIN
                SET @MensajeError = CONCAT(N'TRANSICION_NO_PERMITIDA: un pedido en ', @EstadoActual, N' no puede pasar a ', @EstadoDestino, N'.');
                THROW 51010, @MensajeError, 1;
            END;

            UPDATE dbo.Pedido SET IDEstadoPedido = @IDDestino, FechaModificacion = SYSUTCDATETIME() WHERE IDPedido = @IDPedido;

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioAccion, 'PEDIDOS', 'Pedido', CAST(@IDPedido AS VARCHAR(50)), 'CAMBIAR_ESTADO',
                    (SELECT e.Codigo AS Estado FROM dbo.EstadoPedido AS e WHERE e.IDEstadoPedido = @IDActual FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                    (SELECT @CodigoEstado AS Estado, @Comentario AS Comentario FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));
        END;

        COMMIT TRANSACTION;
        EXEC sys.sp_set_session_context @key = N'ComentarioEstado', @value = NULL;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        EXEC sys.sp_set_session_context @key = N'ComentarioEstado', @value = NULL;
        THROW;
    END CATCH;

    EXEC dbo.SP_Pedidos_Obtener @IDUsuarioAccion = @IDUsuarioAccion, @IDPedido = @IDPedido;
END;
GO

/*
    Cancela un pedido: el cliente el suyo cuando la transición lo permite al cliente (PAGADO);
    el operador o administrador cuando el estado lo permite (PAGADO o EN_PREPARACION), con
    motivo obligatorio (D40). En una transacción: devuelve la existencia (kardex CANCELACION),
    revierte el uso del cupón (D6), registra el reembolso simulado del pago (D38) y cambia el
    estado. El invitado no cancela desde la tienda: lo pide y lo hace un operador.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_Cancelar
    @IDUsuarioAccion INT,
    @IDPedido        INT,
    @Motivo          NVARCHAR(501) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME(), @Rol VARCHAR(20), @IDCancelado TINYINT, @IDTipoCancelacion TINYINT,
            @IDActual TINYINT, @CodigoActual VARCHAR(20), @EstadoActual NVARCHAR(50), @IDUsuarioPedido INT, @PermiteCliente BIT,
            @IDCupon INT, @Bloqueadas INT, @MensajeError NVARCHAR(400);
    DECLARE @Movimientos TABLE (IDVariante INT PRIMARY KEY, SaldoNuevo INT NOT NULL);

    SELECT @Rol = a.CodigoRol FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a;
    IF ISNULL(@Rol, '') NOT IN ('CLIENTE', 'OPERADOR', 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: se requiere un usuario activo.', 1;

    SET @Motivo = NULLIF(TRIM(@Motivo), N'');
    IF @Rol <> 'CLIENTE' AND @Motivo IS NULL
        THROW 50024, N'MOTIVO_INVALIDO: el motivo de la cancelación es obligatorio.', 1;
    IF LEN(@Motivo) > 500
        THROW 50024, N'MOTIVO_INVALIDO: el motivo admite como máximo 500 caracteres.', 1;

    SELECT @IDCancelado = e.IDEstadoPedido FROM dbo.EstadoPedido AS e WHERE e.Codigo = 'CANCELADO';
    SELECT @IDTipoCancelacion = t.IDTipoMovimiento FROM dbo.TipoMovimiento AS t WHERE t.Codigo = 'CANCELACION' AND t.Signo = 1;
    IF @IDCancelado IS NULL OR @IDTipoCancelacion IS NULL
        THROW 59001, N'CONFIGURACION_INCOMPLETA: falta el estado CANCELADO o el tipo de movimiento CANCELACION.', 1;

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;
        EXEC sys.sp_set_session_context @key = N'ComentarioEstado', @value = @Motivo;

        BEGIN TRANSACTION;

        SELECT @IDActual = p.IDEstadoPedido, @CodigoActual = e.Codigo, @EstadoActual = e.Nombre, @IDUsuarioPedido = p.IDUsuario
        FROM dbo.Pedido AS p WITH (UPDLOCK)
        JOIN dbo.EstadoPedido AS e ON e.IDEstadoPedido = p.IDEstadoPedido
        WHERE p.IDPedido = @IDPedido;

        IF @IDActual IS NULL OR (@Rol = 'CLIENTE' AND ISNULL(@IDUsuarioPedido, 0) <> @IDUsuarioAccion)
            THROW 50116, N'PEDIDO_NO_ENCONTRADO: el pedido no existe.', 1;

        SELECT @PermiteCliente = t.PermiteCliente
        FROM dbo.TransicionEstadoPedido AS t
        WHERE t.IDEstadoOrigen = @IDActual AND t.IDEstadoDestino = @IDCancelado;

        IF @PermiteCliente IS NULL OR (@Rol = 'CLIENTE' AND @PermiteCliente = 0)
        BEGIN
            SET @MensajeError = CONCAT(N'TRANSICION_NO_PERMITIDA: un pedido en ', @EstadoActual, N' ya no se puede cancelar',
                                       CASE WHEN @Rol = 'CLIENTE' AND @PermiteCliente = 0 THEN N' desde la tienda; contacte a la tienda' END, N'.');
            THROW 51010, @MensajeError, 1;
        END;

        -- Uso del cupón: se revierte (D6). El cupón se bloquea antes que las variantes, como al pagar.
        SELECT @IDCupon = cu.IDCupon FROM dbo.CuponUso AS cu WHERE cu.IDPedido = @IDPedido AND cu.FechaReversion IS NULL;
        IF @IDCupon IS NOT NULL
        BEGIN
            UPDATE dbo.Cupon SET UsosActuales = UsosActuales - 1 WHERE IDCupon = @IDCupon;
            UPDATE dbo.CuponUso SET FechaReversion = @Ahora WHERE IDPedido = @IDPedido;
        END;

        SELECT @Bloqueadas = COUNT(*)
        FROM dbo.PedidoDetalle AS pd
        JOIN dbo.Variante AS v WITH (UPDLOCK, ROWLOCK) ON v.IDVariante = pd.IDVariante
        WHERE pd.IDPedido = @IDPedido
        OPTION (FORCE ORDER, LOOP JOIN);

        INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimiento, Signo, Cantidad, SaldoAnterior, SaldoNuevo, Motivo, IDPedido, IDUsuario, Fecha)
        OUTPUT inserted.IDVariante, inserted.SaldoNuevo INTO @Movimientos (IDVariante, SaldoNuevo)
        SELECT pd.IDVariante, @IDTipoCancelacion, 1, pd.Cantidad - pd.CantidadDevuelta, v.ExistenciaFisica,
               v.ExistenciaFisica + pd.Cantidad - pd.CantidadDevuelta, LEFT(@Motivo, 300), @IDPedido, @IDUsuarioAccion, @Ahora
        FROM dbo.PedidoDetalle AS pd
        JOIN dbo.Variante AS v ON v.IDVariante = pd.IDVariante
        WHERE pd.IDPedido = @IDPedido AND pd.Cantidad > pd.CantidadDevuelta;

        UPDATE v
        SET ExistenciaFisica = m.SaldoNuevo
        FROM dbo.Variante AS v
        JOIN @Movimientos AS m ON m.IDVariante = v.IDVariante;

        -- Reembolso simulado del pago aprobado, por su mismo monto.
        INSERT INTO dbo.Pago (IDCheckout, IDPedido, Estado, Marca, Ultimos4, Monto, ReferenciaExterna, IDPagoOriginal, Fecha)
        SELECT pg.IDCheckout, pg.IDPedido, 'REEMBOLSADO', pg.Marca, pg.Ultimos4, pg.Monto, CONCAT('REEMBOLSO-', pg.IDPago), pg.IDPago, @Ahora
        FROM dbo.Pago AS pg
        WHERE pg.IDPedido = @IDPedido AND pg.Estado = 'APROBADO';

        UPDATE dbo.Pedido SET IDEstadoPedido = @IDCancelado, FechaModificacion = @Ahora WHERE IDPedido = @IDPedido;

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioAccion, 'PEDIDOS', 'Pedido', CAST(@IDPedido AS VARCHAR(50)), 'CAMBIAR_ESTADO',
                (SELECT @CodigoActual AS Estado FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                (SELECT 'CANCELADO' AS Estado, @Motivo AS Comentario FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

        COMMIT TRANSACTION;
        EXEC sys.sp_set_session_context @key = N'ComentarioEstado', @value = NULL;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        EXEC sys.sp_set_session_context @key = N'ComentarioEstado', @value = NULL;
        THROW;
    END CATCH;

    IF @Rol = 'CLIENTE'
        SELECT d.* FROM dbo.FU_Pedidos_DetalleCliente(@IDPedido) AS d;
    ELSE
        EXEC dbo.SP_Pedidos_Obtener @IDUsuarioAccion = @IDUsuarioAccion, @IDPedido = @IDPedido;
END;
GO
