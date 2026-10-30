/*
    021_Tipos_Tabla_Catalogo.sql
    Tipos tabla adicionales del catálogo (mismo criterio que 019: solo estructura; las reglas
    las valida el SP).
*/
:on error exit
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
GO

/*
    Atributos de una categoría con su orden en los selectores de la tienda. Representa la lista
    completa: el SP agrega los nuevos, actualiza el orden y quita los que ya no vienen.
*/
CREATE TYPE dbo.TT_Catalogo_CategoriaAtributo AS TABLE
(
    IDAtributo INT     NOT NULL PRIMARY KEY,
    Orden      TINYINT NOT NULL
);
GO

COMMIT TRANSACTION;
GO
