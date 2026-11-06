import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Dropdown } from 'react-bootstrap';
import {
    hoyGuatemala,
    inicioDeMes,
    nombreDeDia,
    nombreDeMes,
    semanasDelMes,
    sumarDias,
    sumarMeses,
} from '../utils/calendario';
import estilos from './SelectorFechas.module.scss';

const DIAS_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function atajos(hoy: string) {
    return [
        { etiqueta: 'Hoy', desde: hoy, hasta: hoy },
        { etiqueta: 'Últimos 7 días', desde: sumarDias(hoy, -6), hasta: hoy },
        { etiqueta: 'Últimos 30 días', desde: sumarDias(hoy, -29), hasta: hoy },
        { etiqueta: 'Este mes', desde: inicioDeMes(hoy), hasta: hoy },
    ];
}

/**
 * Rango de fechas con el aspecto del sistema, igual en todo navegador: atajos y calendario. El primer
 * clic marca el inicio y el segundo el fin (en cualquier orden). Teclado, Escape y clic fuera los
 * resuelve el Dropdown de Bootstrap. Los días futuros no se pueden elegir.
 */
export function SelectorFechas({
    etiqueta = 'Filtrar por fecha',
    desde,
    hasta,
    alCambiar,
}: {
    etiqueta?: string;
    desde: string | null;
    hasta: string | null;
    alCambiar: (desde: string, hasta: string) => void;
}) {
    const hoy = hoyGuatemala();
    const [abierto, setAbierto] = useState(false);
    const [mes, setMes] = useState(() => inicioDeMes(hasta ?? desde ?? hoy));
    const [inicio, setInicio] = useState<string | null>(null);

    const aplicar = (primero: string, ultimo: string) => {
        alCambiar(primero, ultimo);
        setInicio(null);
        setAbierto(false);
    };
    const elegirDia = (dia: string) => {
        if (inicio === null) {
            setInicio(dia);
            return;
        }
        if (inicio <= dia) aplicar(inicio, dia);
        else aplicar(dia, inicio);
    };
    /* Mientras se elige el rango se muestra solo el inicio; si no, el rango vigente. */
    const marcaDesde = inicio ?? desde;
    const marcaHasta = inicio === null ? hasta : inicio;

    return (
        <Dropdown
            show={abierto}
            autoClose="outside"
            onToggle={(siguiente) => {
                setAbierto(siguiente);
                if (!siguiente) setInicio(null);
            }}
        >
            <Dropdown.Toggle as="button" type="button" bsPrefix={estilos.boton ?? ''}>
                <CalendarDays size={20} aria-hidden="true" />
                {etiqueta}
            </Dropdown.Toggle>
            <Dropdown.Menu className={estilos.menu ?? ''}>
                <div className={estilos.atajos}>
                    {atajos(hoy).map((a) => (
                        <button
                            key={a.etiqueta}
                            type="button"
                            onClick={() => {
                                aplicar(a.desde, a.hasta);
                            }}
                        >
                            {a.etiqueta}
                        </button>
                    ))}
                </div>
                <div className={estilos.calendario}>
                    <div className={estilos.mes}>
                        <button
                            type="button"
                            aria-label="Mes anterior"
                            onClick={() => {
                                setMes(sumarMeses(mes, -1));
                            }}
                        >
                            <ChevronLeft size={20} aria-hidden="true" />
                        </button>
                        <span aria-live="polite">{nombreDeMes(mes)}</span>
                        <button
                            type="button"
                            aria-label="Mes siguiente"
                            disabled={mes >= inicioDeMes(hoy)}
                            onClick={() => {
                                setMes(sumarMeses(mes, 1));
                            }}
                        >
                            <ChevronRight size={20} aria-hidden="true" />
                        </button>
                    </div>
                    <table className={estilos.dias}>
                        <thead>
                            <tr>
                                {DIAS_SEMANA.map((dia, i) => (
                                    <th key={i} scope="col">
                                        {dia}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {semanasDelMes(mes).map((semana, i) => (
                                <tr key={i}>
                                    {semana.map((dia, j) => {
                                        const extremo = dia !== null && (dia === marcaDesde || dia === marcaHasta);
                                        const enRango =
                                            dia !== null &&
                                            marcaDesde &&
                                            marcaHasta &&
                                            dia > marcaDesde &&
                                            dia < marcaHasta;
                                        return (
                                            <td key={j}>
                                                {dia && (
                                                    <button
                                                        type="button"
                                                        aria-label={nombreDeDia(dia)}
                                                        aria-pressed={extremo}
                                                        disabled={dia > hoy}
                                                        className={`${enRango ? estilos.enRango : ''} ${dia === hoy ? estilos.hoy : ''}`}
                                                        onClick={() => {
                                                            elegirDia(dia);
                                                        }}
                                                    >
                                                        {Number(dia.slice(8))}
                                                    </button>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className={estilos.ayuda}>{inicio ? 'Ahora elige el último día.' : 'Elige el primer día.'}</p>
                </div>
            </Dropdown.Menu>
        </Dropdown>
    );
}
