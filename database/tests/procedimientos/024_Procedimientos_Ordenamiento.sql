/*
    024_Procedimientos_Ordenamiento.sql
    Se ejecuta conectado como shopcart_migrator (deploy.ps1 -Probar). Cada listado paginado acepta
    solo las columnas de su lista blanca y las direcciones ASC y DESC: cualquier otro valor se
    rechaza con ORDENAMIENTO_INVALIDO antes de consultar. No modifica datos. Que cada columna
    ordene correctamente lo comprueban las pruebas de la API (ordenamiento.test.ts).
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT OFF;
GO

DECLARE @Api SYSNAME = (SELECT TOP (1) USER_NAME(rm.member_principal_id)
                        FROM sys.database_role_members AS rm
                        WHERE rm.role_principal_id = DATABASE_PRINCIPAL_ID(N'RolApi')
                        ORDER BY rm.member_principal_id);
DECLARE @Fallas INT = 0, @Error INT, @Sentencia NVARCHAR(400), @Descripcion NVARCHAR(200), @Orden INT = 1;
DECLARE @IDAdmin INT = (SELECT TOP (1) a.IDUsuario FROM dbo.Usuario AS a JOIN dbo.Rol AS r ON r.IDRol = a.IDRol
                        WHERE r.Codigo = 'ADMIN' AND a.Activo = 1 AND a.EsSistema = 0 ORDER BY a.IDUsuario);
DECLARE @IDCliente INT = (SELECT TOP (1) c.IDUsuario FROM dbo.Usuario AS c JOIN dbo.Rol AS r ON r.IDRol = c.IDRol
                          WHERE r.Codigo = 'CLIENTE' AND c.Activo = 1 ORDER BY c.IDUsuario);
DECLARE @Listados TABLE (Orden INT IDENTITY PRIMARY KEY, Procedimiento SYSNAME NOT NULL, Usuario INT NOT NULL);

IF @Api IS NULL THROW 50000, N'RolApi no tiene miembros: no se pueden ejecutar los SPs como la API.', 1;
IF @IDAdmin IS NULL OR @IDCliente IS NULL THROW 50000, N'Se requiere la semilla: un administrador y un cliente activos.', 1;

INSERT INTO @Listados (Procedimiento, Usuario)
VALUES (N'SP_Pedidos_Listar', @IDAdmin), (N'SP_Catalogo_ListarProductos', @IDAdmin), (N'SP_Usuarios_Listar', @IDAdmin),
       (N'SP_Inventario_ListarExistencias', @IDAdmin), (N'SP_Inventario_ListarKardex', @IDAdmin), (N'SP_Cupones_Listar', @IDAdmin),
       (N'SP_Devoluciones_Listar', @IDAdmin), (N'SP_Reportes_CarritosAbandonados', @IDAdmin), (N'SP_Bitacora_Listar', @IDAdmin);

DECLARE @Total INT = (SELECT COUNT(*) FROM @Listados), @Caso INT, @Procedimiento SYSNAME, @Usuario INT;

WHILE @Orden <= @Total + 1
BEGIN
    -- SP_Pedidos_ListarCliente recibe @IDUsuario; los demás, @IDUsuarioAccion.
    SELECT @Procedimiento = Procedimiento, @Usuario = Usuario FROM @Listados WHERE Orden = @Orden;
    IF @Orden = @Total + 1 SELECT @Procedimiento = N'SP_Pedidos_ListarCliente', @Usuario = @IDCliente;

    SET @Caso = 1;
    WHILE @Caso <= 3
    BEGIN
        SET @Sentencia = CONCAT(N'EXEC dbo.', @Procedimiento, N' ',
                                CASE WHEN @Procedimiento = N'SP_Pedidos_ListarCliente' THEN N'@IDUsuario' ELSE N'@IDUsuarioAccion' END,
                                N' = ', @Usuario, N', ',
                                CASE @Caso WHEN 1 THEN N'@OrdenarPor = ''NO_EXISTE'''
                                           WHEN 2 THEN N'@OrdenarPor = ''1;DROP TABLE x'''
                                           ELSE N'@Direccion = ''ABAJO''' END, N';');
        SET @Descripcion = CONCAT(@Procedimiento, N': ', CASE @Caso WHEN 1 THEN N'columna fuera de la lista'
                                                                    WHEN 2 THEN N'texto con SQL' ELSE N'dirección inválida' END);
        SET @Error = 0;
        BEGIN TRY
            EXECUTE AS USER = @Api;
            EXEC sys.sp_executesql @Sentencia;
            REVERT;
        END TRY
        BEGIN CATCH
            SET @Error = ERROR_NUMBER();
            REVERT;
        END CATCH;

        IF @Error = 50022
            PRINT CONCAT(N'OK     ', @Descripcion, N' → ORDENAMIENTO_INVALIDO');
        ELSE
        BEGIN
            SET @Fallas += 1;
            PRINT CONCAT(N'FALLA  ', @Descripcion, N': esperado 50022, obtenido ', @Error);
        END;
        SET @Caso += 1;
    END;
    SET @Orden += 1;
END;

IF @Fallas > 0
    THROW 50000, N'Pruebas de ordenamiento fallidas.', 1;
GO
