import type { Logger } from 'pino';
import { expirarVencidos } from '../modules/checkout/checkout.repository.js';
import { programarTarea, type TareaProgramada } from './programador.js';

/*
    Expiración de checkouts (D76, plan 6.4): cada minuto marca EXPIRADO cada checkout pendiente
    vencido y libera sus reservas, en una transacción del SP. Las reservas vencidas ya no restan
    disponibilidad desde que vencen (lo calcula la base); esto deja los estados consistentes.
    Corre en la API porque SQL Server Express no tiene SQL Agent. El SP procesa hasta 1000 por
    ejecución: si llegó al tope, se repite en seguida, con un máximo de lotes por pasada para que
    el ciclo siempre termine; lo que quede se atiende en la siguiente. Ante un deadlock el SP se
    reintenta (es idempotente).
*/
const INTERVALO_MS = 60 * 1000;
const LOTE = 1000;
const MAXIMO_LOTES = 50;

export async function expirarCheckoutsVencidos(
    expirar: typeof expirarVencidos = expirarVencidos,
): Promise<{ checkoutsExpirados: number; reservasLiberadas: number }> {
    const total = { checkoutsExpirados: 0, reservasLiberadas: 0 };
    for (let lotes = 0; lotes < MAXIMO_LOTES; lotes += 1) {
        const lote = await expirar();
        total.checkoutsExpirados += lote.checkoutsExpirados;
        total.reservasLiberadas += lote.reservasLiberadas;
        if (lote.checkoutsExpirados < LOTE) break;
    }
    return total;
}

export function programarExpiracionCheckouts(logger: Logger, intervaloMs = INTERVALO_MS): TareaProgramada {
    return programarTarea(
        'expirar-checkouts',
        intervaloMs,
        async () => {
            const resultado = await expirarCheckoutsVencidos();
            if (resultado.checkoutsExpirados > 0) logger.info(resultado, 'Checkouts vencidos expirados');
        },
        logger,
    );
}
