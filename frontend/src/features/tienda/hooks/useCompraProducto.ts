import { useMemo, useState } from 'react';
import { useAgregarAlCarrito } from '../../carrito/hooks/useCarrito';
import { gruposDeAtributos, imagenesDeVariante, varianteAlElegir } from '../variantes';
import type { DetalleDeProducto } from './useCatalogo';

/* Desde esta cantidad se avisa al cliente que quedan pocas. */
const POCAS_UNIDADES = 5;

/** Selección de variante, imagen y cantidad en el detalle, y agregar al carrito. */
export function useCompraProducto(producto: DetalleDeProducto) {
    const { variantes } = producto;
    const inicial = variantes.find((v) => v.esSeleccionInicial) ?? variantes[0];
    const [idVariante, setIdVariante] = useState(inicial?.idVariante);
    const [cantidad, setCantidad] = useState(1);
    const [imagenElegida, setImagenElegida] = useState<string | null>(null);
    const { agregar, agregando } = useAgregarAlCarrito();

    const variante = variantes.find((v) => v.idVariante === idVariante) ?? inicial;
    const grupos = useMemo(() => (variante ? gruposDeAtributos(variantes, variante) : []), [variantes, variante]);
    const imagenes = useMemo(() => imagenesDeVariante(producto.imagenes, variante), [producto.imagenes, variante]);
    const disponible = variante?.disponible ?? 0;

    const elegirValor = (idAtributo: number, idValor: number) => {
        if (!variante) return;
        setIdVariante(varianteAlElegir(variantes, variante, idAtributo, idValor).idVariante);
        setCantidad(1);
        setImagenElegida(null);
    };

    const agregarAlCarrito = () => {
        if (!variante) return;
        const detalle = variante.atributos.map((a) => a.valor).join(' / ');
        void agregar({
            idVariante: variante.idVariante,
            cantidad,
            nombre: detalle ? `${producto.nombre} · ${detalle}` : producto.nombre,
        });
    };

    return {
        variante,
        grupos,
        imagenes,
        imagen: imagenes.find((i) => i.rutaImagen === imagenElegida) ?? imagenes[0],
        cantidad,
        setCantidad,
        disponible,
        agotado: disponible === 0,
        pocasUnidades: disponible > 0 && disponible <= POCAS_UNIDADES,
        agregando,
        elegirValor,
        elegirImagen: setImagenElegida,
        agregarAlCarrito,
    };
}
