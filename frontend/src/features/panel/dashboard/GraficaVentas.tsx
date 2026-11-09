import {
    Bar,
    BarChart,
    CartesianGrid,
    Rectangle,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    type BarShapeProps,
} from 'recharts';
import { moneda } from '../../../utils/formato';
import { nombreDeDia } from '../../../utils/calendario';
import type { VentaPeriodo } from './hooks/useDashboard';
import estilos from './dashboard.module.scss';

const ALTO = 280;

/** Q60k, Q1.2k o Q0: el eje solo orienta; el monto exacto está en el detalle al pasar el cursor. */
const montoCorto = (valor: number) =>
    valor >= 1_000 ? `Q${(valor / 1_000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k` : `Q${String(valor)}`;

function Detalle({ active, payload }: { active?: boolean; payload?: readonly { payload: VentaPeriodo }[] }) {
    const fila = payload?.[0]?.payload;
    if (!active || !fila) return null;
    return (
        <div className={estilos.detalleGrafica}>
            <strong>{nombreDeDia(fila.periodo)}</strong>
            <span className="numero">{moneda(fila.ventaNeta)}</span>
            <small>
                {fila.pedidos} {fila.pedidos === 1 ? 'pedido' : 'pedidos'}
            </small>
        </div>
    );
}

/*
    Una sola serie (ventas netas por día): un solo tono, y hoy más oscuro porque aún no termina.
    La misma información va en una tabla para lectores de pantalla.
*/
export function GraficaVentas({ filas, hoy }: { filas: readonly VentaPeriodo[]; hoy: string }) {
    return (
        <figure className={estilos.figura}>
            <div aria-hidden="true">
                <ResponsiveContainer width="100%" height={ALTO}>
                    <BarChart
                        accessibilityLayer={false}
                        data={[...filas]}
                        margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
                        barCategoryGap="20%"
                    >
                        <CartesianGrid vertical={false} className={estilos.rejilla} />
                        <XAxis
                            dataKey="periodo"
                            tickFormatter={(dia: string) => String(Number(dia.slice(8)))}
                            tickLine={false}
                            axisLine={false}
                            interval="preserveStartEnd"
                            className={estilos.eje}
                        />
                        <YAxis
                            tickFormatter={montoCorto}
                            tickLine={false}
                            axisLine={false}
                            width={64}
                            className={estilos.eje}
                        />
                        <Tooltip content={<Detalle />} cursor={{ className: estilos.cursorGrafica }} />
                        <Bar
                            dataKey="ventaNeta"
                            radius={[4, 4, 0, 0]}
                            isAnimationActive={false}
                            shape={(barra: BarShapeProps) => (
                                <Rectangle
                                    {...barra}
                                    className={
                                        (barra.payload as VentaPeriodo).periodo === hoy
                                            ? estilos.barraHoy
                                            : estilos.barra
                                    }
                                />
                            )}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <figcaption className={estilos.leyenda}>
                <span>
                    <i className={estilos.muestra} /> Días anteriores
                </span>
                <span>
                    <i className={estilos.muestraHoy} /> Hoy (parcial)
                </span>
            </figcaption>
            {/* Una tabla no respeta el ancho de 1 px de visually-hidden: se oculta su contenedor. */}
            <div className="visually-hidden">
                <table>
                    <caption>Ventas netas por día</caption>
                    <thead>
                        <tr>
                            <th scope="col">Día</th>
                            <th scope="col">Ventas</th>
                            <th scope="col">Pedidos</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filas.map((f) => (
                            <tr key={f.periodo}>
                                <th scope="row">{nombreDeDia(f.periodo)}</th>
                                <td>{moneda(f.ventaNeta)}</td>
                                <td>{f.pedidos}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </figure>
    );
}
