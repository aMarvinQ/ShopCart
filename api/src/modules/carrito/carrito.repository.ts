import { ejecutarProcedimiento, TipoSql, type Parametro } from '../../db/index.js';

/*
    El carrito pertenece a un cliente (IDUsuario, del token) o a un invitado (SHA-256 del token de
    su cookie), nunca a ambos. Todos los SPs devuelven el carrito completo (SP_Carrito_Obtener).
*/
export type Propietario = { idUsuario: number } | { tokenHash: Buffer };

type Fila = Record<string, unknown>;
const JSON_CARRITO = { json: ['cupon', 'items'] };

function propietario(p: Propietario): Record<string, Parametro> {
    return 'idUsuario' in p
        ? { IDUsuario: { tipo: TipoSql.Int, valor: p.idUsuario } }
        : { TokenInvitadoHash: { tipo: TipoSql.VarBinary(64), valor: p.tokenHash } };
}
const variante = (idVariante: number): Parametro => ({ tipo: TipoSql.Int, valor: idVariante });

// Los SPs del carrito siempre devuelven una fila (sin carrito: IDCarrito NULL e Items vacío).
async function carrito(promesa: ReturnType<typeof ejecutarProcedimiento>): Promise<Fila> {
    return (await promesa).filas[0] as Fila;
}

export const obtener = (p: Propietario) =>
    carrito(ejecutarProcedimiento('SP_Carrito_Obtener', propietario(p), { reintentable: true, ...JSON_CARRITO }));

export const agregarItem = (p: Propietario, idVariante: number, cantidad: number) =>
    carrito(
        ejecutarProcedimiento(
            'SP_Carrito_AgregarItem',
            { ...propietario(p), IDVariante: variante(idVariante), Cantidad: { tipo: TipoSql.Int, valor: cantidad } },
            JSON_CARRITO,
        ),
    );

export const actualizarCantidad = (p: Propietario, idVariante: number, cantidad: number) =>
    carrito(
        ejecutarProcedimiento(
            'SP_Carrito_ActualizarCantidad',
            { ...propietario(p), IDVariante: variante(idVariante), Cantidad: { tipo: TipoSql.Int, valor: cantidad } },
            JSON_CARRITO,
        ),
    );

export const quitarItem = (p: Propietario, idVariante: number) =>
    carrito(
        ejecutarProcedimiento(
            'SP_Carrito_QuitarItem',
            { ...propietario(p), IDVariante: variante(idVariante) },
            JSON_CARRITO,
        ),
    );

export const vaciar = (p: Propietario) =>
    carrito(ejecutarProcedimiento('SP_Carrito_Vaciar', propietario(p), JSON_CARRITO));

export const aplicarCupon = (p: Propietario, codigo: string) =>
    carrito(
        ejecutarProcedimiento(
            'SP_Carrito_AplicarCupon',
            { ...propietario(p), Codigo: { tipo: TipoSql.VarChar(31), valor: codigo } },
            JSON_CARRITO,
        ),
    );

export const quitarCupon = (p: Propietario) =>
    carrito(ejecutarProcedimiento('SP_Carrito_QuitarCupon', propietario(p), JSON_CARRITO));

/** Pasa el carrito del invitado al del cliente (al iniciar sesión o registrarse). */
export const fusionar = (idUsuario: number, tokenHash: Buffer) =>
    carrito(
        ejecutarProcedimiento(
            'SP_Carrito_Fusionar',
            {
                IDUsuario: { tipo: TipoSql.Int, valor: idUsuario },
                TokenInvitadoHash: { tipo: TipoSql.VarBinary(64), valor: tokenHash },
            },
            JSON_CARRITO,
        ),
    );
