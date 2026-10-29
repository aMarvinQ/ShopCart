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
