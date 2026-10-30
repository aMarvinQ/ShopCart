# ShopCart

Plataforma web de ventas con carrito de compras: catálogo con variantes, inventario con kardex, cupones, checkout con reserva de existencia, gestión de pedidos y devoluciones, dashboard y bitácora.

| Capa | Tecnología |
|---|---|
| Base de datos | Microsoft SQL Server 2019 · acceso exclusivo mediante stored procedures |
| Backend | Node.js 24 LTS · TypeScript (strict) · Express |
| Frontend | React 18+ · TypeScript |

---

## Estructura del repositorio

```
ShopCart/
  database/
    bootstrap/         Crea la BD, logins, usuarios, rol de la API y control de versiones (sysadmin)
    migrations/        Estructura: tablas, índices, tipos tabla (se aplican una sola vez)
    programmability/   Funciones, vistas, stored procedures, triggers y permisos (CREATE OR ALTER)
    seed/              Datos semilla
    tests/api/         Pruebas de permisos (se ejecutan como la API)
    tests/integridad/  Pruebas de restricciones (como el migrador; revierten sus datos)
    tests/calculos/    Pruebas de resultados de funciones y vistas (como el migrador; revierten sus datos)
    tests/procedimientos/  Pruebas de los SPs, ejecutados como la API (revierten sus datos)
    herramientas/      Utilidades de desarrollo (no forman parte del despliegue)
    deploy.ps1         Despliegue reproducible de la base de datos
  docs/                Diagrama entidad-relación, catálogo de errores y diagramas de apoyo
```

Modelo de datos: [docs/ER.md](docs/ER.md) · Errores de los stored procedures: [docs/errores.md](docs/errores.md).

---

## Requisitos

- SQL Server 2019 o superior con **autenticación mixta** y **TCP/IP habilitado**.
- `sqlcmd` en el PATH (incluido con las herramientas de SQL Server).
- Windows PowerShell 5.1 o superior.
- Una cuenta Windows con rol `sysadmin` en la instancia (solo para el bootstrap).
- Node.js 24 LTS.

---

## Instalación

### 1. Base de datos

```powershell
cd database
Copy-Item .env.example .env
# Edita .env: servidor (SQL_SERVER) y contraseñas de los logins shopcart_migrator y shopcart_api

.\deploy.ps1 -Bootstrap   # una vez, con una cuenta sysadmin: BD, logins, usuarios y permisos
.\deploy.ps1              # aplica migraciones, objetos programables y semillas
.\deploy.ps1 -Probar      # pruebas de permisos, integridad, cálculos y stored procedures
```

Para reconstruir la base desde cero en desarrollo: `.\deploy.ps1 -Bootstrap -Recrear` y luego `.\deploy.ps1`.

---

## Decisiones técnicas

### Seguridad de la base de datos: mínimo privilegio

| Login | Permisos | Uso |
|---|---|---|
| Cuenta Windows del instalador | `sysadmin` | Solo el bootstrap: crear la BD y los logins |
| `shopcart_migrator` | `db_owner` **solo** de ShopCart (no es sysadmin) | Crear y modificar tablas, SPs, vistas y funciones |
| `shopcart_api` (rol `RolApi`) | **Solo `EXECUTE`** sobre el esquema `dbo` | Conexión de la API |

- `RolApi` tiene `DENY SELECT, INSERT, UPDATE, DELETE` sobre `dbo`: la API no puede leer ni escribir tablas, vistas ni funciones directamente. Los stored procedures sí pueden hacerlo gracias al *ownership chaining* (SPs y tablas pertenecen a `dbo`). Así, la regla "todo el acceso a datos mediante stored procedures" la impone el motor y no solo la disciplina del código.
- Consecuencia: los SPs no usan SQL dinámico (`sp_executesql` rompe la cadena de propiedad). Los filtros opcionales y el ordenamiento se resuelven con SQL estático.
- Las contraseñas se definen en `database/.env` (excluido de Git) y llegan a `sqlcmd` por variables de entorno del proceso, nunca por la línea de comandos.

### Configuración de la base de datos

- **Collation `Modern_Spanish_100_CI_AI`**: búsquedas sin distinguir mayúsculas ni tildes ("cafe" encuentra "Café").
- **`READ_COMMITTED_SNAPSHOT ON`**: las lecturas (catálogo, reportes) no bloquean ni esperan a las escrituras (checkout). Las lecturas que deciden una escritura usan `UPDLOCK`.

### Despliegue versionado

- Scripts numerados con formato `000_Descripcion.sql`; el número es único en todo el proyecto.
- `deploy.ps1` registra cada script aplicado en `Despliegue.VersionEsquema` con su checksum SHA-256, usando stored procedures con parámetros.
- `migrations/` y `seed/` son **inmutables** una vez aplicados: un cambio se hace con un script nuevo. `programmability/` se vuelve a aplicar cuando cambia su contenido.
- Los cambios a la base se hacen **solo** con `deploy.ps1`. Volver a ejecutarlo es seguro: lo ya aplicado se omite y, si un script aplicado fue modificado, el despliegue se detiene en lugar de dejar el esquema distinto al del repositorio. Por eso las migraciones no usan `IF NOT EXISTS`: si un objeto ya existe sin estar registrado, es preferible fallar (y revertir la transacción) a ocultar la diferencia.
- El esquema `Despliegue` está separado del de la aplicación y `RolApi` no tiene acceso a él.
- `sqlcmd` se ejecuta con `QUOTED_IDENTIFIER ON` (`-I`), requerido por los índices filtrados, y lee los scripts como UTF-8.

### Integridad de datos en la base

Las reglas críticas las garantiza la base de datos, no solo la API: aunque un SP tuviera un error, el dato inválido no se guarda. La lista completa de reglas y su mecanismo está en [docs/ER.md](docs/ER.md).

- **Restricciones declarativas**: `CHECK`, `UNIQUE` (incluidos índices únicos filtrados, p. ej. un solo pago aprobado por checkout) y llaves foráneas **compuestas** que impiden cruzar datos (un cliente no puede usar la dirección de otro, una línea devuelta pertenece al pedido de su devolución, un valor "Rojo" no puede guardarse como Talla).
- **Montos** en `DECIMAL(12,2)` (nunca `FLOAT`); los totales de checkout, pedido y líneas se validan con `CHECK` (`Total = Subtotal − Descuento + CostoEnvio`, `Total = BaseImponible + IVA`). Los precios incluyen IVA (12 %).
- **Fechas** en UTC (`DATETIME2(3)`).
- **Inventario**: la existencia física solo cambia junto con un movimiento del kardex; cada movimiento cuadra (`SaldoNuevo = SaldoAnterior + Cantidad`) y nunca deja existencia negativa. Existencia disponible = física − reservas activas no vencidas, así una reserva vencida deja de contar en el mismo instante en que vence.
- **Idempotencia**: un checkout produce como máximo un pedido (`UQ_Pedido_IDCheckout`) y nunca se cobra dos veces (`UQ_Pago_CheckoutAprobado`), aun con doble clic o peticiones simultáneas.
- **Snapshot**: checkout y pedido copian precios, dirección, método de envío y cupón; editar el catálogo después no altera pedidos existentes.
- **Auditoría inmutable**: kardex, historial de precios, historial de estados y bitácora no admiten `UPDATE` ni `DELETE` (triggers `TR_*_Inmutable`). Los registros de negocio no se borran: se desactivan.
- **Pagos (PCI DSS)**: solo se guardan marca, últimos 4 dígitos, código de autorización y referencia; nunca el número completo, el CVV ni el vencimiento.

### Ciclo de vida del pedido

```mermaid
stateDiagram-v2
    [*] --> PAGADO : pago aprobado
    PAGADO --> EN_PREPARACION : Operador
    PAGADO --> CANCELADO : Cliente u Operador
    EN_PREPARACION --> ENVIADO : Operador (despacho)
    EN_PREPARACION --> CANCELADO : Operador
    ENVIADO --> ENTREGADO : Operador
    ENTREGADO --> DEVUELTO_PARCIAL : devolución parcial
    ENTREGADO --> DEVUELTO : devolución total
    DEVUELTO_PARCIAL --> DEVUELTO : devolución de lo restante
    CANCELADO --> [*]
    DEVUELTO --> [*]
```

- Un pedido se crea solo con un pago aprobado y puede cancelarse mientras no haya sido despachado.
- Las transiciones permitidas están en la tabla `TransicionEstadoPedido`. El trigger `TR_Pedido_Estado` rechaza cualquier otra y registra cada cambio en `PedidoHistorialEstado` con usuario, fecha y hora, estado anterior y nuevo; ningún proceso puede cambiar un estado sin dejar rastro. La API valida las mismas reglas antes de llegar a la base.
- Cancelar o devolver reintegra la existencia con movimientos del kardex. Cancelar un pedido pagado revierte el uso del cupón; una devolución no.

### Funciones, vistas y tipos tabla

Son piezas internas que usan los stored procedures; la API no puede leerlas directamente (`SELECT` denegado), solo ejecuta SPs. Cada cálculo delicado existe **una sola vez**, así el carrito, el checkout y los reportes nunca calculan distinto.

| Objeto | Responsabilidad |
|---|---|
| `FU_Inventario_Disponibilidad` | Disponible = existencia física − reservas activas no vencidas. Una reserva vencida deja de contar en el mismo instante en que vence, sin depender del job de limpieza. |
| `FU_Catalogo_OrdenVariantes` | Orden lógico de las variantes según el orden de atributos de la categoría y la variante de selección inicial (la primera disponible), de la que sale el único precio del listado. |
| `FU_Catalogo_ValidarDatos` | Reglas de nombre, slug, descripción y color de categorías, productos, atributos y valores, con su error estable. |
| `FU_Catalogo_ValidarVariantes` / `FU_Catalogo_ValidarImagenes` | Reglas de las variantes (atributos de la categoría, mismos atributos en todas, sin combinaciones ni SKU repetidos) y de las imágenes de un producto, en operaciones de conjunto; las comparten el alta del producto y los SPs que agregan variantes o imágenes. |
| `FU_Carrito_Lineas` | Líneas del carrito con el precio vigente: única fuente del importe de cada línea. |
| `FU_Cupones_Validar` / `FU_Cupones_CalculoDescuento` | Reglas del cupón (vigencia, usos totales y por cliente, solo registrados, monto mínimo, categoría) con un código de error estable para cada caso, y el monto del descuento. |
| `FU_Cupones_ProrrateoDescuento` | Reparte el descuento entre las líneas con el método del mayor residuo: la suma cuadra al centavo y ninguna línea recibe más que su importe. |
| `FU_Seguridad_Actor` | Rol de quien ejecuta una acción, solo si está activo: los SPs administrativos validan el permiso aunque la API ya lo haya hecho. |
| `FU_Usuarios_ValidarDatos` | Reglas de correo, hash, nombre y teléfono con su error estable; las comparten el registro, el alta de usuarios internos y la edición del perfil. |
| `VW_Usuarios_Detalle` | Forma única en que se devuelve un usuario: nunca incluye el hash y excluye al usuario de sistema. |
| `FU_Pedidos_DesgloseIVA` | `BaseImponible = ROUND(Total / 1.12, 2)` e `IVA = Total − BaseImponible`, con la tasa tomada de `Parametro`. |
| `VW_Inventario_Conciliacion` | Por variante: existencia física vs. suma del kardex vs. último saldo, y detección de saltos en la cadena de saldos. |
| `VW_Reportes_VentasNetas` / `VW_Reportes_LineasVendidas` | Base de los reportes: qué cuenta como venta, neta de devoluciones, en hora de Guatemala. |
| Tipos `TT_*` | Envían varias filas a un SP en una sola llamada y una sola transacción (p. ej. un producto con todas sus variantes). Son parámetros tipados, no texto: no admiten inyección SQL. |

Todas las funciones son *inline*: el optimizador las integra a la consulta que las usa, así un filtro por variante o producto llega hasta el índice. Las consultas de los reportes se verificaron con volumen (20 000 pedidos): consultar un periodo lee solo las filas de ese periodo gracias a índices cubrientes.

### Stored procedures: contrato con la API

- **Plantilla común**: `SET NOCOUNT ON`, `SET XACT_ABORT ON`, validaciones antes de abrir la transacción, `TRY/CATCH` que revierte y relanza el error original (nunca se oculta).
- **Identidad desde el token**: el usuario que actúa (`@IDUsuarioSolicitante`, `@IDUsuarioAccion`) lo toma la API del JWT, nunca del cuerpo de la petición; cada SP filtra por él, así un cliente no puede ver ni modificar datos de otro cambiando un ID en la URL. Los SPs que modifican datos lo fijan en `SESSION_CONTEXT` para los triggers y la bitácora.
- **Errores con código estable**: `THROW` con un número por rango (validación, no encontrado, permiso, autenticación, conflicto) y un código como `CORREO_REGISTRADO`. La API traduce el rango a HTTP sin interpretar textos. Catálogo completo: [docs/errores.md](docs/errores.md).
- **Parámetros más largos que la columna**: los textos se declaran con un carácter más que la columna; un valor demasiado largo se rechaza en lugar de guardarse recortado en silencio.
- **Búsquedas**: filtros opcionales con SQL estático y `OPTION (RECOMPILE)`; los comodines de `LIKE` que escribe el usuario (`%`, `_`, `[`) se buscan como texto.
- **Un solo conjunto de resultados por SP**: las listas hijas (los atributos de una categoría, los valores de un atributo) van en una columna JSON. La API lee una sola respuesta con la estructura ya anidada.
- **Edición concurrente**: los formularios de edición envían la `VersionFila` (`ROWVERSION`) que cargaron; si otro usuario guardó cambios después, el SP responde `EDICION_CONCURRENTE` en lugar de sobrescribirlos.
- **Bitácora sin ruido**: guardar los mismos valores, o repetir el estado actual, no es un error ni genera registro.

### Catálogo

- **Nada se elimina**: categorías, atributos y valores se desactivan. Un atributo o valor desactivado ya no se ofrece para variantes nuevas, pero lo conservan las que ya lo usan.
- **Desactivar una categoría** oculta sus productos en la tienda sin cambiar el estado de cada uno; al reactivarla vuelven tal como estaban.
- **Atributos por categoría**: no se puede quitar de una categoría un atributo que usa alguna de sus variantes. Quien cambia los atributos de una categoría y quien crea variantes en ella bloquean primero la categoría (orden `Categoria → Producto → Variante`), así la validación no compite con una variante que se está creando.
- **Slug**: lo genera la API a partir del nombre (sin tildes, `ñ` → `n`) y el administrador puede editarlo; la base valida el formato y que no se repita.
- **Alta de un producto en una sola llamada**: producto, variantes con sus atributos e imágenes viajan en tipos tabla y se guardan en una transacción. La existencia inicial entra al kardex como `INVENTARIO_INICIAL` y el precio inicial a `HistorialPrecio`: el saldo de cada variante cuadra con su kardex desde el primer día.
- **Un producto nace inactivo** y solo se activa con al menos una imagen y una variante activa. Mientras esté activo no se puede quitar su última imagen ni desactivar su última variante activa; para retirarlo se desactiva el producto.
- **Agotada no es lo mismo que desactivada**: una variante sin existencia se sigue mostrando como agotada y vuelve sola cuando entra mercadería; desactivarla la retira de la venta. Una venta fuera del sistema se registra como ajuste de inventario, no desactivando la variante.
- **Precios**: el único camino para cambiar un precio guarda `HistorialPrecio` y bitácora en la misma transacción.
- **Tienda**: un producto es visible si está activo, su categoría está activa y tiene al menos una variante activa. La búsqueda filtra por texto (nombre y descripción), categoría, rango de precio y disponibilidad, con orden de una lista blanca y paginación.
- **Precio mostrado**: la tarjeta muestra un solo precio, el de la selección inicial (la primera variante disponible en el orden de los selectores). El rango y el orden por precio usan ese mismo precio, así ninguna tarjeta queda fuera del rango que pidió el cliente y la tarjeta coincide con el detalle al abrirlo. La imagen de la tarjeta es la principal del color de esa variante.
- **Imagen principal**: cada grupo de imágenes (las generales o las de un mismo color) tiene siempre exactamente una; si no se marca, se toma la de menor orden, y si se elimina la principal se promueve la siguiente.

### Autenticación y sesiones

- **Contraseñas**: la API las procesa con Argon2id; la base solo recibe y guarda el hash (un `CHECK` rechaza cualquier otro formato). El inicio de sesión no revela si un correo está registrado.
- **Refresh token** opaco en cookie `httpOnly`; la base guarda solo su SHA-256. Se **rota en cada uso** y vence a los 7 días sin uso; aunque se use a diario, la sesión termina a los 30 días del inicio de sesión. Ambos valores están en `Parametro`, así la base es la única fuente de la regla.
- **Robo de sesión**: si se presenta un token que ya fue rotado, se asume robado y se revoca la sesión completa. Excepción: dentro de los 30 segundos siguientes a la rotación se rechaza sin cerrar la sesión, porque es el caso legítimo de dos pestañas renovando a la vez. Dos renovaciones simultáneas se serializan con un bloqueo: una rota y la otra recibe `ROTACION_CONCURRENTE`.
- **Desactivar un usuario** revoca todas sus sesiones en la misma transacción; el access token ya emitido deja de servir al vencer (máximo 15 minutos). Cambiar la contraseña cierra las demás sesiones.
- **Orden de bloqueo**: todos los SPs del módulo bloquean primero `Usuario` y después `RefreshToken`, así una desactivación simultánea a un inicio de sesión o una rotación no puede dejar una sesión viva ni producir interbloqueos.

### Inventario

- **Un solo camino para mover existencia**: cada cambio inserta su movimiento en el kardex (saldo anterior → nuevo, usuario, fecha, motivo y documento de origen) y actualiza la existencia en la misma transacción, con la variante bloqueada. Así la existencia siempre es la suma del kardex, y `SP_Inventario_Conciliar` lo demuestra: devuelve vacío cuando todo cuadra.
- **Movimientos manuales**: operadores y administradores registran entradas por compra y ajustes (de entrada o salida) con varias variantes a la vez; los ajustes exigen motivo. Ventas, cancelaciones y devoluciones las registran sus propios procesos.
- **Las unidades reservadas no se tocan**: una salida solo puede tomar lo disponible (existencia menos reservas vigentes), así quien está pagando no se queda sin la unidad que apartó. Verificado con dos sesiones simultáneas: la segunda espera el bloqueo de la primera y se rechaza con `STOCK_INSUFICIENTE`.
- **Una venta fuera del sistema** se registra como ajuste de salida con su motivo, no desactivando la variante.

### Carrito

- **De un cliente o de un invitado**: el invitado se identifica con un token aleatorio en una cookie `httpOnly`; la base solo guarda su SHA-256. Cada cliente tiene un solo carrito activo.
- **Sin precios guardados**: el carrito muestra siempre el precio vigente; el precio se congela al iniciar el checkout.
- **Tope por línea**: cada variante admite como máximo el menor entre el límite configurable `MAXIMO_UNIDADES_POR_LINEA` y lo disponible. Al agregar más, el error indica cuántas se pueden llevar. El carrito no reserva: la garantía de existencia llega en el checkout.
- **Productos que dejan de venderse no desaparecen**: si una variante, su producto o su categoría se desactivan, o la existencia baja, la línea se marca (`NO_DISPONIBLE`, `AGOTADO`, `CANTIDAD_EXCEDIDA`) y no se puede pasar al checkout hasta corregirla.
- **Fusión al iniciar sesión**: si el cliente no tiene carrito, el del invitado pasa a ser suyo; si tiene, se agregan las líneas del invitado y las variantes repetidas suman sus cantidades, topadas al límite y a lo disponible. Iniciar sesión nunca falla por el carrito.
- **Peticiones simultáneas**: cada operación bloquea primero el carrito, así dos pestañas que agregan a la vez se ejecutan en orden y, si aún no hay carrito, se crea uno solo. Verificado con dos sesiones simultáneas.

### Cupones

- **Porcentaje o monto fijo**, sobre todo el carrito o solo sobre una categoría, con monto mínimo de compra, vigencia, límite total de usos, límite por cliente (contado por correo, así también aplica a invitados) y opción "solo clientes registrados".
- **Un cupón por carrito**: aplicar otro lo reemplaza. Aplicarlo no consume usos; el uso se consume al pagar y se revierte si el pedido se cancela.
- **Nunca se cobra más de lo esperado sin aviso**: si el cupón aplicado deja de cumplir (el carrito baja del monto mínimo, el cupón vence o se desactiva), el carrito lo sigue mostrando con descuento 0, el motivo y cuánto falta, y no se puede pasar al checkout hasta que el cliente decida.
- **Respuesta uniforme**: un código inexistente y uno desactivado responden igual, para no revelar qué códigos existen.
- **Historial confiable**: los cupones no se eliminan, se desactivan; y después del primer uso su código, tipo, valor y categoría quedan fijos (otra promoción = otro cupón). Cada cambio queda en la bitácora.
- **Mejora futura**: cupones asignados a clientes específicos y emitidos por reglas (p. ej. "tras 2 compras, envío gratis por 15 días"), y envío gratis desde un monto por método de envío. El modelo actual lo admite sin rehacer nada: los usos ya identifican al cliente por correo.

### Envíos y direcciones

- **Municipios como catálogo**, no texto libre: cada municipio pertenece a su departamento (llave foránea, códigos del INE) y la dirección guarda solo el municipio; el departamento se deduce de él, así "Mixco, Petén" no se puede guardar.
- **Libreta de direcciones del cliente**: hasta 5, con una predeterminada (la primera lo es automáticamente; si se elimina, la más reciente de las restantes toma su lugar). Se agregan desde el perfil o desde el checkout con el mismo diálogo, y el checkout solo recibe la dirección elegida.
- **Privacidad**: una dirección de otro cliente responde igual que una inexistente.
- **Los pedidos guardan una copia de la dirección**: editar o eliminar una dirección no altera pedidos ya realizados. "Eliminar" desactiva, porque un checkout puede referenciarla.
- **Métodos de envío**: el administrador los crea, edita (con control de edición concurrente) y desactiva; un costo nuevo aplica solo a compras nuevas. No se puede desactivar el último activo. Cada cambio queda en la bitácora.
- **Peticiones simultáneas**: cada operación de la libreta bloquea primero al cliente; verificado con dos sesiones que agregan la quinta y sexta dirección a la vez: la segunda espera y se rechaza con `LIMITE_DIRECCIONES`.

### Checkout

- **Reserva al pasar al pago**: al iniciar el checkout se congelan precios, cupón y envío, y cada unidad queda reservada 15 minutos (`MINUTOS_RESERVA`); mientras tanto nadie más puede tomarla. Verificado con dos compradores simultáneos por la última unidad: el segundo espera el bloqueo del primero y se rechaza con `STOCK_INSUFICIENTE`.
- **Sin dobles reservas**: repetir la petición con la misma clave de idempotencia (doble clic, reintento) devuelve el mismo checkout; iniciar otro cancela el anterior y libera sus unidades antes de verificar lo disponible.
- **Lo que se paga es lo que hay en el carrito**: si el carrito cambia después de iniciar (líneas, cantidades o cupón), el checkout deja de poder pagarse (`CARRITO_MODIFICADO`) y se reinicia.
- **Se valida todo de nuevo**: productos a la venta, tope por línea, cupón (ahora también el límite por cliente, con el correo) y existencia, con el primer problema como mensaje. El invitado escribe correo y dirección con las mismas reglas de la libreta.
- **Montos e IVA**: total = subtotal − descuento + envío; el descuento se reparte por línea cuadrado al centavo y el IVA incluido se desglosa (`TASA_IVA`).
- **Expiración**: un checkout vencido deja de restar disponibilidad en el instante en que vence; un proceso de la API lo marca `EXPIRADO` cada minuto y libera sus reservas en la misma transacción.
- **Pagos rechazados**: se registra cada intento con marca, últimos 4 dígitos y motivo; nunca el número completo, el CVV ni el vencimiento.

### Pedidos

- **Un pago aprobado, un pedido**: confirmar el pago crea en una sola transacción el pago, el pedido con su número (`SC-000123`), una copia de cada línea (SKU, nombre, variante y categoría), la salida de inventario con su kardex, el uso del cupón, y cierra el carrito y el checkout.
- **Doble clic y pagos simultáneos**: repetir el pago con la misma referencia devuelve el mismo pedido sin cobrar ni descontar otra vez; un segundo cobro distinto se rechaza para que la API lo anule. Verificado con dos sesiones simultáneas: un solo pedido y un solo pago. Además lo garantizan los índices únicos (un pago aprobado y un pedido por checkout).
- **El último uso de un cupón**: el cupón se bloquea y se revalida al pagar. Verificado con dos clientes pagando a la vez: el segundo se rechaza con `CUPON_AGOTADO` y el cupón queda 1/1.
- **Checkout vencido mientras se cobraba**: si todo sigue disponible, el pedido se acepta (el cliente ya pagó); si no, se rechaza para anular el cobro.
- **Ciclo de vida**: el operador avanza PAGADO → EN_PREPARACION → ENVIADO → ENTREGADO solo por transiciones permitidas; cada cambio queda en el historial (quién, cuándo, comentario) y en la bitácora.
- **Cancelación**: el cliente cancela su pedido mientras está PAGADO; el operador también EN_PREPARACION, con motivo obligatorio. Devuelve la existencia (kardex `CANCELACION`), revierte el uso del cupón y registra el reembolso del pago (simulado). El invitado la pide a la tienda.
- **Consultas**: "Mis pedidos" para el cliente, enlace de seguimiento para el invitado (solo el hash del token en la base) y panel con filtros por estado, fecha, número o correo. El cliente no ve quién cambió cada estado.

### Reglas de los reportes

- **Venta** = pedidos cuyo estado cuenta como venta (desde `PAGADO`; excluye `CANCELADO`).
- **Monto** = mercadería: subtotal − descuento − devoluciones. El costo de envío no es venta.
- **Devoluciones**: se descuentan en la **fecha del pedido**. Así, "ventas de octubre" responde cuánto se vendió realmente en octubre, y es consistente con el top 10 y las ventas por categoría.
- **Fechas**: se guardan en UTC y los reportes agrupan por día, semana y mes en hora de Guatemala (UTC−6).

### Pruebas de la base de datos

`.\deploy.ps1 -Probar` ejecuta cuatro suites:

- `tests/api`: conectado **como la API**, verifica que solo puede ejecutar SPs, que leer o escribir una tabla se rechaza y que puede enviar tipos tabla a un SP.
- `tests/integridad`: intenta guardar datos inválidos (totales que no cuadran, doble pedido del mismo checkout, transición de estado no permitida, modificar el kardex...) y verifica que los rechace **la restricción o el trigger esperado**, identificado por su nombre.
- `tests/calculos`: verifica los resultados de funciones y vistas con datos y fechas controlados (disponibilidad con reservas vencidas, cada error de cupón, prorrateo, IVA, conciliación del kardex, ventas netas). Incluye pruebas de propiedad: 2 500 descuentos prorrateados y 20 000 totales desglosados, sin un solo centavo de diferencia.
- `tests/procedimientos`: el migrador prepara los datos y ejecuta cada SP **haciéndose pasar por la API**, así cada prueba demuestra que el SP funciona y que la API tiene permiso para usarlo. Cubre cada código de error y los casos de sesión con el tiempo simulado: rotación, dos pestañas renovando a la vez, reúso de un token robado, vencimiento por inactividad y por el máximo de 30 días, cierre de sesión y desactivación del usuario. En el catálogo: edición concurrente, atributos en uso, validación de slug y color, alta de productos con kardex inicial, cada regla de variantes e imágenes, agotada frente a desactivada, bitácora, y en la tienda la visibilidad, el precio mostrado y cada filtro. En inventario: entradas y ajustes, motivo obligatorio, reservas vigentes frente a vencidas, kardex y conciliación. En el carrito: cliente e invitado, tope por límite y por disponible, estado de cada línea cuando el catálogo cambia, y la fusión al iniciar sesión. En cupones: alta y edición con sus reglas, situación de cada cupón, cada motivo de rechazo al aplicarlo y el cupón que deja de cumplir con el carrito abierto. En envíos: catálogos, cada regla de la libreta (máximo, predeterminada, direcciones ajenas) y la administración de métodos de envío. En checkout: reserva, idempotencia, cancelación del anterior, carrito modificado, invitado, expiración, pago rechazado y cada motivo de rechazo. En pedidos: compra completa, doble clic, cupón al pagar, checkout vencido, avance de estados, cancelación del cliente y del operador con reembolso, seguimiento del invitado y conciliación del kardex.

Todas ocurren en transacciones que se revierten: no dejan datos. En `tests/procedimientos` cada caso usa su propia transacción, porque un error dentro de un SP (`XACT_ABORT ON`) condena la transacción que lo envuelve. Por eso las fallas se cuentan en `SESSION_CONTEXT`, que no se revierte con la transacción del caso.

---

## Credenciales de prueba

_Se documentarán al cargar los datos semilla._
