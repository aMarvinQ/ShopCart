/*
    005_Integridad_PermisosTiposTabla.sql
    Se ejecuta conectado como shopcart_migrator (deploy.ps1 -Probar).
    Para enviar un TVP a un SP la API necesita EXECUTE sobre el tipo. Esta prueba no puede
    correr como la API: un tipo sin permiso es invisible para ella y no aparecería en la lista.
    Por eso el migrador (que ve todos los tipos) se hace pasar por un miembro de RolApi y
    verifica cada tipo, incluidos los que se agreguen en el futuro.
*/
:on error exit
SET NOCOUNT ON;

DECLARE @Fallas INT = 0;
DECLARE @UsuarioApi SYSNAME;

SELECT TOP (1) @UsuarioApi = USER_NAME(rm.member_principal_id)
FROM sys.database_role_members AS rm
WHERE rm.role_principal_id = DATABASE_PRINCIPAL_ID(N'RolApi')
ORDER BY rm.member_principal_id;

IF @UsuarioApi IS NULL
    THROW 50000, N'RolApi no tiene miembros: no se puede verificar el permiso sobre los tipos tabla.', 1;

DECLARE @Tipos TABLE (Nombre SYSNAME NOT NULL PRIMARY KEY, Permiso INT NULL);
INSERT INTO @Tipos (Nombre)
SELECT tt.name FROM sys.table_types AS tt WHERE tt.schema_id = SCHEMA_ID(N'dbo');

EXECUTE AS USER = @UsuarioApi;
    UPDATE @Tipos SET Permiso = HAS_PERMS_BY_NAME(N'dbo.' + Nombre, N'TYPE', N'EXECUTE');
REVERT;

DECLARE @SinPermiso NVARCHAR(MAX) =
    (SELECT STRING_AGG(Nombre, N', ') FROM @Tipos WHERE ISNULL(Permiso, 0) <> 1);
DECLARE @Total INT = (SELECT COUNT(*) FROM @Tipos);

IF @Total = 0
BEGIN
    SET @Fallas += 1; PRINT N'FALLA  No hay tipos tabla en dbo.';
END
ELSE IF @SinPermiso IS NULL
    PRINT N'OK     ' + @UsuarioApi + N' (RolApi) puede usar los ' + CAST(@Total AS NVARCHAR(10)) + N' tipos tabla de dbo.';
ELSE
BEGIN
    SET @Fallas += 1; PRINT N'FALLA  ' + @UsuarioApi + N' (RolApi) no puede usar: ' + @SinPermiso + N'.';
END

IF @Fallas > 0
    THROW 50000, N'Pruebas de permisos sobre tipos tabla fallidas.', 1;
GO
