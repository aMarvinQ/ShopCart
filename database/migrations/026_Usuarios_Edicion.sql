/*
    026_Usuarios_Edicion.sql
    Módulo: Usuarios (edición de operadores y administradores, RF-01).

    - RefreshToken.MotivoRevocacion: nuevo motivo CAMBIO_ROL. El rol viaja en el access token;
      al cambiarlo se revocan las sesiones del usuario para que vuelva a entrar con el rol nuevo.
    - Usuario.VersionFila ya existe: el control de edición concurrente no requiere estructura nueva.
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
GO

ALTER TABLE dbo.RefreshToken DROP CONSTRAINT CK_RefreshToken_Revocacion;
ALTER TABLE dbo.RefreshToken ADD CONSTRAINT CK_RefreshToken_Revocacion CHECK (
    (FechaRevocacion IS NULL AND MotivoRevocacion IS NULL)
    OR (FechaRevocacion IS NOT NULL AND MotivoRevocacion IS NOT NULL AND MotivoRevocacion IN
        ('ROTACION', 'CIERRE_SESION', 'REUSO_DETECTADO', 'USUARIO_DESACTIVADO', 'CAMBIO_CONTRASENA', 'CAMBIO_ROL'))
);
GO

COMMIT TRANSACTION;
GO
