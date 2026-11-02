/*
    085_SP_Sistema.sql
    Estado del sistema para el endpoint de salud de la API (D63).
    Errores: ver docs/errores.md.
*/
:on error exit
SET NOCOUNT ON;
GO

/*
    Confirma que la base responde y devuelve su versión: el último script aplicado por
    deploy.ps1 y cuántos hay. La API no tiene permisos sobre el esquema Despliegue; lo lee
    este SP por ownership chaining (ambos esquemas son de dbo). Público: no expone datos del
    negocio ni requiere sesión.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Sistema_Estado
AS
BEGIN
    SET NOCOUNT ON;

    SELECT DB_NAME() AS BaseDatos,
           (SELECT COUNT(*) FROM Despliegue.VersionEsquema) AS ScriptsAplicados,
           u.Script AS UltimoScript,
           u.FechaAplicacion AS FechaUltimoScript,
           CAST(SYSUTCDATETIME() AS DATETIME2(3)) AS FechaServidor
    FROM (SELECT 1 AS Uno) AS x
    OUTER APPLY (SELECT TOP (1) v.Script, v.FechaAplicacion
                 FROM Despliegue.VersionEsquema AS v
                 ORDER BY v.FechaAplicacion DESC, v.IDVersionEsquema DESC) AS u;
END;
GO
