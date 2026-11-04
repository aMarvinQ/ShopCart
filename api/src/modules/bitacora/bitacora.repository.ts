import { ejecutarProcedimiento, parametrosOrden, TipoSql } from '../../db/index.js';
import type { FiltrosBitacora } from './bitacora.schemas.js';

/*
    Bitácora (solo administrador): la escriben los SPs de cada módulo en la misma transacción
    que el cambio y es inmutable (trigger y DENY a la API). Aquí solo se consulta; los valores
    anterior y nuevo (JSON) se entregan como objetos.
*/
const dia = (valor: string | undefined) => ({
    tipo: TipoSql.Date,
    valor: valor === undefined ? null : new Date(`${valor}T00:00:00Z`),
});

export async function listar(idUsuario: number, f: FiltrosBitacora, pagina: number, tamanoPagina: number) {
    const { filas, salidas } = await ejecutarProcedimiento(
        'SP_Bitacora_Listar',
        {
            IDUsuarioAccion: { tipo: TipoSql.Int, valor: idUsuario },
            Modulo: { tipo: TipoSql.VarChar(21), valor: f.modulo ?? null },
            Accion: { tipo: TipoSql.VarChar(21), valor: f.accion ?? null },
            IDUsuario: { tipo: TipoSql.Int, valor: f.idUsuario ?? null },
            Entidad: { tipo: TipoSql.VarChar(51), valor: f.entidad || null },
            IDEntidad: { tipo: TipoSql.VarChar(51), valor: f.idEntidad || null },
            FechaDesde: dia(f.fechaDesde),
            FechaHasta: dia(f.fechaHasta),
            Pagina: { tipo: TipoSql.Int, valor: pagina },
            TamanoPagina: { tipo: TipoSql.Int, valor: tamanoPagina },
            ...parametrosOrden(f),
        },
        { salidas: { TotalRegistros: TipoSql.Int }, json: ['valorAnterior', 'valorNuevo'], reintentable: true },
    );
    return { filas, total: Number(salidas.TotalRegistros ?? 0) };
}
