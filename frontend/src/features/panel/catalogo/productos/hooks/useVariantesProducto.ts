import { useState } from 'react';
import { api } from '../../../../../api/cliente';
import { precioValido, skuValido } from '../generadorVariantes';
import { useGeneradorVariantes } from './useGeneradorVariantes';
import { useCambioProducto, type Producto, type Variante } from './useEdicionProducto';

export const nombreVariante = (variante: Variante) => variante.atributos.map((a) => a.valor).join(' / ') || 'Única';

export function useVariantesProducto(producto: Producto) {
    const id = producto.idProducto;
    const estado = useCambioProducto(
        id,
        (variante: Variante) =>
            api.patch('/variantes/{id}/estado', {
                params: { id: variante.idVariante },
                cuerpo: { activo: !variante.activo },
            }),
        { error: 'No se pudo cambiar la variante' },
    );
    const [abiertos, setAbiertos] = useState<ReadonlySet<number>>(new Set());
    const activas = producto.variantes.filter((v) => v.activo);

    /* Con dos o más atributos se agrupan por el valor del primero; un solo grupo no necesita contenedor. */
    const porValor = new Map<number, { idValor: number; titulo: string; variantes: Variante[] }>();
    for (const variante of producto.variantes) {
        const [primero] = variante.atributos;
        if (primero && variante.atributos.length > 1) {
            const grupo = porValor.get(primero.idAtributoValor);
            if (grupo) grupo.variantes.push(variante);
            else {
                porValor.set(primero.idAtributoValor, {
                    idValor: primero.idAtributoValor,
                    titulo: primero.valor,
                    variantes: [variante],
                });
            }
        }
    }
    const [unicaActiva] = activas;
    return {
        grupos:
            porValor.size > 1
                ? [...porValor.values()].map((g) => ({
                      ...g,
                      abierto: abiertos.has(g.idValor),
                      disponible: g.variantes.reduce((suma, v) => suma + v.disponible, 0),
                  }))
                : [],
        alternarGrupo: (idValor: number) => {
            setAbiertos((actuales) => {
                const copia = new Set(actuales);
                if (!copia.delete(idValor)) copia.add(idValor);
                return copia;
            });
        },
        cambiando: estado.isPending,
        alternar: estado.mutate,
        /* El SP no deja desactivar la última variante activa de un producto visible. */
        idUltimaActiva: producto.activo && activas.length === 1 && unicaActiva ? unicaActiva.idVariante : null,
        /* Una variante sin atributos no admite otras: todas deben usar los mismos atributos. */
        admiteMas: producto.variantes.every((v) => v.atributos.length > 0),
        paraMovimiento: producto.variantes.map((v) => ({
            idVariante: v.idVariante,
            sku: v.sku,
            producto: producto.nombre,
            descripcion: nombreVariante(v),
            disponible: v.disponible,
        })),
    };
}

/** SKU y precio son dos rutas con su propia versión: se guarda solo lo que cambió, usando la versión más nueva. */
export function useEdicionVariante(producto: Producto, variante: Variante, alTerminar: () => void) {
    const [sku, setSku] = useState(variante.sku);
    const [precio, setPrecio] = useState(String(variante.precio));
    const [errores, setErrores] = useState<{ sku?: string; precio?: string }>({});

    const guardar = useCambioProducto(
        producto.idProducto,
        async ({ skuNuevo, precioNuevo }: { skuNuevo: string; precioNuevo: number }) => {
            let respuesta = { data: producto };
            let version = variante.versionFila;
            const parametros = { params: { id: variante.idVariante } };
            if (skuNuevo !== variante.sku) {
                respuesta = await api.put('/variantes/{id}', {
                    ...parametros,
                    cuerpo: { sku: skuNuevo, versionFila: version },
                });
                version =
                    respuesta.data.variantes.find((v) => v.idVariante === variante.idVariante)?.versionFila ?? version;
            }
            if (precioNuevo !== variante.precio) {
                respuesta = await api.put('/variantes/{id}/precio', {
                    ...parametros,
                    cuerpo: { precio: precioNuevo, versionFila: version },
                });
            }
            return respuesta;
        },
        { exito: 'Variante actualizada', error: 'No se pudo guardar la variante' },
    );

    return {
        sku,
        setSku: (texto: string) => {
            setSku(texto.toUpperCase());
        },
        precio,
        setPrecio,
        errores,
        guardando: guardar.isPending,
        enviar: () => {
            const skuLimpio = sku.trim();
            const nuevos: { sku?: string; precio?: string } = {};
            if (!skuValido(skuLimpio)) nuevos.sku = 'De 3 a 50 letras, números o guiones.';
            if (!precioValido(precio)) nuevos.precio = 'Escribe un monto mayor que 0, como 120.50.';
            setErrores(nuevos);
            if (Object.keys(nuevos).length > 0) return;
            guardar.mutate({ skuNuevo: skuLimpio, precioNuevo: Number(precio) }, { onSuccess: alTerminar });
        },
    };
}

export function useAgregarVariantes(producto: Producto, alTerminar: () => void) {
    const [error, setError] = useState<string | null>(null);
    const generador = useGeneradorVariantes(producto.idCategoria, producto.nombre, producto.variantes);
    const agregar = useCambioProducto(
        producto.idProducto,
        () =>
            api.post('/productos/{id}/variantes', {
                params: { id: producto.idProducto },
                cuerpo: { variantes: generador.cuerpo() },
            }),
        { exito: 'Variantes agregadas', error: 'No se pudieron agregar las variantes' },
    );
    return {
        generador,
        error,
        agregando: agregar.isPending,
        enviar: () => {
            const problema = generador.revisar();
            setError(problema);
            if (!problema) agregar.mutate(undefined, { onSuccess: alTerminar });
        },
    };
}
