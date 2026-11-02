/*
    110_Seed_Demo.sql
    Datos de demostración (D56–D59): usuarios, catálogo, envíos, cupones, clientes con sus
    direcciones, unos 6 meses de pedidos y carritos abandonados. Requiere 100_Seed_Catalogos.

    Cómo se generan
    - Todo se crea con los MISMOS stored procedures que usa la API (registro, catálogo,
      carrito → checkout → pago → estados → cancelaciones → devoluciones, inventario,
      precios). Así cumplen cada regla: existencias y kardex, cupones, historial de estados,
      bitácora. La única excepción es el primer administrador: crear un usuario interno exige
      un administrador, así que se inserta directamente (y se registra en la bitácora).
    - Historial con fechas reales (D56): los SPs fechan todo con la hora actual. La semilla
      ejecuta los eventos en el orden de su fecha simulada y, antes de cada uno, anota en
      #Reloj la hora real y la simulada. Al final traslada cada fecha de los registros creados
      al tramo simulado que le corresponde, con la inmutabilidad desactivada solo dentro de la
      transacción de esta semilla. Así un pedido de hace 3 meses tiene su pago, historial,
      kardex y bitácora de hace 3 meses, en el orden en que ocurrieron.
    - Reproducible: las decisiones "al azar" salen de un generador con semilla fija; las fechas
      son relativas al día del despliegue (los últimos 200 días).
    - Los SPs devuelven resultados para la API; aquí se descartan (:out NUL). Los errores se
      siguen mostrando y detienen la semilla, que se revierte completa.

    Credenciales de prueba: ver README (sección "Credenciales de prueba").
*/
:on error exit
:out NUL
:error STDERR
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
GO

/* =========================================================================================
   Definiciones
   ========================================================================================= */

-- Atributos y sus valores (Orden = orden de los selectores en la tienda).
CREATE TABLE #DefValor
(
    Atributo NVARCHAR(50) COLLATE DATABASE_DEFAULT,
    Valor NVARCHAR(50) COLLATE DATABASE_DEFAULT,
    CodigoHex VARCHAR(7) COLLATE DATABASE_DEFAULT,
    Orden INT
);
INSERT INTO #DefValor (Atributo, Valor, CodigoHex, Orden) VALUES
    (N'Color', N'Negro', '#1F1F1F', 1),
    (N'Color', N'Blanco', '#F5F5F5', 2),
    (N'Color', N'Gris', '#8E8E8E', 3),
    (N'Color', N'Azul', '#1F4E9C', 4),
    (N'Color', N'Rojo', '#C0392B', 5),
    (N'Color', N'Verde', '#2E7D32', 6),
    (N'Talla', N'S', NULL, 1),
    (N'Talla', N'M', NULL, 2),
    (N'Talla', N'L', NULL, 3),
    (N'Talla', N'XL', NULL, 4),
    (N'Número', N'39', NULL, 1),
    (N'Número', N'40', NULL, 2),
    (N'Número', N'41', NULL, 3),
    (N'Número', N'42', NULL, 4),
    (N'Almacenamiento', N'512 GB', NULL, 1),
    (N'Almacenamiento', N'1 TB', NULL, 2);

-- Atributos de cada categoría, en el orden de sus selectores.
CREATE TABLE #DefCategoria
(
    Slug VARCHAR(120) COLLATE DATABASE_DEFAULT,
    Nombre NVARCHAR(100) COLLATE DATABASE_DEFAULT,
    Descripcion NVARCHAR(500) COLLATE DATABASE_DEFAULT,
    Atributos NVARCHAR(200) COLLATE DATABASE_DEFAULT
);
INSERT INTO #DefCategoria (Slug, Nombre, Descripcion, Atributos) VALUES
    (N'ropa', N'Ropa', N'Playeras, sudaderos, pantalones y accesorios de vestir.', N'Color,Talla'),
    (N'calzado', N'Calzado', N'Tenis y sandalias para todos los días.', N'Color,Número'),
    (N'consolas-y-videojuegos', N'Consolas y videojuegos', N'Consolas, controles y videojuegos.', N'Color,Almacenamiento'),
    (N'tecnologia', N'Tecnología', N'Audio, cargadores y accesorios para tus dispositivos.', N'Color'),
    (N'bebidas', N'Bebidas', N'Agua, café y bebidas para el día.', NULL),
    (N'hogar', N'Hogar', N'Termos, tazas e iluminación para casa y oficina.', N'Color');

-- Popularidad: peso relativo de cada producto al armar los pedidos (0 = no se vende).
CREATE TABLE #DefProducto
(
    Slug VARCHAR(220) COLLATE DATABASE_DEFAULT,
    Categoria VARCHAR(120) COLLATE DATABASE_DEFAULT,
    Nombre NVARCHAR(200) COLLATE DATABASE_DEFAULT,
    Descripcion NVARCHAR(4000) COLLATE DATABASE_DEFAULT,
    Popularidad INT
);
INSERT INTO #DefProducto (Slug, Categoria, Nombre, Descripcion, Popularidad) VALUES
    (N'playera-basica', N'ropa', N'Playera básica', N'Playera de algodón peinado, corte regular y cuello redondo.', 9),
    (N'sudadero-con-capucha', N'ropa', N'Sudadero con capucha', N'Sudadero de felpa con capucha ajustable y bolsa frontal.', 5),
    (N'camisa-polo', N'ropa', N'Camisa polo', N'Camisa polo de piqué con dos botones.', 5),
    (N'pantalon-jogger', N'ropa', N'Pantalón jogger', N'Pantalón jogger con puños elásticos y bolsas laterales.', 4),
    (N'gorra-ajustable', N'ropa', N'Gorra ajustable', N'Gorra de seis paneles con cierre ajustable.', 4),
    (N'calcetines-deportivos-3-pares', N'ropa', N'Calcetines deportivos (3 pares)', N'Paquete de tres pares de calcetines acolchados.', 4),
    (N'tenis-para-correr', N'calzado', N'Tenis para correr', N'Tenis ligeros con suela amortiguada para correr y entrenar.', 6),
    (N'sandalias-de-playa', N'calzado', N'Sandalias de playa', N'Sandalias de hule con plantilla suave.', 3),
    (N'consola-novaplay', N'consolas-y-videojuegos', N'Consola NovaPlay', N'Consola de videojuegos 4K con control incluido.', 3),
    (N'control-inalambrico-novaplay', N'consolas-y-videojuegos', N'Control inalámbrico NovaPlay', N'Control inalámbrico con batería recargable.', 5),
    (N'galaxia-rally', N'consolas-y-videojuegos', N'Galaxia Rally', N'Videojuego de carreras espaciales para NovaPlay.', 4),
    (N'reino-de-bloques', N'consolas-y-videojuegos', N'Reino de Bloques', N'Videojuego de construcción y aventura para NovaPlay.', 4),
    (N'futbol-total-26', N'consolas-y-videojuegos', N'Fútbol Total 26', N'Videojuego de fútbol con ligas de todo el mundo para NovaPlay.', 5),
    (N'audifonos-inalambricos', N'tecnologia', N'Audífonos inalámbricos', N'Audífonos Bluetooth con cancelación de ruido y 30 horas de batería.', 6),
    (N'bocina-bluetooth-portatil', N'tecnologia', N'Bocina Bluetooth portátil', N'Bocina resistente al agua con 12 horas de batería.', 4),
    (N'mouse-inalambrico', N'tecnologia', N'Mouse inalámbrico', N'Mouse ergonómico inalámbrico de 1600 DPI.', 5),
    (N'cargador-usb-c-30-w', N'tecnologia', N'Cargador USB-C 30 W', N'Cargador de pared con carga rápida USB-C.', 5),
    (N'bateria-portatil-10-000-mah', N'tecnologia', N'Batería portátil 10 000 mAh', N'Batería externa con dos puertos USB.', 4),
    (N'teclado-mecanico', N'tecnologia', N'Teclado mecánico', N'Teclado mecánico compacto con iluminación.', 3),
    (N'bocina-retro', N'tecnologia', N'Bocina retro', N'Bocina de estilo retro con radio FM (descontinuada).', 0),
    (N'agua-pura-500-ml', N'bebidas', N'Agua pura 500 ml', N'Agua purificada en botella de 500 ml.', 4),
    (N'agua-pura-1-l', N'bebidas', N'Agua pura 1 L', N'Agua purificada en botella de 1 litro.', 3),
    (N'cafe-molido-454-g', N'bebidas', N'Café molido 454 g', N'Café guatemalteco de altura, tostado medio.', 4),
    (N'bebida-isotonica-600-ml', N'bebidas', N'Bebida isotónica 600 ml', N'Bebida hidratante sabor limón.', 3),
    (N'te-verde-500-ml', N'bebidas', N'Té verde 500 ml', N'Té verde listo para tomar, sin azúcar.', 2),
    (N'termo-de-acero-750-ml', N'hogar', N'Termo de acero 750 ml', N'Termo de doble pared que conserva la temperatura 12 horas.', 4),
    (N'taza-de-ceramica-350-ml', N'hogar', N'Taza de cerámica 350 ml', N'Taza de cerámica apta para microondas.', 3),
    (N'lampara-de-escritorio-led', N'hogar', N'Lámpara de escritorio LED', N'Lámpara LED con brazo flexible y tres tonos de luz.', 3);

/*
    Especial = 1: existencia fija para la demostración (no se vende en el historial):
    PLA-NEG-S agotada (es la primera combinación de la playera: la tienda debe saltar a la
    siguiente disponible); TEN-BLA-42, TER-VER y CTL-ROJ con existencia baja.
*/
CREATE TABLE #DefVariante
(
    Producto VARCHAR(220) COLLATE DATABASE_DEFAULT,
    SKU VARCHAR(50) COLLATE DATABASE_DEFAULT,
    Precio DECIMAL(12, 2),
    Existencia INT,
    Color NVARCHAR(50) COLLATE DATABASE_DEFAULT,
    Atributo2 NVARCHAR(50) COLLATE DATABASE_DEFAULT,
    Valor2 NVARCHAR(50) COLLATE DATABASE_DEFAULT,
    Especial BIT
);
INSERT INTO #DefVariante (Producto, SKU, Precio, Existencia, Color, Atributo2, Valor2, Especial) VALUES
    (N'playera-basica', 'PLA-NEG-S', 89.00, 0, N'Negro', N'Talla', N'S', 1),
    (N'playera-basica', 'PLA-NEG-M', 89.00, 27, N'Negro', N'Talla', N'M', 0),
    (N'playera-basica', 'PLA-NEG-L', 89.00, 37, N'Negro', N'Talla', N'L', 0),
    (N'playera-basica', 'PLA-NEG-XL', 89.00, 45, N'Negro', N'Talla', N'XL', 0),
    (N'playera-basica', 'PLA-BLA-S', 89.00, 45, N'Blanco', N'Talla', N'S', 0),
    (N'playera-basica', 'PLA-BLA-M', 89.00, 30, N'Blanco', N'Talla', N'M', 0),
    (N'playera-basica', 'PLA-BLA-L', 89.00, 28, N'Blanco', N'Talla', N'L', 0),
    (N'playera-basica', 'PLA-BLA-XL', 89.00, 38, N'Blanco', N'Talla', N'XL', 0),
    (N'playera-basica', 'PLA-AZU-S', 89.00, 26, N'Azul', N'Talla', N'S', 0),
    (N'playera-basica', 'PLA-AZU-M', 89.00, 45, N'Azul', N'Talla', N'M', 0),
    (N'playera-basica', 'PLA-AZU-L', 89.00, 31, N'Azul', N'Talla', N'L', 0),
    (N'playera-basica', 'PLA-AZU-XL', 89.00, 37, N'Azul', N'Talla', N'XL', 0),
    (N'sudadero-con-capucha', 'SUD-GRI-S', 249.00, 41, N'Gris', N'Talla', N'S', 0),
    (N'sudadero-con-capucha', 'SUD-GRI-M', 249.00, 44, N'Gris', N'Talla', N'M', 0),
    (N'sudadero-con-capucha', 'SUD-GRI-L', 249.00, 39, N'Gris', N'Talla', N'L', 0),
    (N'sudadero-con-capucha', 'SUD-GRI-XL', 249.00, 31, N'Gris', N'Talla', N'XL', 0),
    (N'sudadero-con-capucha', 'SUD-NEG-S', 249.00, 44, N'Negro', N'Talla', N'S', 0),
    (N'sudadero-con-capucha', 'SUD-NEG-M', 249.00, 30, N'Negro', N'Talla', N'M', 0),
    (N'sudadero-con-capucha', 'SUD-NEG-L', 249.00, 42, N'Negro', N'Talla', N'L', 0),
    (N'sudadero-con-capucha', 'SUD-NEG-XL', 249.00, 38, N'Negro', N'Talla', N'XL', 0),
    (N'camisa-polo', 'POL-BLA-S', 159.00, 43, N'Blanco', N'Talla', N'S', 0),
    (N'camisa-polo', 'POL-BLA-M', 159.00, 39, N'Blanco', N'Talla', N'M', 0),
    (N'camisa-polo', 'POL-BLA-L', 159.00, 43, N'Blanco', N'Talla', N'L', 0),
    (N'camisa-polo', 'POL-BLA-XL', 159.00, 35, N'Blanco', N'Talla', N'XL', 0),
    (N'camisa-polo', 'POL-AZU-S', 159.00, 31, N'Azul', N'Talla', N'S', 0),
    (N'camisa-polo', 'POL-AZU-M', 159.00, 42, N'Azul', N'Talla', N'M', 0),
    (N'camisa-polo', 'POL-AZU-L', 159.00, 41, N'Azul', N'Talla', N'L', 0),
    (N'camisa-polo', 'POL-AZU-XL', 159.00, 26, N'Azul', N'Talla', N'XL', 0),
    (N'camisa-polo', 'POL-ROJ-S', 159.00, 45, N'Rojo', N'Talla', N'S', 0),
    (N'camisa-polo', 'POL-ROJ-M', 159.00, 27, N'Rojo', N'Talla', N'M', 0),
    (N'camisa-polo', 'POL-ROJ-L', 159.00, 28, N'Rojo', N'Talla', N'L', 0),
    (N'camisa-polo', 'POL-ROJ-XL', 159.00, 45, N'Rojo', N'Talla', N'XL', 0),
    (N'pantalon-jogger', 'JOG-NEG-S', 219.00, 27, N'Negro', N'Talla', N'S', 0),
    (N'pantalon-jogger', 'JOG-NEG-M', 219.00, 41, N'Negro', N'Talla', N'M', 0),
    (N'pantalon-jogger', 'JOG-NEG-L', 219.00, 42, N'Negro', N'Talla', N'L', 0),
    (N'pantalon-jogger', 'JOG-NEG-XL', 219.00, 25, N'Negro', N'Talla', N'XL', 0),
    (N'pantalon-jogger', 'JOG-GRI-S', 219.00, 25, N'Gris', N'Talla', N'S', 0),
    (N'pantalon-jogger', 'JOG-GRI-M', 219.00, 39, N'Gris', N'Talla', N'M', 0),
    (N'pantalon-jogger', 'JOG-GRI-L', 219.00, 36, N'Gris', N'Talla', N'L', 0),
    (N'pantalon-jogger', 'JOG-GRI-XL', 219.00, 43, N'Gris', N'Talla', N'XL', 0),
    (N'gorra-ajustable', 'GOR-NEG', 99.00, 42, N'Negro', NULL, NULL, 0),
    (N'gorra-ajustable', 'GOR-AZU', 99.00, 27, N'Azul', NULL, NULL, 0),
    (N'calcetines-deportivos-3-pares', 'CAL', 59.00, 38, NULL, NULL, NULL, 0),
    (N'tenis-para-correr', 'TEN-NEG-39', 549.00, 45, N'Negro', N'Número', N'39', 0),
    (N'tenis-para-correr', 'TEN-NEG-40', 549.00, 44, N'Negro', N'Número', N'40', 0),
    (N'tenis-para-correr', 'TEN-NEG-41', 549.00, 28, N'Negro', N'Número', N'41', 0),
    (N'tenis-para-correr', 'TEN-NEG-42', 549.00, 32, N'Negro', N'Número', N'42', 0),
    (N'tenis-para-correr', 'TEN-BLA-39', 549.00, 41, N'Blanco', N'Número', N'39', 0),
    (N'tenis-para-correr', 'TEN-BLA-40', 549.00, 44, N'Blanco', N'Número', N'40', 0),
    (N'tenis-para-correr', 'TEN-BLA-41', 549.00, 28, N'Blanco', N'Número', N'41', 0),
    (N'tenis-para-correr', 'TEN-BLA-42', 549.00, 3, N'Blanco', N'Número', N'42', 1),
    (N'sandalias-de-playa', 'SAN-NEG-39', 149.00, 43, N'Negro', N'Número', N'39', 0),
    (N'sandalias-de-playa', 'SAN-NEG-40', 149.00, 41, N'Negro', N'Número', N'40', 0),
    (N'sandalias-de-playa', 'SAN-NEG-41', 149.00, 42, N'Negro', N'Número', N'41', 0),
    (N'sandalias-de-playa', 'SAN-NEG-42', 149.00, 38, N'Negro', N'Número', N'42', 0),
    (N'sandalias-de-playa', 'SAN-AZU-39', 149.00, 28, N'Azul', N'Número', N'39', 0),
    (N'sandalias-de-playa', 'SAN-AZU-40', 149.00, 34, N'Azul', N'Número', N'40', 0),
    (N'sandalias-de-playa', 'SAN-AZU-41', 149.00, 45, N'Azul', N'Número', N'41', 0),
    (N'sandalias-de-playa', 'SAN-AZU-42', 149.00, 45, N'Azul', N'Número', N'42', 0),
    (N'consola-novaplay', 'CON-NEG-512', 3999.00, 43, N'Negro', N'Almacenamiento', N'512 GB', 0),
    (N'consola-novaplay', 'CON-NEG-1TB', 4699.00, 30, N'Negro', N'Almacenamiento', N'1 TB', 0),
    (N'consola-novaplay', 'CON-BLA-512', 3999.00, 33, N'Blanco', N'Almacenamiento', N'512 GB', 0),
    (N'consola-novaplay', 'CON-BLA-1TB', 4699.00, 35, N'Blanco', N'Almacenamiento', N'1 TB', 0),
    (N'control-inalambrico-novaplay', 'CTL-NEG', 499.00, 28, N'Negro', NULL, NULL, 0),
    (N'control-inalambrico-novaplay', 'CTL-BLA', 499.00, 40, N'Blanco', NULL, NULL, 0),
    (N'control-inalambrico-novaplay', 'CTL-ROJ', 499.00, 2, N'Rojo', NULL, NULL, 1),
    (N'galaxia-rally', 'JGR', 449.00, 40, NULL, NULL, NULL, 0),
    (N'reino-de-bloques', 'JRB', 399.00, 30, NULL, NULL, NULL, 0),
    (N'futbol-total-26', 'JFT', 549.00, 36, NULL, NULL, NULL, 0),
    (N'audifonos-inalambricos', 'AUD-NEG', 399.00, 35, N'Negro', NULL, NULL, 0),
    (N'audifonos-inalambricos', 'AUD-BLA', 399.00, 41, N'Blanco', NULL, NULL, 0),
    (N'audifonos-inalambricos', 'AUD-AZU', 399.00, 38, N'Azul', NULL, NULL, 0),
    (N'bocina-bluetooth-portatil', 'BOC-NEG', 299.00, 29, N'Negro', NULL, NULL, 0),
    (N'bocina-bluetooth-portatil', 'BOC-ROJ', 299.00, 37, N'Rojo', NULL, NULL, 0),
    (N'mouse-inalambrico', 'MOU-NEG', 129.00, 27, N'Negro', NULL, NULL, 0),
    (N'mouse-inalambrico', 'MOU-GRI', 129.00, 32, N'Gris', NULL, NULL, 0),
    (N'cargador-usb-c-30-w', 'CAR', 149.00, 39, NULL, NULL, NULL, 0),
    (N'bateria-portatil-10-000-mah', 'BAT-NEG', 229.00, 38, N'Negro', NULL, NULL, 0),
    (N'bateria-portatil-10-000-mah', 'BAT-BLA', 229.00, 33, N'Blanco', NULL, NULL, 0),
    (N'teclado-mecanico', 'TEC', 599.00, 33, NULL, NULL, NULL, 0),
    (N'bocina-retro', 'BRE', 349.00, 25, NULL, NULL, NULL, 0),
    (N'agua-pura-500-ml', 'AGU-500', 5.00, 154, NULL, NULL, NULL, 0),
    (N'agua-pura-1-l', 'AGU-1L', 8.00, 158, NULL, NULL, NULL, 0),
    (N'cafe-molido-454-g', 'CAF', 65.00, 131, NULL, NULL, NULL, 0),
    (N'bebida-isotonica-600-ml', 'ISO', 12.00, 140, NULL, NULL, NULL, 0),
    (N'te-verde-500-ml', 'TEV', 10.00, 153, NULL, NULL, NULL, 0),
    (N'termo-de-acero-750-ml', 'TER-NEG', 149.00, 29, N'Negro', NULL, NULL, 0),
    (N'termo-de-acero-750-ml', 'TER-AZU', 149.00, 33, N'Azul', NULL, NULL, 0),
    (N'termo-de-acero-750-ml', 'TER-VER', 149.00, 4, N'Verde', NULL, NULL, 1),
    (N'taza-de-ceramica-350-ml', 'TAZ', 49.00, 40, NULL, NULL, NULL, 0),
    (N'lampara-de-escritorio-led', 'LAM-NEG', 259.00, 41, N'Negro', NULL, NULL, 0),
    (N'lampara-de-escritorio-led', 'LAM-BLA', 259.00, 40, N'Blanco', NULL, NULL, 0);

-- Una imagen general por producto y una por color. Los archivos están en api/seed-assets/productos.
CREATE TABLE #DefImagen
(
    Producto VARCHAR(220) COLLATE DATABASE_DEFAULT,
    Ruta NVARCHAR(500) COLLATE DATABASE_DEFAULT,
    TextoAlternativo NVARCHAR(200) COLLATE DATABASE_DEFAULT,
    Color NVARCHAR(50) COLLATE DATABASE_DEFAULT
);
INSERT INTO #DefImagen (Producto, Ruta, TextoAlternativo, Color) VALUES
    (N'playera-basica', N'/uploads/productos/playera-basica.jpg', N'Playera básica', NULL),
    (N'playera-basica', N'/uploads/productos/playera-basica--negro.jpg', N'Playera básica negro', N'Negro'),
    (N'playera-basica', N'/uploads/productos/playera-basica--blanco.jpg', N'Playera básica blanco', N'Blanco'),
    (N'playera-basica', N'/uploads/productos/playera-basica--azul.jpg', N'Playera básica azul', N'Azul'),
    (N'sudadero-con-capucha', N'/uploads/productos/sudadero-con-capucha.jpg', N'Sudadero con capucha', NULL),
    (N'sudadero-con-capucha', N'/uploads/productos/sudadero-con-capucha--gris.jpg', N'Sudadero con capucha gris', N'Gris'),
    (N'sudadero-con-capucha', N'/uploads/productos/sudadero-con-capucha--negro.jpg', N'Sudadero con capucha negro', N'Negro'),
    (N'camisa-polo', N'/uploads/productos/camisa-polo.jpg', N'Camisa polo', NULL),
    (N'camisa-polo', N'/uploads/productos/camisa-polo--blanco.jpg', N'Camisa polo blanco', N'Blanco'),
    (N'camisa-polo', N'/uploads/productos/camisa-polo--azul.jpg', N'Camisa polo azul', N'Azul'),
    (N'camisa-polo', N'/uploads/productos/camisa-polo--rojo.jpg', N'Camisa polo rojo', N'Rojo'),
    (N'pantalon-jogger', N'/uploads/productos/pantalon-jogger.jpg', N'Pantalón jogger', NULL),
    (N'pantalon-jogger', N'/uploads/productos/pantalon-jogger--negro.jpg', N'Pantalón jogger negro', N'Negro'),
    (N'pantalon-jogger', N'/uploads/productos/pantalon-jogger--gris.jpg', N'Pantalón jogger gris', N'Gris'),
    (N'gorra-ajustable', N'/uploads/productos/gorra-ajustable.jpg', N'Gorra ajustable', NULL),
    (N'gorra-ajustable', N'/uploads/productos/gorra-ajustable--negro.jpg', N'Gorra ajustable negro', N'Negro'),
    (N'gorra-ajustable', N'/uploads/productos/gorra-ajustable--azul.jpg', N'Gorra ajustable azul', N'Azul'),
    (N'calcetines-deportivos-3-pares', N'/uploads/productos/calcetines-deportivos-3-pares.jpg', N'Calcetines deportivos (3 pares)', NULL),
    (N'tenis-para-correr', N'/uploads/productos/tenis-para-correr.jpg', N'Tenis para correr', NULL),
    (N'tenis-para-correr', N'/uploads/productos/tenis-para-correr--negro.jpg', N'Tenis para correr negro', N'Negro'),
    (N'tenis-para-correr', N'/uploads/productos/tenis-para-correr--blanco.jpg', N'Tenis para correr blanco', N'Blanco'),
    (N'sandalias-de-playa', N'/uploads/productos/sandalias-de-playa.jpg', N'Sandalias de playa', NULL),
    (N'sandalias-de-playa', N'/uploads/productos/sandalias-de-playa--negro.jpg', N'Sandalias de playa negro', N'Negro'),
    (N'sandalias-de-playa', N'/uploads/productos/sandalias-de-playa--azul.jpg', N'Sandalias de playa azul', N'Azul'),
    (N'consola-novaplay', N'/uploads/productos/consola-novaplay.jpg', N'Consola NovaPlay', NULL),
    (N'consola-novaplay', N'/uploads/productos/consola-novaplay--negro.jpg', N'Consola NovaPlay negro', N'Negro'),
    (N'consola-novaplay', N'/uploads/productos/consola-novaplay--blanco.jpg', N'Consola NovaPlay blanco', N'Blanco'),
    (N'control-inalambrico-novaplay', N'/uploads/productos/control-inalambrico-novaplay.jpg', N'Control inalámbrico NovaPlay', NULL),
    (N'control-inalambrico-novaplay', N'/uploads/productos/control-inalambrico-novaplay--negro.jpg', N'Control inalámbrico NovaPlay negro', N'Negro'),
    (N'control-inalambrico-novaplay', N'/uploads/productos/control-inalambrico-novaplay--blanco.jpg', N'Control inalámbrico NovaPlay blanco', N'Blanco'),
    (N'control-inalambrico-novaplay', N'/uploads/productos/control-inalambrico-novaplay--rojo.jpg', N'Control inalámbrico NovaPlay rojo', N'Rojo'),
    (N'galaxia-rally', N'/uploads/productos/galaxia-rally.jpg', N'Galaxia Rally', NULL),
    (N'reino-de-bloques', N'/uploads/productos/reino-de-bloques.jpg', N'Reino de Bloques', NULL),
    (N'futbol-total-26', N'/uploads/productos/futbol-total-26.jpg', N'Fútbol Total 26', NULL),
    (N'audifonos-inalambricos', N'/uploads/productos/audifonos-inalambricos.jpg', N'Audífonos inalámbricos', NULL),
    (N'audifonos-inalambricos', N'/uploads/productos/audifonos-inalambricos--negro.jpg', N'Audífonos inalámbricos negro', N'Negro'),
    (N'audifonos-inalambricos', N'/uploads/productos/audifonos-inalambricos--blanco.jpg', N'Audífonos inalámbricos blanco', N'Blanco'),
    (N'audifonos-inalambricos', N'/uploads/productos/audifonos-inalambricos--azul.jpg', N'Audífonos inalámbricos azul', N'Azul'),
    (N'bocina-bluetooth-portatil', N'/uploads/productos/bocina-bluetooth-portatil.jpg', N'Bocina Bluetooth portátil', NULL),
    (N'bocina-bluetooth-portatil', N'/uploads/productos/bocina-bluetooth-portatil--negro.jpg', N'Bocina Bluetooth portátil negro', N'Negro'),
    (N'bocina-bluetooth-portatil', N'/uploads/productos/bocina-bluetooth-portatil--rojo.jpg', N'Bocina Bluetooth portátil rojo', N'Rojo'),
    (N'mouse-inalambrico', N'/uploads/productos/mouse-inalambrico.jpg', N'Mouse inalámbrico', NULL),
    (N'mouse-inalambrico', N'/uploads/productos/mouse-inalambrico--negro.jpg', N'Mouse inalámbrico negro', N'Negro'),
    (N'mouse-inalambrico', N'/uploads/productos/mouse-inalambrico--gris.jpg', N'Mouse inalámbrico gris', N'Gris'),
    (N'cargador-usb-c-30-w', N'/uploads/productos/cargador-usb-c-30-w.jpg', N'Cargador USB-C 30 W', NULL),
    (N'bateria-portatil-10-000-mah', N'/uploads/productos/bateria-portatil-10-000-mah.jpg', N'Batería portátil 10 000 mAh', NULL),
    (N'bateria-portatil-10-000-mah', N'/uploads/productos/bateria-portatil-10-000-mah--negro.jpg', N'Batería portátil 10 000 mAh negro', N'Negro'),
    (N'bateria-portatil-10-000-mah', N'/uploads/productos/bateria-portatil-10-000-mah--blanco.jpg', N'Batería portátil 10 000 mAh blanco', N'Blanco'),
    (N'teclado-mecanico', N'/uploads/productos/teclado-mecanico.jpg', N'Teclado mecánico', NULL),
    (N'bocina-retro', N'/uploads/productos/bocina-retro.jpg', N'Bocina retro', NULL),
    (N'agua-pura-500-ml', N'/uploads/productos/agua-pura-500-ml.jpg', N'Agua pura 500 ml', NULL),
    (N'agua-pura-1-l', N'/uploads/productos/agua-pura-1-l.jpg', N'Agua pura 1 L', NULL),
    (N'cafe-molido-454-g', N'/uploads/productos/cafe-molido-454-g.jpg', N'Café molido 454 g', NULL),
    (N'bebida-isotonica-600-ml', N'/uploads/productos/bebida-isotonica-600-ml.jpg', N'Bebida isotónica 600 ml', NULL),
    (N'te-verde-500-ml', N'/uploads/productos/te-verde-500-ml.jpg', N'Té verde 500 ml', NULL),
    (N'termo-de-acero-750-ml', N'/uploads/productos/termo-de-acero-750-ml.jpg', N'Termo de acero 750 ml', NULL),
    (N'termo-de-acero-750-ml', N'/uploads/productos/termo-de-acero-750-ml--negro.jpg', N'Termo de acero 750 ml negro', N'Negro'),
    (N'termo-de-acero-750-ml', N'/uploads/productos/termo-de-acero-750-ml--azul.jpg', N'Termo de acero 750 ml azul', N'Azul'),
    (N'termo-de-acero-750-ml', N'/uploads/productos/termo-de-acero-750-ml--verde.jpg', N'Termo de acero 750 ml verde', N'Verde'),
    (N'taza-de-ceramica-350-ml', N'/uploads/productos/taza-de-ceramica-350-ml.jpg', N'Taza de cerámica 350 ml', NULL),
    (N'lampara-de-escritorio-led', N'/uploads/productos/lampara-de-escritorio-led.jpg', N'Lámpara de escritorio LED', NULL),
    (N'lampara-de-escritorio-led', N'/uploads/productos/lampara-de-escritorio-led--negro.jpg', N'Lámpara de escritorio LED negro', N'Negro'),
    (N'lampara-de-escritorio-led', N'/uploads/productos/lampara-de-escritorio-led--blanco.jpg', N'Lámpara de escritorio LED blanco', N'Blanco');

-- Clientes registrados (todos con la contraseña de prueba de clientes) y el día en que se registran.
CREATE TABLE #Cliente
(
    Numero INT PRIMARY KEY,
    Correo NVARCHAR(254) COLLATE DATABASE_DEFAULT,
    Nombre NVARCHAR(100) COLLATE DATABASE_DEFAULT,
    Apellido NVARCHAR(100) COLLATE DATABASE_DEFAULT,
    Telefono VARCHAR(20) COLLATE DATABASE_DEFAULT,
    IDMunicipio SMALLINT,
    Linea1 NVARCHAR(200) COLLATE DATABASE_DEFAULT,
    DiaRegistro INT,
    IDUsuario INT,
    IDDireccion INT,
    Pedidos INT DEFAULT (0)
);
INSERT INTO #Cliente (Numero, Correo, Nombre, Apellido, Telefono, IDMunicipio, Linea1, DiaRegistro) VALUES
    (1, N'cliente@shopcart.test', N'María', N'López', '5164-2505', 116, N'Barrio El Centro, 2a calle 4-10', 2),
    (2, N'jose.garcia@correo.test', N'José', N'García', '5955-4664', 901, N'Calzada Roosevelt 22-43 zona 11', 20),
    (3, N'ana.martinez@correo.test', N'Ana', N'Martínez', '5913-4042', 901, N'Boulevard Los Próceres 18-60 zona 10', 45),
    (4, N'luis.hernandez@correo.test', N'Luis', N'Hernández', '5147-7095', 401, N'Calzada Roosevelt 22-43 zona 11', 51),
    (5, N'carmen.gonzalez@correo.test', N'Carmen', N'González', '5656-7797', 1101, N'Colonia Las Flores, lote 14', 40),
    (6, N'jorge.morales@correo.test', N'Jorge', N'Morales', '5727-8101', 1801, N'Residenciales El Prado, casa 8', 63),
    (7, N'lucia.castillo@correo.test', N'Lucía', N'Castillo', '5548-8528', 108, N'7a avenida 1-30 zona 3', 65),
    (8, N'diego.ramirez@correo.test', N'Diego', N'Ramírez', '5368-7561', 115, N'12 avenida 3-45 zona 10', 9),
    (9, N'paola.juarez@correo.test', N'Paola', N'Juárez', '5942-8746', 301, N'Colonia Las Flores, lote 14', 5),
    (10, N'andres.mendez@correo.test', N'Andrés', N'Méndez', '5705-7264', 116, N'Residenciales El Prado, casa 8', 46),
    (11, N'gabriela.rodriguez@correo.test', N'Gabriela', N'Rodríguez', '5805-4699', 101, N'12 avenida 3-45 zona 10', 51),
    (12, N'fernando.cruz@correo.test', N'Fernando', N'Cruz', '5898-1098', 701, N'3a calle 2-15 zona 2', 25),
    (13, N'daniela.reyes@correo.test', N'Daniela', N'Reyes', '5692-8337', 1801, N'Colonia Las Flores, lote 14', 47),
    (14, N'ricardo.perez@correo.test', N'Ricardo', N'Pérez', '5625-4405', 401, N'Boulevard Los Próceres 18-60 zona 10', 52),
    (15, N'sofia.orellana@correo.test', N'Sofía', N'Orellana', '5798-8054', 1101, N'Colonia Las Flores, lote 14', 15),
    (16, N'kevin.estrada@correo.test', N'Kevin', N'Estrada', '5305-7619', 1101, N'Colonia Las Flores, lote 14', 29),
    (17, N'valeria.gomez@correo.test', N'Valeria', N'Gómez', '5806-6100', 1301, N'12 avenida 3-45 zona 10', 50),
    (18, N'pablo.barrios@correo.test', N'Pablo', N'Barrios', '5946-3491', 401, N'6a avenida 8-12 zona 4', 39),
    (19, N'monica.chavez@correo.test', N'Mónica', N'Chávez', '5200-8652', 901, N'4a calle 5-20 zona 1', 28),
    (20, N'hector.velasquez@correo.test', N'Héctor', N'Velásquez', '5864-6673', 108, N'3a calle 2-15 zona 2', 59),
    (21, N'alejandra.solis@correo.test', N'Alejandra', N'Solís', '5449-6290', 1001, N'Residenciales El Prado, casa 8', 62),
    (22, N'mario.aguilar@correo.test', N'Mario', N'Aguilar', '5172-1098', 2201, N'Colonia Las Flores, lote 14', 7),
    (23, N'fabiola.ortiz@correo.test', N'Fabiola', N'Ortiz', '5622-3596', 117, N'7a avenida 1-30 zona 3', 24),
    (24, N'javier.herrera@correo.test', N'Javier', N'Herrera', '5483-8373', 117, N'3a calle 2-15 zona 2', 44),
    (25, N'rosa.monterroso@correo.test', N'Rosa', N'Monterroso', '5611-8289', 701, N'6a avenida 8-12 zona 4', 39);

-- Compradores invitados (sin cuenta): cada compra o carrito usa su propio token.
CREATE TABLE #Invitado
(
    Numero INT PRIMARY KEY,
    Correo NVARCHAR(254) COLLATE DATABASE_DEFAULT,
    Nombre NVARCHAR(150) COLLATE DATABASE_DEFAULT,
    Telefono VARCHAR(20) COLLATE DATABASE_DEFAULT,
    IDMunicipio SMALLINT,
    Linea1 NVARCHAR(200) COLLATE DATABASE_DEFAULT
);
INSERT INTO #Invitado (Numero, Correo, Nombre, Telefono, IDMunicipio, Linea1) VALUES
    (1, N'roberto.sandoval@correo.test', N'Roberto Sandoval', '4509-7545', 2101, N'Residenciales El Prado, casa 8'),
    (2, N'elena.figueroa@correo.test', N'Elena Figueroa', '4207-7929', 115, N'Colonia Las Flores, lote 14'),
    (3, N'oscar.pineda@correo.test', N'Óscar Pineda', '4917-4151', 2101, N'7a avenida 1-30 zona 3'),
    (4, N'claudia.arriaga@correo.test', N'Claudia Arriaga', '4669-3039', 1101, N'Residenciales El Prado, casa 8'),
    (5, N'marco.toledo@correo.test', N'Marco Toledo', '4233-3935', 108, N'Residenciales El Prado, casa 8'),
    (6, N'silvia.paz@correo.test', N'Silvia Paz', '4729-6434', 117, N'4a calle 5-20 zona 1'),
    (7, N'erick.mazariegos@correo.test', N'Erick Mazariegos', '4824-6945', 1601, N'Colonia Las Flores, lote 14'),
    (8, N'brenda.lemus@correo.test', N'Brenda Lemus', '4688-7526', 2101, N'6a avenida 8-12 zona 4'),
    (9, N'julio.cifuentes@correo.test', N'Julio Cifuentes', '4441-6016', 1101, N'6a avenida 8-12 zona 4'),
    (10, N'karla.ruano@correo.test', N'Karla Ruano', '4767-4860', 1101, N'3a calle 2-15 zona 2');

/*
    Contexto de la simulación. Guatemala está en UTC−6 todo el año (sin horario de verano):
    hora local + 6 h = UTC. El día 0 es 200 días antes del despliegue.
*/
CREATE TABLE #Contexto (AhoraUtc DATETIME2(3), Dia0Local DATETIME2(3), Azar BIGINT, IDAdmin INT, IDOperador1 INT, IDOperador2 INT);
INSERT INTO #Contexto (AhoraUtc, Dia0Local, Azar)
SELECT SYSUTCDATETIME(),
       DATEADD(DAY, -200, CAST(CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'Central America Standard Time' AS DATE) AS DATETIME2(3))),
       20261102;

-- Hora real y simulada antes de cada evento (ver encabezado).
CREATE TABLE #Reloj (Real DATETIME2(3) PRIMARY KEY, Simulado DATETIME2(3) NOT NULL);

CREATE TABLE #Evento
(
    IDEvento INT IDENTITY PRIMARY KEY,
    Simulado DATETIME2(3) NOT NULL,
    Tipo VARCHAR(20) COLLATE DATABASE_DEFAULT NOT NULL,
    Referencia INT NULL,
    Secuencia INT NULL
);
CREATE TABLE #PlanPedido
(
    IDPlan INT IDENTITY PRIMARY KEY,
    Simulado DATETIME2(3),
    NumeroCliente INT,
    NumeroInvitado INT,
    MetodoEnvio NVARCHAR(100) COLLATE DATABASE_DEFAULT,
    CodigoCupon VARCHAR(30) COLLATE DATABASE_DEFAULT,
    Resultado VARCHAR(20) COLLATE DATABASE_DEFAULT,
    IDPedido INT
);
CREATE TABLE #PlanLinea (IDPlan INT, SKU VARCHAR(50) COLLATE DATABASE_DEFAULT, Cantidad INT, PRIMARY KEY (IDPlan, SKU));
CREATE TABLE #PlanCarrito (IDPlanCarrito INT IDENTITY PRIMARY KEY, NumeroCliente INT, NumeroInvitado INT);
CREATE TABLE #PlanCarritoLinea
(
    IDPlanCarrito INT,
    SKU VARCHAR(50) COLLATE DATABASE_DEFAULT,
    Cantidad INT,
    PRIMARY KEY (IDPlanCarrito, SKU)
);
GO

/* Generador con semilla fija (Park–Miller): devuelve un entero en [0, @Maximo). */
CREATE PROCEDURE #Azar
    @Maximo INT,
    @Valor  INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE #Contexto SET Azar = Azar * 48271 % 2147483647;
    SET @Valor = (SELECT Azar FROM #Contexto) % @Maximo;
END;
GO

/*
    Anota el inicio de un evento: espera a que avance el milisegundo, así ningún registro del
    evento anterior comparte la hora real con este (cada hora real pertenece a un solo tramo).
*/
CREATE PROCEDURE #Marcar
    @Simulado DATETIME2(3)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Inicio DATETIME2(3) = SYSUTCDATETIME();
    WHILE CAST(SYSUTCDATETIME() AS DATETIME2(3)) <= @Inicio
        SET @Inicio = @Inicio;
    INSERT INTO #Reloj (Real, Simulado) VALUES (CAST(SYSUTCDATETIME() AS DATETIME2(3)), @Simulado);
END;
GO

/* =========================================================================================
   Día 0, 08:00: personal, catálogo, envíos y cupones
   ========================================================================================= */
DECLARE @Dia0 DATETIME2(3) = (SELECT DATEADD(HOUR, 6 + 8, Dia0Local) FROM #Contexto);
DECLARE @HashAdmin VARCHAR(255) = '$argon2id$v=19$m=65536,t=3,p=4$k71axE/aBkMnIPQfzyeKOQ$kw4M6DL6YPpB85acmvVGaT3270dADwb04T8UHuU9rd4';
DECLARE @HashOperador VARCHAR(255) = '$argon2id$v=19$m=65536,t=3,p=4$9Qh4DXg47oTvHxFt6PEQOw$oDetO1Z7bmiCZHjE+Hgq0iTBhC6KxrYi1pZVWTEZKjs';
DECLARE @IDAdmin INT, @IDSistema INT = (SELECT IDUsuario FROM dbo.Usuario WHERE EsSistema = 1);

EXEC #Marcar @Dia0;

-- Primer administrador: no hay otro que lo cree (ver encabezado). Queda en la bitácora a nombre del sistema.
INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido, Telefono)
SELECT r.IDRol, N'admin@shopcart.test', @HashAdmin, N'Laura', N'Méndez', '5512-3400' FROM dbo.Rol AS r WHERE r.Codigo = 'ADMIN';
SET @IDAdmin = SCOPE_IDENTITY();
INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDEntidad, Accion, ValorNuevo)
SELECT @IDSistema, 'USUARIOS', 'Usuario', CAST(@IDAdmin AS VARCHAR(50)), 'CREAR',
       (SELECT u.IDUsuario, u.Correo, u.Nombre, u.Apellido, N'ADMIN' AS Rol, u.Activo
        FROM dbo.Usuario AS u WHERE u.IDUsuario = @IDAdmin
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

EXEC dbo.SP_Usuarios_CrearInterno @IDAdmin, N'operador@shopcart.test', @HashOperador, N'Carlos', N'Pérez', N'5512-3401', 'OPERADOR';
EXEC dbo.SP_Usuarios_CrearInterno @IDAdmin, N'operador2@shopcart.test', @HashOperador, N'Sofía', N'Ramírez', N'5512-3402', 'OPERADOR';
UPDATE #Contexto SET IDAdmin = @IDAdmin,
                     IDOperador1 = (SELECT IDUsuario FROM dbo.Usuario WHERE Correo = N'operador@shopcart.test'),
                     IDOperador2 = (SELECT IDUsuario FROM dbo.Usuario WHERE Correo = N'operador2@shopcart.test');

-- Atributos y valores.
DECLARE @Atributo NVARCHAR(50), @Valor NVARCHAR(50), @Hex VARCHAR(7), @Orden INT, @IDAtributo INT;
DECLARE @Atributos TABLE (Atributo NVARCHAR(50) COLLATE DATABASE_DEFAULT PRIMARY KEY);
INSERT INTO @Atributos SELECT DISTINCT Atributo FROM #DefValor;
WHILE EXISTS (SELECT 1 FROM @Atributos)
BEGIN
    SELECT TOP (1) @Atributo = Atributo FROM @Atributos ORDER BY Atributo;
    EXEC dbo.SP_Catalogo_CrearAtributo @IDAdmin, @Atributo;
    SET @IDAtributo = (SELECT IDAtributo FROM dbo.Atributo WHERE Nombre = @Atributo);
    SET @Orden = 1;
    WHILE @Orden <= (SELECT MAX(Orden) FROM #DefValor WHERE Atributo = @Atributo)
    BEGIN
        SELECT @Valor = Valor, @Hex = CodigoHex FROM #DefValor WHERE Atributo = @Atributo AND Orden = @Orden;
        EXEC dbo.SP_Catalogo_CrearAtributoValor @IDAdmin, @IDAtributo, @Valor, @Hex, @Orden;
        SET @Orden += 1;
    END;
    DELETE FROM @Atributos WHERE Atributo = @Atributo;
END;

-- Categorías con sus atributos.
DECLARE @Slug VARCHAR(220), @Nombre NVARCHAR(200), @Descripcion NVARCHAR(4000), @Lista NVARCHAR(200), @IDCategoria INT;
DECLARE @CategoriaAtributos dbo.TT_Catalogo_CategoriaAtributo;
DECLARE cCategorias CURSOR LOCAL FAST_FORWARD FOR SELECT Slug, Nombre, Descripcion, Atributos FROM #DefCategoria;
OPEN cCategorias;
FETCH NEXT FROM cCategorias INTO @Slug, @Nombre, @Descripcion, @Lista;
WHILE @@FETCH_STATUS = 0
BEGIN
    EXEC dbo.SP_Catalogo_CrearCategoria @IDAdmin, @Nombre, @Slug, @Descripcion;
    SET @IDCategoria = (SELECT IDCategoria FROM dbo.Categoria WHERE Slug = @Slug);
    IF @Lista IS NOT NULL
    BEGIN
        DELETE FROM @CategoriaAtributos;
        INSERT INTO @CategoriaAtributos (IDAtributo, Orden)
        SELECT a.IDAtributo, ROW_NUMBER() OVER (ORDER BY CHARINDEX(a.Nombre, @Lista))
        FROM STRING_SPLIT(@Lista, ',') AS s JOIN dbo.Atributo AS a ON a.Nombre = s.value;
        EXEC dbo.SP_Catalogo_AsignarAtributosCategoria @IDAdmin, @IDCategoria, @CategoriaAtributos;
    END;
    FETCH NEXT FROM cCategorias INTO @Slug, @Nombre, @Descripcion, @Lista;
END;
CLOSE cCategorias;
DEALLOCATE cCategorias;

-- Productos: variantes con su existencia inicial (kardex INVENTARIO_INICIAL) e imágenes; se activan al crearlos.
DECLARE @Variantes dbo.TT_Catalogo_Variante, @VarianteAtributos dbo.TT_Catalogo_VarianteAtributo, @Imagenes dbo.TT_Catalogo_ProductoImagen;
DECLARE @IDProducto INT, @Categoria VARCHAR(120);
DECLARE cProductos CURSOR LOCAL FAST_FORWARD FOR SELECT Slug, Categoria, Nombre, Descripcion FROM #DefProducto;
OPEN cProductos;
FETCH NEXT FROM cProductos INTO @Slug, @Categoria, @Nombre, @Descripcion;
WHILE @@FETCH_STATUS = 0
BEGIN
    DELETE FROM @Variantes; DELETE FROM @VarianteAtributos; DELETE FROM @Imagenes;

    INSERT INTO @Variantes (NumeroLinea, SKU, Precio, ExistenciaInicial)
    SELECT ROW_NUMBER() OVER (ORDER BY v.SKU), v.SKU, v.Precio, v.Existencia FROM #DefVariante AS v WHERE v.Producto = @Slug;

    INSERT INTO @VarianteAtributos (NumeroLinea, IDAtributo, IDAtributoValor)
    SELECT l.NumeroLinea, av.IDAtributo, av.IDAtributoValor
    FROM @Variantes AS l
    JOIN #DefVariante AS v ON v.SKU = l.SKU
    CROSS APPLY (VALUES (N'Color', v.Color), (v.Atributo2, v.Valor2)) AS x (Atributo, Valor)
    JOIN dbo.Atributo AS a ON a.Nombre = x.Atributo
    JOIN dbo.AtributoValor AS av ON av.IDAtributo = a.IDAtributo AND av.Valor = x.Valor;

    INSERT INTO @Imagenes (NumeroLinea, RutaImagen, TextoAlternativo, IDAtributoValor, Orden, EsPrincipal)
    SELECT ROW_NUMBER() OVER (ORDER BY i.Ruta), i.Ruta, i.TextoAlternativo, av.IDAtributoValor, 0, 1
    FROM #DefImagen AS i
    LEFT JOIN dbo.Atributo AS a ON a.Nombre = N'Color'
    LEFT JOIN dbo.AtributoValor AS av ON av.IDAtributo = a.IDAtributo AND av.Valor = i.Color
    WHERE i.Producto = @Slug;

    SET @IDCategoria = (SELECT IDCategoria FROM dbo.Categoria WHERE Slug = @Categoria);
    EXEC dbo.SP_Catalogo_CrearProducto @IDAdmin, @IDCategoria, @Nombre, @Slug, @Descripcion, @Variantes, @VarianteAtributos, @Imagenes;
    SET @IDProducto = (SELECT IDProducto FROM dbo.Producto WHERE Slug = @Slug);
    EXEC dbo.SP_Catalogo_CambiarEstadoProducto @IDAdmin, @IDProducto, 1;

    FETCH NEXT FROM cProductos INTO @Slug, @Categoria, @Nombre, @Descripcion;
END;
CLOSE cProductos;
DEALLOCATE cProductos;

-- Métodos de envío (el económico queda inactivo: ya no se ofrece).
EXEC dbo.SP_Envios_CrearMetodo @IDAdmin, N'Envío estándar', N'Entrega a domicilio en todo el país.', 25.00, 2, 4;
EXEC dbo.SP_Envios_CrearMetodo @IDAdmin, N'Envío exprés', N'Entrega prioritaria en cabeceras departamentales.', 45.00, 1, 2;
EXEC dbo.SP_Envios_CrearMetodo @IDAdmin, N'Recoger en tienda', N'Recoge tu pedido en nuestra tienda de zona 10.', 0.00, 0, 1;
EXEC dbo.SP_Envios_CrearMetodo @IDAdmin, N'Envío económico', N'Entrega consolidada sin prioridad.', 15.00, 5, 8;
DECLARE @IDMetodo INT = (SELECT IDMetodoEnvio FROM dbo.MetodoEnvio WHERE Nombre = N'Envío económico');
EXEC dbo.SP_Envios_CambiarEstadoMetodo @IDAdmin, @IDMetodo, 0;

/*
    Cupones: uno de cada situación al final de la semilla. Sus fechas de vigencia son datos del
    negocio (no se trasladan): inician el día 0 y vencen después del despliegue, salvo:
    VERANO20 se usa en el historial y al final se le fija el vencimiento en el día 100;
    NAVIDAD30 inicia en 30 días (programado); FLASH25 se agota con sus 5 usos; BLACKFRIDAY
    está inactivo.
*/
DECLARE @Hoy DATETIME2(3) = (SELECT AhoraUtc FROM #Contexto), @IDRopa INT = (SELECT IDCategoria FROM dbo.Categoria WHERE Slug = 'ropa');
DECLARE @Fin DATETIME2(3);
SET @Fin = DATEADD(DAY, 120, @Hoy);
EXEC dbo.SP_Cupones_Crear @IDAdmin, 'BIENVENIDA10', N'10 % en tu primera compra.', 'PORCENTAJE', 10, 0, @Dia0, @Fin, NULL, 1, NULL, 1;
SET @Fin = DATEADD(DAY, 60, @Hoy);
EXEC dbo.SP_Cupones_Crear @IDAdmin, 'ROPA15', N'15 % en ropa en compras desde Q200.', 'PORCENTAJE', 15, 200, @Dia0, @Fin, NULL, NULL, @IDRopa, 0;
SET @Fin = DATEADD(DAY, 90, @Hoy);
EXEC dbo.SP_Cupones_Crear @IDAdmin, 'DESCUENTO50', N'Q50 de descuento en compras desde Q500.', 'MONTO_FIJO', 50, 500, @Dia0, @Fin, 500, NULL, NULL, 0;
SET @Fin = DATEADD(DAY, 30, @Hoy);
EXEC dbo.SP_Cupones_Crear @IDAdmin, 'FLASH25', N'25 % de descuento, solo 5 usos.', 'PORCENTAJE', 25, 0, @Dia0, @Fin, 5, 1, NULL, 1;
EXEC dbo.SP_Cupones_Crear @IDAdmin, 'VERANO20', N'20 % de temporada de verano.', 'PORCENTAJE', 20, 0, @Dia0, @Fin, NULL, NULL, NULL, 0;
DECLARE @Inicio DATETIME2(3) = DATEADD(DAY, 30, @Hoy);
SET @Fin = DATEADD(DAY, 60, @Hoy);
EXEC dbo.SP_Cupones_Crear @IDAdmin, 'NAVIDAD30', N'30 % en compras navideñas desde Q300.', 'PORCENTAJE', 30, 300, @Inicio, @Fin, NULL, 2, NULL, 0;
SET @Fin = DATEADD(DAY, 90, @Hoy);
EXEC dbo.SP_Cupones_Crear @IDAdmin, 'BLACKFRIDAY', N'40 % de descuento (campaña suspendida).', 'PORCENTAJE', 40, 0, @Dia0, @Fin, 100, 1, NULL, 1;
DECLARE @IDCupon INT = (SELECT IDCupon FROM dbo.Cupon WHERE Codigo = 'BLACKFRIDAY');
EXEC dbo.SP_Cupones_CambiarEstado @IDAdmin, @IDCupon, 0;
GO

/* =========================================================================================
   Plan del historial: registros, pedidos y sus eventos, reabastos, precios, carritos
   ========================================================================================= */
DECLARE @AhoraUtc DATETIME2(3), @Dia0Local DATETIME2(3);
SELECT @AhoraUtc = AhoraUtc, @Dia0Local = Dia0Local FROM #Contexto;
-- Ningún evento después de este momento: un pedido reciente queda en el estado al que llegó.
DECLARE @Limite DATETIME2(3) = DATEADD(MINUTE, -5, @AhoraUtc);
DECLARE @r INT, @r2 INT, @Dia INT, @Cantidad INT, @Lineas INT, @Simulado DATETIME2(3), @t DATETIME2(3), @IDPlan INT,
        @NumeroCliente INT, @NumeroInvitado INT, @Cupon VARCHAR(30), @Resultado VARCHAR(20), @Metodo NVARCHAR(100), @SKU VARCHAR(50),
        @Producto VARCHAR(220), @TotalPeso INT, @Unidades INT, @Invitados INT = (SELECT COUNT(*) FROM #Invitado);

-- Productos que se venden, con su rango acumulado de popularidad para elegirlos al azar.
DECLARE @Peso TABLE (Producto VARCHAR(220) COLLATE DATABASE_DEFAULT PRIMARY KEY, Desde INT, Hasta INT, EsBebida BIT);
INSERT INTO @Peso (Producto, Desde, Hasta, EsBebida)
SELECT Slug, SUM(Popularidad) OVER (ORDER BY Slug) - Popularidad, SUM(Popularidad) OVER (ORDER BY Slug),
       CASE WHEN Categoria = 'bebidas' THEN 1 ELSE 0 END
FROM #DefProducto WHERE Popularidad > 0;
SET @TotalPeso = (SELECT MAX(Hasta) FROM @Peso);

-- Registro de cada cliente (con su dirección), entre las 09:00 y las 19:00.
DECLARE @Numero INT = 1;
WHILE @Numero <= (SELECT MAX(Numero) FROM #Cliente)
BEGIN
    EXEC #Azar 600, @r OUTPUT;
    INSERT INTO #Evento (Simulado, Tipo, Referencia)
    SELECT DATEADD(MINUTE, 540 + @r, DATEADD(HOUR, 6, DATEADD(DAY, DiaRegistro, @Dia0Local))), 'REGISTRO', Numero
    FROM #Cliente WHERE Numero = @Numero;
    SET @Numero += 1;
END;

/*
    Pedidos: del día 15 al 200 (hoy), de 0 a 2 por día (de 1 a 3 desde el día 100: el negocio
    crece; 2 más ayer y hoy, que quedan pendientes de atender), entre las 08:00 y las 21:00
    sin pasar de la hora del despliegue. 82 % de clientes registrados (ya registrados ese
    día), el resto invitados. De 1 a 3 productos elegidos por popularidad; bebidas de 1 a 3
    unidades, lo demás 1 o 2.
*/
SET @Dia = 15;
WHILE @Dia <= 200
BEGIN
    EXEC #Azar 3, @r OUTPUT;
    SET @Cantidad = @r + CASE WHEN @Dia >= 100 THEN 1 ELSE 0 END + CASE WHEN @Dia >= 199 THEN 2 ELSE 0 END;
    WHILE @Cantidad > 0
    BEGIN
        SET @Cantidad -= 1;
        EXEC #Azar 780, @r OUTPUT;
        SET @Simulado = DATEADD(MINUTE, 480 + @r, DATEADD(HOUR, 6, DATEADD(DAY, @Dia, @Dia0Local)));
        IF @Simulado >= @Limite
            CONTINUE;

        -- Comprador.
        SELECT @NumeroCliente = NULL, @NumeroInvitado = NULL, @Cupon = NULL;
        EXEC #Azar 100, @r OUTPUT;
        IF @r < 82
        BEGIN
            EXEC #Azar 1000, @r OUTPUT;
            SELECT @NumeroCliente = c.Numero
            FROM (SELECT Numero, ROW_NUMBER() OVER (ORDER BY Numero) - 1 AS Fila, COUNT(*) OVER () AS Total
                  FROM #Cliente WHERE DiaRegistro < @Dia) AS c
            WHERE c.Fila = @r % c.Total;
        END;
        IF @NumeroCliente IS NULL
        BEGIN
            EXEC #Azar @Invitados, @r OUTPUT;
            SET @NumeroInvitado = @r + 1;
        END;

        -- Método de envío: estándar 60 %, exprés 25 %, recoger en tienda 15 %.
        EXEC #Azar 100, @r OUTPUT;
        SET @Metodo = CASE WHEN @r < 60 THEN N'Envío estándar' WHEN @r < 85 THEN N'Envío exprés' ELSE N'Recoger en tienda' END;

        INSERT INTO #PlanPedido (Simulado, NumeroCliente, NumeroInvitado, MetodoEnvio) VALUES (@Simulado, @NumeroCliente, @NumeroInvitado, @Metodo);
        SET @IDPlan = SCOPE_IDENTITY();

        -- Líneas.
        EXEC #Azar 100, @r OUTPUT;
        SET @Lineas = CASE WHEN @r < 55 THEN 1 WHEN @r < 85 THEN 2 ELSE 3 END;
        WHILE @Lineas > 0
        BEGIN
            SET @Lineas -= 1;
            EXEC #Azar @TotalPeso, @r OUTPUT;
            SELECT @Producto = Producto FROM @Peso WHERE @r >= Desde AND @r < Hasta;
            EXEC #Azar 1000, @r OUTPUT;
            SELECT @SKU = v.SKU
            FROM (SELECT SKU, ROW_NUMBER() OVER (ORDER BY SKU) - 1 AS Fila, COUNT(*) OVER () AS Total
                  FROM #DefVariante WHERE Producto = @Producto AND Especial = 0) AS v
            WHERE v.Fila = @r % v.Total;
            EXEC #Azar 100, @r OUTPUT;
            SET @Unidades = CASE WHEN (SELECT EsBebida FROM @Peso WHERE Producto = @Producto) = 1 THEN 1 + @r % 3
                                 WHEN @r < 80 THEN 1 ELSE 2 END;
            IF NOT EXISTS (SELECT 1 FROM #PlanLinea WHERE IDPlan = @IDPlan AND SKU = @SKU)
                INSERT INTO #PlanLinea (IDPlan, SKU, Cantidad) VALUES (@IDPlan, @SKU, @Unidades);
        END;

        /*
            Cupón (solo clientes registrados): BIENVENIDA10 en la mitad de las primeras compras;
            en el 12 % del resto, el de la campaña del momento. La semilla lo aplica solo si
            el carrito cumple sus condiciones (como lo haría el cliente).
        */
        IF @NumeroCliente IS NOT NULL
        BEGIN
            EXEC #Azar 100, @r OUTPUT;
            IF (SELECT Pedidos FROM #Cliente WHERE Numero = @NumeroCliente) = 0 AND @r < 50
                SET @Cupon = 'BIENVENIDA10';
            ELSE IF @r < 12 OR (@Dia BETWEEN 150 AND 156 AND @r < 70)
                SET @Cupon = CASE WHEN @Dia BETWEEN 150 AND 156 THEN 'FLASH25'
                                  WHEN @Dia BETWEEN 40 AND 100 THEN 'VERANO20'
                                  WHEN @r % 2 = 0 THEN 'ROPA15' ELSE 'DESCUENTO50' END;
            UPDATE #Cliente SET Pedidos += 1 WHERE Numero = @NumeroCliente;
        END;

        /*
            Resultado: 5 % cancelado por el cliente (solo registrados, antes de prepararse),
            4 % cancelado por el operador en preparación, 6 % devolución parcial (si tiene más
            de una unidad), 3 % devolución total; el resto se entrega.
        */
        EXEC #Azar 100, @r OUTPUT;
        SET @Resultado = CASE WHEN @r < 5 AND @NumeroCliente IS NOT NULL THEN 'CANCELADO_CLIENTE'
                              WHEN @r < 9 THEN 'CANCELADO_OPERADOR'
                              WHEN @r < 15 AND (SELECT SUM(Cantidad) FROM #PlanLinea WHERE IDPlan = @IDPlan) > 1 THEN 'DEVUELTO_PARCIAL'
                              WHEN @r < 18 THEN 'DEVUELTO'
                              ELSE 'ENTREGADO' END;
        UPDATE #PlanPedido SET CodigoCupon = @Cupon, Resultado = @Resultado WHERE IDPlan = @IDPlan;

        -- Eventos del pedido; los posteriores a @Limite no ocurren todavía.
        INSERT INTO #Evento (Simulado, Tipo, Referencia) VALUES (@Simulado, 'PEDIDO', @IDPlan);
        IF @Resultado = 'CANCELADO_CLIENTE'
        BEGIN
            EXEC #Azar 100, @r OUTPUT;
            INSERT INTO #Evento (Simulado, Tipo, Referencia) VALUES (DATEADD(MINUTE, 20 + @r, @Simulado), 'CANCELAR_CLIENTE', @IDPlan);
        END
        ELSE
        BEGIN
            EXEC #Azar 960, @r OUTPUT;
            SET @t = DATEADD(MINUTE, 120 + @r, @Simulado);
            INSERT INTO #Evento (Simulado, Tipo, Referencia) VALUES (@t, 'PREPARAR', @IDPlan);
            EXEC #Azar 720, @r OUTPUT;
            IF @Resultado = 'CANCELADO_OPERADOR'
                INSERT INTO #Evento (Simulado, Tipo, Referencia) VALUES (DATEADD(MINUTE, 60 + @r / 4, @t), 'CANCELAR_OPERADOR', @IDPlan);
            ELSE
            BEGIN
                SET @t = DATEADD(MINUTE, 1080 + @r, @t);
                INSERT INTO #Evento (Simulado, Tipo, Referencia) VALUES (@t, 'ENVIAR', @IDPlan);
                EXEC #Azar 4320, @r OUTPUT;
                SET @t = DATEADD(MINUTE, 1440 + @r, @t);
                INSERT INTO #Evento (Simulado, Tipo, Referencia) VALUES (@t, 'ENTREGAR', @IDPlan);
                IF @Resultado IN ('DEVUELTO_PARCIAL', 'DEVUELTO')
                BEGIN
                    EXEC #Azar 25920, @r OUTPUT;
                    INSERT INTO #Evento (Simulado, Tipo, Referencia) VALUES (DATEADD(MINUTE, 2880 + @r, @t), 'DEVOLVER', @IDPlan);
                END;
            END;
        END;
    END;
    SET @Dia += 1;
END;

-- Reabastecimientos (entradas por compra), cambios de precio, un ajuste por daño y un producto descontinuado.
INSERT INTO #Evento (Simulado, Tipo, Referencia)
SELECT DATEADD(HOUR, 6 + x.Hora, DATEADD(DAY, x.Dia, @Dia0Local)), x.Tipo, x.Referencia
FROM (VALUES (60, 9, 'REABASTO', NULL), (120, 9, 'REABASTO', NULL), (175, 9, 'REABASTO', NULL),
             (90, 10, 'PRECIO', 1), (130, 10, 'PRECIO', 2), (150, 10, 'PRECIO', 3),
             (95, 16, 'AJUSTE', NULL), (170, 11, 'DESCONTINUAR', NULL)) AS x (Dia, Hora, Tipo, Referencia);

/*
    Carritos al final del periodo: 7 de clientes y 4 de invitados abandonados entre los días
    186 y 197, y 2 de clientes con actividad en las últimas horas (no abandonados). Un
    cliente solo deja un carrito abierto si no volvió a comprar después.
*/
DECLARE @Carritos INT = 0, @IDPlanCarrito INT;
DECLARE cClientes CURSOR LOCAL FAST_FORWARD FOR SELECT Numero FROM #Cliente ORDER BY Numero * 7 % 25, Numero;
OPEN cClientes;
FETCH NEXT FROM cClientes INTO @Numero;
WHILE @@FETCH_STATUS = 0 AND @Carritos < 9
BEGIN
    EXEC #Azar 12, @r OUTPUT;
    EXEC #Azar 720, @r2 OUTPUT;
    SET @Simulado = CASE WHEN @Carritos < 7 THEN DATEADD(MINUTE, 480 + @r2, DATEADD(HOUR, 6, DATEADD(DAY, 186 + @r, @Dia0Local)))
                         ELSE DATEADD(MINUTE, -(60 + @r2 / 6), @Limite) END;
    IF NOT EXISTS (SELECT 1 FROM #PlanPedido AS p JOIN #Evento AS e ON e.Referencia = p.IDPlan AND e.Tipo IN ('PEDIDO', 'CANCELAR_CLIENTE')
                   WHERE p.NumeroCliente = @Numero AND e.Simulado >= DATEADD(DAY, -1, @Simulado))
    BEGIN
        INSERT INTO #PlanCarrito (NumeroCliente) VALUES (@Numero);
        SET @IDPlanCarrito = SCOPE_IDENTITY();
        INSERT INTO #Evento (Simulado, Tipo, Referencia) VALUES (@Simulado, 'CARRITO', @IDPlanCarrito);
        SET @Carritos += 1;
    END;
    FETCH NEXT FROM cClientes INTO @Numero;
END;
CLOSE cClientes;
DEALLOCATE cClientes;
SET @Numero = 1;
WHILE @Numero <= 4
BEGIN
    EXEC #Azar 12, @r OUTPUT;
    EXEC #Azar 720, @r2 OUTPUT;
    INSERT INTO #PlanCarrito (NumeroInvitado) VALUES (@Numero);
    SET @IDPlanCarrito = SCOPE_IDENTITY();
    INSERT INTO #Evento (Simulado, Tipo, Referencia)
    VALUES (DATEADD(MINUTE, 480 + @r2, DATEADD(HOUR, 6, DATEADD(DAY, 186 + @r, @Dia0Local))), 'CARRITO', @IDPlanCarrito);
    SET @Numero += 1;
END;
-- Contenido de cada carrito: de 1 a 3 productos, 1 o 2 unidades.
DECLARE cCarritos CURSOR LOCAL FAST_FORWARD FOR SELECT IDPlanCarrito FROM #PlanCarrito;
OPEN cCarritos;
FETCH NEXT FROM cCarritos INTO @IDPlanCarrito;
WHILE @@FETCH_STATUS = 0
BEGIN
    EXEC #Azar 3, @Lineas OUTPUT;
    SET @Lineas += 1;
    WHILE @Lineas > 0
    BEGIN
        SET @Lineas -= 1;
        EXEC #Azar @TotalPeso, @r OUTPUT;
        SELECT @Producto = Producto FROM @Peso WHERE @r >= Desde AND @r < Hasta;
        EXEC #Azar 1000, @r OUTPUT;
        SELECT @SKU = v.SKU
        FROM (SELECT SKU, ROW_NUMBER() OVER (ORDER BY SKU) - 1 AS Fila, COUNT(*) OVER () AS Total
              FROM #DefVariante WHERE Producto = @Producto AND Especial = 0) AS v
        WHERE v.Fila = @r % v.Total;
        EXEC #Azar 2, @r OUTPUT;
        IF NOT EXISTS (SELECT 1 FROM #PlanCarritoLinea WHERE IDPlanCarrito = @IDPlanCarrito AND SKU = @SKU)
            INSERT INTO #PlanCarritoLinea (IDPlanCarrito, SKU, Cantidad) VALUES (@IDPlanCarrito, @SKU, 1 + @r);
    END;
    FETCH NEXT FROM cCarritos INTO @IDPlanCarrito;
END;
CLOSE cCarritos;
DEALLOCATE cCarritos;

-- Cierre: VERANO20 vence (día 100) y queda el historial listo.
INSERT INTO #Evento (Simulado, Tipo) VALUES (DATEADD(MINUTE, -1, @Limite), 'FIN');

DELETE FROM #Evento WHERE Simulado >= @Limite;
UPDATE e SET Secuencia = s.Secuencia
FROM #Evento AS e
JOIN (SELECT IDEvento, ROW_NUMBER() OVER (ORDER BY Simulado, IDEvento) AS Secuencia FROM #Evento) AS s ON s.IDEvento = e.IDEvento;
GO

/* =========================================================================================
   Ejecución de los eventos, en el orden de su fecha simulada
   ========================================================================================= */
DECLARE @IDAdmin INT, @IDOperador1 INT, @IDOperador2 INT, @Dia0Local DATETIME2(3);
SELECT @IDAdmin = IDAdmin, @IDOperador1 = IDOperador1, @IDOperador2 = IDOperador2, @Dia0Local = Dia0Local FROM #Contexto;
DECLARE @HashCliente VARCHAR(255) = '$argon2id$v=19$m=65536,t=3,p=4$Dspk4jDnU5YxFu6EJIHEOw$4YwjvCFAyKFnGXQ+a/2jTRafk7RCZhTfAT5eA7wVlpc';
DECLARE @Secuencia INT = 1, @Total INT = (SELECT MAX(Secuencia) FROM #Evento);
DECLARE @Simulado DATETIME2(3), @Tipo VARCHAR(20), @Referencia INT, @r INT, @Operador INT;
DECLARE @IDUsuario INT, @IDDireccion INT, @Token VARBINARY(64), @IDCarrito INT, @IDCheckout BIGINT, @IDPedido INT, @IDCupon INT,
        @IDVariante INT, @IDMetodo INT, @IDMunicipio SMALLINT, @Cantidad INT, @SKU VARCHAR(50), @Cupon VARCHAR(30), @Resultado VARCHAR(20),
        @Correo NVARCHAR(254), @Nombre NVARCHAR(150), @Apellido NVARCHAR(100), @Telefono VARCHAR(20), @Linea1 NVARCHAR(200),
        @Marca VARCHAR(12), @Ultimos4 VARCHAR(4), @Autorizacion VARCHAR(20), @Referencia2 VARCHAR(64), @Seguimiento VARBINARY(64),
        @Motivo NVARCHAR(300), @Version BINARY(8), @Precio DECIMAL(12, 2), @Clave UNIQUEIDENTIFIER;
DECLARE @Lineas dbo.TT_Devoluciones_Linea, @Movimiento dbo.TT_Inventario_Movimiento;
DECLARE @PlanLineas TABLE (Orden INT IDENTITY, SKU VARCHAR(50) COLLATE DATABASE_DEFAULT, Cantidad INT);

WHILE @Secuencia <= @Total
BEGIN
    SELECT @Simulado = Simulado, @Tipo = Tipo, @Referencia = Referencia FROM #Evento WHERE Secuencia = @Secuencia;
    EXEC #Marcar @Simulado;
    EXEC #Azar 2, @r OUTPUT;
    SET @Operador = CASE @r WHEN 0 THEN @IDOperador1 ELSE @IDOperador2 END;

    IF @Tipo = 'REGISTRO'
    BEGIN
        SELECT @Correo = Correo, @Nombre = Nombre, @Apellido = Apellido, @Telefono = Telefono, @IDMunicipio = IDMunicipio, @Linea1 = Linea1
        FROM #Cliente WHERE Numero = @Referencia;
        EXEC dbo.SP_Seguridad_RegistrarCliente @Correo, @HashCliente, @Nombre, @Apellido, @Telefono;
        SET @IDUsuario = (SELECT IDUsuario FROM dbo.Usuario WHERE Correo = @Correo);
        SET @Nombre = CONCAT(@Nombre, N' ', @Apellido);
        EXEC dbo.SP_Direcciones_Crear @IDUsuario, N'Casa', @Nombre, @Telefono, @Linea1, NULL, @IDMunicipio, NULL, NULL, 1, @IDDireccion OUTPUT;
        UPDATE #Cliente SET IDUsuario = @IDUsuario, IDDireccion = @IDDireccion WHERE Numero = @Referencia;
    END

    ELSE IF @Tipo IN ('PEDIDO', 'CARRITO')
    BEGIN
        -- Comprador: cliente registrado o invitado con un token propio para esta compra.
        SELECT @IDUsuario = NULL, @Token = NULL, @IDDireccion = NULL, @Cupon = NULL;
        DELETE FROM @PlanLineas;
        IF @Tipo = 'PEDIDO'
        BEGIN
            SELECT @IDUsuario = c.IDUsuario, @IDDireccion = c.IDDireccion, @Cupon = p.CodigoCupon,
                   @Token = CASE WHEN p.NumeroInvitado IS NOT NULL THEN HASHBYTES('SHA2_256', CONCAT('invitado-demo-pedido-', p.IDPlan)) END,
                   @IDMetodo = (SELECT IDMetodoEnvio FROM dbo.MetodoEnvio WHERE Nombre = p.MetodoEnvio)
            FROM #PlanPedido AS p LEFT JOIN #Cliente AS c ON c.Numero = p.NumeroCliente
            WHERE p.IDPlan = @Referencia;
            INSERT INTO @PlanLineas (SKU, Cantidad) SELECT SKU, Cantidad FROM #PlanLinea WHERE IDPlan = @Referencia ORDER BY SKU;
        END
        ELSE
        BEGIN
            SELECT @IDUsuario = c.IDUsuario,
                   @Token = CASE WHEN p.NumeroInvitado IS NOT NULL THEN HASHBYTES('SHA2_256', CONCAT('invitado-demo-carrito-', p.IDPlanCarrito)) END
            FROM #PlanCarrito AS p LEFT JOIN #Cliente AS c ON c.Numero = p.NumeroCliente
            WHERE p.IDPlanCarrito = @Referencia;
            INSERT INTO @PlanLineas (SKU, Cantidad) SELECT SKU, Cantidad FROM #PlanCarritoLinea WHERE IDPlanCarrito = @Referencia ORDER BY SKU;
        END;

        -- Agrega cada línea si hay existencia disponible (como haría el cliente ante un producto agotado).
        WHILE EXISTS (SELECT 1 FROM @PlanLineas)
        BEGIN
            SELECT TOP (1) @r = Orden, @SKU = SKU, @Cantidad = Cantidad FROM @PlanLineas ORDER BY Orden;
            SET @IDVariante = (SELECT IDVariante FROM dbo.Variante WHERE SKU = @SKU);
            IF (SELECT Disponible FROM dbo.FU_Inventario_Disponibilidad(SYSUTCDATETIME()) WHERE IDVariante = @IDVariante) >= @Cantidad
                EXEC dbo.SP_Carrito_AgregarItem @IDUsuario, @Token, @IDVariante, @Cantidad;
            DELETE FROM @PlanLineas WHERE Orden = @r;
        END;

        SET @IDCarrito = (SELECT IDCarrito FROM dbo.Carrito
                          WHERE Estado = 'ACTIVO' AND (IDUsuario = @IDUsuario OR TokenInvitadoHash = CAST(@Token AS BINARY(32))));

        IF @Tipo = 'PEDIDO' AND EXISTS (SELECT 1 FROM dbo.CarritoItem WHERE IDCarrito = @IDCarrito)
        BEGIN
            -- El cupón se aplica solo si el carrito cumple sus condiciones en este momento.
            SET @IDCupon = (SELECT IDCupon FROM dbo.Cupon WHERE Codigo = @Cupon);
            IF @IDCupon IS NOT NULL
               AND NOT EXISTS (SELECT 1
                               FROM dbo.FU_Cupones_Validar(@IDCupon, @IDUsuario, NULL, SYSUTCDATETIME()) AS v
                               OUTER APPLY dbo.FU_Cupones_CalculoDescuento(@IDCupon, @IDCarrito) AS d
                               WHERE COALESCE(v.CodigoError, d.CodigoError) IS NOT NULL)
                EXEC dbo.SP_Carrito_AplicarCupon @IDUsuario, @Token, @Cupon;

            SET @Clave = NEWID();
            IF @IDUsuario IS NOT NULL
                EXEC dbo.SP_Checkout_Iniciar @IDUsuario = @IDUsuario, @ClaveIdempotencia = @Clave, @IDMetodoEnvio = @IDMetodo,
                                             @IDDireccion = @IDDireccion;
            ELSE
            BEGIN
                SELECT @Correo = i.Correo, @Nombre = i.Nombre, @Telefono = i.Telefono, @Linea1 = i.Linea1, @IDMunicipio = i.IDMunicipio
                FROM #PlanPedido AS p JOIN #Invitado AS i ON i.Numero = p.NumeroInvitado WHERE p.IDPlan = @Referencia;
                EXEC dbo.SP_Checkout_Iniciar @TokenInvitadoHash = @Token, @ClaveIdempotencia = @Clave, @IDMetodoEnvio = @IDMetodo,
                                             @Correo = @Correo, @NombreDestinatario = @Nombre, @Telefono = @Telefono, @Linea1 = @Linea1,
                                             @IDMunicipio = @IDMunicipio;
            END;
            SET @IDCheckout = (SELECT MAX(IDCheckout) FROM dbo.Checkout WHERE IDCarrito = @IDCarrito);

            -- Pago aprobado por la pasarela (datos de tarjeta de prueba).
            EXEC #Azar 10, @r OUTPUT;
            SET @Marca = CASE WHEN @r < 6 THEN 'VISA' WHEN @r < 9 THEN 'MASTERCARD' ELSE 'AMEX' END;
            EXEC #Azar 10000, @r OUTPUT;
            SET @Ultimos4 = RIGHT(CONCAT('000', @r), 4);
            EXEC #Azar 1000000, @r OUTPUT;
            SET @Autorizacion = CONCAT('A', RIGHT(CONCAT('00000', @r), 6));
            SET @Referencia2 = CONCAT('DEMO-', RIGHT(CONCAT('0000', @Referencia), 5));
            SET @Seguimiento = HASHBYTES('SHA2_256', CONCAT('seguimiento-demo-', @Referencia));
            EXEC dbo.SP_Pedidos_Crear @IDUsuario, @Token, @IDCheckout, @Marca, @Ultimos4, @Autorizacion, @Referencia2, @Seguimiento;
            UPDATE #PlanPedido SET IDPedido = (SELECT IDPedido FROM dbo.Pedido WHERE IDCheckout = @IDCheckout) WHERE IDPlan = @Referencia;
        END;
    END

    ELSE IF @Tipo IN ('PREPARAR', 'ENVIAR', 'ENTREGAR', 'CANCELAR_CLIENTE', 'CANCELAR_OPERADOR', 'DEVOLVER')
    BEGIN
        SELECT @IDPedido = p.IDPedido, @Resultado = p.Resultado, @IDUsuario = c.IDUsuario
        FROM #PlanPedido AS p LEFT JOIN #Cliente AS c ON c.Numero = p.NumeroCliente
        WHERE p.IDPlan = @Referencia;

        -- Un pedido que no se pudo crear (sin existencia para ninguna línea) no tiene eventos.
        IF @IDPedido IS NOT NULL
        BEGIN
            IF @Tipo = 'PREPARAR'
                EXEC dbo.SP_Pedidos_CambiarEstado @Operador, @IDPedido, 'EN_PREPARACION';
            ELSE IF @Tipo = 'ENVIAR'
                EXEC dbo.SP_Pedidos_CambiarEstado @Operador, @IDPedido, 'ENVIADO', N'Entregado a la mensajería.';
            ELSE IF @Tipo = 'ENTREGAR'
                EXEC dbo.SP_Pedidos_CambiarEstado @Operador, @IDPedido, 'ENTREGADO';
            ELSE IF @Tipo = 'CANCELAR_CLIENTE'
                EXEC dbo.SP_Pedidos_Cancelar @IDUsuario, @IDPedido, N'Ya no necesito el producto.';
            ELSE IF @Tipo = 'CANCELAR_OPERADOR'
                EXEC dbo.SP_Pedidos_Cancelar @Operador, @IDPedido, N'El cliente solicitó la cancelación por teléfono.';
            ELSE
            BEGIN
                -- Total: todas las unidades. Parcial: una unidad de la primera línea. 1 de cada 4 llega dañada (no reingresa).
                EXEC #Azar 4, @r OUTPUT;
                DELETE FROM @Lineas;
                INSERT INTO @Lineas (IDPedidoDetalle, Cantidad, Reingresa)
                SELECT d.IDPedidoDetalle, CASE WHEN @Resultado = 'DEVUELTO' THEN d.Cantidad ELSE 1 END, CASE WHEN @r = 0 THEN 0 ELSE 1 END
                FROM dbo.PedidoDetalle AS d
                WHERE d.IDPedido = @IDPedido
                  AND (@Resultado = 'DEVUELTO'
                       OR d.IDPedidoDetalle = (SELECT MIN(x.IDPedidoDetalle) FROM dbo.PedidoDetalle AS x WHERE x.IDPedido = @IDPedido));
                SET @Motivo = CASE WHEN @r = 0 THEN N'El producto llegó dañado.' WHEN @Resultado = 'DEVUELTO' THEN N'El cliente cambió de opinión.'
                                   ELSE N'La talla o el modelo no era el esperado.' END;
                EXEC dbo.SP_Devoluciones_Registrar @Operador, @IDPedido, @Motivo, @Lineas;
            END;
        END;
    END

    ELSE IF @Tipo = 'REABASTO'
    BEGIN
        -- Entrada de 40 unidades de cada variante en venta con menos de 20 disponibles (salvo las de existencia fija).
        DELETE FROM @Movimiento;
        INSERT INTO @Movimiento (IDVariante, Cantidad)
        SELECT d.IDVariante, 40
        FROM dbo.FU_Inventario_Disponibilidad(SYSUTCDATETIME()) AS d
        JOIN dbo.Variante AS v ON v.IDVariante = d.IDVariante
        JOIN #DefVariante AS dv ON dv.SKU = v.SKU AND dv.Especial = 0
        WHERE d.Disponible < 20 AND v.Activo = 1;
        IF EXISTS (SELECT 1 FROM @Movimiento)
            EXEC dbo.SP_Inventario_RegistrarMovimiento @Operador, 'ENTRADA_COMPRA', NULL, @Movimiento;
    END

    ELSE IF @Tipo = 'AJUSTE'
    BEGIN
        DELETE FROM @Movimiento;
        INSERT INTO @Movimiento (IDVariante, Cantidad) SELECT IDVariante, 2 FROM dbo.Variante WHERE SKU = 'TAZ';
        EXEC dbo.SP_Inventario_RegistrarMovimiento @Operador, 'AJUSTE_SALIDA', N'Dos tazas quebradas en bodega.', @Movimiento;
    END

    ELSE IF @Tipo = 'PRECIO'
    BEGIN
        -- 1: la consola de 1 TB baja a Q4,399; 2: los audífonos suben a Q449; 3: el café sube a Q69.
        DECLARE cPrecios CURSOR LOCAL FAST_FORWARD FOR
            SELECT v.IDVariante, v.VersionFila, x.Precio
            FROM dbo.Variante AS v
            JOIN (VALUES (1, 'CON-%-1TB', 4399.00), (2, 'AUD-%', 449.00), (3, 'CAF', 69.00)) AS x (Referencia, Patron, Precio)
              ON v.SKU LIKE x.Patron
            WHERE x.Referencia = @Referencia;
        OPEN cPrecios;
        FETCH NEXT FROM cPrecios INTO @IDVariante, @Version, @Precio;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            EXEC dbo.SP_Catalogo_CambiarPrecio @IDAdmin, @IDVariante, @Precio, @Version;
            FETCH NEXT FROM cPrecios INTO @IDVariante, @Version, @Precio;
        END;
        CLOSE cPrecios;
        DEALLOCATE cPrecios;
    END

    ELSE IF @Tipo = 'DESCONTINUAR'
    BEGIN
        SET @Referencia = (SELECT IDProducto FROM dbo.Producto WHERE Slug = 'bocina-retro');
        EXEC dbo.SP_Catalogo_CambiarEstadoProducto @IDAdmin, @Referencia, 0;
    END

    ELSE IF @Tipo = 'FIN'
    BEGIN
        -- VERANO20 vence el día 100 (se usó durante su vigencia).
        DECLARE @c_ID INT, @c_Codigo VARCHAR(30), @c_Desc NVARCHAR(300), @c_Tipo VARCHAR(12), @c_Valor DECIMAL(12, 2), @c_Min DECIMAL(12, 2),
                @c_Inicio DATETIME2(3), @c_Fin DATETIME2(3), @c_Total INT, @c_Cliente INT, @c_Cat INT, @c_Reg BIT;
        SELECT @c_ID = IDCupon, @c_Codigo = Codigo, @c_Desc = Descripcion, @c_Tipo = TipoDescuento, @c_Valor = Valor, @c_Min = MontoMinimo,
               @c_Inicio = FechaInicio, @c_Total = LimiteUsosTotal, @c_Cliente = LimiteUsosPorCliente, @c_Cat = IDCategoria,
               @c_Reg = SoloRegistrados, @Version = VersionFila
        FROM dbo.Cupon WHERE Codigo = 'VERANO20';
        SET @c_Fin = DATEADD(HOUR, 6, DATEADD(DAY, 100, @Dia0Local));
        EXEC dbo.SP_Cupones_Actualizar @IDAdmin, @c_ID, @c_Codigo, @c_Desc, @c_Tipo, @c_Valor, @c_Min, @c_Inicio, @c_Fin, @c_Total, @c_Cliente,
                                       @c_Cat, @c_Reg, @Version;
    END;

    SET @Secuencia += 1;
END;
GO

/* =========================================================================================
   Traslado de las fechas a la línea de tiempo simulada
   ========================================================================================= */
/*
    Cada fecha generada durante la semilla (hora real >= el primer evento) pasa al tramo
    simulado de su evento: simulado del evento + lo transcurrido desde que empezó. Los
    vencimientos de checkout y reserva conservan su plazo desde la creación. Las vigencias de
    los cupones son datos del negocio y no se trasladan.
    Los triggers de inmutabilidad y de estados se desactivan solo para este paso y dentro de
    la transacción: si algo falla, también se revierte.
*/
DISABLE TRIGGER dbo.TR_Bitacora_Inmutable ON dbo.Bitacora;
DISABLE TRIGGER dbo.TR_HistorialPrecio_Inmutable ON dbo.HistorialPrecio;
DISABLE TRIGGER dbo.TR_MovimientoInventario_Inmutable ON dbo.MovimientoInventario;
DISABLE TRIGGER dbo.TR_PedidoHistorialEstado_Inmutable ON dbo.PedidoHistorialEstado;
DISABLE TRIGGER dbo.TR_Pedido_Estado ON dbo.Pedido;

DECLARE @Columnas TABLE (Tabla SYSNAME COLLATE DATABASE_DEFAULT, Columnas NVARCHAR(500) COLLATE DATABASE_DEFAULT);
INSERT INTO @Columnas (Tabla, Columnas) VALUES
    ('Usuario', 'FechaCreacion,FechaModificacion,UltimoAcceso'), ('Atributo', 'FechaCreacion'), ('AtributoValor', 'FechaCreacion'),
    ('Categoria', 'FechaCreacion,FechaModificacion'), ('Producto', 'FechaCreacion,FechaModificacion'),
    ('Variante', 'FechaCreacion,FechaModificacion'), ('ProductoImagen', 'FechaCreacion'), ('HistorialPrecio', 'Fecha'),
    ('MovimientoInventario', 'Fecha'), ('MetodoEnvio', 'FechaCreacion,FechaModificacion'), ('Cupon', 'FechaCreacion,FechaModificacion'),
    ('Direccion', 'FechaCreacion,FechaModificacion'), ('Carrito', 'FechaCreacion,FechaUltimaActividad'),
    ('CarritoItem', 'FechaAgregado,FechaModificacion'), ('Checkout', 'FechaCreacion,FechaCierre'),
    ('ReservaInventario', 'FechaCreacion,FechaCierre'), ('Pedido', 'FechaPedido,FechaModificacion'), ('PedidoHistorialEstado', 'Fecha'),
    ('Pago', 'Fecha'), ('CuponUso', 'Fecha,FechaReversion'), ('Devolucion', 'Fecha'), ('Bitacora', 'Fecha');

-- Valor trasladado de una columna (ver arriba); conserva el original si no se generó en esta semilla.
DECLARE @Traslado NVARCHAR(400) = N'ISNULL((SELECT TOP (1) DATEADD(MILLISECOND, DATEDIFF(MILLISECOND, r.Real, t.{c}), r.Simulado) '
                                + N'FROM #Reloj AS r WHERE r.Real <= t.{c} ORDER BY r.Real DESC), t.{c})';
DECLARE @Sql NVARCHAR(MAX);
SELECT @Sql = STRING_AGG(x.Sentencia, NCHAR(10))
FROM (
    SELECT N'UPDATE t SET '
           + STRING_AGG(CAST(CASE WHEN c.Tabla IN ('Checkout', 'ReservaInventario') AND s.value = 'FechaCreacion'
                                  THEN N'FechaExpiracion = DATEADD(MILLISECOND, DATEDIFF(MILLISECOND, t.FechaCreacion, t.FechaExpiracion), '
                                       + REPLACE(@Traslado, N'{c}', N'FechaCreacion') + N'), '
                                  ELSE N'' END
                             + QUOTENAME(s.value) + N' = ' + REPLACE(@Traslado, N'{c}', QUOTENAME(s.value)) AS NVARCHAR(MAX)), N', ')
           + N' FROM dbo.' + QUOTENAME(c.Tabla) + N' AS t;' AS Sentencia
    FROM @Columnas AS c
    CROSS APPLY STRING_SPLIT(c.Columnas, ',') AS s
    GROUP BY c.Tabla
) AS x;
EXEC sys.sp_executesql @Sql;

ENABLE TRIGGER dbo.TR_Bitacora_Inmutable ON dbo.Bitacora;
ENABLE TRIGGER dbo.TR_HistorialPrecio_Inmutable ON dbo.HistorialPrecio;
ENABLE TRIGGER dbo.TR_MovimientoInventario_Inmutable ON dbo.MovimientoInventario;
ENABLE TRIGGER dbo.TR_PedidoHistorialEstado_Inmutable ON dbo.PedidoHistorialEstado;
ENABLE TRIGGER dbo.TR_Pedido_Estado ON dbo.Pedido;
GO

COMMIT TRANSACTION;
GO

:out STDOUT
:error STDOUT
SET NOCOUNT ON;
DECLARE @Resumen NVARCHAR(400) = (
    SELECT CONCAT(N'   Semilla de demostración: ', (SELECT COUNT(*) FROM dbo.Producto), N' productos, ', (SELECT COUNT(*) FROM dbo.Variante),
                  N' variantes, ', (SELECT COUNT(*) FROM dbo.Usuario WHERE EsSistema = 0), N' usuarios, ', (SELECT COUNT(*) FROM dbo.Pedido),
                  N' pedidos, ', (SELECT COUNT(*) FROM dbo.Carrito WHERE Estado = 'ACTIVO'), N' carritos activos.'));
PRINT @Resumen;
DROP TABLE IF EXISTS #DefValor, #DefCategoria, #DefProducto, #DefVariante, #DefImagen, #Cliente, #Invitado, #Contexto, #Reloj, #Evento,
                     #PlanPedido, #PlanLinea, #PlanCarrito, #PlanCarritoLinea;
DROP PROCEDURE IF EXISTS #Azar;
DROP PROCEDURE IF EXISTS #Marcar;
GO
