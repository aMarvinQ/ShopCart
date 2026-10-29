/*
    052_Vistas_Usuarios.sql
    VW_Usuarios_Detalle: forma única en que los SPs devuelven un usuario (perfil, creación,
    cambio de estado y listado). Excluye al usuario de sistema y nunca expone el hash.
*/
:on error exit
SET NOCOUNT ON;
GO

CREATE OR ALTER VIEW dbo.VW_Usuarios_Detalle
AS
    SELECT
        u.IDUsuario,
        u.Correo,
        u.Nombre,
        u.Apellido,
        u.Telefono,
        r.Codigo AS CodigoRol,
        r.Nombre AS NombreRol,
        u.Activo,
        u.UltimoAcceso,
        u.FechaCreacion,
        u.FechaModificacion
    FROM dbo.Usuario AS u
    JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
    WHERE u.EsSistema = 0;
GO
