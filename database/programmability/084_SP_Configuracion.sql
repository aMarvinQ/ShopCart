/*
    084_SP_Configuracion.sql
    Parámetros del sistema (D20), solo para el administrador:
    - Listar y obtener los parámetros con su rango.
    - Editar el VALOR de un parámetro existente. Las claves, el tipo, la descripción y el rango
      solo los carga la semilla: el código depende de ellos.

    - Cada parámetro numérico tiene su rango en la tabla (D51), que también lo garantiza con
      CK_Parametro_ValorEnRango. Un parámetro numérico sin rango no se puede editar: indica una
      semilla incompleta.
    - La vigencia de una sesión no puede ser menor que su inactividad (D52).
    - Un cambio aplica de inmediato (D55): las funciones leen Parametro en cada consulta. Un
      nuevo IVA solo afecta a los pedidos siguientes; cada pedido guarda el suyo (D53).
    - Guardar el mismo valor no modifica nada ni escribe en la bitácora (D54). Los cambios
      quedan en Bitacora (CONFIGURACION) con el valor anterior y el nuevo.
    Errores: ver docs/errores.md.
*/
:on error exit
SET NOCOUNT ON;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Configuracion_ObtenerParametro
    @IDUsuarioAccion INT,
    @Clave           VARCHAR(51)
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar los parámetros.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.Parametro AS p WHERE p.Clave = @Clave)
        THROW 50118, N'PARAMETRO_NO_ENCONTRADO: el parámetro no existe.', 1;

    SELECT p.IDParametro, p.Clave, p.Valor, p.TipoDato, p.Descripcion, p.ValorMinimo, p.ValorMaximo, p.FechaModificacion, p.VersionFila
    FROM dbo.Parametro AS p
    WHERE p.Clave = @Clave;
END;
GO

/* Todos los parámetros. Sin paginación: son pocos. */
CREATE OR ALTER PROCEDURE dbo.SP_Configuracion_ListarParametros
    @IDUsuarioAccion INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar los parámetros.', 1;

    SELECT p.IDParametro, p.Clave, p.Valor, p.TipoDato, p.Descripcion, p.ValorMinimo, p.ValorMaximo, p.FechaModificacion, p.VersionFila
    FROM dbo.Parametro AS p
    ORDER BY p.Clave;
END;
GO

/*
    El valor llega como texto. Los numéricos se guardan normalizados ("07" → "7", "0.120" →
    "0.12") y se comparan por su valor numérico; los decimales admiten hasta 6 cifras
    decimales (las que guarda el rango) en lugar de redondear sin avisar.
    Los dos parámetros de vigencia de sesión se bloquean juntos: dos administradores que
    editan uno cada uno a la vez no pueden dejar la vigencia menor que la inactividad.
*/
CREATE OR ALTER PROCEDURE dbo.SP_Configuracion_ActualizarParametro
    @IDUsuarioAccion INT,
    @Clave           VARCHAR(51),
    @Valor           NVARCHAR(201),
    @VersionFila     BINARY(8)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @TipoDato VARCHAR(10), @ValorActual NVARCHAR(200), @ValorMinimo DECIMAL(18, 6), @ValorMaximo DECIMAL(18, 6),
            @VersionActual BINARY(8), @Numero DECIMAL(18, 6), @DiasInactividad INT, @DiasMaximo INT, @Bloqueados INT,
            @Mensaje NVARCHAR(400);

    IF NULLIF(TRIM(@Clave), '') IS NULL OR @VersionFila IS NULL
        THROW 50006, N'PARAMETRO_REQUERIDO: se requiere la clave del parámetro y su versión.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.FU_Seguridad_Actor(@IDUsuarioAccion) AS a WHERE a.CodigoRol = 'ADMIN')
        THROW 50201, N'PERMISO_DENEGADO: solo un administrador activo puede administrar los parámetros.', 1;

    SELECT @Clave = TRIM(@Clave), @Valor = TRIM(ISNULL(@Valor, N''));

    BEGIN TRY
        EXEC sys.sp_set_session_context @key = N'IDUsuario', @value = @IDUsuarioAccion;

        BEGIN TRANSACTION;

        -- Los dos de sesión se bloquean en una sola sentencia (mismo orden siempre): bloquear
        -- uno y después el otro podría causar un deadlock entre dos ediciones simultáneas.
        IF @Clave IN ('SESION_DIAS_INACTIVIDAD', 'SESION_DIAS_MAXIMO')
            SELECT @Bloqueados = COUNT(*)
            FROM dbo.Parametro AS p WITH (UPDLOCK, HOLDLOCK)
            WHERE p.Clave IN ('SESION_DIAS_INACTIVIDAD', 'SESION_DIAS_MAXIMO');

        SELECT @TipoDato = p.TipoDato, @ValorActual = p.Valor, @ValorMinimo = p.ValorMinimo, @ValorMaximo = p.ValorMaximo,
               @VersionActual = p.VersionFila
        FROM dbo.Parametro AS p WITH (UPDLOCK, HOLDLOCK)
        WHERE p.Clave = @Clave;

        IF @VersionActual IS NULL
            THROW 50118, N'PARAMETRO_NO_ENCONTRADO: el parámetro no existe.', 1;
        IF @VersionActual <> @VersionFila
            THROW 51203, N'EDICION_CONCURRENTE: otro usuario modificó el registro; vuelva a cargarlo.', 1;

        IF @TipoDato = 'TEXTO'
        BEGIN
            IF LEN(@Valor) NOT BETWEEN 1 AND 200
                THROW 50041, N'VALOR_PARAMETRO_INVALIDO: el valor es obligatorio y admite hasta 200 caracteres.', 1;
        END
        ELSE
        BEGIN
            IF @ValorMinimo IS NULL
            BEGIN
                SET @Mensaje = CONCAT(N'CONFIGURACION_INCOMPLETA: el parámetro ', @Clave, N' no tiene rango válido.');
                THROW 59001, @Mensaje, 1;
            END;

            SET @Numero = CASE @TipoDato WHEN 'ENTERO' THEN TRY_CAST(@Valor AS INT)
                                         ELSE TRY_CAST(@Valor AS DECIMAL(18, 6)) END;
            -- TRY_CAST convierte '', '+' o '-' en 0: se exige al menos un dígito y solo dígitos, punto y
            -- signo menos (BIN2: en la intercalación de la BD, '²' o '½' cuentan como dígitos).
            IF @Numero IS NULL OR @Valor NOT LIKE N'%[0-9]%' OR @Valor COLLATE Latin1_General_100_BIN2 LIKE N'%[^-0-9.]%'
               OR @Valor LIKE N'%.[0-9][0-9][0-9][0-9][0-9][0-9][0-9]%' OR @Numero NOT BETWEEN @ValorMinimo AND @ValorMaximo
            BEGIN
                SET @Mensaje = CONCAT(N'VALOR_PARAMETRO_INVALIDO: ', @Clave, N' debe ser ',
                                      CASE @TipoDato WHEN 'ENTERO' THEN N'un número entero' ELSE N'un número con hasta 6 decimales' END,
                                      N' entre ', FORMAT(@ValorMinimo, N'0.######', 'en-US'), N' y ',
                                      FORMAT(@ValorMaximo, N'0.######', 'en-US'), N'.');
                THROW 50041, @Mensaje, 1;
            END;

            -- Formato fijo con punto decimal y sin notación científica, convertible de vuelta.
            SET @Valor = FORMAT(@Numero, N'0.######', 'en-US');
        END;

        IF @Clave IN ('SESION_DIAS_INACTIVIDAD', 'SESION_DIAS_MAXIMO')
        BEGIN
            -- El que se edita con su valor nuevo; el otro, con el guardado.
            SELECT @DiasInactividad = TRY_CAST(CASE WHEN @Clave = 'SESION_DIAS_INACTIVIDAD' THEN @Valor
                                                    ELSE (SELECT p.Valor FROM dbo.Parametro AS p WHERE p.Clave = 'SESION_DIAS_INACTIVIDAD') END AS INT),
                   @DiasMaximo = TRY_CAST(CASE WHEN @Clave = 'SESION_DIAS_MAXIMO' THEN @Valor
                                               ELSE (SELECT p.Valor FROM dbo.Parametro AS p WHERE p.Clave = 'SESION_DIAS_MAXIMO') END AS INT);

            IF @DiasMaximo < @DiasInactividad
            BEGIN
                SET @Mensaje = CONCAT(N'PARAMETROS_INCOHERENTES: la vigencia máxima de la sesión (', @DiasMaximo,
                                      N' días) no puede ser menor que los días de inactividad (', @DiasInactividad, N').');
                THROW 51801, @Mensaje, 1;
            END;
        END;

        IF (@TipoDato = 'TEXTO' AND @Valor COLLATE Latin1_General_100_BIN2 <> @ValorActual)
           OR (@TipoDato <> 'TEXTO' AND @Numero <> TRY_CAST(@ValorActual AS DECIMAL(18, 6)))
        BEGIN
            UPDATE dbo.Parametro SET Valor = @Valor, FechaModificacion = SYSUTCDATETIME() WHERE Clave = @Clave;

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioAccion, 'CONFIGURACION', 'Parametro', @Clave, 'MODIFICAR',
                    (SELECT @ValorActual AS Valor FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                    (SELECT @Valor AS Valor FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    EXEC dbo.SP_Configuracion_ObtenerParametro @IDUsuarioAccion = @IDUsuarioAccion, @Clave = @Clave;
END;
GO
