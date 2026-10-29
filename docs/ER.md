# Diagrama entidad-relación

El diagrama se divide por módulo para que sea legible. Las fechas se guardan en UTC (`DATETIME2(3)`), los montos en `DECIMAL(12,2)` y ninguna tabla usa `FLOAT` ni `REAL`.

## Seguridad

```mermaid
erDiagram
    Rol ||--o{ Usuario : "asigna"
    Usuario ||--o{ RefreshToken : "inicia sesiones"
    RefreshToken |o--o| RefreshToken : "reemplazado por"

    Rol {
        tinyint IDRol PK
        varchar Codigo UK "CLIENTE, OPERADOR, ADMIN"
        nvarchar Nombre
    }
    Usuario {
        int IDUsuario PK
        tinyint IDRol FK
        nvarchar Correo UK "minúsculas"
        varchar HashContrasena "Argon2id; NULL solo en el usuario de sistema"
        nvarchar Nombre
        nvarchar Apellido
        varchar Telefono "NULL"
        bit EsSistema "un único usuario técnico"
        bit Activo "se desactiva, nunca se borra"
        datetime2 UltimoAcceso "NULL"
        rowversion VersionFila
    }
    RefreshToken {
        bigint IDRefreshToken PK
        int IDUsuario FK
        binary TokenHash UK "SHA-256"
        uniqueidentifier Familia "tokens de la misma sesión"
        datetime2 FechaExpiracion "7 días sin uso"
        datetime2 FechaExpiracionSesion "30 días desde el login"
        datetime2 FechaRevocacion "NULL"
        varchar MotivoRevocacion "NULL"
        bigint IDRefreshTokenReemplazo FK "NULL"
    }
```

## Catálogo

```mermaid
erDiagram
    Categoria ||--o{ Producto : "clasifica"
    Categoria ||--o{ CategoriaAtributo : "usa"
    Atributo ||--o{ CategoriaAtributo : "disponible en"
    Atributo ||--o{ AtributoValor : "tiene"
    Producto ||--|{ Variante : "se vende como"
    Producto ||--o{ ProductoImagen : "muestra"
    AtributoValor |o--o{ ProductoImagen : "imágenes del color"
    Variante ||--o{ VarianteAtributoValor : "combinación"
    AtributoValor ||--o{ VarianteAtributoValor : "valor"
    Variante ||--o{ HistorialPrecio : "cambios de precio"
    Usuario ||--o{ HistorialPrecio : "registra"

    Categoria {
        int IDCategoria PK
        nvarchar Nombre UK
        varchar Slug UK "URL de la tienda"
        nvarchar Descripcion "NULL"
        bit Activo
    }
    Atributo {
        int IDAtributo PK
        nvarchar Nombre UK "Talla, Color, Almacenamiento"
        bit Activo
    }
    AtributoValor {
        int IDAtributoValor PK
        int IDAtributo FK
        nvarchar Valor "UK con IDAtributo"
        tinyint Orden "S=1, M=2, L=3"
        char CodigoHex "NULL; #RRGGBB"
        bit Activo
    }
    CategoriaAtributo {
        int IDCategoria PK, FK
        int IDAtributo PK, FK
        tinyint Orden "orden de los selectores"
    }
    Producto {
        int IDProducto PK
        int IDCategoria FK
        nvarchar Nombre
        varchar Slug UK
        nvarchar Descripcion "NULL"
        bit Activo "requiere al menos 1 imagen"
        rowversion VersionFila
    }
    Variante {
        int IDVariante PK
        int IDProducto FK
        varchar SKU UK
        decimal Precio "DECIMAL(12,2), IVA incluido, > 0"
        int ExistenciaFisica ">= 0; saldo del kardex"
        varchar ClaveCombinacion "UK con IDProducto"
        bit Activo
        rowversion VersionFila
    }
    VarianteAtributoValor {
        int IDVariante PK, FK
        int IDAtributo PK, FK
        int IDAtributoValor FK "FK compuesta con IDAtributo"
    }
    ProductoImagen {
        int IDProductoImagen PK
        int IDProducto FK
        int IDAtributoValor FK "NULL = imagen general"
        nvarchar RutaImagen UK "/uploads/..."
        nvarchar TextoAlternativo
        tinyint Orden
        bit EsPrincipal "1 por producto y valor"
    }
    HistorialPrecio {
        bigint IDHistorialPrecio PK
        int IDVariante FK
        decimal PrecioAnterior "NULL = precio inicial"
        decimal PrecioNuevo
        int IDUsuario FK
        datetime2 Fecha
    }
```

## Inventario

```mermaid
erDiagram
    Variante ||--o{ MovimientoInventario : "kardex"
    TipoMovimiento ||--o{ MovimientoInventario : "clasifica"
    Usuario ||--o{ MovimientoInventario : "registra"

    TipoMovimiento {
        tinyint IDTipoMovimiento PK
        varchar Codigo UK "INVENTARIO_INICIAL, SALIDA_VENTA, ..."
        nvarchar Nombre
        smallint Signo "+1 o -1"
        bit RequiereMotivo
        bit PermiteRegistroManual "lo puede registrar un Operador"
    }
    MovimientoInventario {
        bigint IDMovimientoInventario PK
        int IDVariante FK
        tinyint IDTipoMovimiento FK "FK compuesta con Signo"
        smallint Signo FK
        int Cantidad "con signo, distinta de 0"
        int SaldoAnterior
        int SaldoNuevo "= SaldoAnterior + Cantidad, >= 0"
        nvarchar Motivo "NULL"
        int IDPedido "NULL; venta o cancelación"
        int IDDevolucion "NULL; devolución"
        int IDUsuario FK
        datetime2 Fecha
    }
```

> Existencia disponible = `Variante.ExistenciaFisica` − reservas activas no vencidas. `ReservaInventario` se documenta con el checkout.

## Direcciones y envío

```mermaid
erDiagram
    Usuario ||--o{ Direccion : "guarda"
    Departamento ||--o{ Direccion : "ubica"

    Departamento {
        tinyint IDDepartamento PK
        nvarchar Nombre UK "22 departamentos de Guatemala"
    }
    Direccion {
        int IDDireccion PK
        int IDUsuario FK
        nvarchar Alias "Casa, Oficina"
        nvarchar NombreDestinatario
        varchar Telefono
        nvarchar Linea1
        nvarchar Linea2 "NULL"
        nvarchar Municipio
        tinyint IDDepartamento FK
        varchar CodigoPostal "NULL; 5 dígitos"
        nvarchar Referencias "NULL"
        bit EsPredeterminada "1 por usuario"
        bit Activo
    }
    MetodoEnvio {
        int IDMetodoEnvio PK
        nvarchar Nombre UK
        nvarchar Descripcion "NULL"
        decimal Costo "IVA incluido, >= 0"
        tinyint DiasEstimadosMin
        tinyint DiasEstimadosMax
        bit Activo
        rowversion VersionFila
    }
```

## Cupones y carrito

```mermaid
erDiagram
    Categoria |o--o{ Cupon : "limita a"
    Usuario |o--o{ Carrito : "posee"
    Cupon |o--o{ Carrito : "aplicado en"
    Carrito ||--o{ CarritoItem : "contiene"
    Variante ||--o{ CarritoItem : "agregada como"

    Cupon {
        int IDCupon PK
        varchar Codigo UK "mayúsculas"
        nvarchar Descripcion
        varchar TipoDescuento "PORCENTAJE o MONTO_FIJO"
        decimal Valor "> 0; porcentaje <= 100"
        decimal MontoMinimo
        datetime2 FechaInicio
        datetime2 FechaFin
        int LimiteUsosTotal "NULL = ilimitado"
        int LimiteUsosPorCliente "NULL = ilimitado"
        int UsosActuales "<= LimiteUsosTotal"
        int IDCategoria FK "NULL = todo el carrito"
        bit SoloRegistrados
        bit Activo
        rowversion VersionFila
    }
    Carrito {
        int IDCarrito PK
        int IDUsuario FK "NULL si es de invitado"
        binary TokenInvitadoHash UK "NULL si es de cliente"
        int IDCupon FK "NULL"
        varchar Estado "ACTIVO, CONVERTIDO, FUSIONADO"
        datetime2 FechaCreacion
        datetime2 FechaUltimaActividad
    }
    CarritoItem {
        int IDCarritoItem PK
        int IDCarrito FK
        int IDVariante FK "UK con IDCarrito"
        int Cantidad "1 a 999"
        datetime2 FechaAgregado
    }
```

## Checkout

```mermaid
erDiagram
    Carrito ||--o{ Checkout : "se paga con"
    Usuario |o--o{ Checkout : "NULL = invitado"
    Direccion |o--o{ Checkout : "copiada de"
    MetodoEnvio ||--o{ Checkout : "envío"
    Cupon |o--o{ Checkout : "descuento"
    Checkout ||--|{ CheckoutDetalle : "líneas congeladas"
    CheckoutDetalle ||--o| ReservaInventario : "reserva"

    Checkout {
        bigint IDCheckout PK
        int IDCarrito FK
        int IDUsuario FK "NULL = invitado"
        uniqueidentifier ClaveIdempotencia "UK con IDCarrito"
        nvarchar CorreoContacto
        int IDDireccion FK "NULL; FK compuesta con IDUsuario"
        nvarchar EnvioLinea1 "snapshot de la dirección"
        int IDMetodoEnvio FK
        int IDCupon FK "NULL"
        decimal Subtotal
        decimal Descuento
        decimal CostoEnvio
        decimal Total "= Subtotal - Descuento + CostoEnvio"
        varchar Estado "PENDIENTE, COMPLETADO, EXPIRADO, CANCELADO"
        datetime2 FechaExpiracion
        datetime2 FechaCierre "NULL mientras está PENDIENTE"
    }
    CheckoutDetalle {
        bigint IDCheckout PK, FK
        int IDVariante PK, FK
        int Cantidad
        decimal PrecioUnitario "congelado"
        decimal DescuentoLinea "cupón prorrateado"
    }
    ReservaInventario {
        bigint IDReservaInventario PK
        bigint IDCheckout FK "FK compuesta a CheckoutDetalle"
        int IDVariante FK
        int Cantidad
        varchar Estado "ACTIVA, CONSUMIDA, LIBERADA"
        datetime2 FechaExpiracion "vencida = deja de contar"
        datetime2 FechaCierre "NULL mientras está ACTIVA"
    }
```

## Pedidos, pagos y devoluciones

```mermaid
erDiagram
    Checkout ||--o| Pedido : "genera"
    Checkout ||--o{ Pago : "intentos de cobro"
    Pedido ||--o| Pago : "pago aprobado"
    EstadoPedido ||--o{ Pedido : "estado actual"
    EstadoPedido ||--o{ TransicionEstadoPedido : "origen / destino"
    Pedido ||--|{ PedidoDetalle : "líneas"
    Pedido ||--|{ PedidoHistorialEstado : "cambios de estado"
    Pedido ||--o| CuponUso : "uso del cupón"
    Cupon ||--o{ CuponUso : "usado en"
    Pedido ||--o{ Devolucion : "devoluciones"
    Devolucion ||--|{ DevolucionDetalle : "líneas devueltas"
    PedidoDetalle ||--o{ DevolucionDetalle : "devuelta en"
    Pedido |o--o{ MovimientoInventario : "venta / cancelación"
    Devolucion |o--o{ MovimientoInventario : "reingreso"

    EstadoPedido {
        tinyint IDEstadoPedido PK
        varchar Codigo UK "PAGADO, EN_PREPARACION, ..."
        nvarchar Nombre
        tinyint Orden
        bit EsInicial
        bit EsFinal
        bit CuentaComoVenta "lo usan los reportes"
    }
    TransicionEstadoPedido {
        tinyint IDEstadoOrigen PK, FK
        tinyint IDEstadoDestino PK, FK
        bit PermiteCliente "cancelar su propio pedido"
    }
    Pedido {
        int IDPedido PK
        varchar NumeroPedido UK "SC-000123 (secuencia)"
        bigint IDCheckout UK, FK "un pedido por checkout"
        int IDUsuario FK "NULL = invitado"
        binary TokenSeguimientoHash UK "enlace de seguimiento"
        tinyint IDEstadoPedido FK
        nvarchar EnvioLinea1 "snapshot de dirección"
        nvarchar NombreMetodoEnvio "snapshot"
        varchar CodigoCupon "snapshot, NULL"
        decimal Subtotal
        decimal Descuento
        decimal CostoEnvio
        decimal Total
        decimal BaseImponible "Total = BaseImponible + IVA"
        decimal IVA
        datetime2 FechaPedido
        rowversion VersionFila
    }
    PedidoDetalle {
        int IDPedidoDetalle PK
        int IDPedido FK
        int IDVariante FK
        int IDCategoria FK "categoría al vender"
        varchar SKU "snapshot"
        nvarchar NombreProducto "snapshot"
        int Cantidad
        decimal PrecioUnitario
        decimal DescuentoLinea
        decimal TotalLinea "= Cantidad x Precio - Descuento"
        int CantidadDevuelta "0 a Cantidad"
    }
    PedidoHistorialEstado {
        bigint IDPedidoHistorialEstado PK
        int IDPedido FK
        tinyint IDEstadoAnterior FK "NULL al crear"
        tinyint IDEstadoNuevo FK
        int IDUsuario FK "NULL solo al crear un pedido de invitado"
        nvarchar Comentario "NULL"
        datetime2 Fecha
    }
    Pago {
        bigint IDPago PK
        bigint IDCheckout FK
        int IDPedido FK "solo si APROBADO; FK compuesta con IDCheckout"
        varchar Estado "APROBADO o RECHAZADO"
        varchar Marca "VISA, MASTERCARD, AMEX"
        char Ultimos4
        varchar CodigoAutorizacion "NULL si RECHAZADO"
        varchar MotivoRechazo "NULL si APROBADO"
        decimal Monto
        varchar ReferenciaExterna UK
    }
    CuponUso {
        int IDCuponUso PK
        int IDCupon FK "FK compuesta con IDPedido"
        int IDPedido UK, FK
        int IDUsuario FK "NULL = invitado"
        nvarchar CorreoCliente "límite por cliente"
        decimal MontoDescontado
        datetime2 FechaReversion "NULL; al cancelar el pedido"
    }
    Devolucion {
        int IDDevolucion PK
        int IDPedido FK
        nvarchar Motivo
        decimal MontoReembolso
        int IDUsuario FK "Operador"
        datetime2 Fecha
    }
    DevolucionDetalle {
        int IDDevolucionDetalle PK
        int IDDevolucion FK "FK compuesta con IDPedido"
        int IDPedido FK
        int IDPedidoDetalle FK "FK compuesta con IDPedido"
        int Cantidad
        decimal MontoReembolso
    }
```

## Transversal

```mermaid
erDiagram
    Usuario ||--o{ Bitacora : "realiza"

    Parametro {
        tinyint IDParametro PK
        varchar Clave UK "MINUTOS_RESERVA, TASA_IVA, ..."
        nvarchar Valor "validado según TipoDato"
        varchar TipoDato "ENTERO, DECIMAL, TEXTO"
        nvarchar Descripcion
    }
    Bitacora {
        bigint IDBitacora PK
        datetime2 Fecha
        int IDUsuario FK
        varchar Modulo "CATALOGO, INVENTARIO, CUPONES, PEDIDOS, ..."
        varchar Entidad
        varchar IDEntidad
        varchar Accion "CREAR, MODIFICAR, ACTIVAR, DESACTIVAR, CAMBIAR_ESTADO"
        nvarchar ValorAnterior "JSON"
        nvarchar ValorNuevo "JSON"
    }
```

### Triggers

| Trigger | Garantía |
|---|---|
| `TR_Pedido_Estado` | Un pedido nace en el estado inicial; un cambio de estado solo se acepta si está en `TransicionEstadoPedido`; cada creación y cambio inserta su fila en `PedidoHistorialEstado` con el usuario tomado de `SESSION_CONTEXT`. Sin usuario identificado, el cambio se rechaza. |
| `TR_MovimientoInventario_Inmutable`, `TR_HistorialPrecio_Inmutable`, `TR_PedidoHistorialEstado_Inmutable`, `TR_Bitacora_Inmutable` | Registros de auditoría *append-only*: no admiten `UPDATE` ni `DELETE`. Un error se corrige con un registro nuevo (por ejemplo, un ajuste de inventario). |

### Reglas que garantiza la base de datos

| Regla | Mecanismo |
|---|---|
| Correo único y en minúsculas | `UQ_Usuario_Correo`, `CK_Usuario_CorreoMinusculas` (comparación binaria) |
| Nunca se guarda una contraseña en claro | `CK_Usuario_Contrasena`: solo acepta hashes Argon2id |
| Un único usuario de sistema | Índice único filtrado `UQ_Usuario_UnicoSistema` |
| Un refresh token no puede durar más que la sesión | `CK_RefreshToken_Vigencia` |
| Precio positivo y existencia nunca negativa | `CK_Variante_PrecioPositivo`, `CK_Variante_ExistenciaNoNegativa` |
| SKU único con formato | `UQ_Variante_SKU`, `CK_Variante_SKUFormato` (mayúsculas, números y guiones) |
| Sin combinaciones repetidas en un producto | `UQ_Variante_Producto_Combinacion` |
| Una variante tiene un solo valor por atributo y el valor pertenece a ese atributo | PK `(IDVariante, IDAtributo)` + FK compuesta a `AtributoValor (IDAtributo, IDAtributoValor)` |
| Una sola imagen principal por producto y color | Índice único filtrado `UQ_ProductoImagen_Principal` |
| Rutas de imagen seguras | `CK_ProductoImagen_RutaFormato` (debe estar bajo `/uploads/`, sin `..`) |
| Cada movimiento del kardex cuadra y nunca deja existencia negativa | `CK_MovimientoInventario_SaldoCuadra`, `CK_MovimientoInventario_SaldoNoNegativo` |
| El signo de la cantidad corresponde al tipo de movimiento (una venta no puede sumar existencia) | FK compuesta `(IDTipoMovimiento, Signo)` + `CK_MovimientoInventario_CantidadConSigno` |
| Una sola dirección predeterminada por cliente, y debe estar activa | `UQ_Direccion_Predeterminada`, `CK_Direccion_PredeterminadaActiva` |
| Un cupón nunca supera su límite de usos, aun con pagos simultáneos | `CK_Cupon_UsosDentroDelLimite` |
| Descuento porcentual entre 0 y 100 y vigencia coherente | `CK_Cupon_Valor`, `CK_Cupon_Vigencia` |
| Un carrito pertenece a un cliente o a un invitado, nunca a ambos ni a ninguno | `CK_Carrito_Propietario` |
| Un solo carrito activo por cliente | Índice único filtrado `UQ_Carrito_UsuarioActivo` |
| Una variante aparece una sola vez en el carrito | `UQ_CarritoItem_Carrito_Variante` |
| Repetir la misma petición de checkout no crea otro | `UQ_Checkout_Carrito_ClaveIdempotencia` |
| Un solo checkout pendiente por carrito (no se reserva dos veces) | Índice único filtrado `UQ_Checkout_CarritoPendiente` |
| Un cliente solo puede enviar a sus propias direcciones | FK compuesta `FK_Checkout_DireccionDelUsuario` |
| Solo se reserva lo que está en el checkout | FK compuesta `FK_ReservaInventario_CheckoutDetalle` |
| Un checkout produce como máximo un pedido (doble clic, reintentos simultáneos) | `UQ_Pedido_IDCheckout` |
| Nunca se cobra dos veces un checkout | Índice único filtrado `UQ_Pago_CheckoutAprobado` |
| El pago aprobado pertenece al pedido de su mismo checkout | FK compuesta `FK_Pago_PedidoDelCheckout` |
| Montos del pedido cuadran, incluido el desglose de IVA | `CK_Pedido_Totales`, `CK_Pedido_Impuestos`, `CK_PedidoDetalle_TotalLinea` |
| No se devuelve más de lo vendido por línea | `CK_PedidoDetalle_CantidadDevuelta` |
| Una línea devuelta pertenece al pedido de la devolución | FK compuestas `FK_DevolucionDetalle_Devolucion` y `FK_DevolucionDetalle_PedidoDetalle` |
| El uso de cupón corresponde al cupón registrado en el pedido | FK compuesta `FK_CuponUso_PedidoCupon` |
| Transiciones de estado válidas e historial completo | Trigger `TR_Pedido_Estado` |
| Kardex, historiales y bitácora no se pueden alterar | Triggers `TR_*_Inmutable` |
| Los parámetros son convertibles a su tipo y la bitácora guarda JSON válido | `CK_Parametro_ValorSegunTipo`, `CK_Bitacora_ValoresJSON` |
