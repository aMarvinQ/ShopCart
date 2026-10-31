/*
    021_Integridad_Semillas.sql
    Se ejecuta conectado como shopcart_migrator (deploy.ps1 -Probar).
    Verifica que los datos semilla de los que depende el código estén completos y sean
    válidos: un despliegue con una semilla incompleta fallaría en tiempo de ejecución
    (CONFIGURACION_INCOMPLETA), aquí falla antes.
    Solo lectura: no modifica datos.
*/
:on error exit
SET NOCOUNT ON;

DECLARE @Pruebas TABLE (Orden INT IDENTITY, Descripcion NVARCHAR(300), Esperado NVARCHAR(MAX), Obtenido NVARCHAR(MAX));

/* --- Catálogos fijos ---------------------------------------------------------------------- */
INSERT INTO @Pruebas (Descripcion, Esperado, Obtenido)
SELECT N'Roles', N'1:CLIENTE,2:OPERADOR,3:ADMIN',
       (SELECT STRING_AGG(CONCAT(IDRol, ':', Codigo), ',') WITHIN GROUP (ORDER BY IDRol) FROM dbo.Rol);

-- Código:inicial/final/cuenta como venta, en orden.
INSERT INTO @Pruebas (Descripcion, Esperado, Obtenido)
SELECT N'Estados del pedido (inicial, final, cuenta como venta)',
       N'PAGADO:101,EN_PREPARACION:001,ENVIADO:001,ENTREGADO:001,CANCELADO:010,DEVUELTO_PARCIAL:001,DEVUELTO:010',
       (SELECT STRING_AGG(CONCAT(Codigo, ':', CAST(EsInicial AS CHAR(1)), CAST(EsFinal AS CHAR(1)), CAST(CuentaComoVenta AS CHAR(1))), ',')
               WITHIN GROUP (ORDER BY Orden)
        FROM dbo.EstadoPedido);

INSERT INTO @Pruebas (Descripcion, Esperado, Obtenido)
SELECT N'Transiciones (cliente solo cancela desde PAGADO)',
       N'PAGADO>CANCELADO*,PAGADO>EN_PREPARACION,EN_PREPARACION>CANCELADO,EN_PREPARACION>ENVIADO,ENVIADO>ENTREGADO,'
       + N'ENTREGADO>DEVUELTO,ENTREGADO>DEVUELTO_PARCIAL,DEVUELTO_PARCIAL>DEVUELTO',
       (SELECT STRING_AGG(CONCAT(o.Codigo, '>', d.Codigo, CASE WHEN t.PermiteCliente = 1 THEN '*' END), ',')
               WITHIN GROUP (ORDER BY o.Orden, d.Codigo)
        FROM dbo.TransicionEstadoPedido AS t
        JOIN dbo.EstadoPedido AS o ON o.IDEstadoPedido = t.IDEstadoOrigen
        JOIN dbo.EstadoPedido AS d ON d.IDEstadoPedido = t.IDEstadoDestino);

-- Código:signo:requiere motivo:manual.
INSERT INTO @Pruebas (Descripcion, Esperado, Obtenido)
SELECT N'Tipos de movimiento (signo, motivo, manual)',
       N'INVENTARIO_INICIAL:1:0:0,ENTRADA_COMPRA:1:0:1,AJUSTE_ENTRADA:1:1:1,AJUSTE_SALIDA:-1:1:1,SALIDA_VENTA:-1:0:0,'
       + N'CANCELACION:1:0:0,DEVOLUCION:1:0:0',
       (SELECT STRING_AGG(CONCAT(Codigo, ':', Signo, ':', CAST(RequiereMotivo AS CHAR(1)), ':', CAST(PermiteRegistroManual AS CHAR(1))), ',')
               WITHIN GROUP (ORDER BY IDTipoMovimiento)
        FROM dbo.TipoMovimiento);

/* --- Parámetros ----------------------------------------------------------------------------- */
INSERT INTO @Pruebas (Descripcion, Esperado, Obtenido)
SELECT N'Parámetros: los 9 existen, los numéricos tienen rango y su valor está dentro',
       N'9|9|0',
       CONCAT((SELECT COUNT(*) FROM dbo.Parametro
               WHERE Clave IN ('MINUTOS_RESERVA', 'HORAS_CARRITO_ABANDONADO', 'TASA_IVA', 'SESION_DIAS_INACTIVIDAD', 'SESION_DIAS_MAXIMO',
                               'SESION_SEGUNDOS_GRACIA', 'MAXIMO_UNIDADES_POR_LINEA', 'DIAS_DEVOLUCION', 'EXISTENCIA_MINIMA')), '|',
              (SELECT COUNT(*) FROM dbo.Parametro WHERE TipoDato <> 'TEXTO' AND ValorMinimo IS NOT NULL), '|',
              (SELECT COUNT(*) FROM dbo.Parametro
               WHERE TipoDato <> 'TEXTO' AND NOT TRY_CAST(Valor AS DECIMAL(18, 6)) BETWEEN ValorMinimo AND ValorMaximo));

-- Cada función que lee parámetros obtiene un valor válido (NULL = configuración incompleta).
INSERT INTO @Pruebas (Descripcion, Esperado, Obtenido)
SELECT N'Las funciones de configuración leen valores válidos',
       N'reserva 15|carrito 10|devolución 30|abandonado 24, mínima 5|sesión 7, 30, 30|IVA 0.120000',
       CONCAT(N'reserva ', (SELECT MinutosReserva FROM dbo.FU_Checkout_Configuracion()),
              N'|carrito ', (SELECT MaximoPorLinea FROM dbo.FU_Carrito_Configuracion()),
              N'|devolución ', (SELECT DiasDevolucion FROM dbo.FU_Devoluciones_Configuracion()),
              N'|abandonado ', (SELECT CONCAT(HorasCarritoAbandonado, N', mínima ', ExistenciaMinima) FROM dbo.FU_Reportes_Configuracion()),
              N'|sesión ', (SELECT CONCAT(DiasInactividad, N', ', DiasMaximo, N', ', SegundosGracia) FROM dbo.FU_Seguridad_ParametrosSesion()),
              N'|IVA ', (SELECT TasaIVA FROM dbo.FU_Pedidos_DesgloseIVA(112.00)));

/* --- Departamentos y municipios ------------------------------------------------------------- */
-- Municipios por departamento según el INE (suman 340).
INSERT INTO @Pruebas (Descripcion, Esperado, Obtenido)
SELECT N'22 departamentos y 340 municipios, con el número de municipios de cada uno',
       N'22|340|1:17,2:8,3:16,4:16,5:14,6:14,7:19,8:8,9:24,10:21,11:9,12:30,13:33,14:21,15:8,16:17,17:14,18:5,19:11,20:11,21:7,22:17',
       CONCAT((SELECT COUNT(*) FROM dbo.Departamento), '|', (SELECT COUNT(*) FROM dbo.Municipio), '|',
              (SELECT STRING_AGG(CONCAT(d.IDDepartamento, ':', d.Municipios), ',') WITHIN GROUP (ORDER BY d.IDDepartamento)
               FROM (SELECT IDDepartamento, COUNT(*) AS Municipios FROM dbo.Municipio GROUP BY IDDepartamento) AS d));

-- El código INE de un municipio empieza con el de su departamento (0108 Mixco → 1).
INSERT INTO @Pruebas (Descripcion, Esperado, Obtenido)
SELECT N'El código de cada municipio corresponde a su departamento', N'0|Mixco:Guatemala|Petatán:Huehuetenango',
       CONCAT((SELECT COUNT(*) FROM dbo.Municipio WHERE IDMunicipio / 100 <> IDDepartamento), '|',
              (SELECT CONCAT(m.Nombre, ':', d.Nombre) FROM dbo.Municipio AS m JOIN dbo.Departamento AS d ON d.IDDepartamento = m.IDDepartamento
               WHERE m.IDMunicipio = 108), '|',
              (SELECT CONCAT(m.Nombre, ':', d.Nombre) FROM dbo.Municipio AS m JOIN dbo.Departamento AS d ON d.IDDepartamento = m.IDDepartamento
               WHERE m.IDMunicipio = 1333));

/* --- Usuario de sistema --------------------------------------------------------------------- */
INSERT INTO @Pruebas (Descripcion, Esperado, Obtenido)
SELECT N'Un único usuario de sistema, sin contraseña y que no actúa como usuario', N'1|sin contraseña|no es actor',
       CONCAT((SELECT COUNT(*) FROM dbo.Usuario WHERE EsSistema = 1), '|',
              (SELECT CASE WHEN COUNT(*) = 0 THEN N'sin contraseña' END FROM dbo.Usuario WHERE EsSistema = 1 AND HashContrasena IS NOT NULL), '|',
              (SELECT CASE WHEN COUNT(*) = 0 THEN N'no es actor' END
               FROM dbo.Usuario AS u CROSS APPLY dbo.FU_Seguridad_Actor(u.IDUsuario) AS a WHERE u.EsSistema = 1));

/* --- Resultado ------------------------------------------------------------------------------ */
DECLARE @Fallas INT = (SELECT COUNT(*) FROM @Pruebas WHERE ISNULL(Esperado, N'') COLLATE Latin1_General_100_BIN2 <> ISNULL(Obtenido, N'(NULL)'));

DECLARE @Orden INT = 1, @Linea NVARCHAR(MAX);
WHILE @Orden <= (SELECT MAX(Orden) FROM @Pruebas)
BEGIN
    SELECT @Linea = CASE WHEN ISNULL(Esperado, N'') COLLATE Latin1_General_100_BIN2 = ISNULL(Obtenido, N'(NULL)')
                         THEN N'OK     ' + Descripcion
                         ELSE N'FALLA  ' + Descripcion + N': esperado ' + Esperado + N', obtenido ' + ISNULL(Obtenido, N'(NULL)') END
    FROM @Pruebas WHERE Orden = @Orden;
    PRINT @Linea;
    SET @Orden += 1;
END;

IF @Fallas > 0
    THROW 50000, N'Pruebas de datos semilla fallidas.', 1;
GO
