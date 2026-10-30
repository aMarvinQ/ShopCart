# Catálogo de errores de la base de datos

Los stored procedures informan los errores de negocio con `THROW` usando un **número** y un mensaje que empieza con un **código estable**:

```
THROW 51101, N'CORREO_REGISTRADO: ya existe una cuenta con ese correo.', 1;
```

La API decide el estado HTTP según el **rango del número** y devuelve el código (lo que va antes de `:`) en su respuesta. El texto después de `:` es una descripción para desarrolladores; el mensaje para el usuario final lo arma el frontend a partir del código.

| Rango | Significado | HTTP |
|---|---|---|
| 50001–50099 | Validación de datos | 400 / 422 |
| 50100–50199 | No encontrado | 404 |
| 50200–50299 | Permiso o propiedad | 403 |
| 50300–50399 | Autenticación | 401 |
| 51000–51999 | Conflicto de negocio | 409 |
| 59000–59999 | Configuración incompleta de la base (error del servidor, no del usuario) | 500 |
| 2627 / 2601 | Violación de `UNIQUE` no prevista por el SP | 409 |
| 547 | Violación de `CHECK` o llave foránea no prevista por el SP | 409 / 422 |
| Otros | Error interno: no se expone el detalle | 500 |

## Validación (400 / 422)

| Número | Código | Cuándo |
|---|---|---|
| 50001 | `CORREO_INVALIDO` | Correo vacío, sin formato `x@y.z`, con espacios o de más de 254 caracteres. |
| 50002 | `HASH_INVALIDO` | La contraseña no llegó como hash Argon2id (la base nunca recibe contraseñas en claro). |
| 50003 | `NOMBRE_INVALIDO` | Nombre vacío o más largo que el máximo: nombre y apellido de usuario (100), categoría (100), producto (200), atributo y valor de atributo (50). |
| 50004 | `TELEFONO_INVALIDO` | Teléfono con caracteres distintos de dígitos, espacios, `+` y `-`, o de más de 20. |
| 50005 | `ROL_INVALIDO` | Un usuario interno solo puede ser `OPERADOR` o `ADMIN`. |
| 50006 | `PARAMETRO_REQUERIDO` | Falta un parámetro obligatorio o tiene un tamaño inválido (p. ej. un hash de token que no mide 32 bytes). |
| 50007 | `PAGINACION_INVALIDA` | Página menor que 1 o tamaño de página fuera de 1–100. |
| 50008 | `BUSQUEDA_INVALIDA` | Texto de búsqueda de más de 100 caracteres. |
| 50009 | `SLUG_INVALIDO` | Slug vacío, con caracteres distintos de minúsculas sin tilde, dígitos y guiones, con guion al inicio, al final o doble, o más largo que el máximo (categoría: 120, producto: 220). |
| 50010 | `DESCRIPCION_INVALIDA` | Descripción más larga que el máximo (categoría: 500, producto: 4000). |
| 50011 | `COLOR_INVALIDO` | Color que no tiene el formato `#RRGGBB`. |
| 50012 | `ORDEN_INVALIDO` | Orden fuera de 0–255. |
| 50013 | `VARIANTES_REQUERIDAS` | Un producto nuevo sin variantes. |
| 50014 | `SKU_INVALIDO` | SKU con caracteres distintos de mayúsculas, dígitos y guiones, o fuera de 3–50 caracteres. |
| 50015 | `PRECIO_INVALIDO` | Precio vacío, cero o negativo. |
| 50016 | `EXISTENCIA_INVALIDA` | Existencia inicial negativa. |
| 50017 | `ATRIBUTO_NO_PERMITIDO` | Una variante usa un atributo que la categoría del producto no tiene asignado, o que está desactivado. |
| 50018 | `VALOR_INVALIDO` | Una variante usa un valor que no existe, que es de otro atributo (p. ej. "Rojo" como talla) o que está desactivado. |
| 50019 | `COMBINACION_INCOMPLETA` | Las variantes del producto no usan todas los mismos atributos, hay más de una y alguna no tiene atributos, o hay atributos para una variante que no viene en la lista. |
| 50020 | `IMAGEN_INVALIDA` | Ruta fuera de `/uploads/` o con `..`, texto alternativo vacío, imagen de un valor que ninguna variante del producto usa, imágenes por valor de dos atributos distintos, o más de una principal en un grupo. |
| 50021 | `RANGO_PRECIO_INVALIDO` | Búsqueda con un precio negativo o con el mínimo mayor que el máximo. |
| 50022 | `ORDENAMIENTO_INVALIDO` | Búsqueda ordenada por algo distinto de `RECIENTES`, `NOMBRE` o `PRECIO`, o con una dirección distinta de `ASC`/`DESC`. |
| 50023 | `TIPO_MOVIMIENTO_INVALIDO` | El tipo de movimiento no existe o no se puede registrar a mano (ventas, cancelaciones, devoluciones e inventario inicial los generan sus procesos). |
| 50024 | `MOTIVO_INVALIDO` | Falta el motivo en un tipo que lo exige (ajustes) o tiene más de 300 caracteres. |
| 50025 | `CANTIDAD_INVALIDA` | Cantidad cero o negativa en un movimiento de inventario o en el carrito. |
| 50026 | `RANGO_FECHAS_INVALIDO` | La fecha inicial no es anterior a la final. |
| 50027 | `CANTIDAD_EXCEDE_LIMITE` | La cantidad de una variante en el carrito supera `MAXIMO_UNIDADES_POR_LINEA`. El mensaje indica el máximo y cuántas ya hay. |

## No encontrado (404)

| Número | Código | Cuándo |
|---|---|---|
| 50101 | `USUARIO_NO_ENCONTRADO` | El usuario no existe o está desactivado. |
| 50102 | `CATEGORIA_NO_ENCONTRADA` | La categoría no existe (en la tienda: o está inactiva). |
| 50103 | `ATRIBUTO_NO_ENCONTRADO` | El atributo no existe, o está desactivado y se intenta usar en algo nuevo (asignarlo a una categoría, agregarle valores). |
| 50104 | `VALOR_NO_ENCONTRADO` | El valor de atributo no existe. |
| 50105 | `PRODUCTO_NO_ENCONTRADO` | El producto no existe (en la tienda: o no está visible, porque él o su categoría están inactivos o no tiene variantes activas). |
| 50106 | `VARIANTE_NO_ENCONTRADA` | La variante no existe. |
| 50107 | `IMAGEN_NO_ENCONTRADA` | La imagen no existe. |
| 50108 | `CARRITO_NO_ENCONTRADO` | El cliente o invitado no tiene un carrito activo. |
| 50109 | `ITEM_NO_ENCONTRADO` | Se cambia la cantidad de una variante que no está en el carrito. |

## Permiso (403)

| Número | Código | Cuándo |
|---|---|---|
| 50201 | `PERMISO_DENEGADO` | Quien ejecuta la acción no tiene el rol requerido o está desactivado. El SP lo valida aunque la API ya lo haya hecho. |

## Autenticación (401)

| Número | Código | Cuándo |
|---|---|---|
| 50301 | `USUARIO_INACTIVO` | Inicio de sesión de una cuenta desactivada o inexistente. |

### Resultados de la rotación de sesión

`SP_Seguridad_RotarSesion` **no lanza error** en estos casos: devuelve una fila con `Resultado`, porque algunos deben guardar cambios (revocar la sesión) y un `THROW` los revertiría. La API responde **401** a todo lo que no sea `ROTADO`.

| Resultado | Significado | Efecto |
|---|---|---|
| `ROTADO` | Token válido. | Se emite el nuevo token y el actual queda revocado. |
| `ROTACION_CONCURRENTE` | El token se rotó hace menos de `SESION_SEGUNDOS_GRACIA` (otra pestaña renovó al mismo tiempo). | Ninguno: la sesión sigue con el token nuevo. |
| `REUSO_DETECTADO` | Se presentó un token ya rotado fuera del plazo de gracia: se asume robado. | Se revoca toda la sesión (familia). |
| `SESION_EXPIRADA` | Venció por inactividad o por el máximo de la sesión. | Ninguno. |
| `USUARIO_INACTIVO` | El usuario fue desactivado. | Se revoca toda la sesión. |
| `SESION_INVALIDA` | El token no existe o fue revocado (cierre de sesión, cambio de contraseña...). | Ninguno. |

## Conflicto (409)

| Número | Código | Cuándo |
|---|---|---|
| 51010 | `TRANSICION_NO_PERMITIDA` | Cambio de estado de pedido que no está en `TransicionEstadoPedido` (trigger). |
| 51011 | `ESTADO_INICIAL_INVALIDO` | Pedido creado en un estado que no es el inicial (trigger). |
| 51101 | `CORREO_REGISTRADO` | Ya existe una cuenta con ese correo (sin distinguir mayúsculas). |
| 51102 | `USUARIO_SISTEMA_PROTEGIDO` | Intento de modificar el usuario de sistema. |
| 51103 | `AUTODESACTIVACION_NO_PERMITIDA` | Un administrador intentó desactivarse a sí mismo. |
| 51201 | `NOMBRE_REGISTRADO` | Ya existe una categoría o atributo con ese nombre, o el atributo ya tiene ese valor (sin distinguir mayúsculas ni tildes). |
| 51202 | `SLUG_REGISTRADO` | Ya existe una categoría o un producto con ese slug. |
| 51203 | `EDICION_CONCURRENTE` | Otro usuario guardó cambios después de que se cargó el formulario (`VersionFila` distinta). |
| 51204 | `ATRIBUTO_EN_USO` | Se intenta quitar de una categoría un atributo que usa alguna de sus variantes. |
| 51205 | `SKU_REGISTRADO` | Un SKU está repetido en la lista o ya lo usa otra variante (sin distinguir mayúsculas). |
| 51206 | `COMBINACION_REPETIDA` | Dos variantes del producto tienen la misma combinación de valores, aunque una esté desactivada (se reactiva en lugar de crearla de nuevo). |
| 51207 | `CATEGORIA_INCOMPATIBLE` | Se cambia un producto a una categoría que no tiene los atributos que usan sus variantes. |
| 51208 | `PRODUCTO_SIN_IMAGEN` | Activar un producto sin imágenes, o eliminar la última imagen de un producto activo. |
| 51209 | `PRODUCTO_SIN_VARIANTES` | Activar un producto sin variantes activas, o desactivar la última variante activa de un producto activo. |
| 51210 | `IMAGEN_REGISTRADA` | Una ruta de imagen está repetida en la lista o ya existe. |
| 51301 | `STOCK_INSUFICIENTE` | Se intenta retirar más unidades de las disponibles: las reservadas por un checkout en curso no se pueden tomar. En el carrito: la cantidad supera lo disponible (cuando es menor que el límite por línea); el mensaje indica cuántas hay. |
| 51302 | `VARIANTE_NO_DISPONIBLE` | Se agrega al carrito, o se cambia la cantidad de, una variante que no está a la venta (ella, su producto o su categoría están desactivados). Solo se puede quitar. |
| 51303 | `CARRITO_CERRADO` | El token de invitado pertenece a un carrito ya pagado o fusionado: la API debe emitir un token nuevo. |
| 51900 | `REGISTRO_INMUTABLE` | Intento de modificar o eliminar kardex, historial de precios, historial de estados o bitácora (trigger). |
| 51901 | `ACTOR_REQUERIDO` | Cambio de estado de pedido sin usuario en `SESSION_CONTEXT` (trigger). |

## Configuración (500)

| Número | Código | Cuándo |
|---|---|---|
| 59001 | `CONFIGURACION_INCOMPLETA` | Falta un dato que carga la semilla (rol, parámetro de sesión, tipo de movimiento). Indica un despliegue incompleto, no un error del usuario. |
