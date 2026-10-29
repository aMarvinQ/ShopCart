/*
    031_Trigger_PedidoEstado.sql
    Ciclo de vida del pedido garantizado por la base de datos (RF-07):
    - Un pedido nace en el estado inicial (EstadoPedido.EsInicial).
    - Un cambio de estado solo se acepta si está en TransicionEstadoPedido.
    - Cada creación y cambio de estado inserta su fila en PedidoHistorialEstado con usuario,
      fecha, estado anterior y nuevo; ningún SP puede olvidarlo.

    El actor se lee de SESSION_CONTEXT(N'IDUsuario'), que todo SP fija al iniciar; el
    comentario opcional, de SESSION_CONTEXT(N'ComentarioEstado'). Sin actor el cambio se
    rechaza, salvo al crear el pedido de un invitado (no tiene cuenta).
*/
:on error exit
SET NOCOUNT ON;
GO

CREATE OR ALTER TRIGGER dbo.TR_Pedido_Estado ON dbo.Pedido
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM inserted)
        RETURN;

    DECLARE @IDUsuario  INT           = TRY_CAST(SESSION_CONTEXT(N'IDUsuario') AS INT);
    DECLARE @Comentario NVARCHAR(500) = TRY_CAST(SESSION_CONTEXT(N'ComentarioEstado') AS NVARCHAR(500));

    /* Creación */
    IF NOT EXISTS (SELECT 1 FROM deleted)
    BEGIN
        IF EXISTS (
            SELECT 1
            FROM inserted AS i
            INNER JOIN dbo.EstadoPedido AS e ON e.IDEstadoPedido = i.IDEstadoPedido
            WHERE e.EsInicial = 0
        )
            THROW 51011, N'ESTADO_INICIAL_INVALIDO: un pedido debe crearse en el estado inicial.', 1;

        IF @IDUsuario IS NULL AND EXISTS (SELECT 1 FROM inserted WHERE IDUsuario IS NOT NULL)
            THROW 51901, N'ACTOR_REQUERIDO: falta SESSION_CONTEXT IDUsuario para registrar el historial del pedido.', 1;

        INSERT INTO dbo.PedidoHistorialEstado (IDPedido, IDEstadoAnterior, IDEstadoNuevo, IDUsuario, Comentario)
        SELECT IDPedido, NULL, IDEstadoPedido, @IDUsuario, @Comentario
        FROM inserted;

        RETURN;
    END;

    /* Cambio de estado */
    IF NOT UPDATE(IDEstadoPedido)
        RETURN;

    DECLARE @Cambios TABLE
    (
        IDPedido         INT     NOT NULL PRIMARY KEY,
        IDEstadoAnterior TINYINT NOT NULL,
        IDEstadoNuevo    TINYINT NOT NULL
    );

    INSERT INTO @Cambios (IDPedido, IDEstadoAnterior, IDEstadoNuevo)
    SELECT i.IDPedido, d.IDEstadoPedido, i.IDEstadoPedido
    FROM inserted AS i
    INNER JOIN deleted AS d ON d.IDPedido = i.IDPedido
    WHERE i.IDEstadoPedido <> d.IDEstadoPedido;

    IF NOT EXISTS (SELECT 1 FROM @Cambios)
        RETURN;

    IF @IDUsuario IS NULL
        THROW 51901, N'ACTOR_REQUERIDO: falta SESSION_CONTEXT IDUsuario para registrar el cambio de estado.', 1;

    IF EXISTS (
        SELECT 1
        FROM @Cambios AS c
        WHERE NOT EXISTS (
            SELECT 1
            FROM dbo.TransicionEstadoPedido AS t
            WHERE t.IDEstadoOrigen = c.IDEstadoAnterior
              AND t.IDEstadoDestino = c.IDEstadoNuevo
        )
    )
        THROW 51010, N'TRANSICION_NO_PERMITIDA: el cambio de estado del pedido no está permitido.', 1;

    INSERT INTO dbo.PedidoHistorialEstado (IDPedido, IDEstadoAnterior, IDEstadoNuevo, IDUsuario, Comentario)
    SELECT IDPedido, IDEstadoAnterior, IDEstadoNuevo, @IDUsuario, @Comentario
    FROM @Cambios;
END;
GO
