import type { CSSProperties } from 'react';
import estilos from './Esqueleto.module.scss';

/*
    Bloque de carga con la forma del contenido final y un brillo que se desplaza (se apaga con
    "reducir movimiento"). Nunca spinners de página. Se oculta a los lectores de pantalla: quien
    agrupa los esqueletos anuncia "Cargando" una sola vez.
*/
export function Esqueleto({
    ancho = '100%',
    alto = '1rem',
    radio,
    style,
}: {
    ancho?: CSSProperties['width'];
    alto?: CSSProperties['height'];
    radio?: CSSProperties['borderRadius'];
    style?: CSSProperties;
}) {
    return (
        <span
            aria-hidden="true"
            className={estilos.esqueleto}
            style={{ width: ancho, height: alto, borderRadius: radio, ...style }}
        />
    );
}

/** Estructura de la app mientras se recupera la sesión: barra superior y contenido en gris. */
export function EsqueletoApp() {
    return (
        <div role="status" aria-label="Cargando" className={estilos.app}>
            <div className={estilos.barra}>
                <Esqueleto ancho="7rem" alto="1.75rem" />
                <Esqueleto ancho="min(36rem, 45vw)" alto="2.25rem" />
                <Esqueleto ancho="5rem" alto="1.75rem" />
            </div>
            <div className={`container ${estilos.contenido}`}>
                <Esqueleto alto="min(40vw, 14rem)" radio="12px" />
                <div className="row g-3 mt-2">
                    {Array.from({ length: 4 }, (_, i) => (
                        <div key={i} className="col-6 col-lg-3">
                            <Esqueleto alto="min(40vw, 14rem)" radio="12px" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
