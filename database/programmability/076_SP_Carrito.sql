/*
    076_SP_Carrito.sql
    Carrito (RF-04): consultar, agregar, cambiar cantidad, quitar, vaciar, fusionar al iniciar
    sesión y aplicar o quitar un cupón (RF-05).

    - Propietario: un cliente registrado (@IDUsuario) o un invitado (@TokenInvitadoHash, el
      SHA-256 del token de su cookie), nunca ambos. Personal interno no tiene carrito.
    - El carrito no reserva: la disponibilidad se valida al agregar para no dar sorpresas, pero
      la garantía llega en el checkout, que bloquea y reserva.
    - Tope de cada línea = el menor entre MAXIMO_UNIDADES_POR_LINEA (Parametro) y lo disponible.
    - Toda operación que modifica bloquea primero la fila del carrito (UPDLOCK, HOLDLOCK): dos
      peticiones simultáneas del mismo cliente se ejecutan una tras otra, y si aún no hay
      carrito, el bloqueo de rango impide que ambas lo creen.
    - Un solo cupón por carrito: aplicar otro lo reemplaza. Aplicarlo no consume usos (se
      consumen al pagar). Si deja de cumplir sus condiciones no se quita en silencio: el carrito
      lo muestra con descuento 0 y el motivo, y no se puede pasar al checkout.
    - Las operaciones devuelven el carrito completo (mismo resultado que SP_Carrito_Obtener).
    - Errores: ver docs/errores.md.
*/
:on error exit
SET NOCOUNT ON;
GO

/*
    Carrito activo con sus líneas en JSON (Items), el subtotal con precios vigentes, el cupón
    aplicado (JSON, NULL si no hay), el descuento, el total sin envío y si se puede pasar al
    checkout. Sin carrito devuelve la misma fila con IDCarrito NULL e Items vacío.
    Estado de cada línea:
    - NO_DISPONIBLE: la variante, el producto o la categoría ya no están a la venta.
    - AGOTADO: no hay unidades disponibles.
    - CANTIDAD_EXCEDIDA: la cantidad supera el tope actual (bajó la existencia o el límite).
    - DISPONIBLE: se puede comprar.
    Cupón: Aplicable y CodigoError (el mismo código que rechazaría aplicarlo, p. ej.
    CUPON_MONTO_MINIMO, con MontoFaltante). Un cupón no aplicable descuenta 0.
    PuedeComprar = hay líneas, todas están DISPONIBLE y el cupón (si hay) es aplicable.
    El límite de usos por cliente de un invitado se valida en el checkout, cuando da su correo.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Carrito_Obtener
    @IDUsuario         INT = NULL,
    @TokenInvitadoHash VARBINARY(64) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME(), @Token BINARY(32), @IDCarrito INT, @Maximo INT,
            @IDCupon INT, @ErrorCupon VARCHAR(40), @Descuento DECIMAL(12, 2) = 0, @MontoFaltante DECIMAL(12, 2);

    IF (@IDUsuario IS NULL AND @TokenInvitadoHash IS NULL) OR (@IDUsuario IS NOT NULL AND @TokenInvitadoHash IS NOT NULL)
       OR DATALENGTH(@TokenInvitadoHash) <> 32
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el cliente o el hash SHA-256 del token de invitado, uno de los dos.', 1;

    IF @IDUsuario IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuario) AS a WHERE a.CodigoRol = 'CLIENTE')
        THROW 50201, N'PERMISO_DENEGADO: solo un cliente activo puede tener carrito.', 1;

    SELECT @Maximo = c.MaximoPorLinea FROM dbo.FU_Carrito_Configuracion() AS c;
    IF @Maximo IS NULL
        THROW 59001, N'CONFIGURACION_INCOMPLETA: falta el parámetro MAXIMO_UNIDADES_POR_LINEA o no está entre 1 y 999.', 1;

    SET @Token = CAST(@TokenInvitadoHash AS BINARY(32));

    IF @IDUsuario IS NOT NULL
        SELECT @IDCarrito = c.IDCarrito, @IDCupon = c.IDCupon FROM dbo.Carrito AS c WHERE c.IDUsuario = @IDUsuario AND c.Estado = 'ACTIVO';
    ELSE
        SELECT @IDCarrito = c.IDCarrito, @IDCupon = c.IDCupon FROM dbo.Carrito AS c WHERE c.TokenInvitadoHash = @Token AND c.Estado = 'ACTIVO';

    -- Las mismas reglas que al aplicarlo: primero las del cupón y el cliente, luego las del carrito.
    IF @IDCupon IS NOT NULL
        SELECT @ErrorCupon = COALESCE(v.CodigoError, d.CodigoError),
               @Descuento = CASE WHEN COALESCE(v.CodigoError, d.CodigoError) IS NULL THEN d.Descuento ELSE 0 END,
               @MontoFaltante = CASE WHEN COALESCE(v.CodigoError, d.CodigoError) = 'CUPON_MONTO_MINIMO'
                                     THEN c.MontoMinimo - d.Subtotal END
        FROM dbo.FU_Cupones_Validar(@IDCupon, @IDUsuario, NULL, @Ahora) AS v
        CROSS JOIN dbo.FU_Cupones_CalculoDescuento(@IDCupon, @IDCarrito) AS d
        JOIN dbo.Cupon AS c ON c.IDCupon = @IDCupon;

    WITH Lineas AS
    (
        SELECT l.IDCarritoItem, l.IDVariante, v.SKU, l.IDProducto, p.Nombre AS Producto, p.Slug,
               ISNULL((SELECT STRING_AGG(av.Valor, N' / ') WITHIN GROUP (ORDER BY ISNULL(ca.Orden, 255), vav.IDAtributo)
                       FROM dbo.VarianteAtributoValor AS vav
                       JOIN dbo.AtributoValor AS av ON av.IDAtributoValor = vav.IDAtributoValor
                       LEFT JOIN dbo.CategoriaAtributo AS ca ON ca.IDCategoria = l.IDCategoria AND ca.IDAtributo = vav.IDAtributo
                       WHERE vav.IDVariante = l.IDVariante), N'') AS Descripcion,
               i.RutaImagen AS Imagen, i.TextoAlternativo, l.PrecioUnitario, l.Cantidad, l.Importe,
               d.Disponible, t.CantidadMaxima,
               CASE WHEN l.EnVenta = 0 THEN 'NO_DISPONIBLE'
                    WHEN d.Disponible = 0 THEN 'AGOTADO'
                    WHEN l.Cantidad > t.CantidadMaxima THEN 'CANTIDAD_EXCEDIDA'
                    ELSE 'DISPONIBLE' END AS Estado
        FROM dbo.FU_Carrito_Lineas(@IDCarrito) AS l
        JOIN dbo.Variante AS v ON v.IDVariante = l.IDVariante
        JOIN dbo.Producto AS p ON p.IDProducto = l.IDProducto
        JOIN dbo.FU_Inventario_Disponibilidad(@Ahora) AS d ON d.IDVariante = l.IDVariante
        CROSS APPLY (SELECT CASE WHEN d.Disponible < @Maximo THEN d.Disponible ELSE @Maximo END AS CantidadMaxima) AS t
        -- Imagen: la principal del valor de la variante (su color) o la general del producto.
        OUTER APPLY (
            SELECT TOP (1) pi.RutaImagen, pi.TextoAlternativo
            FROM dbo.ProductoImagen AS pi
            WHERE pi.IDProducto = l.IDProducto AND pi.EsPrincipal = 1
            ORDER BY CASE WHEN EXISTS (SELECT 1 FROM dbo.VarianteAtributoValor AS vav
                                       WHERE vav.IDVariante = l.IDVariante AND vav.IDAtributoValor = pi.IDAtributoValor) THEN 0
                          WHEN pi.IDAtributoValor IS NULL THEN 1
                          ELSE 2 END,
                     pi.IDProductoImagen
        ) AS i
    )
    SELECT @IDCarrito AS IDCarrito, @Maximo AS MaximoPorLinea,
           ISNULL((SELECT SUM(x.Cantidad) FROM Lineas AS x), 0) AS CantidadArticulos,
           CAST(ISNULL((SELECT SUM(x.Importe) FROM Lineas AS x), 0) AS DECIMAL(12, 2)) AS Subtotal,
           @Descuento AS Descuento,
           CAST(ISNULL((SELECT SUM(x.Importe) FROM Lineas AS x), 0) - @Descuento AS DECIMAL(12, 2)) AS Total,
           CAST(CASE WHEN EXISTS (SELECT 1 FROM Lineas)
                      AND NOT EXISTS (SELECT 1 FROM Lineas AS x WHERE x.Estado <> 'DISPONIBLE')
                      AND @ErrorCupon IS NULL THEN 1 ELSE 0 END AS BIT) AS PuedeComprar,
           (SELECT c.Codigo, c.Descripcion, c.TipoDescuento, c.Valor, c.MontoMinimo, c.IDCategoria,
                   CAST(CASE WHEN @ErrorCupon IS NULL THEN 1 ELSE 0 END AS BIT) AS Aplicable,
                   @ErrorCupon AS CodigoError, @MontoFaltante AS MontoFaltante
            FROM dbo.Cupon AS c
            WHERE c.IDCupon = @IDCupon
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) AS Cupon,
           ISNULL((SELECT x.IDCarritoItem, x.IDVariante, x.SKU, x.IDProducto, x.Producto, x.Slug, x.Descripcion,
                          x.Imagen, x.TextoAlternativo, x.PrecioUnitario, x.Cantidad, x.Importe, x.Disponible,
                          x.CantidadMaxima, x.Estado
                   FROM Lineas AS x
                   ORDER BY x.IDCarritoItem
                   FOR JSON PATH, INCLUDE_NULL_VALUES), N'[]') AS Items;
END;
GO

/*
    Agrega una variante (si ya está en el carrito, suma la cantidad). Crea el carrito si el
    cliente o el invitado aún no tiene uno. Rechaza variantes que no están a la venta y
    cantidades por encima del tope, indicando cuántas se pueden llevar.
    Un token de invitado cuyo carrito ya se pagó o se fusionó no se reutiliza (CARRITO_CERRADO):
    la API emite un token nuevo y reintenta.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Carrito_AgregarItem
    @IDUsuario         INT = NULL,
    @TokenInvitadoHash VARBINARY(64) = NULL,
    @IDVariante        INT,
    @Cantidad          INT = 1
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME(), @Token BINARY(32), @Maximo INT, @IDCarrito INT, @EstadoCarrito VARCHAR(12),
            @SKU VARCHAR(50), @EnVenta BIT, @Disponible INT, @Actual INT, @Nueva INT, @MensajeError NVARCHAR(400);

    IF (@IDUsuario IS NULL AND @TokenInvitadoHash IS NULL) OR (@IDUsuario IS NOT NULL AND @TokenInvitadoHash IS NOT NULL)
       OR DATALENGTH(@TokenInvitadoHash) <> 32
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el cliente o el hash SHA-256 del token de invitado, uno de los dos.', 1;

    IF @IDUsuario IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuario) AS a WHERE a.CodigoRol = 'CLIENTE')
        THROW 50201, N'PERMISO_DENEGADO: solo un cliente activo puede tener carrito.', 1;

    IF @IDVariante IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere la variante.', 1;
    IF @Cantidad IS NULL OR @Cantidad <= 0
        THROW 50025, N'CANTIDAD_INVALIDA: la cantidad debe ser mayor que cero.', 1;

    SELECT @Maximo = c.MaximoPorLinea FROM dbo.FU_Carrito_Configuracion() AS c;
    IF @Maximo IS NULL
        THROW 59001, N'CONFIGURACION_INCOMPLETA: falta el parámetro MAXIMO_UNIDADES_POR_LINEA o no está entre 1 y 999.', 1;

    IF @Cantidad > @Maximo
    BEGIN
        SET @MensajeError = CONCAT(N'CANTIDAD_EXCEDE_LIMITE: se permiten como máximo ', @Maximo, N' unidades por producto.');
        THROW 50027, @MensajeError, 1;
    END;

    SET @Token = CAST(@TokenInvitadoHash AS BINARY(32));

    BEGIN TRY
        BEGIN TRANSACTION;

        IF @IDUsuario IS NOT NULL
            SELECT @IDCarrito = c.IDCarrito, @EstadoCarrito = c.Estado
            FROM dbo.Carrito AS c WITH (UPDLOCK, HOLDLOCK)
            WHERE c.IDUsuario = @IDUsuario AND c.Estado = 'ACTIVO';
        ELSE
            SELECT @IDCarrito = c.IDCarrito, @EstadoCarrito = c.Estado
            FROM dbo.Carrito AS c WITH (UPDLOCK, HOLDLOCK)
            WHERE c.TokenInvitadoHash = @Token;

        IF @EstadoCarrito <> 'ACTIVO'
            THROW 51303, N'CARRITO_CERRADO: el carrito de este token ya se pagó o se fusionó; se requiere un token de invitado nuevo.', 1;

        SELECT @SKU = v.SKU, @Disponible = d.Disponible,
               @EnVenta = CASE WHEN v.Activo = 1 AND p.Activo = 1 AND c.Activo = 1 THEN 1 ELSE 0 END
        FROM dbo.Variante AS v
        JOIN dbo.Producto AS p ON p.IDProducto = v.IDProducto
        JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
        JOIN dbo.FU_Inventario_Disponibilidad(@Ahora) AS d ON d.IDVariante = v.IDVariante
        WHERE v.IDVariante = @IDVariante;

        IF @SKU IS NULL
            THROW 50106, N'VARIANTE_NO_ENCONTRADA: la variante no existe.', 1;
        IF @EnVenta = 0
            THROW 51302, N'VARIANTE_NO_DISPONIBLE: el producto ya no está a la venta.', 1;

        SELECT @Actual = ci.Cantidad FROM dbo.CarritoItem AS ci WHERE ci.IDCarrito = @IDCarrito AND ci.IDVariante = @IDVariante;
        SET @Nueva = ISNULL(@Actual, 0) + @Cantidad;

        IF @Nueva > @Disponible AND @Disponible < @Maximo
        BEGIN
            SET @MensajeError = CONCAT(N'STOCK_INSUFICIENTE: el SKU ', @SKU, N' tiene ', @Disponible, N' unidades disponibles',
                                       CASE WHEN @Actual IS NOT NULL THEN CONCAT(N' y el carrito ya tiene ', @Actual) END, N'.');
            THROW 51301, @MensajeError, 1;
        END;
        IF @Nueva > @Maximo
        BEGIN
            SET @MensajeError = CONCAT(N'CANTIDAD_EXCEDE_LIMITE: se permiten como máximo ', @Maximo, N' unidades por producto',
                                       CASE WHEN @Actual IS NOT NULL THEN CONCAT(N' y el carrito ya tiene ', @Actual) END, N'.');
            THROW 50027, @MensajeError, 1;
        END;

        IF @IDCarrito IS NULL
        BEGIN
            INSERT INTO dbo.Carrito (IDUsuario, TokenInvitadoHash, FechaCreacion, FechaUltimaActividad)
            VALUES (@IDUsuario, CASE WHEN @IDUsuario IS NULL THEN @Token END, @Ahora, @Ahora);
            SET @IDCarrito = SCOPE_IDENTITY();
        END
        ELSE
            UPDATE dbo.Carrito SET FechaUltimaActividad = @Ahora WHERE IDCarrito = @IDCarrito;

        IF @Actual IS NULL
            INSERT INTO dbo.CarritoItem (IDCarrito, IDVariante, Cantidad, FechaAgregado, FechaModificacion)
            VALUES (@IDCarrito, @IDVariante, @Nueva, @Ahora, @Ahora);
        ELSE
            UPDATE dbo.CarritoItem SET Cantidad = @Nueva, FechaModificacion = @Ahora
            WHERE IDCarrito = @IDCarrito AND IDVariante = @IDVariante;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    EXEC dbo.SP_Carrito_Obtener @IDUsuario = @IDUsuario, @TokenInvitadoHash = @TokenInvitadoHash;
END;
GO

/*
    Fija la cantidad de una línea (para quitarla: SP_Carrito_QuitarItem). Una línea que ya no
    está a la venta solo se puede quitar. La nueva cantidad respeta el mismo tope que al agregar.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Carrito_ActualizarCantidad
    @IDUsuario         INT = NULL,
    @TokenInvitadoHash VARBINARY(64) = NULL,
    @IDVariante        INT,
    @Cantidad          INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME(), @Token BINARY(32), @Maximo INT, @IDCarrito INT,
            @SKU VARCHAR(50), @EnVenta BIT, @Disponible INT, @MensajeError NVARCHAR(400);

    IF (@IDUsuario IS NULL AND @TokenInvitadoHash IS NULL) OR (@IDUsuario IS NOT NULL AND @TokenInvitadoHash IS NOT NULL)
       OR DATALENGTH(@TokenInvitadoHash) <> 32
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el cliente o el hash SHA-256 del token de invitado, uno de los dos.', 1;

    IF @IDUsuario IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuario) AS a WHERE a.CodigoRol = 'CLIENTE')
        THROW 50201, N'PERMISO_DENEGADO: solo un cliente activo puede tener carrito.', 1;

    IF @IDVariante IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere la variante.', 1;
    IF @Cantidad IS NULL OR @Cantidad <= 0
        THROW 50025, N'CANTIDAD_INVALIDA: la cantidad debe ser mayor que cero.', 1;

    SELECT @Maximo = c.MaximoPorLinea FROM dbo.FU_Carrito_Configuracion() AS c;
    IF @Maximo IS NULL
        THROW 59001, N'CONFIGURACION_INCOMPLETA: falta el parámetro MAXIMO_UNIDADES_POR_LINEA o no está entre 1 y 999.', 1;

    SET @Token = CAST(@TokenInvitadoHash AS BINARY(32));

    BEGIN TRY
        BEGIN TRANSACTION;

        IF @IDUsuario IS NOT NULL
            SELECT @IDCarrito = c.IDCarrito FROM dbo.Carrito AS c WITH (UPDLOCK, HOLDLOCK)
            WHERE c.IDUsuario = @IDUsuario AND c.Estado = 'ACTIVO';
        ELSE
            SELECT @IDCarrito = c.IDCarrito FROM dbo.Carrito AS c WITH (UPDLOCK, HOLDLOCK)
            WHERE c.TokenInvitadoHash = @Token AND c.Estado = 'ACTIVO';

        IF @IDCarrito IS NULL
            THROW 50108, N'CARRITO_NO_ENCONTRADO: no hay un carrito activo.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.CarritoItem AS ci WHERE ci.IDCarrito = @IDCarrito AND ci.IDVariante = @IDVariante)
            THROW 50109, N'ITEM_NO_ENCONTRADO: el producto no está en el carrito.', 1;

        SELECT @SKU = v.SKU, @Disponible = d.Disponible,
               @EnVenta = CASE WHEN v.Activo = 1 AND p.Activo = 1 AND c.Activo = 1 THEN 1 ELSE 0 END
        FROM dbo.Variante AS v
        JOIN dbo.Producto AS p ON p.IDProducto = v.IDProducto
        JOIN dbo.Categoria AS c ON c.IDCategoria = p.IDCategoria
        JOIN dbo.FU_Inventario_Disponibilidad(@Ahora) AS d ON d.IDVariante = v.IDVariante
        WHERE v.IDVariante = @IDVariante;

        IF @EnVenta = 0
            THROW 51302, N'VARIANTE_NO_DISPONIBLE: el producto ya no está a la venta; solo se puede quitar del carrito.', 1;

        IF @Cantidad > @Disponible AND @Disponible < @Maximo
        BEGIN
            SET @MensajeError = CONCAT(N'STOCK_INSUFICIENTE: el SKU ', @SKU, N' tiene ', @Disponible, N' unidades disponibles.');
            THROW 51301, @MensajeError, 1;
        END;
        IF @Cantidad > @Maximo
        BEGIN
            SET @MensajeError = CONCAT(N'CANTIDAD_EXCEDE_LIMITE: se permiten como máximo ', @Maximo, N' unidades por producto.');
            THROW 50027, @MensajeError, 1;
        END;

        UPDATE dbo.CarritoItem SET Cantidad = @Cantidad, FechaModificacion = @Ahora
        WHERE IDCarrito = @IDCarrito AND IDVariante = @IDVariante;

        UPDATE dbo.Carrito SET FechaUltimaActividad = @Ahora WHERE IDCarrito = @IDCarrito;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    EXEC dbo.SP_Carrito_Obtener @IDUsuario = @IDUsuario, @TokenInvitadoHash = @TokenInvitadoHash;
END;
GO

/*
    Quita una línea. Idempotente: si la variante ya no está (o no hay carrito) no es error,
    así un doble clic devuelve el mismo carrito.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Carrito_QuitarItem
    @IDUsuario         INT = NULL,
    @TokenInvitadoHash VARBINARY(64) = NULL,
    @IDVariante        INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME(), @Token BINARY(32), @IDCarrito INT;

    IF (@IDUsuario IS NULL AND @TokenInvitadoHash IS NULL) OR (@IDUsuario IS NOT NULL AND @TokenInvitadoHash IS NOT NULL)
       OR DATALENGTH(@TokenInvitadoHash) <> 32
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el cliente o el hash SHA-256 del token de invitado, uno de los dos.', 1;

    IF @IDUsuario IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuario) AS a WHERE a.CodigoRol = 'CLIENTE')
        THROW 50201, N'PERMISO_DENEGADO: solo un cliente activo puede tener carrito.', 1;

    IF @IDVariante IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere la variante.', 1;

    SET @Token = CAST(@TokenInvitadoHash AS BINARY(32));

    BEGIN TRY
        BEGIN TRANSACTION;

        IF @IDUsuario IS NOT NULL
            SELECT @IDCarrito = c.IDCarrito FROM dbo.Carrito AS c WITH (UPDLOCK, HOLDLOCK)
            WHERE c.IDUsuario = @IDUsuario AND c.Estado = 'ACTIVO';
        ELSE
            SELECT @IDCarrito = c.IDCarrito FROM dbo.Carrito AS c WITH (UPDLOCK, HOLDLOCK)
            WHERE c.TokenInvitadoHash = @Token AND c.Estado = 'ACTIVO';

        DELETE FROM dbo.CarritoItem WHERE IDCarrito = @IDCarrito AND IDVariante = @IDVariante;

        IF @@ROWCOUNT > 0
            UPDATE dbo.Carrito SET FechaUltimaActividad = @Ahora WHERE IDCarrito = @IDCarrito;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    EXEC dbo.SP_Carrito_Obtener @IDUsuario = @IDUsuario, @TokenInvitadoHash = @TokenInvitadoHash;
END;
GO

/*
    Quita todas las líneas; el carrito sigue activo. Idempotente, como SP_Carrito_QuitarItem.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Carrito_Vaciar
    @IDUsuario         INT = NULL,
    @TokenInvitadoHash VARBINARY(64) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME(), @Token BINARY(32), @IDCarrito INT;

    IF (@IDUsuario IS NULL AND @TokenInvitadoHash IS NULL) OR (@IDUsuario IS NOT NULL AND @TokenInvitadoHash IS NOT NULL)
       OR DATALENGTH(@TokenInvitadoHash) <> 32
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el cliente o el hash SHA-256 del token de invitado, uno de los dos.', 1;

    IF @IDUsuario IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuario) AS a WHERE a.CodigoRol = 'CLIENTE')
        THROW 50201, N'PERMISO_DENEGADO: solo un cliente activo puede tener carrito.', 1;

    SET @Token = CAST(@TokenInvitadoHash AS BINARY(32));

    BEGIN TRY
        BEGIN TRANSACTION;

        IF @IDUsuario IS NOT NULL
            SELECT @IDCarrito = c.IDCarrito FROM dbo.Carrito AS c WITH (UPDLOCK, HOLDLOCK)
            WHERE c.IDUsuario = @IDUsuario AND c.Estado = 'ACTIVO';
        ELSE
            SELECT @IDCarrito = c.IDCarrito FROM dbo.Carrito AS c WITH (UPDLOCK, HOLDLOCK)
            WHERE c.TokenInvitadoHash = @Token AND c.Estado = 'ACTIVO';

        DELETE FROM dbo.CarritoItem WHERE IDCarrito = @IDCarrito;

        IF @@ROWCOUNT > 0
            UPDATE dbo.Carrito SET FechaUltimaActividad = @Ahora WHERE IDCarrito = @IDCarrito;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    EXEC dbo.SP_Carrito_Obtener @IDUsuario = @IDUsuario, @TokenInvitadoHash = @TokenInvitadoHash;
END;
GO

/*
    Al iniciar sesión o registrarse, la API llama a este SP con el cliente y el token de la
    cookie de invitado, y después borra la cookie. Nunca falla por el contenido del carrito:
    - Sin carrito de invitado activo: no hay nada que fusionar.
    - El cliente no tiene carrito activo: el del invitado pasa a ser suyo (se le quita el token).
    - Ambos tienen carrito: las líneas del invitado se agregan al del cliente; si la variante
      está en los dos, se suman las cantidades. Cada línea resultante se topa al menor entre
      el límite por línea y lo disponible (si está agotada, solo al límite: el carrito la
      muestra como AGOTADO). El carrito del invitado queda FUSIONADO con sus líneas como
      historial, y su cupón pasa al del cliente si este no tiene uno.
    Orden de bloqueo: carrito del invitado y después el del cliente.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Carrito_Fusionar
    @IDUsuario         INT,
    @TokenInvitadoHash VARBINARY(64)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME(), @Token BINARY(32), @Maximo INT,
            @IDInvitado INT, @EstadoInvitado VARCHAR(12), @IDCuponInvitado INT, @IDCliente INT;
    DECLARE @Fusion TABLE (IDVariante INT PRIMARY KEY, Cantidad INT NOT NULL, EnCliente BIT NOT NULL);

    IF @IDUsuario IS NULL OR @TokenInvitadoHash IS NULL OR DATALENGTH(@TokenInvitadoHash) <> 32
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el cliente y el hash SHA-256 del token de invitado.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuario) AS a WHERE a.CodigoRol = 'CLIENTE')
        THROW 50201, N'PERMISO_DENEGADO: solo un cliente activo puede tener carrito.', 1;

    SELECT @Maximo = c.MaximoPorLinea FROM dbo.FU_Carrito_Configuracion() AS c;
    IF @Maximo IS NULL
        THROW 59001, N'CONFIGURACION_INCOMPLETA: falta el parámetro MAXIMO_UNIDADES_POR_LINEA o no está entre 1 y 999.', 1;

    SET @Token = CAST(@TokenInvitadoHash AS BINARY(32));

    BEGIN TRY
        BEGIN TRANSACTION;

        SELECT @IDInvitado = c.IDCarrito, @EstadoInvitado = c.Estado, @IDCuponInvitado = c.IDCupon
        FROM dbo.Carrito AS c WITH (UPDLOCK, HOLDLOCK)
        WHERE c.TokenInvitadoHash = @Token;

        IF @EstadoInvitado = 'ACTIVO'
        BEGIN
            SELECT @IDCliente = c.IDCarrito
            FROM dbo.Carrito AS c WITH (UPDLOCK, HOLDLOCK)
            WHERE c.IDUsuario = @IDUsuario AND c.Estado = 'ACTIVO';

            IF @IDCliente IS NULL
                UPDATE dbo.Carrito
                SET IDUsuario = @IDUsuario, TokenInvitadoHash = NULL, FechaUltimaActividad = @Ahora
                WHERE IDCarrito = @IDInvitado;
            ELSE
            BEGIN
                INSERT INTO @Fusion (IDVariante, Cantidad, EnCliente)
                SELECT g.IDVariante,
                       CASE WHEN t.Tope >= 1 AND s.Suma > t.Tope THEN t.Tope
                            WHEN s.Suma > @Maximo THEN @Maximo
                            ELSE s.Suma END,
                       CASE WHEN u.IDCarritoItem IS NULL THEN 0 ELSE 1 END
                FROM dbo.CarritoItem AS g
                LEFT JOIN dbo.CarritoItem AS u ON u.IDCarrito = @IDCliente AND u.IDVariante = g.IDVariante
                JOIN dbo.FU_Inventario_Disponibilidad(@Ahora) AS d ON d.IDVariante = g.IDVariante
                CROSS APPLY (SELECT g.Cantidad + ISNULL(u.Cantidad, 0) AS Suma) AS s
                CROSS APPLY (SELECT CASE WHEN d.Disponible < @Maximo THEN d.Disponible ELSE @Maximo END AS Tope) AS t
                WHERE g.IDCarrito = @IDInvitado;

                UPDATE u
                SET Cantidad = f.Cantidad, FechaModificacion = @Ahora
                FROM dbo.CarritoItem AS u
                JOIN @Fusion AS f ON f.IDVariante = u.IDVariante
                WHERE u.IDCarrito = @IDCliente AND f.EnCliente = 1;

                INSERT INTO dbo.CarritoItem (IDCarrito, IDVariante, Cantidad, FechaAgregado, FechaModificacion)
                SELECT @IDCliente, f.IDVariante, f.Cantidad, @Ahora, @Ahora
                FROM @Fusion AS f
                WHERE f.EnCliente = 0;

                UPDATE dbo.Carrito
                SET IDCupon = ISNULL(IDCupon, @IDCuponInvitado), FechaUltimaActividad = @Ahora
                WHERE IDCarrito = @IDCliente;

                UPDATE dbo.Carrito SET Estado = 'FUSIONADO', FechaUltimaActividad = @Ahora WHERE IDCarrito = @IDInvitado;
            END;
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    EXEC dbo.SP_Carrito_Obtener @IDUsuario = @IDUsuario;
END;
GO

/*
    Aplica un cupón por su código (sin distinguir mayúsculas) y reemplaza el anterior. Lo valida
    completo contra el carrito actual y rechaza con el motivo exacto. Un código inexistente y uno
    desactivado responden igual (CUPON_INVALIDO), para no revelar qué códigos existen.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Carrito_AplicarCupon
    @IDUsuario         INT = NULL,
    @TokenInvitadoHash VARBINARY(64) = NULL,
    @Codigo            VARCHAR(31)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME(), @Token BINARY(32), @IDCarrito INT, @IDCupon INT,
            @ErrorCupon VARCHAR(40), @NumeroError INT, @MensajeError NVARCHAR(400);

    IF (@IDUsuario IS NULL AND @TokenInvitadoHash IS NULL) OR (@IDUsuario IS NOT NULL AND @TokenInvitadoHash IS NOT NULL)
       OR DATALENGTH(@TokenInvitadoHash) <> 32
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el cliente o el hash SHA-256 del token de invitado, uno de los dos.', 1;

    IF @IDUsuario IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuario) AS a WHERE a.CodigoRol = 'CLIENTE')
        THROW 50201, N'PERMISO_DENEGADO: solo un cliente activo puede tener carrito.', 1;

    SET @Codigo = NULLIF(UPPER(TRIM(@Codigo)), '');
    IF @Codigo IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el código del cupón.', 1;

    SET @Token = CAST(@TokenInvitadoHash AS BINARY(32));

    BEGIN TRY
        BEGIN TRANSACTION;

        IF @IDUsuario IS NOT NULL
            SELECT @IDCarrito = c.IDCarrito FROM dbo.Carrito AS c WITH (UPDLOCK, HOLDLOCK)
            WHERE c.IDUsuario = @IDUsuario AND c.Estado = 'ACTIVO';
        ELSE
            SELECT @IDCarrito = c.IDCarrito FROM dbo.Carrito AS c WITH (UPDLOCK, HOLDLOCK)
            WHERE c.TokenInvitadoHash = @Token AND c.Estado = 'ACTIVO';

        IF @IDCarrito IS NULL
            THROW 50108, N'CARRITO_NO_ENCONTRADO: no hay un carrito activo.', 1;

        SELECT @IDCupon = c.IDCupon FROM dbo.Cupon AS c WHERE c.Codigo = @Codigo;

        SELECT @ErrorCupon = v.CodigoError FROM dbo.FU_Cupones_Validar(@IDCupon, @IDUsuario, NULL, @Ahora) AS v;
        IF @ErrorCupon IS NULL
            SELECT @ErrorCupon = d.CodigoError,
                   @MensajeError = CASE d.CodigoError
                       WHEN 'CUPON_MONTO_MINIMO' THEN CONCAT(N'CUPON_MONTO_MINIMO: el cupón requiere una compra mínima de Q', c.MontoMinimo,
                                                             N'; faltan Q', c.MontoMinimo - d.Subtotal, N'.')
                       WHEN 'CUPON_SIN_PRODUCTOS_ELEGIBLES' THEN CONCAT(N'CUPON_SIN_PRODUCTOS_ELEGIBLES: el cupón aplica solo a productos de ',
                                                                        cat.Nombre, N' y el carrito no tiene ninguno.')
                   END
            FROM dbo.FU_Cupones_CalculoDescuento(@IDCupon, @IDCarrito) AS d
            JOIN dbo.Cupon AS c ON c.IDCupon = d.IDCupon
            LEFT JOIN dbo.Categoria AS cat ON cat.IDCategoria = c.IDCategoria;

        IF @ErrorCupon IS NOT NULL
        BEGIN
            SELECT @NumeroError = e.NumeroError, @MensajeError = ISNULL(@MensajeError, e.MensajeError)
            FROM (VALUES
                (51401, 'CUPON_INVALIDO',          N'CUPON_INVALIDO: el cupón no existe o no está disponible.'),
                (51402, 'CUPON_NO_VIGENTE',        N'CUPON_NO_VIGENTE: el cupón todavía no está vigente.'),
                (51403, 'CUPON_VENCIDO',           N'CUPON_VENCIDO: el cupón ya venció.'),
                (51404, 'CUPON_AGOTADO',           N'CUPON_AGOTADO: el cupón alcanzó su límite de usos.'),
                (51405, 'CUPON_SOLO_REGISTRADOS',  N'CUPON_SOLO_REGISTRADOS: el cupón es solo para clientes registrados; inicie sesión para usarlo.'),
                (51406, 'CUPON_LIMITE_CLIENTE',    N'CUPON_LIMITE_CLIENTE: ya usó este cupón el máximo de veces permitido.'),
                (51409, 'CARRITO_VACIO',           N'CARRITO_VACIO: agregue productos antes de aplicar un cupón.')
            ) AS e (NumeroError, Codigo, MensajeError)
            WHERE e.Codigo = @ErrorCupon;

            SET @NumeroError = ISNULL(@NumeroError, CASE @ErrorCupon WHEN 'CUPON_MONTO_MINIMO' THEN 51407
                                                                     WHEN 'CUPON_SIN_PRODUCTOS_ELEGIBLES' THEN 51408 END);
            THROW @NumeroError, @MensajeError, 1;
        END;

        UPDATE dbo.Carrito SET IDCupon = @IDCupon, FechaUltimaActividad = @Ahora WHERE IDCarrito = @IDCarrito;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    EXEC dbo.SP_Carrito_Obtener @IDUsuario = @IDUsuario, @TokenInvitadoHash = @TokenInvitadoHash;
END;
GO

/*
    Quita el cupón del carrito. Idempotente: sin cupón o sin carrito no es error.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Carrito_QuitarCupon
    @IDUsuario         INT = NULL,
    @TokenInvitadoHash VARBINARY(64) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME(), @Token BINARY(32), @IDCarrito INT;

    IF (@IDUsuario IS NULL AND @TokenInvitadoHash IS NULL) OR (@IDUsuario IS NOT NULL AND @TokenInvitadoHash IS NOT NULL)
       OR DATALENGTH(@TokenInvitadoHash) <> 32
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere el cliente o el hash SHA-256 del token de invitado, uno de los dos.', 1;

    IF @IDUsuario IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuario) AS a WHERE a.CodigoRol = 'CLIENTE')
        THROW 50201, N'PERMISO_DENEGADO: solo un cliente activo puede tener carrito.', 1;

    SET @Token = CAST(@TokenInvitadoHash AS BINARY(32));

    BEGIN TRY
        BEGIN TRANSACTION;

        IF @IDUsuario IS NOT NULL
            SELECT @IDCarrito = c.IDCarrito FROM dbo.Carrito AS c WITH (UPDLOCK, HOLDLOCK)
            WHERE c.IDUsuario = @IDUsuario AND c.Estado = 'ACTIVO';
        ELSE
            SELECT @IDCarrito = c.IDCarrito FROM dbo.Carrito AS c WITH (UPDLOCK, HOLDLOCK)
            WHERE c.TokenInvitadoHash = @Token AND c.Estado = 'ACTIVO';

        UPDATE dbo.Carrito SET IDCupon = NULL, FechaUltimaActividad = @Ahora
        WHERE IDCarrito = @IDCarrito AND IDCupon IS NOT NULL;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    EXEC dbo.SP_Carrito_Obtener @IDUsuario = @IDUsuario, @TokenInvitadoHash = @TokenInvitadoHash;
END;
GO
