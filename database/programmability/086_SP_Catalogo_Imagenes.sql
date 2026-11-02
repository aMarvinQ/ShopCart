/*
    086_SP_Catalogo_Imagenes.sql
    Limpieza de archivos de imagen huérfanos. La API sube los archivos antes de asociarlos a un
    producto (subida en dos pasos); un archivo que nunca se asoció queda sin uso. Un proceso de
    la API pregunta cuáles de sus archivos están en uso y borra los demás.
    Errores: ver docs/errores.md.
*/
:on error exit
SET NOCOUNT ON;
GO

/*
    Recibe rutas en un arreglo JSON (["/uploads/productos/a.webp", ...], hasta 1000) y devuelve
    las que alguna imagen de producto usa. Lo llama un proceso interno de la API (no hay actor):
    solo revela si una ruta existe, no datos del negocio.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_FiltrarImagenesEnUso
    @Rutas NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF @Rutas IS NULL OR ISJSON(@Rutas) = 0 OR LEFT(LTRIM(@Rutas), 1) <> N'['
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere un arreglo JSON de rutas.', 1;
    IF (SELECT COUNT(*) FROM OPENJSON(@Rutas)) > 1000
        THROW 50006, N'PARAMETRO_REQUERIDO: se admiten hasta 1000 rutas por consulta.', 1;

    SELECT DISTINCT pi.RutaImagen
    FROM OPENJSON(@Rutas) AS r
    JOIN dbo.ProductoImagen AS pi ON pi.RutaImagen = CAST(r.value AS NVARCHAR(500))
    WHERE r.type = 1;
END;
GO
