import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '../../../../../api/cliente';
import { useAtributosPanel, useNuevoValor } from '../../hooks/useAtributosPanel';
import { useDetalleCategoria } from '../../hooks/useCategoriasPanel';
import {
    MAXIMO_VARIANTES,
    combinaciones,
    precioValido,
    prefijoSku,
    skuLibre,
    skuSugerido,
    skuValido,
    totalCombinaciones,
    type ValorElegible,
} from '../generadorVariantes';

interface EdicionFila {
    sku?: string;
    precio?: string;
    existencia?: string;
    quitada?: boolean;
}

export interface VarianteExistente {
    sku: string;
    atributos: readonly { idAtributo: number; idAtributoValor: number }[];
}

const SIN_VARIANTES: readonly VarianteExistente[] = [];
const existenciaValida = (texto: string) => /^\d{1,7}$/.test(texto.trim()) && Number(texto) <= 1_000_000;
const claveDeValores = (ids: readonly number[]) => [...ids].sort((a, b) => a - b).join('-');
const POR_PAGINA = 100;

/**
 * SKU de la tienda que empiezan como los sugeridos para este producto (activos o no: el SKU es único en
 * toda la tabla). Se piden todas las páginas.
 */
async function skusConPrefijo(prefijo: string, signal: AbortSignal) {
    const skus: string[] = [];
    for (let pagina = 1; ; pagina++) {
        const { data, meta } = await api.get('/inventario/existencias', {
            query: { pagina, tamanoPagina: POR_PAGINA, busqueda: prefijo, ordenarPor: 'SKU', direccion: 'ASC' },
            signal,
        });
        // La búsqueda también halla nombres y SKU que solo contienen el prefijo: se quedan los que empiezan así.
        skus.push(...data.map((v) => v.sku).filter((sku) => sku.startsWith(prefijo)));
        if (pagina * POR_PAGINA >= meta.totalRegistros) return skus;
    }
}

/**
 * Marca valores y arma una fila por combinación, con SKU sugerido, y precio y existencia comunes que se
 * pueden cambiar. Con `existentes` (agregar a un producto ya creado) aplica lo que exige el SP: los mismos
 * atributos que sus variantes, sin repetir combinaciones (ni las desactivadas) ni SKU.
 */
export function useGeneradorVariantes(
    idCategoria: number | null,
    nombre: string,
    existentes: readonly VarianteExistente[] = SIN_VARIANTES,
) {
    const [elegidos, setElegidos] = useState<ReadonlySet<number>>(new Set());
    const [precioBase, setPrecioBase] = useState('');
    const [existenciaBase, setExistenciaBase] = useState('');
    const [ediciones, setEdiciones] = useState<Partial<Record<string, EdicionFila>>>({});
    const [mostrarErrores, setMostrarErrores] = useState(false);
    const [abiertos, setAbiertos] = useState<ReadonlySet<number>>(new Set());

    const categoria = useDetalleCategoria(idCategoria);
    const { consulta: consultaAtributos } = useAtributosPanel();
    const nuevoValor = useNuevoValor();
    const prefijo = prefijoSku(nombre);
    const enLaTienda = useQuery({
        queryKey: ['panel', 'catalogo', 'skus', prefijo],
        queryFn: ({ signal }) => skusConPrefijo(prefijo, signal),
        enabled: idCategoria !== null,
        select: (skus) => new Set(skus),
    });

    /* Atributos activos de la categoría, con sus valores activos, en el orden de sus selectores. */
    const atributos = useMemo(() => {
        const todos = consultaAtributos.data?.data ?? [];
        const firma = existentes[0]?.atributos.map((a) => a.idAtributo);
        return [...(categoria.data?.data.atributos ?? [])]
            .filter((a) => a.activo && (!firma || firma.includes(a.idAtributo)))
            .sort((a, b) => a.orden - b.orden)
            .map((a) => ({
                idAtributo: a.idAtributo,
                nombre: a.nombre,
                valores: (todos.find((t) => t.idAtributo === a.idAtributo)?.valores ?? [])
                    .filter((v) => v.activo)
                    .sort((x, y) => x.orden - y.orden)
                    .map((v) => ({ ...v, idAtributo: a.idAtributo })),
            }))
            .map((a) => ({ ...a, usaColor: a.valores.some((v) => v.codigoHex !== null) }));
    }, [consultaAtributos.data, categoria.data, existentes]);

    const grupos: ValorElegible[][] = atributos.map((a) => a.valores.filter((v) => elegidos.has(v.idAtributoValor)));
    const total = totalCombinaciones(grupos);
    const faltaValor = atributos.some((_, i) => (grupos[i]?.length ?? 0) === 0);
    const demasiadas = total > MAXIMO_VARIANTES;
    const yaExistentes = new Set(existentes.map((v) => claveDeValores(v.atributos.map((a) => a.idAtributoValor))));
    const skusTomados = new Set([...existentes.map((v) => v.sku), ...(enLaTienda.data ?? [])]);

    const vigentes = (
        faltaValor || demasiadas || idCategoria === null || categoria.isPending ? [] : combinaciones(grupos)
    )
        .filter((c) => !yaExistentes.has(claveDeValores(c.valores.map((v) => v.idAtributoValor))))
        .filter((c) => ediciones[c.clave]?.quitada !== true);
    /* La sugerencia evita los SKU de la tienda, los escritos a mano y los ya sugeridos a otra fila
       (Negro y Negrita darían el mismo). Lo escrito a mano no se toca: si choca, se marca el error. */
    const ocupados = new Set([...skusTomados, ...vigentes.flatMap((c) => ediciones[c.clave]?.sku?.trim() ?? [])]);
    const filas = vigentes.map((c) => {
        const edicion = ediciones[c.clave];
        const sku = edicion?.sku ?? skuLibre(skuSugerido(nombre, c.valores), ocupados);
        ocupados.add(sku.trim());
        return {
            clave: c.clave,
            valores: c.valores,
            sku,
            precio: edicion?.precio ?? precioBase,
            existencia: edicion?.existencia ?? (existenciaBase || '0'),
        };
    });

    const errorSku = (sku: string) => {
        const limpio = sku.trim();
        if (!skuValido(limpio)) return '3 a 50 letras, números o guiones.';
        if (skusTomados.has(limpio)) return 'Ese SKU ya existe.';
        return filas.filter((f) => f.sku.trim() === limpio).length > 1 ? 'SKU repetido.' : undefined;
    };
    const errorPrecio = (precio: string) => (precioValido(precio) ? undefined : 'Monto mayor que 0.');
    const errorExistencia = (texto: string) => (existenciaValida(texto) ? undefined : 'De 0 a 1,000,000.');

    const tieneError = (f: (typeof filas)[number]) =>
        Boolean(errorSku(f.sku) ?? errorPrecio(f.precio) ?? errorExistencia(f.existencia));

    /* Con dos o más atributos, las filas se agrupan por el valor del primero (Azul: Azul / S, Azul / M...). */
    const porValor = new Map<number, { idValor: number; titulo: string; filas: typeof filas }>();
    if (atributos.length > 1) {
        for (const fila of filas) {
            const [primero] = fila.valores;
            if (primero) {
                const grupo = porValor.get(primero.idAtributoValor);
                if (grupo) grupo.filas.push(fila);
                else
                    porValor.set(primero.idAtributoValor, {
                        idValor: primero.idAtributoValor,
                        titulo: primero.valor,
                        filas: [fila],
                    });
            }
        }
    }
    /* Un solo grupo no necesita contenedor: sus filas se muestran directo. */
    const gruposFilas = porValor.size > 1 ? [...porValor.values()] : [];

    /* Los valores con los que puede mostrarse una imagen: los que tendrá alguna variante. */
    const valoresConVariante = new Map(
        filas.flatMap((f) =>
            f.valores.map((v) => [
                v.idAtributoValor,
                { ...v, atributo: atributos.find((a) => a.idAtributo === v.idAtributo)?.nombre ?? '' },
            ]),
        ),
    );

    return {
        cargando: idCategoria !== null && categoria.isPending,
        hayCategoria: idCategoria !== null,
        atributos,
        elegidos,
        demasiadas,
        total,
        filas,
        gruposFilas: gruposFilas.map((g) => ({
            ...g,
            abierto: abiertos.has(g.idValor),
            conError: mostrarErrores && g.filas.some(tieneError),
        })),
        alternarGrupo: (idValor: number) => {
            setAbiertos((actuales) => {
                const copia = new Set(actuales);
                if (!copia.delete(idValor)) copia.add(idValor);
                return copia;
            });
        },
        precioBase,
        cambiarPrecioBase: setPrecioBase,
        existenciaBase,
        cambiarExistenciaBase: setExistenciaBase,
        mostrarErrores,
        errorSku,
        errorPrecio,
        errorExistencia,
        hayCambios: elegidos.size > 0 || precioBase !== '' || existenciaBase !== '',
        valoresConVariante: [...valoresConVariante.values()],
        editarFila: (clave: string, cambios: EdicionFila) => {
            const normalizados = cambios.sku === undefined ? cambios : { ...cambios, sku: cambios.sku.toUpperCase() };
            setEdiciones((actuales) => ({ ...actuales, [clave]: { ...actuales[clave], ...normalizados } }));
        },
        alternarValor: (id: number) => {
            // Lo escrito en las filas se conserva; las que tenían este valor vuelven a ofrecerse.
            setEdiciones((actuales) =>
                Object.fromEntries(
                    Object.entries(actuales).map(([clave, edicion]) => [
                        clave,
                        clave.split('-').includes(String(id)) ? { ...edicion, quitada: false } : edicion,
                    ]),
                ),
            );
            setElegidos((actuales) => {
                const copia = new Set(actuales);
                if (!copia.delete(id)) copia.add(id);
                return copia;
            });
        },
        creandoValor: nuevoValor.isPending,
        /** Crea el valor sin perder lo escrito en el formulario y lo deja marcado. */
        crearValor: async (idAtributo: number, valor: string, codigoHex: string | null) => {
            const mismoTexto = (otro: string) => otro.toLocaleLowerCase('es') === valor.toLocaleLowerCase('es');
            const desactivado = consultaAtributos.data?.data
                .find((a) => a.idAtributo === idAtributo)
                ?.valores.some((v) => !v.activo && mismoTexto(v.valor));
            if (desactivado) throw new Error(`${valor} ya existe, desactivado: actívalo en Catálogo, Atributos.`);
            const { data } = await nuevoValor.mutateAsync({ idAtributo, valor, codigoHex });
            setElegidos((actuales) => new Set(actuales).add(data.idAtributoValor));
        },
        reiniciar: () => {
            setElegidos(new Set());
            setEdiciones({});
            setAbiertos(new Set());
        },
        /** Mensaje de lo que impide enviar; null si las filas están bien. */
        revisar: (): string | null => {
            setMostrarErrores(true);
            if (filas.length === 0) {
                return demasiadas
                    ? `Son demasiadas combinaciones: el máximo es ${String(MAXIMO_VARIANTES)}.`
                    : 'Elige al menos un valor de cada atributo para crear las variantes.';
            }
            const bien = !filas.some(tieneError);
            // Lo que hay que corregir no queda escondido en un grupo cerrado.
            const conError = gruposFilas.filter((g) => g.filas.some(tieneError)).map((g) => g.idValor);
            setAbiertos((actuales) => new Set([...actuales, ...conError]));
            return bien ? null : 'Revisa los datos marcados en las variantes.';
        },
        cuerpo: () =>
            filas.map((f) => ({
                sku: f.sku.trim(),
                precio: Number(f.precio),
                existenciaInicial: Number(f.existencia),
                atributos: f.valores.map((v) => ({ idAtributo: v.idAtributo, idAtributoValor: v.idAtributoValor })),
            })),
    };
}
