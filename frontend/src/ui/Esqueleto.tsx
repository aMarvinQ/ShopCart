import type { CSSProperties } from 'react';
import { leerContraido } from '../utils/menuContraido';
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

function BarraEsqueleto({ conLogo }: { conLogo: boolean }) {
    return (
        <div className={estilos.barra}>
            <span className={conLogo ? undefined : estilos.soloMovil}>
                <Esqueleto ancho="6.5rem" alto="1.75rem" />
            </span>
            <span className={estilos.espacio} />
            <span className={estilos.ranura}>
                <Esqueleto ancho="1.25rem" alto="1.25rem" />
            </span>
            <span className={estilos.ranuraUsuario}>
                <Esqueleto ancho="2.25rem" alto="2.25rem" radio="50%" />
            </span>
        </div>
    );
}

function TarjetasEsqueleto() {
    return (
        <div className="row g-3">
            {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="col-6 col-lg-3">
                    <Esqueleto alto="min(40vw, 14rem)" radio="12px" />
                </div>
            ))}
        </div>
    );
}

/**
 * Estructura mientras se recupera la sesión, con la geometría de la pantalla que viene (tienda o
 * panel, y el menú como lo dejó el usuario): al terminar de cargar, nada cambia de lugar.
 */
export function EsqueletoApp() {
    if (window.location.pathname.startsWith('/panel')) {
        const ancho = leerContraido() ? estilos.lateralContraido : '';
        return (
            <div role="status" aria-label="Cargando" className={estilos.panel}>
                <div data-testid="esqueleto-lateral" className={`${estilos.lateral} ${ancho}`}>
                    <div className={estilos.lateralCabecera}>
                        <Esqueleto ancho="1.75rem" alto="1.75rem" />
                    </div>
                    {Array.from({ length: 3 }, (_, i) => (
                        <div key={i} className={estilos.lateralOpcion}>
                            <Esqueleto ancho="1.25rem" alto="1.25rem" />
                        </div>
                    ))}
                </div>
                <div className={estilos.panelCuerpo}>
                    <BarraEsqueleto conLogo={false} />
                    <div className={estilos.panelContenido}>
                        <Esqueleto ancho="12rem" alto="1.75rem" style={{ marginBottom: '1.5rem' }} />
                        <TarjetasEsqueleto />
                    </div>
                </div>
            </div>
        );
    }
    return (
        <div role="status" aria-label="Cargando" className={estilos.app}>
            <BarraEsqueleto conLogo />
            <div className={`container ${estilos.contenido}`}>
                <Esqueleto alto="min(40vw, 14rem)" radio="12px" style={{ marginBottom: '1rem' }} />
                <TarjetasEsqueleto />
            </div>
        </div>
    );
}
