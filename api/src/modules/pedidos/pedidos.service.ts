import { ErrorApi } from '../../errors/ErrorApi.js';
import { hashToken } from '../../seguridad/tokens.js';
import * as repositorio from './pedidos.repository.js';
import { esquemaTokenSeguimiento } from './pedidos.schemas.js';

/*
    Lo que la API agrega a los pedidos: el enlace de seguimiento. La base guarda solo el SHA-256
    del token; un token con otro formato responde igual que uno desconocido (404), sin consultar
    la base ni revelar si el formato era el problema.
*/
export async function seguimiento(parametros: unknown): Promise<Record<string, unknown>> {
    const resultado = esquemaTokenSeguimiento.safeParse(parametros);
    if (!resultado.success) throw new ErrorApi(404, 'PEDIDO_NO_ENCONTRADO', 'El pedido no existe.');
    return repositorio.obtenerSeguimiento(hashToken(resultado.data.token));
}
