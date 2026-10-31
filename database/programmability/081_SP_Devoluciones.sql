/*
    081_SP_Devoluciones.sql
    Devoluciones (RF-07): registrar una devolución total o parcial y listarlas. Operadores y
    administradores. El detalle de cada pedido ya incluye sus devoluciones (FU_Pedidos_Detalle).

    - Solo pedidos ENTREGADO o DEVUELTO_PARCIAL, dentro de DIAS_DEVOLUCION desde la entrega (D43).
    - Por línea: cuántas unidades y si vuelven al inventario (D41). Nunca más de lo vendido
      menos lo ya devuelto (además lo impide CK_PedidoDetalle_CantidadDevuelta).
    - Reembolso por línea proporcional a lo que se pagó por ella (ya con su parte del descuento),
      calculado acumulado: devolver todo en varias veces suma exactamente lo pagado (D44). El
      envío no se reembolsa (D42) y el uso del cupón no se revierte (D6).
    - El pedido pasa a DEVUELTO cuando ya no queda nada por devolver; si no, a DEVUELTO_PARCIAL.
    - Orden de bloqueo: Pedido → Variante (por IDVariante), como la cancelación.
    - Errores: ver docs/errores.md.
*/
:on error exit
SET NOCOUNT ON;
GO

/*
    Registra la devolución de @Lineas (IDPedidoDetalle, Cantidad, Reingresa) con un motivo
    obligatorio. En una transacción: devolución y sus líneas con el monto a reembolsar, lo
    devuelto en cada línea del pedido, kardex DEVOLUCION de lo que reingresa, estado del pedido
    (historial y bitácora). Devuelve el pedido como lo ve el panel.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Devoluciones_Registrar
    @IDUsuarioAccion INT,
    @IDPedido        INT,
    @Motivo          NVARCHAR(501),
    @Lineas          dbo.TT_Devoluciones_Linea READONLY
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME(), @Dias INT, @IDParcial TINYINT, @IDTotal TINYINT, @IDTipoDevolucion TINYINT,
            @IDActual TINYINT, @CodigoActual VARCHAR(20), @IDNuevo TINYINT, @FechaEntrega DATETIME2(3), @IDDevolucion INT,
            @Bloqueadas INT, @MensajeError NVARCHAR(400);
    -- Llave por IDVariante (cada línea del pedido es una variante distinta): el recorrido en orden
    -- de la llave bloquea las variantes en orden ascendente.
    DECLARE @Detalle TABLE (IDVariante INT PRIMARY KEY, IDPedidoDetalle INT NOT NULL UNIQUE, Cantidad INT NOT NULL,
                            Reingresa BIT NOT NULL, MontoReembolso DECIMAL(12, 2) NOT NULL);
    DECLARE @Movimientos TABLE (IDVariante INT PRIMARY KEY, SaldoNuevo INT NOT NULL);

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol IN ('OPERADOR', 'ADMIN'))
        THROW 50201, N'PERMISO_DENEGADO: solo un operador o administrador activo puede registrar devoluciones.', 1;

    SET @Motivo = NULLIF(TRIM(@Motivo), N'');
    IF @Motivo IS NULL OR LEN(@Motivo) > 500
        THROW 50024, N'MOTIVO_INVALIDO: el motivo de la devolución es obligatorio (máximo 500 caracteres).', 1;

    IF NOT EXISTS (SELECT 1 FROM @Lineas)
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere al menos una línea a devolver.', 1;
    IF EXISTS (SELECT 1 FROM @Lineas AS l WHERE l.Cantidad <= 0)
        THROW 50025, N'CANTIDAD_INVALIDA: las cantidades a devolver deben ser mayores que cero.', 1;

    SELECT @Dias = c.DiasDevolucion FROM dbo.FU_Devoluciones_Configuracion() AS c;
    SELECT @IDParcial = e.IDEstadoPedido FROM dbo.EstadoPedido AS e WHERE e.Codigo = 'DEVUELTO_PARCIAL';
    SELECT @IDTotal = e.IDEstadoPedido FROM dbo.EstadoPedido AS e WHERE e.Codigo = 'DEVUELTO';
    SELECT @IDTipoDevolucion = t.IDTipoMovimiento FROM dbo.TipoMovimiento AS t WHERE t.Codigo = 'DEVOLUCION' AND t.Signo = 1;
    IF @Dias IS NULL OR @IDParcial IS NULL OR @IDTotal IS NULL OR @IDTipoDevolucion IS NULL
        THROW 59001, N'CONFIGURACION_INCOMPLETA: falta DIAS_DEVOLUCION (1–365), los estados DEVUELTO_PARCIAL y DEVUELTO o el tipo de movimiento DEVOLUCION.', 1;

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;
        EXEC sys.sp_set_session_context @key = N'ComentarioEstado', @value = @Motivo;

        BEGIN TRANSACTION;

        SELECT @IDActual = p.IDEstadoPedido, @CodigoActual = e.Codigo
        FROM dbo.Pedido AS p WITH (UPDLOCK)
        JOIN dbo.EstadoPedido AS e ON e.IDEstadoPedido = p.IDEstadoPedido
        WHERE p.IDPedido = @IDPedido;

        IF @IDActual IS NULL
            THROW 50116, N'PEDIDO_NO_ENCONTRADO: el pedido no existe.', 1;
        IF @CodigoActual NOT IN ('ENTREGADO', 'DEVUELTO_PARCIAL')
            THROW 51701, N'PEDIDO_NO_DEVOLVIBLE: solo se devuelven pedidos entregados.', 1;

        SELECT @FechaEntrega = MAX(h.Fecha)
        FROM dbo.PedidoHistorialEstado AS h
        JOIN dbo.EstadoPedido AS e ON e.IDEstadoPedido = h.IDEstadoNuevo
        WHERE h.IDPedido = @IDPedido AND e.Codigo = 'ENTREGADO';

        IF @Ahora > DATEADD(DAY, @Dias, @FechaEntrega)
        BEGIN
            SET @MensajeError = CONCAT(N'PLAZO_DEVOLUCION_VENCIDO: las devoluciones se aceptan hasta ', @Dias, N' días después de la entrega.');
            THROW 51702, @MensajeError, 1;
        END;

        -- Monto acumulado: lo pagado por lo devuelto hasta ahora más esto, menos lo ya reembolsado.
        INSERT INTO @Detalle (IDPedidoDetalle, IDVariante, Cantidad, Reingresa, MontoReembolso)
        SELECT pd.IDPedidoDetalle, pd.IDVariante, l.Cantidad, l.Reingresa,
               CAST(ROUND(pd.TotalLinea * (pd.CantidadDevuelta + l.Cantidad) / pd.Cantidad, 2)
                    - ROUND(pd.TotalLinea * pd.CantidadDevuelta / pd.Cantidad, 2) AS DECIMAL(12, 2))
        FROM @Lineas AS l
        JOIN dbo.PedidoDetalle AS pd ON pd.IDPedidoDetalle = l.IDPedidoDetalle AND pd.IDPedido = @IDPedido
        WHERE l.Cantidad <= pd.Cantidad - pd.CantidadDevuelta;

        IF (SELECT COUNT(*) FROM @Detalle) <> (SELECT COUNT(*) FROM @Lineas)
        BEGIN
            IF EXISTS (SELECT 1 FROM @Lineas AS l
                       WHERE NOT EXISTS (SELECT 1 FROM dbo.PedidoDetalle AS pd WHERE pd.IDPedidoDetalle = l.IDPedidoDetalle AND pd.IDPedido = @IDPedido))
                THROW 50117, N'LINEA_PEDIDO_NO_ENCONTRADA: una línea no pertenece al pedido.', 1;

            SELECT TOP (1) @MensajeError = CONCAT(N'CANTIDAD_DEVOLUCION_EXCEDIDA: del SKU ', pd.SKU, N' se pueden devolver como máximo ',
                                                  pd.Cantidad - pd.CantidadDevuelta, N' unidades.')
            FROM @Lineas AS l
            JOIN dbo.PedidoDetalle AS pd ON pd.IDPedidoDetalle = l.IDPedidoDetalle
            WHERE l.Cantidad > pd.Cantidad - pd.CantidadDevuelta
            ORDER BY pd.IDPedidoDetalle;
            THROW 51703, @MensajeError, 1;
        END;

        INSERT INTO dbo.Devolucion (IDPedido, Motivo, MontoReembolso, IDUsuario, Fecha)
        SELECT @IDPedido, @Motivo, SUM(d.MontoReembolso), @IDUsuarioAccion, @Ahora FROM @Detalle AS d;
        SET @IDDevolucion = SCOPE_IDENTITY();

        INSERT INTO dbo.DevolucionDetalle (IDDevolucion, IDPedido, IDPedidoDetalle, Cantidad, MontoReembolso, Reingresa)
        SELECT @IDDevolucion, @IDPedido, d.IDPedidoDetalle, d.Cantidad, d.MontoReembolso, d.Reingresa
        FROM @Detalle AS d;

        UPDATE pd
        SET CantidadDevuelta = pd.CantidadDevuelta + d.Cantidad
        FROM dbo.PedidoDetalle AS pd
        JOIN @Detalle AS d ON d.IDPedidoDetalle = pd.IDPedidoDetalle;

        -- Lo que reingresa vuelve a la existencia con su kardex (variantes bloqueadas en orden de ID).
        IF EXISTS (SELECT 1 FROM @Detalle AS d WHERE d.Reingresa = 1)
        BEGIN
            SELECT @Bloqueadas = COUNT(*)
            FROM @Detalle AS d
            JOIN dbo.Variante AS v WITH (UPDLOCK, ROWLOCK) ON v.IDVariante = d.IDVariante
            WHERE d.Reingresa = 1
            OPTION (FORCE ORDER, LOOP JOIN);

            INSERT INTO dbo.MovimientoInventario (IDVariante, IDTipoMovimiento, Signo, Cantidad, SaldoAnterior, SaldoNuevo, Motivo,
                                                  IDDevolucion, IDUsuario, Fecha)
            OUTPUT inserted.IDVariante, inserted.SaldoNuevo INTO @Movimientos (IDVariante, SaldoNuevo)
            SELECT d.IDVariante, @IDTipoDevolucion, 1, d.Cantidad, v.ExistenciaFisica, v.ExistenciaFisica + d.Cantidad,
                   LEFT(@Motivo, 300), @IDDevolucion, @IDUsuarioAccion, @Ahora
            FROM @Detalle AS d
            JOIN dbo.Variante AS v ON v.IDVariante = d.IDVariante
            WHERE d.Reingresa = 1;

            UPDATE v
            SET ExistenciaFisica = m.SaldoNuevo
            FROM dbo.Variante AS v
            JOIN @Movimientos AS m ON m.IDVariante = v.IDVariante;
        END;

        SET @IDNuevo = CASE WHEN EXISTS (SELECT 1 FROM dbo.PedidoDetalle AS pd WHERE pd.IDPedido = @IDPedido AND pd.CantidadDevuelta < pd.Cantidad)
                            THEN @IDParcial ELSE @IDTotal END;

        IF @IDNuevo <> @IDActual
        BEGIN
            UPDATE dbo.Pedido SET IDEstadoPedido = @IDNuevo, FechaModificacion = @Ahora WHERE IDPedido = @IDPedido;

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioAccion, 'PEDIDOS', 'Pedido', CAST(@IDPedido AS VARCHAR(50)), 'CAMBIAR_ESTADO',
                    (SELECT @CodigoActual AS Estado FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                    (SELECT e.Codigo AS Estado, @Motivo AS Comentario, @IDDevolucion AS IDDevolucion
                     FROM dbo.EstadoPedido AS e WHERE e.IDEstadoPedido = @IDNuevo
                     FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));
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
    Devoluciones para el panel, de la más reciente a la más antigua, con filtro opcional por
    rango de fechas en UTC [desde, hasta).
*/
CREATE OR ALTER PROCEDURE dbo.SP_Devoluciones_Listar
    @IDUsuarioAccion INT,
    @FechaDesde      DATETIME2(3) = NULL,
    @FechaHasta      DATETIME2(3) = NULL,
    @Pagina          INT = 1,
    @TamanoPagina    INT = 20,
    @TotalRegistros  INT = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol IN ('OPERADOR', 'ADMIN'))
        THROW 50201, N'PERMISO_DENEGADO: solo un operador o administrador activo puede consultar las devoluciones.', 1;

    IF @Pagina IS NULL OR @Pagina < 1 OR @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50007, N'PAGINACION_INVALIDA: la página inicia en 1 y el tamaño va de 1 a 100.', 1;

    IF @FechaDesde >= @FechaHasta
        THROW 50026, N'RANGO_FECHAS_INVALIDO: la fecha inicial debe ser anterior a la final.', 1;

    SELECT @TotalRegistros = COUNT(*)
    FROM dbo.Devolucion AS dv
    WHERE (@FechaDesde IS NULL OR dv.Fecha >= @FechaDesde)
      AND (@FechaHasta IS NULL OR dv.Fecha < @FechaHasta)
    OPTION (RECOMPILE);

    SELECT dv.IDDevolucion, dv.Fecha, dv.IDPedido, p.NumeroPedido, dv.Motivo, dv.MontoReembolso,
           (SELECT SUM(dd.Cantidad) FROM dbo.DevolucionDetalle AS dd WHERE dd.IDDevolucion = dv.IDDevolucion) AS Unidades,
           CONCAT(u.Nombre, N' ', u.Apellido) AS Usuario
    FROM dbo.Devolucion AS dv
    JOIN dbo.Pedido AS p ON p.IDPedido = dv.IDPedido
    JOIN dbo.Usuario AS u ON u.IDUsuario = dv.IDUsuario
    WHERE (@FechaDesde IS NULL OR dv.Fecha >= @FechaDesde)
      AND (@FechaHasta IS NULL OR dv.Fecha < @FechaHasta)
    ORDER BY dv.Fecha DESC, dv.IDDevolucion DESC
    OFFSET CAST(@Pagina - 1 AS BIGINT) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY
    OPTION (RECOMPILE);
END;
GO
