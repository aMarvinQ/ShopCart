import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '../../../../../api/cliente';
import type { DatosPanelImagenes, ImagenDePanel } from '../PanelImagenes';
import { claveDetalle, useCambioProducto, type ImagenProductoAdmin, type Producto } from './useEdicionProducto';

interface CambioOrden {
    imagen: ImagenProductoAdmin;
    orden: number;
}

const porOrden = (a: ImagenProductoAdmin, b: ImagenProductoAdmin) =>
    a.orden - b.orden || a.idProductoImagen - b.idProductoImagen;

const aPanel = (imagen: ImagenProductoAdmin): ImagenDePanel => ({
    clave: String(imagen.idProductoImagen),
    ruta: imagen.rutaImagen,
    texto: imagen.textoAlternativo,
    esPrincipal: imagen.esPrincipal,
});

/**
 * Imágenes de un producto ya creado: cada cambio se guarda al momento. Se trabajan por grupo, como las
 * maneja el SP: las generales y las de cada valor llevan su propio orden y su propia principal.
 */
export function useImagenesProducto(producto: Producto) {
    const id = producto.idProducto;
    const consultas = useQueryClient();
    const [atributoElegido, setAtributoElegido] = useState<number | null>(null);
    const [porEliminar, setPorEliminar] = useState<ImagenProductoAdmin | null>(null);

    const ordenadas = useMemo(() => [...producto.imagenes].sort(porOrden), [producto.imagenes]);
    const delGrupo = (idValor: number | null) => ordenadas.filter((i) => i.idAtributoValor === idValor);

    /* Atributos y valores que tienen variante: los únicos que admite el SP. */
    const atributos = useMemo(() => {
        const mapa = new Map<number, { idAtributo: number; nombre: string; valores: Map<number, string> }>();
        for (const variante of producto.variantes) {
            for (const a of variante.atributos) {
                const atributo = mapa.get(a.idAtributo) ?? {
                    idAtributo: a.idAtributo,
                    nombre: a.atributo,
                    valores: new Map(),
                };
                atributo.valores.set(a.idAtributoValor, a.valor);
                mapa.set(a.idAtributo, atributo);
            }
        }
        return [...mapa.values()];
    }, [producto.variantes]);

    const conValor = producto.imagenes.find((i) => i.idAtributoValor !== null);
    const atributoEnUso = atributos.find((a) => conValor?.idAtributoValor && a.valores.has(conValor.idAtributoValor));
    const atributo = atributoEnUso ?? atributos.find((a) => a.idAtributo === atributoElegido) ?? atributos[0];

    const asociar = useCambioProducto(
        id,
        ({ rutas, idValor }: { rutas: string[]; idValor: number | null }) => {
            const siguiente = delGrupo(idValor).reduce((mayor, i) => Math.max(mayor, i.orden + 1), 0);
            return api.post('/productos/{id}/imagenes', {
                params: { id },
                cuerpo: {
                    imagenes: rutas.map((ruta, i) => ({
                        ruta,
                        textoAlternativo: producto.nombre,
                        idAtributoValor: idValor,
                        orden: Math.min(255, siguiente + i),
                        esPrincipal: false, // El SP hace principal a la primera de un grupo nuevo.
                    })),
                },
            });
        },
        { exito: 'Imágenes agregadas', error: 'No se pudieron agregar las imágenes' },
    );
    const editarTexto = useCambioProducto(
        id,
        ({ imagen, texto }: { imagen: ImagenProductoAdmin; texto: string }) =>
            api.put('/imagenes/{id}', {
                params: { id: imagen.idProductoImagen },
                cuerpo: { textoAlternativo: texto, orden: imagen.orden },
            }),
        { error: 'No se pudo guardar la descripción' },
    );
    /* Se renumera el grupo, porque varias pueden compartir orden. Si una falla, se recarga lo real. */
    const mover = useCambioProducto(
        id,
        async (cambios: readonly CambioOrden[]) => {
            let respuesta = { data: producto };
            for (const { imagen, orden } of cambios) {
                respuesta = await api.put('/imagenes/{id}', {
                    params: { id: imagen.idProductoImagen },
                    cuerpo: { textoAlternativo: imagen.textoAlternativo, orden },
                });
            }
            return respuesta;
        },
        { error: 'No se pudo cambiar el orden' },
    );
    const principal = useCambioProducto(
        id,
        (imagen: ImagenProductoAdmin) =>
            api.post('/imagenes/{id}/principal', { params: { id: imagen.idProductoImagen } }),
        { exito: 'Imagen principal actualizada', error: 'No se pudo marcar como principal' },
    );
    const eliminar = useCambioProducto(
        id,
        (imagen: ImagenProductoAdmin) => api.delete('/imagenes/{id}', { params: { id: imagen.idProductoImagen } }),
        { exito: 'Imagen eliminada', error: 'No se pudo eliminar la imagen' },
    );

    const imagenDe = (clave: string) => producto.imagenes.find((i) => String(i.idProductoImagen) === clave);
    const esUltimaDeVisible = producto.activo && producto.imagenes.length === 1;

    const panel: DatosPanelImagenes = {
        ayuda: 'JPEG, PNG o WebP de hasta 5 MB. Arrastra para ordenar. Cada grupo lleva su orden y su principal. Todo se guarda al momento.',
        general: delGrupo(null).map(aPanel),
        atributos: atributos.map((a) => ({ idAtributo: a.idAtributo, nombre: a.nombre })),
        idAtributo: atributo?.idAtributo ?? null,
        atributoFijo: atributoEnUso !== undefined,
        elegirAtributo: setAtributoElegido,
        valores: [...(atributo?.valores ?? [])].map(([idValor, titulo]) => ({
            idValor,
            titulo,
            imagenes: delGrupo(idValor).map(aPanel),
        })),
        sinValores: 'Este atributo no tiene valores.',
        ocupado: asociar.isPending || editarTexto.isPending || mover.isPending || principal.isPending,
        /* El SP no deja quitar la última imagen de un producto visible. */
        eliminable: !esUltimaDeVisible,
        motivoNoEliminable: 'Es la última imagen de un producto visible: ocúltalo primero.',
        cambiarTexto: (clave, texto) => {
            const imagen = imagenDe(clave);
            const limpio = texto.trim();
            if (!imagen) return texto;
            if (!limpio) return imagen.textoAlternativo;
            if (limpio !== imagen.textoAlternativo) editarTexto.mutate({ imagen, texto: limpio });
            return limpio;
        },
        reordenar: (idValor, desde, hasta) => {
            const nuevo = delGrupo(idValor);
            const [movida] = nuevo.splice(desde, 1);
            if (!movida) return;
            nuevo.splice(hasta, 0, movida);
            const cambios = nuevo.flatMap((imagen, orden) => (imagen.orden === orden ? [] : [{ imagen, orden }]));
            if (cambios.length === 0) return;
            // La imagen queda donde se soltó sin esperar a la API.
            const ordenDe = new Map(cambios.map((cambio) => [cambio.imagen.idProductoImagen, cambio.orden]));
            consultas.setQueryData<{ data: Producto }>(claveDetalle(id), (actual) =>
                actual
                    ? {
                          ...actual,
                          data: {
                              ...actual.data,
                              imagenes: actual.data.imagenes.map((i) => ({
                                  ...i,
                                  orden: ordenDe.get(i.idProductoImagen) ?? i.orden,
                              })),
                          },
                      }
                    : actual,
            );
            mover.mutate(cambios);
        },
        hacerPrincipal: (clave) => {
            const imagen = imagenDe(clave);
            if (imagen) principal.mutate(imagen);
        },
        eliminar: (clave) => {
            setPorEliminar(imagenDe(clave) ?? null);
        },
        subir: (rutas, idValor) => {
            asociar.mutate({ rutas, idValor });
        },
    };

    return {
        panel,
        porEliminar,
        desistir: () => {
            setPorEliminar(null);
        },
        eliminando: eliminar.isPending,
        confirmarEliminar: () => {
            if (porEliminar) {
                eliminar.mutate(porEliminar, {
                    onSettled: () => {
                        setPorEliminar(null);
                    },
                });
            }
        },
    };
}
