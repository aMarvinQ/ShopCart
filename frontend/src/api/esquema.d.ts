/* Generado por npm run tipos a partir del OpenAPI de la API. No editar a mano. */
export interface paths {
    "/api/v1/auth/registro": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Registrar un cliente
         * @description Crea la cuenta e inicia la sesión: devuelve el access token y deja el refresh token en una cookie httpOnly. Si había un carrito de invitado, sus productos pasan al de la cuenta. Límite: 5 registros por hora por IP.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @example cliente@shopcart.test */
                        correo: string;
                        /**
                         * @description De 8 a 128 caracteres, con al menos una letra y un número.
                         * @example MiClave2026
                         */
                        contrasena: string;
                        /** @example Ana */
                        nombre: string;
                        /** @example García */
                        apellido: string;
                        /** @example 5555-1234 */
                        telefono?: string;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Sesion"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Demasiados intentos */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Iniciar sesión
         * @description Responde lo mismo si el correo no existe o la contraseña es incorrecta (CREDENCIALES_INVALIDAS). Si había un carrito de invitado, sus productos pasan al del cliente. Límite: 10 intentos fallidos por correo cada 15 minutos.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @example cliente@shopcart.test */
                        correo: string;
                        /** @example Cliente#2026 */
                        contrasena: string;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Sesion"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Demasiados intentos */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Renovar la sesión
         * @description Usa la cookie del refresh token y la rota (el anterior queda revocado). Si se presenta un token ya rotado, se cierra toda la sesión (REUSO_DETECTADO).
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Sesion"];
                        };
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Demasiados intentos */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cerrar sesión
         * @description Revoca la sesión de la cookie y la borra. Siempre responde 204.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Sin contenido */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/cambiar-contrasena": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cambiar la contraseña
         * @description Verifica la contraseña actual y cierra las demás sesiones; la actual sigue abierta.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        contrasenaActual: string;
                        /**
                         * @description De 8 a 128 caracteres, con al menos una letra y un número.
                         * @example MiClave2026
                         */
                        contrasenaNueva: string;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: {
                                sesionesCerradas: number;
                            };
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bitacora": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Consultar la bitácora
         * @description Del más reciente al más antiguo. Filtros por módulo, acción, autor, entidad (y su ID) y días de Guatemala. Es de solo lectura: nadie puede modificarla ni borrarla.
         *
         *     **Roles:** ADMIN.
         */
        get: {
            parameters: {
                query?: {
                    pagina?: number;
                    tamanoPagina?: number;
                    /** @description Columna por la que se ordena (por defecto FECHA). */
                    ordenarPor?: "FECHA" | "MODULO" | "ACCION";
                    direccion?: "ASC" | "DESC";
                    modulo?: "CATALOGO" | "INVENTARIO" | "CUPONES" | "PEDIDOS" | "USUARIOS" | "ENVIOS" | "CONFIGURACION";
                    accion?: "CREAR" | "MODIFICAR" | "ACTIVAR" | "DESACTIVAR" | "CAMBIAR_ESTADO";
                    /** @description Quién hizo el cambio. */
                    idUsuario?: number;
                    entidad?: string;
                    /** @description ID del registro; requiere la entidad. */
                    idEntidad?: string;
                    /** @description Día de Guatemala (incluido). */
                    fechaDesde?: string;
                    /** @description Día de Guatemala (incluido). */
                    fechaHasta?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["RegistroBitacora"][];
                            meta: {
                                pagina: number;
                                tamanoPagina: number;
                                totalRegistros: number;
                            };
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bitacora/exportar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Descargar la bitácora filtrada (Excel)
         * @description Mismos filtros que el listado; máximo 10 000 registros (el archivo lo indica si hay más).
         *
         *     **Roles:** ADMIN.
         */
        get: {
            parameters: {
                query?: {
                    /** @description Columna por la que se ordena (por defecto FECHA). */
                    ordenarPor?: "FECHA" | "MODULO" | "ACCION";
                    direccion?: "ASC" | "DESC";
                    modulo?: "CATALOGO" | "INVENTARIO" | "CUPONES" | "PEDIDOS" | "USUARIOS" | "ENVIOS" | "CONFIGURACION";
                    accion?: "CREAR" | "MODIFICAR" | "ACTIVAR" | "DESACTIVAR" | "CAMBIAR_ESTADO";
                    /** @description Quién hizo el cambio. */
                    idUsuario?: number;
                    entidad?: string;
                    /** @description ID del registro; requiere la entidad. */
                    idEntidad?: string;
                    /** @description Día de Guatemala (incluido). */
                    fechaDesde?: string;
                    /** @description Día de Guatemala (incluido). */
                    fechaHasta?: string;
                    formato?: "xlsx";
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/carrito": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ver el carrito
         * @description Precios vigentes, estado de cada línea (DISPONIBLE, AGOTADO, CANTIDAD_EXCEDIDA, NO_DISPONIBLE) y el cupón con su descuento o el motivo por el que no aplica. Sin carrito devuelve uno vacío (idCarrito null). Cliente: con Authorization (un token vencido responde 401). Invitado: sin Authorization, con su cookie. El personal no tiene carrito (403).
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Carrito"];
                        };
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        /**
         * Vaciar el carrito
         * @description Cliente: con Authorization (un token vencido responde 401). Invitado: sin Authorization, con su cookie. El personal no tiene carrito (403).
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Carrito"];
                        };
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/carrito/items": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Agregar un producto
         * @description Si la variante ya está, suma la cantidad. El tope por línea es el menor entre MAXIMO_UNIDADES_POR_LINEA y lo disponible; el error indica cuántas se pueden llevar. Al invitado sin cookie se le crea. Cliente: con Authorization (un token vencido responde 401). Invitado: sin Authorization, con su cookie. El personal no tiene carrito (403).
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @example 1 */
                        idVariante: number;
                        /** @default 1 */
                        cantidad?: number;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Carrito"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/carrito/items/{idVariante}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Cambiar la cantidad de un producto
         * @description Cliente: con Authorization (un token vencido responde 401). Invitado: sin Authorization, con su cookie. El personal no tiene carrito (403).
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    idVariante: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        cantidad: number;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Carrito"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        post?: never;
        /**
         * Quitar un producto
         * @description Cliente: con Authorization (un token vencido responde 401). Invitado: sin Authorization, con su cookie. El personal no tiene carrito (403).
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    idVariante: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Carrito"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/carrito/cupon": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Aplicar un cupón
         * @description Reemplaza al anterior. No consume usos (se consumen al pagar). Rechazos: CUPON_INVALIDO, CUPON_NO_VIGENTE, CUPON_VENCIDO, CUPON_AGOTADO, CUPON_SOLO_REGISTRADOS, CUPON_LIMITE_CLIENTE, CUPON_MONTO_MINIMO, CUPON_SIN_PRODUCTOS_ELEGIBLES, CARRITO_VACIO. Cliente: con Authorization (un token vencido responde 401). Invitado: sin Authorization, con su cookie. El personal no tiene carrito (403).
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @example BIENVENIDA10 */
                        codigo: string;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Carrito"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        /**
         * Quitar el cupón
         * @description Cliente: con Authorization (un token vencido responde 401). Invitado: sin Authorization, con su cookie. El personal no tiene carrito (403).
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Carrito"];
                        };
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/categorias": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Listar categorías
         * @description **Roles:** ADMIN.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Categoria"][];
                        };
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Crear una categoría
         * @description **Roles:** ADMIN.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @example Accesorios */
                        nombre: string;
                        /** @example accesorios */
                        slug: string;
                        descripcion?: string | null;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Categoria"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/categorias/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ver una categoría (con versionFila y atributos en uso)
         * @description **Roles:** ADMIN.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Categoria"];
                        };
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        /**
         * Editar una categoría
         * @description Envía la versionFila que devolvió la última lectura: si otro usuario guardó cambios después, responde 409 EDICION_CONCURRENTE.
         *
         *     **Roles:** ADMIN.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @example Accesorios */
                        nombre: string;
                        /** @example accesorios */
                        slug: string;
                        descripcion?: string | null;
                        /** @example AAAAAAAAB9E= */
                        versionFila: string;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Categoria"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/categorias/{id}/estado": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Activar o desactivar una categoría
         * @description Desactivarla oculta sus productos en la tienda sin cambiar el estado de cada uno.
         *
         *     **Roles:** ADMIN.
         */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        activo: boolean;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Categoria"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/api/v1/categorias/{id}/atributos": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Asignar los atributos de una categoría
         * @description Reemplaza la lista completa. No se puede quitar un atributo que usan variantes de la categoría (409 ATRIBUTO_EN_USO).
         *
         *     **Roles:** ADMIN.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @description Atributos de la categoría en el orden de sus selectores. Lista vacía = sin atributos. */
                        atributos: {
                            idAtributo: number;
                            orden: number;
                        }[];
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Categoria"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/atributos": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Listar atributos y sus valores
         * @description **Roles:** ADMIN.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Atributo"][];
                        };
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Crear un atributo
         * @description **Roles:** ADMIN.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @example Material */
                        nombre: string;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Atributo"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/atributos/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ver un atributo
         * @description **Roles:** ADMIN.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Atributo"];
                        };
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        /**
         * Renombrar un atributo
         * @description **Roles:** ADMIN.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @example Material */
                        nombre: string;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Atributo"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/atributos/{id}/estado": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Activar o desactivar un atributo
         * @description **Roles:** ADMIN.
         */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        activo: boolean;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Atributo"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/api/v1/atributos/{id}/valores": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Agregar un valor a un atributo
         * @description **Roles:** ADMIN.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @example Algodón */
                        valor: string;
                        /**
                         * @description Color para el selector (solo atributos de color).
                         * @example #1F4E9C
                         */
                        codigoHex?: string | null;
                        /** @description Si se omite, va al final. */
                        orden?: number;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["AtributoValor"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/valores/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Editar un valor de atributo
         * @description **Roles:** ADMIN.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @example Algodón */
                        valor: string;
                        /**
                         * @description Color para el selector (solo atributos de color).
                         * @example #1F4E9C
                         */
                        codigoHex?: string | null;
                        orden: number;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["AtributoValor"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/valores/{id}/estado": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Activar o desactivar un valor
         * @description **Roles:** ADMIN.
         */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        activo: boolean;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["AtributoValor"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/api/v1/productos": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Listar productos (activos e inactivos)
         * @description **Roles:** ADMIN.
         */
        get: {
            parameters: {
                query?: {
                    pagina?: number;
                    tamanoPagina?: number;
                    /** @description Columna por la que se ordena (por defecto MODIFICACION). */
                    ordenarPor?: "MODIFICACION" | "NOMBRE" | "CATEGORIA" | "PRECIO" | "EXISTENCIA";
                    direccion?: "ASC" | "DESC";
                    idCategoria?: number;
                    activo?: "true" | "false";
                    /** @description Nombre o SKU (contiene). */
                    busqueda?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["ProductoListado"][];
                            meta: {
                                pagina: number;
                                tamanoPagina: number;
                                totalRegistros: number;
                            };
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Crear un producto con sus variantes e imágenes
         * @description En una sola transacción: el producto, sus variantes (con su existencia inicial en el kardex) y sus imágenes (rutas de POST /imagenes). Nace inactivo: actívalo con PATCH /productos/{id}/estado.
         *
         *     **Roles:** ADMIN.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        idCategoria: number;
                        /** @example Mochila urbana */
                        nombre: string;
                        /** @example playera-basica */
                        slug: string;
                        descripcion?: string | null;
                        variantes: {
                            /** @example MOC-NEG-M */
                            sku: string;
                            /** @example 149.99 */
                            precio: number;
                            /** @default 0 */
                            existenciaInicial?: number;
                            /**
                             * @description Un valor por atributo de la categoría (p. ej. Color y Talla).
                             * @default []
                             */
                            atributos?: {
                                idAtributo: number;
                                idAtributoValor: number;
                            }[];
                        }[];
                        /**
                         * @description Rutas devueltas por POST /imagenes. Se necesita al menos una para activar el producto.
                         * @default []
                         */
                        imagenes?: {
                            /** @example /uploads/productos/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed.webp */
                            ruta: string;
                            /** @example Mochila negra, vista frontal */
                            textoAlternativo: string;
                            /** @description Valor (p. ej. un color) al que pertenece; vacío = general. */
                            idAtributoValor?: number | null;
                            /** @default 0 */
                            orden?: number;
                            /** @default false */
                            esPrincipal?: boolean;
                        }[];
                    };
                };
            };
            responses: {
                /** @description Éxito */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["ProductoAdmin"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/productos/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ver un producto con variantes, existencias e imágenes
         * @description **Roles:** ADMIN.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["ProductoAdmin"];
                        };
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        /**
         * Editar un producto
         * @description Envía la versionFila que devolvió la última lectura: si otro usuario guardó cambios después, responde 409 EDICION_CONCURRENTE.
         *
         *     **Roles:** ADMIN.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        idCategoria: number;
                        /** @example Mochila urbana */
                        nombre: string;
                        /** @example playera-basica */
                        slug: string;
                        descripcion?: string | null;
                        /** @example AAAAAAAAB9E= */
                        versionFila: string;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["ProductoAdmin"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/productos/{id}/estado": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Activar o desactivar un producto
         * @description Para activarlo necesita al menos una imagen y una variante activa.
         *
         *     **Roles:** ADMIN.
         */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        activo: boolean;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["ProductoAdmin"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/api/v1/productos/{id}/variantes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Agregar variantes a un producto
         * @description **Roles:** ADMIN.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        variantes: {
                            /** @example MOC-NEG-M */
                            sku: string;
                            /** @example 149.99 */
                            precio: number;
                            /** @default 0 */
                            existenciaInicial?: number;
                            /**
                             * @description Un valor por atributo de la categoría (p. ej. Color y Talla).
                             * @default []
                             */
                            atributos?: {
                                idAtributo: number;
                                idAtributoValor: number;
                            }[];
                        }[];
                    };
                };
            };
            responses: {
                /** @description Éxito */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["ProductoAdmin"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/variantes/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Cambiar el SKU de una variante
         * @description Envía la versionFila que devolvió la última lectura: si otro usuario guardó cambios después, responde 409 EDICION_CONCURRENTE.
         *
         *     **Roles:** ADMIN.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        sku: string;
                        /** @example AAAAAAAAB9E= */
                        versionFila: string;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["ProductoAdmin"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/variantes/{id}/estado": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Activar o desactivar una variante
         * @description **Roles:** ADMIN.
         */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        activo: boolean;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["ProductoAdmin"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/api/v1/variantes/{id}/precio": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Cambiar el precio de una variante
         * @description Guarda el historial de precios y la bitácora en la misma transacción. Envía la versionFila que devolvió la última lectura: si otro usuario guardó cambios después, responde 409 EDICION_CONCURRENTE.
         *
         *     **Roles:** ADMIN.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @example 149.99 */
                        precio: number;
                        /** @example AAAAAAAAB9E= */
                        versionFila: string;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["ProductoAdmin"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/variantes/{id}/precios": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Historial de precios de una variante
         * @description **Roles:** ADMIN.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["PrecioHistorial"][];
                        };
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/imagenes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Subir imágenes (paso 1 de 2)
         * @description Hasta 10 archivos de hasta 5 MB en el campo "archivos". Se aceptan JPEG, PNG y WebP reales (se revisa el contenido); se recodifican como WebP de hasta 1600 px sin metadatos. Devuelve las rutas para asociarlas al producto (paso 2). Un archivo que no se asocia a ningún producto se elimina a las 24 horas.
         *
         *     **Roles:** ADMIN.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "multipart/form-data": {
                        /** @description Imágenes. */
                        archivos: string[];
                    };
                };
            };
            responses: {
                /** @description Éxito */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: {
                                /**
                                 * @example [
                                 *       "/uploads/productos/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed.webp"
                                 *     ]
                                 */
                                rutas: string[];
                            };
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Error */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/productos/{id}/imagenes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Asociar imágenes a un producto (paso 2 de 2)
         * @description Generales o de un valor de atributo (p. ej. un color que usen sus variantes); una principal por grupo.
         *
         *     **Roles:** ADMIN.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        imagenes: {
                            /** @example /uploads/productos/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed.webp */
                            ruta: string;
                            /** @example Mochila negra, vista frontal */
                            textoAlternativo: string;
                            /** @description Valor (p. ej. un color) al que pertenece; vacío = general. */
                            idAtributoValor?: number | null;
                            /** @default 0 */
                            orden?: number;
                            /** @default false */
                            esPrincipal?: boolean;
                        }[];
                    };
                };
            };
            responses: {
                /** @description Éxito */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["ProductoAdmin"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/imagenes/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Editar el texto alternativo y el orden de una imagen
         * @description **Roles:** ADMIN.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        textoAlternativo: string;
                        orden: number;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["ProductoAdmin"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        post?: never;
        /**
         * Eliminar una imagen y su archivo
         * @description No se puede eliminar la última imagen de un producto activo (409 PRODUCTO_SIN_IMAGEN).
         *
         *     **Roles:** ADMIN.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["ProductoAdmin"];
                        };
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/imagenes/{id}/principal": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Marcar como imagen principal de su grupo
         * @description **Roles:** ADMIN.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["ProductoAdmin"];
                        };
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/checkout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Iniciar el checkout (reserva la existencia)
         * @description Congela precios, cupón y envío, y reserva cada unidad por MINUTOS_RESERVA (15). Cliente: `idDireccion` de su libreta. Invitado: `invitado` con su correo y dirección. Con la misma Idempotency-Key devuelve el mismo checkout; con otra, cancela el pendiente anterior del carrito y libera su reserva. Rechazos: STOCK_INSUFICIENTE (indica el SKU y lo disponible), CARRITO_VACIO, VARIANTE_NO_DISPONIBLE, CANTIDAD_EXCEDE_LIMITE, METODO_ENVIO_NO_ENCONTRADO, DIRECCION_NO_ENCONTRADA y los del cupón. Cliente: con Authorization. Invitado: sin Authorization, con la cookie de su carrito. El personal no compra (403).
         */
        post: {
            parameters: {
                query?: never;
                header: {
                    /** @description Repetir la petición con la misma clave devuelve el mismo checkout (doble clic, reintento). */
                    "idempotency-key": string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @example 2 */
                        idMetodoEnvio: number;
                        /** @description Cliente registrado: una dirección de su libreta. */
                        idDireccion?: number;
                        /** @description Invitado: su correo y la dirección. */
                        invitado?: {
                            /** @example María López */
                            nombreDestinatario: string;
                            /** @example 5555-1234 */
                            telefono: string;
                            /** @example 4a calle 5-20 zona 1 */
                            linea1: string;
                            linea2?: string | null;
                            /**
                             * @description Código INE del municipio.
                             * @example 108
                             */
                            idMunicipio: number;
                            codigoPostal?: string | null;
                            referencias?: string | null;
                            /**
                             * Format: email
                             * @example invitado@correo.com
                             */
                            correo: string;
                        };
                    };
                };
            };
            responses: {
                /** @description Éxito */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Checkout"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/checkout/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ver un checkout (resumen y cuenta regresiva)
         * @description Estado efectivo y segundos restantes de la reserva. Cliente: con Authorization. Invitado: sin Authorization, con la cookie de su carrito. El personal no compra (403).
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Checkout"];
                        };
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/checkout/{id}/pago": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Pagar y crear el pedido
         * @description Cobra con la pasarela simulada y crea el pedido en una transacción (salida de inventario, reservas consumidas, uso del cupón, carrito convertido). Un checkout ya pagado devuelve su pedido sin cobrar de nuevo (doble clic). Rechazo del banco: 402 FONDOS_INSUFICIENTES, TARJETA_RECHAZADA, TARJETA_VENCIDA, CVV_INCORRECTO o PAGO_NO_PROCESADO; el intento queda registrado y se puede reintentar. 409: CHECKOUT_NO_PAGABLE (carrito cambiado o cancelado) o CHECKOUT_EXPIRADO (venció y ya no hay existencia; el cobro se anula). Máximo 10 intentos fallidos por IP cada 15 minutos. Cliente: con Authorization. Invitado: sin Authorization, con la cookie de su carrito. El personal no compra (403).
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @description Nunca se guarda ni se registra: a la base llegan solo la marca y los últimos 4 dígitos (PCI DSS). Tarjetas de prueba en el README. */
                        tarjeta: {
                            /** @example 4242 4242 4242 4242 */
                            numero: string;
                            /** @example MARIA LOPEZ */
                            titular: string;
                            /**
                             * @description MM/AA.
                             * @example 12/30
                             */
                            vencimiento: string;
                            /** @example 123 */
                            cvv: string;
                        };
                    };
                };
            };
            responses: {
                /** @description Éxito */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["PagoRealizado"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Pago rechazado por el banco */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Demasiados intentos */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/cupones": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Listar cupones
         * @description Situación calculada al consultar: VIGENTE, PROGRAMADO, VENCIDO, AGOTADO o INACTIVO.
         *
         *     **Roles:** ADMIN.
         */
        get: {
            parameters: {
                query?: {
                    pagina?: number;
                    tamanoPagina?: number;
                    /** @description Columna por la que se ordena (por defecto RECIENTES). */
                    ordenarPor?: "RECIENTES" | "CODIGO" | "VIGENCIA" | "USOS";
                    direccion?: "ASC" | "DESC";
                    /** @description Código o descripción (contiene). */
                    busqueda?: string;
                    situacion?: "VIGENTE" | "PROGRAMADO" | "VENCIDO" | "AGOTADO" | "INACTIVO";
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Cupon"][];
                            meta: {
                                pagina: number;
                                tamanoPagina: number;
                                totalRegistros: number;
                            };
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Crear un cupón
         * @description Porcentaje o monto fijo, vigencia, monto mínimo, límites de uso total y por cliente, categoría y solo registrados.
         *
         *     **Roles:** ADMIN.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /**
                         * @description Se guarda en mayúsculas.
                         * @example VERANO20
                         */
                        codigo: string;
                        /** @example 20 % en toda la tienda. */
                        descripcion: string;
                        /** @enum {string} */
                        tipoDescuento: "PORCENTAJE" | "MONTO_FIJO";
                        /**
                         * @description Porcentaje (hasta 100) o monto en quetzales.
                         * @example 149.99
                         */
                        valor: number;
                        /**
                         * @description Subtotal mínimo de compra (0 = sin mínimo).
                         * @example 149.99
                         */
                        montoMinimo?: number;
                        /**
                         * Format: date-time
                         * @example 2026-11-01T06:00:00Z
                         */
                        fechaInicio: string;
                        /**
                         * Format: date-time
                         * @example 2026-12-01T06:00:00Z
                         */
                        fechaFin: string;
                        /** @description null = sin límite. */
                        limiteUsosTotal?: number | null;
                        /** @description Se cuenta por correo; null = sin límite. */
                        limiteUsosPorCliente?: number | null;
                        /** @description Solo productos de esta categoría. */
                        idCategoria?: number | null;
                        /** @default false */
                        soloRegistrados?: boolean;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Cupon"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/cupones/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ver un cupón (con usos, monto descontado y versionFila)
         * @description **Roles:** ADMIN.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Cupon"];
                        };
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        /**
         * Editar un cupón
         * @description Después del primer uso no se pueden cambiar su código, tipo, valor ni categoría (409 CUPON_CON_USOS); sí su vigencia, límites y descripción. Envía la versionFila de la última lectura (409 EDICION_CONCURRENTE).
         *
         *     **Roles:** ADMIN.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /**
                         * @description Se guarda en mayúsculas.
                         * @example VERANO20
                         */
                        codigo: string;
                        /** @example 20 % en toda la tienda. */
                        descripcion: string;
                        /** @enum {string} */
                        tipoDescuento: "PORCENTAJE" | "MONTO_FIJO";
                        /**
                         * @description Porcentaje (hasta 100) o monto en quetzales.
                         * @example 149.99
                         */
                        valor: number;
                        /**
                         * @description Subtotal mínimo de compra (0 = sin mínimo).
                         * @example 149.99
                         */
                        montoMinimo?: number;
                        /**
                         * Format: date-time
                         * @example 2026-11-01T06:00:00Z
                         */
                        fechaInicio: string;
                        /**
                         * Format: date-time
                         * @example 2026-12-01T06:00:00Z
                         */
                        fechaFin: string;
                        /** @description null = sin límite. */
                        limiteUsosTotal?: number | null;
                        /** @description Se cuenta por correo; null = sin límite. */
                        limiteUsosPorCliente?: number | null;
                        /** @description Solo productos de esta categoría. */
                        idCategoria?: number | null;
                        /** @default false */
                        soloRegistrados?: boolean;
                        /** @example AAAAAAAAB9E= */
                        versionFila: string;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Cupon"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/cupones/{id}/estado": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Activar o desactivar un cupón
         * @description **Roles:** ADMIN.
         */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        activo: boolean;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Cupon"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/api/v1/direcciones": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Mi libreta de direcciones
         * @description **Roles:** CLIENTE.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Direccion"][];
                        };
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Agregar una dirección
         * @description Máximo 5 activas. La primera queda predeterminada. Devuelve el ID de la nueva y la libreta.
         *
         *     **Roles:** CLIENTE.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @example Casa */
                        alias: string;
                        /** @example María López */
                        nombreDestinatario: string;
                        /** @example 5555-1234 */
                        telefono: string;
                        /** @example 4a calle 5-20 zona 1 */
                        linea1: string;
                        linea2?: string | null;
                        /**
                         * @description Código INE del municipio.
                         * @example 108
                         */
                        idMunicipio: number;
                        codigoPostal?: string | null;
                        referencias?: string | null;
                        /** @default false */
                        esPredeterminada?: boolean;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: {
                                idDireccion: number;
                                direcciones: components["schemas"]["Direccion"][];
                            };
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/direcciones/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Editar una dirección
         * @description Devuelve la libreta completa. Una dirección de otro cliente responde 404, como si no existiera.
         *
         *     **Roles:** CLIENTE.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @example Casa */
                        alias: string;
                        /** @example María López */
                        nombreDestinatario: string;
                        /** @example 5555-1234 */
                        telefono: string;
                        /** @example 4a calle 5-20 zona 1 */
                        linea1: string;
                        linea2?: string | null;
                        /**
                         * @description Código INE del municipio.
                         * @example 108
                         */
                        idMunicipio: number;
                        codigoPostal?: string | null;
                        referencias?: string | null;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Direccion"][];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        post?: never;
        /**
         * Eliminar una dirección
         * @description Se desactiva (los pedidos guardan su copia). Si era la predeterminada, pasa a serlo la más reciente. Devuelve la libreta completa. Una dirección de otro cliente responde 404, como si no existiera.
         *
         *     **Roles:** CLIENTE.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Direccion"][];
                        };
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/direcciones/{id}/predeterminada": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Marcar como predeterminada
         * @description Devuelve la libreta completa. Una dirección de otro cliente responde 404, como si no existiera.
         *
         *     **Roles:** CLIENTE.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Direccion"][];
                        };
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/departamentos": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Departamentos de Guatemala */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Departamento"][];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/departamentos/{id}/municipios": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Municipios de un departamento
         * @description idMunicipio es el código INE (DDMM, p. ej. 108 = Mixco).
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Municipio"][];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/tienda/metodos-envio": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Métodos de envío disponibles
         * @description Activos, del más barato al más caro.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["MetodoEnvioTienda"][];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/metodos-envio": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Listar métodos de envío (activos e inactivos)
         * @description **Roles:** ADMIN.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["MetodoEnvio"][];
                        };
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Crear un método de envío
         * @description **Roles:** ADMIN.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @example Envío nocturno */
                        nombre: string;
                        descripcion?: string | null;
                        /**
                         * @description En quetzales; 0 se permite (p. ej. recoger en tienda).
                         * @example 149.99
                         */
                        costo: number;
                        /** @example 1 */
                        diasEstimadosMin: number;
                        /** @example 3 */
                        diasEstimadosMax: number;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["MetodoEnvio"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/metodos-envio/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ver un método de envío (con versionFila y pedidos que lo usaron)
         * @description **Roles:** ADMIN.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["MetodoEnvio"];
                        };
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        /**
         * Editar un método de envío
         * @description Un costo nuevo aplica a los checkouts que se inicien después; los pedidos conservan el que pagaron. Envía la versionFila de la última lectura (409 EDICION_CONCURRENTE).
         *
         *     **Roles:** ADMIN.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @example Envío nocturno */
                        nombre: string;
                        descripcion?: string | null;
                        /**
                         * @description En quetzales; 0 se permite (p. ej. recoger en tienda).
                         * @example 149.99
                         */
                        costo: number;
                        /** @example 1 */
                        diasEstimadosMin: number;
                        /** @example 3 */
                        diasEstimadosMax: number;
                    } & {
                        /** @example AAAAAAAAB9E= */
                        versionFila: string;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["MetodoEnvio"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/metodos-envio/{id}/estado": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Activar o desactivar un método de envío
         * @description No se puede desactivar el último activo: la tienda no podría vender (409 ULTIMO_METODO_ENVIO).
         *
         *     **Roles:** ADMIN.
         */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        activo: boolean;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["MetodoEnvio"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/api/v1/inventario/existencias": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Existencias por variante
         * @description Física, reservada por checkouts en curso y disponible para vender.
         *
         *     **Roles:** OPERADOR, ADMIN.
         */
        get: {
            parameters: {
                query?: {
                    pagina?: number;
                    tamanoPagina?: number;
                    /** @description Columna por la que se ordena (por defecto PRODUCTO). */
                    ordenarPor?: "PRODUCTO" | "SKU" | "CATEGORIA" | "FISICA" | "RESERVADO" | "DISPONIBLE";
                    direccion?: "ASC" | "DESC";
                    /** @description SKU o nombre del producto (contiene). */
                    busqueda?: string;
                    idCategoria?: number;
                    soloAgotadas?: "true" | "false";
                    /** @description Variantes en venta con disponible igual o menor que EXISTENCIA_MINIMA. */
                    soloExistenciaBaja?: "true" | "false";
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Existencia"][];
                            meta: {
                                pagina: number;
                                tamanoPagina: number;
                                totalRegistros: number;
                            };
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventario/kardex": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Kardex (movimientos de inventario)
         * @description Del más reciente al más antiguo, con el saldo antes y después de cada movimiento.
         *
         *     **Roles:** OPERADOR, ADMIN.
         */
        get: {
            parameters: {
                query?: {
                    pagina?: number;
                    tamanoPagina?: number;
                    /** @description Columna por la que se ordena (por defecto FECHA). */
                    ordenarPor?: "FECHA" | "PRODUCTO" | "CANTIDAD";
                    direccion?: "ASC" | "DESC";
                    idVariante?: number;
                    tipo?: "ENTRADA_COMPRA" | "AJUSTE_ENTRADA" | "AJUSTE_SALIDA" | "INVENTARIO_INICIAL" | "SALIDA_VENTA" | "CANCELACION" | "DEVOLUCION";
                    /** @description Desde (incluida), fecha y hora UTC. */
                    fechaDesde?: string | null;
                    /** @description Hasta (excluida), fecha y hora UTC. */
                    fechaHasta?: string | null;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["MovimientoKardex"][];
                            meta: {
                                pagina: number;
                                tamanoPagina: number;
                                totalRegistros: number;
                            };
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventario/movimientos": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Registrar una entrada o un ajuste
         * @description Varias variantes en una sola transacción (p. ej. una compra). Las cantidades van positivas; el tipo pone el signo. Una salida solo toma unidades disponibles: no toca las reservadas por quien está pagando (409 STOCK_INSUFICIENTE).
         *
         *     **Roles:** OPERADOR, ADMIN.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /**
                         * @description Solo los manuales; ventas, cancelaciones y devoluciones los registran sus procesos.
                         * @enum {string}
                         */
                        tipo: "ENTRADA_COMPRA" | "AJUSTE_ENTRADA" | "AJUSTE_SALIDA";
                        /**
                         * @description Obligatorio en los ajustes.
                         * @example Conteo físico: dos unidades dañadas.
                         */
                        motivo?: string;
                        lineas: {
                            idVariante: number;
                            cantidad: number;
                        }[];
                    };
                };
            };
            responses: {
                /** @description Éxito */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["MovimientoRegistrado"][];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventario/conciliacion": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Conciliación del kardex
         * @description Variantes cuya existencia no cuadra con la suma del kardex o con saltos de saldo. Lista vacía = todo cuadra.
         *
         *     **Roles:** OPERADOR, ADMIN.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Conciliacion"][];
                        };
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/parametros": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Listar los parámetros del sistema
         * @description Valor, tipo, descripción y rango permitido de cada uno.
         *
         *     **Roles:** ADMIN.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Parametro"][];
                        };
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/parametros/{clave}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ver un parámetro (con su versionFila)
         * @description **Roles:** ADMIN.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    clave: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Parametro"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        /**
         * Cambiar el valor de un parámetro
         * @description Aplica de inmediato. Fuera de rango o de otro tipo: 422 VALOR_PARAMETRO_INVALIDO. La vigencia máxima de la sesión no puede ser menor que su inactividad (409). Envía la versionFila de la última lectura (409 EDICION_CONCURRENTE). Guardar el mismo valor no es error ni deja registro. Queda en la bitácora y vacía el caché de reportes.
         *
         *     **Roles:** ADMIN.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    clave: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /**
                         * @description El SP valida el tipo y el rango del parámetro.
                         * @example 20
                         */
                        valor: string;
                        /** @example AAAAAAAAB9E= */
                        versionFila: string;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Parametro"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/mis-pedidos": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Mis pedidos, del más reciente al más antiguo
         * @description **Roles:** CLIENTE.
         */
        get: {
            parameters: {
                query?: {
                    pagina?: number;
                    tamanoPagina?: number;
                    /** @description Columna por la que se ordena (por defecto FECHA). */
                    ordenarPor?: "FECHA" | "TOTAL";
                    direccion?: "ASC" | "DESC";
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["ResumenPedido"][];
                            meta: {
                                pagina: number;
                                tamanoPagina: number;
                                totalRegistros: number;
                            };
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/mis-pedidos/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Detalle de un pedido propio
         * @description Líneas, historial de estados, pagos (marca y últimos 4) y devoluciones. Uno ajeno responde 404.
         *
         *     **Roles:** CLIENTE.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["PedidoCliente"];
                        };
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/mis-pedidos/{id}/cancelar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cancelar un pedido propio
         * @description Solo mientras está PAGADO (aún no se prepara): devuelve la existencia, revierte el uso del cupón y registra el reembolso. Después responde 409 TRANSICION_NO_PERMITIDA (contactar a la tienda). El motivo es opcional.
         *
         *     **Roles:** CLIENTE.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @example Me equivoqué de talla. */
                        motivo?: string;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["PedidoCliente"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/seguimiento/{token}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Seguir un pedido con el enlace secreto (sin sesión)
         * @description El token se entrega al pagar (tokenSeguimiento). No se busca por número de pedido porque es secuencial y adivinable. Un token desconocido o mal formado responde 404.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    token: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["PedidoCliente"];
                        };
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/pedidos": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Listar pedidos
         * @description Del más reciente al más antiguo, con filtros por estado, rango de fechas y búsqueda.
         *
         *     **Roles:** OPERADOR, ADMIN.
         */
        get: {
            parameters: {
                query?: {
                    pagina?: number;
                    tamanoPagina?: number;
                    /** @description Columna por la que se ordena (por defecto FECHA). */
                    ordenarPor?: "FECHA" | "NUMERO" | "CLIENTE" | "TOTAL" | "ESTADO";
                    direccion?: "ASC" | "DESC";
                    estado?: "PAGADO" | "EN_PREPARACION" | "ENVIADO" | "ENTREGADO" | "CANCELADO" | "DEVUELTO_PARCIAL" | "DEVUELTO";
                    /** @description Desde (incluida), fecha y hora UTC. */
                    fechaDesde?: string;
                    /** @description Hasta (excluida), fecha y hora UTC. */
                    fechaHasta?: string;
                    /** @description Número de pedido, correo o nombre del contacto (contiene). */
                    busqueda?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["ResumenPedido"][];
                            meta: {
                                pagina: number;
                                tamanoPagina: number;
                                totalRegistros: number;
                            };
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/pedidos/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Detalle de un pedido
         * @description Incluye quién hizo cada cambio de estado, todos los intentos de pago y las devoluciones.
         *
         *     **Roles:** OPERADOR, ADMIN.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["PedidoPanel"];
                        };
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/pedidos/{id}/estado": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Avanzar el estado de un pedido
         * @description Solo por las transiciones permitidas (409 TRANSICION_NO_PERMITIDA). Queda en el historial con el comentario y en la bitácora.
         *
         *     **Roles:** OPERADOR, ADMIN.
         */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /**
                         * @description Avance operativo: PAGADO → EN_PREPARACION → ENVIADO → ENTREGADO. Pedir el estado actual no es error. La cancelación y las devoluciones tienen su propio endpoint.
                         * @enum {string}
                         */
                        estado: "EN_PREPARACION" | "ENVIADO" | "ENTREGADO";
                        /** @example Guía 123456 de la transportista. */
                        comentario?: string;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["PedidoPanel"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/api/v1/pedidos/{id}/cancelar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cancelar un pedido
         * @description PAGADO o EN_PREPARACION, con motivo obligatorio. En una transacción devuelve la existencia (kardex CANCELACION), revierte el uso del cupón y registra el reembolso del pago.
         *
         *     **Roles:** OPERADOR, ADMIN.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @example El cliente lo pidió por teléfono. */
                        motivo: string;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["PedidoPanel"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/pedidos/{id}/devoluciones": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Registrar una devolución total o parcial
         * @description Pedidos ENTREGADO o DEVUELTO_PARCIAL, dentro de DIAS_DEVOLUCION desde la entrega. Por línea: cuántas unidades y si reingresan al inventario (kardex DEVOLUCION). Reembolso proporcional a lo pagado por la línea; el envío no se reembolsa. El pedido pasa a DEVUELTO_PARCIAL o DEVUELTO.
         *
         *     **Roles:** OPERADOR, ADMIN.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @example Talla incorrecta. */
                        motivo: string;
                        lineas: {
                            idPedidoDetalle: number;
                            cantidad: number;
                            /**
                             * @description La unidad vuelve al inventario (buen estado) o no (dañada).
                             * @default true
                             */
                            reingresa?: boolean;
                        }[];
                    };
                };
            };
            responses: {
                /** @description Éxito */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["PedidoPanel"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/devoluciones": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Listar devoluciones
         * @description **Roles:** OPERADOR, ADMIN.
         */
        get: {
            parameters: {
                query?: {
                    pagina?: number;
                    tamanoPagina?: number;
                    /** @description Columna por la que se ordena (por defecto FECHA). */
                    ordenarPor?: "FECHA" | "PEDIDO" | "MONTO";
                    direccion?: "ASC" | "DESC";
                    /** @description Desde (incluida), fecha y hora UTC. */
                    fechaDesde?: string;
                    /** @description Hasta (excluida), fecha y hora UTC. */
                    fechaHasta?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Devolucion"][];
                            meta: {
                                pagina: number;
                                tamanoPagina: number;
                                totalRegistros: number;
                            };
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reportes/resumen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Indicadores del dashboard
         * @description Ventas netas, pedidos, ticket promedio, unidades, devoluciones, carritos abandonados y existencia baja. Puede venir del caché (máximo 5 minutos; se vacía con cada venta, cancelación, devolución, cambio de inventario, catálogo o parámetro): cabecera X-Cache HIT/MISS y meta.generadoEn.
         *
         *     **Roles:** ADMIN.
         */
        get: {
            parameters: {
                query: {
                    /** @description Días de Guatemala, ambos incluidos. */
                    fechaDesde: string;
                    /** @description Días de Guatemala, ambos incluidos. */
                    fechaHasta: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["ResumenVentas"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reportes/ventas": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ventas por día, semana o mes
         * @description Una fila por periodo, incluidos los que no tienen ventas (para la gráfica). Por día, máximo 366 días. Puede venir del caché (máximo 5 minutos; se vacía con cada venta, cancelación, devolución, cambio de inventario, catálogo o parámetro): cabecera X-Cache HIT/MISS y meta.generadoEn.
         *
         *     **Roles:** ADMIN.
         */
        get: {
            parameters: {
                query: {
                    /** @description Días de Guatemala, ambos incluidos. */
                    fechaDesde: string;
                    /** @description Días de Guatemala, ambos incluidos. */
                    fechaHasta: string;
                    agrupacion?: "DIA" | "SEMANA" | "MES";
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["VentasPeriodo"][];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reportes/ventas-por-categoria": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ventas por categoría
         * @description Puede venir del caché (máximo 5 minutos; se vacía con cada venta, cancelación, devolución, cambio de inventario, catálogo o parámetro): cabecera X-Cache HIT/MISS y meta.generadoEn.
         *
         *     **Roles:** ADMIN.
         */
        get: {
            parameters: {
                query: {
                    /** @description Días de Guatemala, ambos incluidos. */
                    fechaDesde: string;
                    /** @description Días de Guatemala, ambos incluidos. */
                    fechaHasta: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["VentasCategoria"][];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reportes/top-productos": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Top 10 productos más vendidos
         * @description Por unidades netas (descontadas las devoluciones). Puede venir del caché (máximo 5 minutos; se vacía con cada venta, cancelación, devolución, cambio de inventario, catálogo o parámetro): cabecera X-Cache HIT/MISS y meta.generadoEn.
         *
         *     **Roles:** ADMIN.
         */
        get: {
            parameters: {
                query: {
                    /** @description Días de Guatemala, ambos incluidos. */
                    fechaDesde: string;
                    /** @description Días de Guatemala, ambos incluidos. */
                    fechaHasta: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["TopProducto"][];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reportes/carritos-abandonados": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Carritos abandonados
         * @description Con productos y sin actividad desde HORAS_CARRITO_ABANDONADO; filtro opcional por la última actividad.
         *
         *     **Roles:** ADMIN.
         */
        get: {
            parameters: {
                query?: {
                    pagina?: number;
                    tamanoPagina?: number;
                    /** @description Columna por la que se ordena (por defecto ACTIVIDAD). */
                    ordenarPor?: "ACTIVIDAD" | "VALOR" | "ARTICULOS";
                    direccion?: "ASC" | "DESC";
                    /** @description Última actividad desde (día de Guatemala). */
                    fechaDesde?: string;
                    /** @description Última actividad hasta (incluido). */
                    fechaHasta?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["CarritoAbandonado"][];
                            meta: {
                                pagina: number;
                                tamanoPagina: number;
                                totalRegistros: number;
                            };
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reportes/exportar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Descargar el reporte de ventas (Excel o PDF)
         * @description Indicadores, ventas por periodo, por categoría, top 10 y existencias bajas en un solo archivo. Excel: una hoja por sección. Responde el archivo (Content-Disposition: attachment).
         *
         *     **Roles:** ADMIN.
         */
        get: {
            parameters: {
                query: {
                    /** @description Días de Guatemala, ambos incluidos. */
                    fechaDesde: string;
                    /** @description Días de Guatemala, ambos incluidos. */
                    fechaHasta: string;
                    agrupacion?: "DIA" | "SEMANA" | "MES";
                    formato?: "xlsx" | "pdf";
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reportes/carritos-abandonados/exportar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Descargar los carritos abandonados (Excel o PDF)
         * @description Máximo 10 000 filas (el archivo lo indica si hay más).
         *
         *     **Roles:** ADMIN.
         */
        get: {
            parameters: {
                query?: {
                    /** @description Columna por la que se ordena (por defecto ACTIVIDAD). */
                    ordenarPor?: "ACTIVIDAD" | "VALOR" | "ARTICULOS";
                    direccion?: "ASC" | "DESC";
                    /** @description Última actividad desde (día de Guatemala). */
                    fechaDesde?: string;
                    /** @description Última actividad hasta (incluido). */
                    fechaHasta?: string;
                    formato?: "xlsx" | "pdf";
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reportes/tiempo-real": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Dashboard en tiempo real (Server-Sent Events)
         * @description Flujo `text/event-stream`. Eventos: `resumen` (al conectar y cuando cambian los números, agrupado por segundo: indicadores de hoy y últimos 5 pedidos), `venta` (cada pedido nuevo), `sesion-expirada` (el token venció: renuévalo y reconecta), `sin-permiso`. Latido cada 25 s. Ábrelo con fetch y Authorization (EventSource no envía cabeceras). Máximo 3 conexiones por usuario (429 DEMASIADAS_CONEXIONES). Swagger no muestra flujos: pruébalo con el frontend o con curl -N.
         *
         *     **Roles:** ADMIN.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Demasiados intentos */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Estado de la API y de la base de datos
         * @description Responde 503 (BASE_DATOS_NO_DISPONIBLE) si la base no responde.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: {
                                /** @enum {string} */
                                estado: "ok";
                                baseDatos: {
                                    scriptsAplicados: number;
                                    ultimoScript: string | null;
                                    fechaUltimoScript: string | null;
                                };
                                fechaServidor: string;
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/tienda/categorias": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Categorías con productos visibles */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["CategoriaTienda"][];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/tienda/productos": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Buscar productos
         * @description Cada tarjeta muestra el precio y la imagen de la variante de selección inicial (la primera disponible). Búsqueda sin distinguir mayúsculas ni tildes; % y _ se buscan como texto.
         */
        get: {
            parameters: {
                query?: {
                    pagina?: number;
                    tamanoPagina?: number;
                    /** @description Busca en nombre y descripción. */
                    texto?: string;
                    /** @description Slug de la categoría. */
                    categoria?: string;
                    precioMinimo?: number;
                    precioMaximo?: number;
                    soloDisponibles?: "true" | "false";
                    ordenarPor?: "RECIENTES" | "NOMBRE" | "PRECIO";
                    direccion?: "ASC" | "DESC";
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["ProductoTarjeta"][];
                            meta: {
                                pagina: number;
                                tamanoPagina: number;
                                totalRegistros: number;
                            };
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/tienda/productos/{slug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Detalle de un producto
         * @description Variantes en venta en su orden (la de selección inicial primero, las agotadas al final), con sus atributos para armar los selectores, e imágenes generales y por valor de atributo.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    slug: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["ProductoTienda"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/perfil": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ver mi perfil */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Perfil"];
                        };
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        /**
         * Actualizar mi perfil
         * @description Nombre, apellido y teléfono. El correo no se modifica: identifica la cuenta.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @example María */
                        nombre: string;
                        /** @example López */
                        apellido: string;
                        /** @example 5555-1234 */
                        telefono?: string | null;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["Perfil"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/usuarios": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Listar usuarios
         * @description **Roles:** ADMIN.
         */
        get: {
            parameters: {
                query?: {
                    pagina?: number;
                    tamanoPagina?: number;
                    /** @description Columna por la que se ordena (por defecto CREACION). */
                    ordenarPor?: "CREACION" | "NOMBRE" | "CORREO" | "ROL" | "ACCESO" | "ESTADO";
                    direccion?: "ASC" | "DESC";
                    rol?: "CLIENTE" | "OPERADOR" | "ADMIN";
                    activo?: "true" | "false";
                    /** @description Correo o nombre completo (contiene). */
                    busqueda?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["UsuarioEditable"][];
                            meta: {
                                pagina: number;
                                tamanoPagina: number;
                                totalRegistros: number;
                            };
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Crear un operador o administrador
         * @description Los clientes se registran solos en /auth/registro.
         *
         *     **Roles:** ADMIN.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @example nuevo.operador@shopcart.test */
                        correo: string;
                        /**
                         * @description De 8 a 128 caracteres, con al menos una letra y un número.
                         * @example MiClave2026
                         */
                        contrasena: string;
                        /** @example Pedro */
                        nombre: string;
                        /** @example Álvarez */
                        apellido: string;
                        /** @example 5555-1234 */
                        telefono?: string;
                        /** @enum {string} */
                        rol: "OPERADOR" | "ADMIN";
                    };
                };
            };
            responses: {
                /** @description Éxito */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["UsuarioEditable"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/usuarios/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Editar un operador o administrador
         * @description Nombre, apellido, teléfono y rol. El correo no se modifica y los clientes editan su propio perfil. Cambiar el rol revoca sus sesiones. Un administrador no puede quitarse su propio rol. Envía la fechaModificacion de la última lectura: si otro usuario guardó cambios después, responde 409 EDICION_CONCURRENTE (iniciar sesión no cuenta como cambio).
         *
         *     **Roles:** ADMIN.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @example Pedro */
                        nombre: string;
                        /** @example Álvarez */
                        apellido: string;
                        /** @example 5555-1234 */
                        telefono?: string | null;
                        /** @enum {string} */
                        rol: "OPERADOR" | "ADMIN";
                        /**
                         * Format: date-time
                         * @description La fechaModificacion de la última lectura (control de edición concurrente).
                         */
                        fechaModificacion: string;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["UsuarioEditado"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Regla de negocio no cumplida */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/usuarios/{id}/estado": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Activar o desactivar un usuario
         * @description Nunca se elimina. Desactivar revoca todas sus sesiones. Un administrador no puede desactivarse a sí mismo.
         *
         *     **Roles:** ADMIN.
         */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        activo: boolean;
                    };
                };
            };
            responses: {
                /** @description Éxito */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data: components["schemas"]["UsuarioEstado"];
                        };
                    };
                };
                /** @description Datos de entrada inválidos */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin sesión o token inválido o vencido */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Sin permiso para la acción */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No encontrado */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Conflicto con el estado actual */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        Error: {
            error: {
                /** @example PERMISO_DENEGADO */
                codigo: string;
                mensaje: string;
                detalles?: {
                    campo: string;
                    mensaje: string;
                }[];
                requestId: string;
            };
        };
        Sesion: {
            accessToken: string;
            /** @enum {string} */
            tipo: "Bearer";
            /** @description Segundos de vigencia del access token. */
            expiraEn: number;
            usuario: {
                idUsuario: number;
                correo: string;
                nombre: string;
                apellido: string;
                /** @enum {string} */
                codigoRol: "CLIENTE" | "OPERADOR" | "ADMIN";
            };
        };
        RegistroBitacora: {
            idBitacora: number;
            fecha: string;
            idUsuario: number;
            usuario: string;
            correo: string;
            codigoRol: string;
            /** @enum {string} */
            modulo: "CATALOGO" | "INVENTARIO" | "CUPONES" | "PEDIDOS" | "USUARIOS" | "ENVIOS" | "CONFIGURACION";
            entidad: string;
            idEntidad: string;
            /** @enum {string} */
            accion: "CREAR" | "MODIFICAR" | "ACTIVAR" | "DESACTIVAR" | "CAMBIAR_ESTADO";
            /** @description Valores antes del cambio. */
            valorAnterior: {
                [key: string]: unknown;
            } | null;
            /** @description Valores después del cambio. */
            valorNuevo: {
                [key: string]: unknown;
            } | null;
        };
        Carrito: {
            /** @description null si aún no hay carrito. */
            idCarrito: number | null;
            maximoPorLinea: number;
            cantidadArticulos: number;
            subtotal: number;
            descuento: number;
            /** @description Sin envío: el costo de envío se suma en el checkout. */
            total: number;
            /** @description Hay líneas, todas DISPONIBLE y el cupón (si hay) es aplicable. */
            puedeComprar: boolean;
            cupon: {
                codigo: string;
                descripcion: string;
                /** @enum {string} */
                tipoDescuento: "PORCENTAJE" | "MONTO_FIJO";
                valor: number;
                montoMinimo: number;
                idCategoria: number | null;
                aplicable: boolean;
                /** @description Por qué no aplica, p. ej. CUPON_MONTO_MINIMO. */
                codigoError: string | null;
                montoFaltante: number | null;
            } | null;
            items: {
                idCarritoItem: number;
                idVariante: number;
                sku: string;
                idProducto: number;
                producto: string;
                slug: string;
                /** @description Valores de la variante (p. ej. "Negro / M"). */
                descripcion: string;
                imagen: string | null;
                textoAlternativo: string | null;
                /** @description Precio vigente. */
                precioUnitario: number;
                cantidad: number;
                importe: number;
                disponible: number;
                /** @description Tope: el menor entre el límite por línea y lo disponible. */
                cantidadMaxima: number;
                /** @enum {string} */
                estado: "DISPONIBLE" | "AGOTADO" | "CANTIDAD_EXCEDIDA" | "NO_DISPONIBLE";
            }[];
        };
        Categoria: {
            idCategoria: number;
            nombre: string;
            slug: string;
            descripcion: string | null;
            activo: boolean;
            /** Format: date-time */
            fechaCreacion: string;
            /** Format: date-time */
            fechaModificacion: string | null;
            /** @description Enviar en la siguiente edición (control de edición concurrente). */
            versionFila?: string;
            productosTotales: number;
            productosActivos: number;
            atributos: {
                idAtributo: number;
                nombre: string;
                orden: number;
                activo: boolean;
                enUso?: boolean;
            }[];
        };
        Atributo: {
            idAtributo: number;
            nombre: string;
            activo: boolean;
            /** Format: date-time */
            fechaCreacion: string;
            categoriasAsignadas?: number;
            valores: {
                idAtributoValor: number;
                valor: string;
                orden: number;
                codigoHex: string | null;
                activo: boolean;
                enUso?: boolean;
            }[];
        };
        AtributoValor: {
            idAtributoValor: number;
            idAtributo: number;
            valor: string;
            orden: number;
            codigoHex: string | null;
            activo: boolean;
        };
        ProductoListado: {
            idProducto: number;
            nombre: string;
            slug: string;
            idCategoria: number;
            categoria: string;
            activo: boolean;
            categoriaActiva: boolean;
            variantesTotales: number;
            variantesActivas: number;
            precioMinimo: number | null;
            precioMaximo: number | null;
            existenciaTotal: number;
            imagenPrincipal: string | null;
        };
        ProductoAdmin: {
            idProducto: number;
            idCategoria: number;
            categoria: string;
            categoriaActiva: boolean;
            nombre: string;
            slug: string;
            descripcion: string | null;
            activo: boolean;
            /** Format: date-time */
            fechaCreacion: string;
            /** Format: date-time */
            fechaModificacion: string | null;
            /** @description Enviar en la siguiente edición (control de edición concurrente). */
            versionFila: string;
            variantes: {
                idVariante: number;
                sku: string;
                precio: number;
                activo: boolean;
                existenciaFisica: number;
                disponible: number;
                esSeleccionInicial: boolean;
                /** @description Enviar en la siguiente edición (control de edición concurrente). */
                versionFila: string;
                atributos: {
                    idAtributo: number;
                    atributo: string;
                    idAtributoValor: number;
                    valor: string;
                    codigoHex: string | null;
                }[];
            }[];
            imagenes: {
                idProductoImagen: number;
                idAtributoValor: number | null;
                valor: string | null;
                rutaImagen: string;
                textoAlternativo: string;
                orden: number;
                esPrincipal: boolean;
            }[];
        };
        PrecioHistorial: {
            idHistorialPrecio: number;
            /** Format: date-time */
            fecha: string;
            precioAnterior: number | null;
            precioNuevo: number;
            idUsuario: number;
            usuario: string;
        };
        Checkout: {
            idCheckout: number;
            /**
             * @description Solo PENDIENTE se puede pagar. CARRITO_MODIFICADO: el carrito cambió; inicia otro checkout.
             * @enum {string}
             */
            estado: "PENDIENTE" | "EXPIRADO" | "CANCELADO" | "COMPLETADO" | "CARRITO_MODIFICADO";
            fechaCreacion: string;
            fechaExpiracion: string;
            /** @description Para la cuenta regresiva de la reserva. */
            segundosRestantes: number;
            correoContacto: string;
            nombreContacto: string;
            telefonoContacto: string;
            idDireccion: number | null;
            envioNombre: string;
            envioTelefono: string;
            envioLinea1: string;
            envioLinea2: string | null;
            envioMunicipio: string;
            idDepartamento: number;
            departamento: string;
            envioCodigoPostal: string | null;
            envioReferencias: string | null;
            idMetodoEnvio: number;
            metodoEnvio: string;
            diasEstimadosMin: number;
            diasEstimadosMax: number;
            codigoCupon: string | null;
            subtotal: number;
            descuento: number;
            costoEnvio: number;
            total: number;
            baseImponible: number;
            iva: number;
            /** @description Si ya se pagó. */
            idPedido: number | null;
            numeroPedido: string | null;
            lineas: {
                idVariante: number;
                sku: string;
                producto: string;
                slug: string;
                descripcion: string;
                imagen: string | null;
                textoAlternativo: string | null;
                cantidad: number;
                precioUnitario: number;
                descuentoLinea: number;
                totalLinea: number;
            }[];
        };
        PagoRealizado: {
            pedido: components["schemas"]["PedidoCliente"];
            /** @description Enlace secreto /seguimiento/{token}: se puede seguir el pedido sin sesión. Guárdalo. */
            tokenSeguimiento: string;
        };
        PedidoCliente: {
            idPedido: number;
            /** @example SC-000123 */
            numeroPedido: string;
            fechaPedido: string;
            /** @enum {string} */
            codigoEstado: "PAGADO" | "EN_PREPARACION" | "ENVIADO" | "ENTREGADO" | "CANCELADO" | "DEVUELTO_PARCIAL" | "DEVUELTO";
            estado: string;
            correoContacto: string;
            nombreContacto: string;
            telefonoContacto: string;
            envioNombre: string;
            envioTelefono: string;
            envioLinea1: string;
            envioLinea2: string | null;
            envioMunicipio: string;
            departamento: string;
            envioCodigoPostal: string | null;
            envioReferencias: string | null;
            nombreMetodoEnvio: string;
            codigoCupon: string | null;
            subtotal: number;
            descuento: number;
            costoEnvio: number;
            total: number;
            baseImponible: number;
            iva: number;
            lineas: {
                idPedidoDetalle: number;
                idVariante: number;
                sku: string;
                nombreProducto: string;
                descripcionVariante: string;
                cantidad: number;
                precioUnitario: number;
                descuentoLinea: number;
                totalLinea: number;
                cantidadDevuelta: number;
            }[];
            historial: {
                codigoEstadoAnterior?: string;
                codigoEstado: string;
                estado: string;
                fecha: string;
                comentario?: string;
                /** @description Solo en el panel. */
                idUsuario?: number;
                /** @description Solo en el panel. */
                usuario?: string;
            }[];
            /** @description Solo marca y últimos 4 dígitos de la tarjeta. */
            pagos: {
                idPago: number;
                /** @enum {string} */
                estado: "APROBADO" | "RECHAZADO" | "REEMBOLSADO";
                marca: string;
                ultimos4: string;
                codigoAutorizacion: string | null;
                motivoRechazo: string | null;
                monto: number;
                referenciaExterna: string;
                fecha: string;
            }[];
            devoluciones: {
                idDevolucion: number;
                fecha: string;
                motivo: string;
                montoReembolso: number;
                /** @description Solo en el panel. */
                usuario?: string;
                lineas: {
                    sku: string;
                    nombreProducto: string;
                    cantidad: number;
                    montoReembolso: number;
                    reingresa: boolean;
                }[];
            }[];
            /** @description El cliente puede cancelarlo desde la tienda (solo PAGADO y con cuenta). */
            puedeCancelar: boolean;
        };
        Cupon: {
            idCupon: number;
            codigo: string;
            descripcion: string;
            /** @enum {string} */
            tipoDescuento: "PORCENTAJE" | "MONTO_FIJO";
            valor: number;
            montoMinimo: number;
            fechaInicio: string;
            fechaFin: string;
            limiteUsosTotal: number | null;
            limiteUsosPorCliente: number | null;
            usosActuales: number;
            idCategoria: number | null;
            categoria: string | null;
            soloRegistrados: boolean;
            activo: boolean;
            /** @enum {string} */
            situacion: "VIGENTE" | "PROGRAMADO" | "VENCIDO" | "AGOTADO" | "INACTIVO";
            montoDescontado?: number;
            /** @description Ya se usó: su código, tipo, valor y categoría ya no se pueden cambiar. */
            terminosBloqueados?: boolean;
            fechaCreacion?: string;
            fechaModificacion?: string | null;
            versionFila?: string;
        };
        Direccion: {
            idDireccion: number;
            alias: string;
            nombreDestinatario: string;
            telefono: string;
            linea1: string;
            linea2: string | null;
            idMunicipio: number;
            municipio: string;
            idDepartamento: number;
            departamento: string;
            codigoPostal: string | null;
            referencias: string | null;
            esPredeterminada: boolean;
            fechaCreacion: string;
            fechaModificacion: string | null;
        };
        Departamento: {
            idDepartamento: number;
            nombre: string;
        };
        Municipio: {
            idMunicipio: number;
            nombre: string;
        };
        MetodoEnvioTienda: {
            idMetodoEnvio: number;
            nombre: string;
            descripcion: string | null;
            costo: number;
            diasEstimadosMin: number;
            diasEstimadosMax: number;
        };
        MetodoEnvio: components["schemas"]["MetodoEnvioTienda"] & {
            activo: boolean;
            /** @description Pedidos que lo usaron (detalle). */
            pedidos?: number;
            fechaCreacion: string;
            fechaModificacion: string | null;
            versionFila?: string;
        };
        Existencia: {
            idVariante: number;
            sku: string;
            idProducto: number;
            producto: string;
            /** @description Valores de la variante (p. ej. "Negro / M"). */
            descripcion: string;
            categoria: string;
            existenciaFisica: number;
            /** @description Apartado por checkouts en curso. */
            reservado: number;
            disponible: number;
            activo: boolean;
            productoActivo: boolean;
        };
        MovimientoKardex: {
            /** @description BIGINT: llega como texto. */
            idMovimientoInventario: string;
            fecha: string;
            idVariante: number;
            sku: string;
            producto: string;
            codigoTipo: string;
            tipo: string;
            cantidad: number;
            saldoAnterior: number;
            saldoNuevo: number;
            motivo: string | null;
            idPedido: number | null;
            idDevolucion: number | null;
            idUsuario: number;
            usuario: string;
        };
        MovimientoRegistrado: {
            idMovimientoInventario: string;
            idVariante: number;
            sku: string;
            producto: string;
            codigoTipo: string;
            cantidad: number;
            saldoAnterior: number;
            saldoNuevo: number;
            disponible: number;
        };
        Conciliacion: {
            idVariante: number;
            sku: string;
            producto: string;
            existenciaFisica: number;
            sumaKardex: number;
            ultimoSaldo: number;
            movimientos: number;
            saltos: number;
            diferencia: number;
        };
        Parametro: {
            idParametro: number;
            clave: string;
            valor: string;
            tipoDato: ("ENTERO" | "DECIMAL" | "TEXTO") | string;
            descripcion: string;
            valorMinimo: number | null;
            valorMaximo: number | null;
            fechaModificacion: string | null;
            versionFila: string;
        };
        ResumenPedido: {
            idPedido: number;
            numeroPedido: string;
            fechaPedido: string;
            /** @enum {string} */
            codigoEstado: "PAGADO" | "EN_PREPARACION" | "ENVIADO" | "ENTREGADO" | "CANCELADO" | "DEVUELTO_PARCIAL" | "DEVUELTO";
            estado: string;
            total: number;
            articulos: number;
            /** @description Solo en el panel. */
            nombreContacto?: string;
            /** @description Solo en el panel. */
            correoContacto?: string;
            /** @description Solo en el panel. */
            esInvitado?: boolean;
        };
        PedidoPanel: {
            idPedido: number;
            /** @example SC-000123 */
            numeroPedido: string;
            fechaPedido: string;
            /** @enum {string} */
            codigoEstado: "PAGADO" | "EN_PREPARACION" | "ENVIADO" | "ENTREGADO" | "CANCELADO" | "DEVUELTO_PARCIAL" | "DEVUELTO";
            estado: string;
            correoContacto: string;
            nombreContacto: string;
            telefonoContacto: string;
            envioNombre: string;
            envioTelefono: string;
            envioLinea1: string;
            envioLinea2: string | null;
            envioMunicipio: string;
            departamento: string;
            envioCodigoPostal: string | null;
            envioReferencias: string | null;
            nombreMetodoEnvio: string;
            codigoCupon: string | null;
            subtotal: number;
            descuento: number;
            costoEnvio: number;
            total: number;
            baseImponible: number;
            iva: number;
            lineas: {
                idPedidoDetalle: number;
                idVariante: number;
                sku: string;
                nombreProducto: string;
                descripcionVariante: string;
                cantidad: number;
                precioUnitario: number;
                descuentoLinea: number;
                totalLinea: number;
                cantidadDevuelta: number;
            }[];
            historial: {
                codigoEstadoAnterior?: string;
                codigoEstado: string;
                estado: string;
                fecha: string;
                comentario?: string;
                /** @description Solo en el panel. */
                idUsuario?: number;
                /** @description Solo en el panel. */
                usuario?: string;
            }[];
            /** @description Solo marca y últimos 4 dígitos de la tarjeta. */
            pagos: {
                idPago: number;
                /** @enum {string} */
                estado: "APROBADO" | "RECHAZADO" | "REEMBOLSADO";
                marca: string;
                ultimos4: string;
                codigoAutorizacion: string | null;
                motivoRechazo: string | null;
                monto: number;
                referenciaExterna: string;
                fecha: string;
            }[];
            devoluciones: {
                idDevolucion: number;
                fecha: string;
                motivo: string;
                montoReembolso: number;
                /** @description Solo en el panel. */
                usuario?: string;
                lineas: {
                    sku: string;
                    nombreProducto: string;
                    cantidad: number;
                    montoReembolso: number;
                    reingresa: boolean;
                }[];
            }[];
            /** @description null = compra de invitado. */
            idUsuario: number | null;
            idDepartamento: number;
            /** @description El estado actual permite cancelarlo. */
            puedeCancelar: boolean;
        };
        Devolucion: {
            idDevolucion: number;
            fecha: string;
            idPedido: number;
            numeroPedido: string;
            motivo: string;
            montoReembolso: number;
            unidades: number;
            usuario: string;
        };
        ResumenVentas: {
            fechaDesde: string;
            fechaHasta: string;
            /** @description Mercadería: subtotal − descuento − devoluciones, sin envío. */
            ventaNeta: number;
            pedidos: number;
            ticketPromedio: number;
            unidades: number;
            montoDevuelto: number;
            carritosAbandonados: number;
            valorCarritosAbandonados: number;
            /** @description Del momento, no del periodo. */
            variantesExistenciaBaja: number;
            horasCarritoAbandonado: number;
            existenciaMinima: number;
        };
        VentasPeriodo: {
            /** @description Primer día del periodo. */
            periodo: string;
            desde: string;
            hasta: string;
            ventaNeta: number;
            pedidos: number;
        };
        VentasCategoria: {
            idCategoria: number;
            categoria: string;
            unidades: number;
            ventaNeta: number;
            porcentaje: number;
        };
        TopProducto: {
            posicion: number;
            idProducto: number;
            producto: string;
            categoria: string;
            unidades: number;
            ventaNeta: number;
        };
        CarritoAbandonado: {
            idCarrito: number;
            esInvitado: boolean;
            cliente: string | null;
            correo: string | null;
            fechaUltimaActividad: string;
            horasInactivo: number;
            articulos: number;
            valor: number;
            codigoCupon: string | null;
        };
        CategoriaTienda: {
            idCategoria: number;
            nombre: string;
            slug: string;
            descripcion: string | null;
            productosVisibles: number;
        };
        ProductoTarjeta: {
            idProducto: number;
            nombre: string;
            slug: string;
            categoria: string;
            slugCategoria: string;
            /** @description Precio de la variante de selección inicial. */
            precio: number;
            disponible: boolean;
            imagenPrincipal: string | null;
            textoAlternativo: string | null;
        };
        ProductoTienda: {
            idProducto: number;
            nombre: string;
            slug: string;
            descripcion: string | null;
            idCategoria: number;
            categoria: string;
            slugCategoria: string;
            variantes: {
                idVariante: number;
                sku: string;
                precio: number;
                disponible: number;
                esSeleccionInicial: boolean;
                atributos: {
                    idAtributo: number;
                    atributo: string;
                    ordenAtributo: number;
                    idAtributoValor: number;
                    valor: string;
                    ordenValor: number;
                    codigoHex: string | null;
                }[];
            }[];
            imagenes: {
                idAtributoValor: number | null;
                rutaImagen: string;
                textoAlternativo: string;
                orden: number;
                esPrincipal: boolean;
            }[];
        };
        Perfil: {
            idUsuario: number;
            correo: string;
            nombre: string;
            apellido: string;
            telefono: string | null;
            codigoRol: string;
            nombreRol: string;
            ultimoAcceso: string | null;
            fechaCreacion: string;
        };
        UsuarioEditable: components["schemas"]["Usuario"] & {
            /** @description Enviar en la siguiente edición (control de edición concurrente). */
            fechaModificacion: string;
        };
        Usuario: components["schemas"]["Perfil"] & {
            activo: boolean;
        };
        UsuarioEditado: components["schemas"]["UsuarioEditable"] & {
            sesionesRevocadas: number;
        };
        UsuarioEstado: components["schemas"]["Usuario"] & {
            estadoCambiado: boolean;
            sesionesRevocadas: number;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
