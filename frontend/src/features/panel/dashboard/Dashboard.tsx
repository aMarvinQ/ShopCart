import { ClipboardList, CreditCard, Download, PackageCheck, Receipt, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Dropdown } from 'react-bootstrap';
import { Link } from 'react-router';
import { EstadoPedido } from '../../../ui/Mensajes';
import { Selector } from '../../../ui/Selector';
import { nombreDeDia } from '../../../utils/calendario';
import { fechaHora, hora, moneda } from '../../../utils/formato';
import { GraficaVentas } from './GraficaVentas';
import { PERIODOS, useDashboard } from './hooks/useDashboard';
import { useExportarReporte } from './hooks/useExportarReporte';
import type { EstadoTiempoReal } from './hooks/useTiempoReal';
import { Contenido, Panel } from './Panel';
import estilos from './dashboard.module.scss';

const TEXTO_EN_VIVO: Record<EstadoTiempoReal, string> = {
    conectando: 'Conectando…',
    'en-vivo': 'En vivo',
    reconectando: 'Reconectando…',
    'sin-permiso': 'Sin acceso en vivo',
};

function Indicador({
    icono: Icono,
    titulo,
    valor,
    pie,
}: {
    icono: LucideIcon;
    titulo: string;
    valor: string | undefined;
    pie?: React.ReactNode;
}) {
    return (
        <div className={estilos.indicador}>
            <span className={estilos.indicadorTitulo}>
                <Icono size={18} aria-hidden="true" />
                {titulo}
            </span>
            <strong className={`numero ${estilos.indicadorValor}`}>{valor ?? '—'}</strong>
            <span className={estilos.indicadorPie}>{pie ?? ' '}</span>
        </div>
    );
}

export default function Dashboard() {
    const d = useDashboard();
    const { exportar, exportando } = useExportarReporte(d.rango);
    const hoy = d.resumenHoy.data;
    const despachar = d.porDespachar;

    return (
        <section className={estilos.pagina}>
            <title>Dashboard · ShopCart</title>
            <div className={estilos.encabezado}>
                <div>
                    <h1 className={estilos.titulo}>
                        Dashboard
                        <span className={`${estilos.enVivo} ${estilos[d.enVivo]}`} role="status">
                            {TEXTO_EN_VIVO[d.enVivo]}
                        </span>
                    </h1>
                    <p className={estilos.subtitulo}>
                        {nombreDeDia(d.hoy)}
                        {d.actualizadoEn && ` · actualizado a las ${hora(d.actualizadoEn)}`}
                    </p>
                </div>
                <div className={estilos.controles}>
                    <Selector
                        etiqueta="Periodo"
                        compacto
                        ancho="12rem"
                        valor={d.periodo}
                        opciones={PERIODOS}
                        alCambiar={d.elegirPeriodo}
                    />
                    <Dropdown align="end">
                        <Dropdown.Toggle variant="outline-primary" disabled={exportando} className={estilos.exportar}>
                            <Download size={18} aria-hidden="true" /> {exportando ? 'Exportando…' : 'Exportar'}
                        </Dropdown.Toggle>
                        <Dropdown.Menu>
                            <Dropdown.Item
                                as="button"
                                type="button"
                                onClick={() => {
                                    exportar('xlsx');
                                }}
                            >
                                Excel (.xlsx)
                            </Dropdown.Item>
                            <Dropdown.Item
                                as="button"
                                type="button"
                                onClick={() => {
                                    exportar('pdf');
                                }}
                            >
                                PDF
                            </Dropdown.Item>
                        </Dropdown.Menu>
                    </Dropdown>
                </div>
            </div>

            <div className={estilos.indicadores} aria-busy={!hoy}>
                <Indicador icono={Receipt} titulo="Ventas de hoy" valor={hoy && moneda(hoy.ventaNeta)} />
                <Indicador icono={ClipboardList} titulo="Pedidos de hoy" valor={hoy && String(hoy.pedidos)} />
                <Indicador icono={CreditCard} titulo="Ticket promedio" valor={hoy && moneda(hoy.ticketPromedio)} />
                <Indicador
                    icono={PackageCheck}
                    titulo="Por despachar"
                    valor={despachar && String(despachar.pagados + despachar.enPreparacion)}
                    pie={
                        despachar && (
                            <Link to="/panel/pedidos?estado=PAGADO">
                                {despachar.pagados} pagados · {despachar.enPreparacion} en preparación
                            </Link>
                        )
                    }
                />
            </div>

            <div className={estilos.fila}>
                <Panel
                    titulo="Ventas por día"
                    detalle={d.resumenPeriodo.data && `Total del periodo: ${moneda(d.resumenPeriodo.data.ventaNeta)}`}
                >
                    <Contenido consulta={d.ventas} alto="19rem">
                        {(filas) => <GraficaVentas filas={filas} hoy={d.hoy} />}
                    </Contenido>
                </Panel>
                <Panel titulo="Ventas por categoría">
                    <Contenido
                        consulta={d.categorias}
                        alto="19rem"
                        vacio={({ filas }) =>
                            filas.length === 0 ? <p className={estilos.vacio}>Sin ventas en el periodo.</p> : null
                        }
                    >
                        {({ filas, restantes }) => (
                            <ul className={estilos.categorias}>
                                {filas.map((c) => (
                                    <li key={c.idCategoria}>
                                        <span className={estilos.categoriaFila}>
                                            <span>{c.categoria}</span>
                                            <strong className="numero">{moneda(c.ventaNeta)}</strong>
                                        </span>
                                        <span className={estilos.pista} aria-hidden="true">
                                            <span style={{ width: `${String(c.porcentaje)}%` }} />
                                        </span>
                                    </li>
                                ))}
                                {restantes > 0 && (
                                    <li className={estilos.vacio}>
                                        y {restantes} {restantes === 1 ? 'categoría' : 'categorías'} más
                                    </li>
                                )}
                            </ul>
                        )}
                    </Contenido>
                </Panel>
            </div>

            <div className={estilos.fila}>
                <Panel titulo="Pedidos recientes" enlace={{ a: '/panel/pedidos', texto: 'Ver todos los pedidos' }}>
                    <Contenido
                        consulta={d.recientes}
                        alto="16rem"
                        vacio={(filas) =>
                            filas.length === 0 ? <p className={estilos.vacio}>Aún no hay pedidos.</p> : null
                        }
                    >
                        {(filas) => (
                            <ul className={estilos.lista}>
                                {filas.map((p) => (
                                    <li key={p.idPedido} className={estilos.pedido}>
                                        <Link to={`/panel/pedidos?pedido=${String(p.idPedido)}`} className="numero">
                                            {p.numeroPedido}
                                        </Link>
                                        <span className={estilos.pedidoCliente}>
                                            {p.nombreContacto}
                                            <small>{fechaHora(p.fechaPedido)}</small>
                                        </span>
                                        <EstadoPedido codigo={p.codigoEstado} />
                                        <strong className="numero">{moneda(p.total)}</strong>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Contenido>
                </Panel>
                <Panel titulo="Existencia baja" enlace={{ a: '/panel/inventario?estado=baja', texto: 'Inventario' }}>
                    <Contenido
                        consulta={d.existenciaBaja}
                        alto="16rem"
                        vacio={({ data }) =>
                            data.length === 0 ? <p className={estilos.vacio}>Todo con existencia suficiente.</p> : null
                        }
                    >
                        {({ data }) => (
                            <ul className={estilos.lista}>
                                {data.map((v) => (
                                    <li key={v.idVariante} className={estilos.variante}>
                                        <span>
                                            <strong>{v.producto}</strong>
                                            <small className="numero">
                                                {v.sku} · {v.descripcion}
                                            </small>
                                        </span>
                                        <span className={estilos.unidades}>
                                            <TriangleAlert size={14} aria-hidden="true" /> {v.disponible} u
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Contenido>
                </Panel>
            </div>

            <div className={estilos.fila}>
                <Panel titulo="Productos más vendidos" detalle="Unidades netas del periodo">
                    <Contenido
                        consulta={d.topProductos}
                        alto="16rem"
                        vacio={(filas) =>
                            filas.length === 0 ? <p className={estilos.vacio}>Sin ventas en el periodo.</p> : null
                        }
                    >
                        {(filas) => (
                            <ol className={estilos.lista}>
                                {filas.map((t) => (
                                    <li key={t.idProducto} className={estilos.top}>
                                        <span className={`numero ${estilos.posicion}`}>{t.posicion}</span>
                                        <span>
                                            <strong>{t.producto}</strong>
                                            <small>{t.categoria}</small>
                                        </span>
                                        <span className="numero">{t.unidades} u</span>
                                        <strong className="numero">{moneda(t.ventaNeta)}</strong>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </Contenido>
                </Panel>
                <Panel
                    titulo="Carritos abandonados"
                    detalle={
                        d.resumenPeriodo.data &&
                        `${String(d.resumenPeriodo.data.carritosAbandonados)} · ${moneda(d.resumenPeriodo.data.valorCarritosAbandonados)}`
                    }
                >
                    <Contenido
                        consulta={d.carritos}
                        alto="16rem"
                        vacio={({ data }) =>
                            data.length === 0 ? <p className={estilos.vacio}>Ninguno por ahora.</p> : null
                        }
                    >
                        {({ data }) => (
                            <ul className={estilos.lista}>
                                {data.map((c) => (
                                    <li key={c.idCarrito} className={estilos.variante}>
                                        <span>
                                            <strong>{c.cliente ?? 'Invitado'}</strong>
                                            <small>
                                                {c.articulos} {c.articulos === 1 ? 'artículo' : 'artículos'} · sin
                                                actividad desde {fechaHora(c.fechaUltimaActividad)}
                                            </small>
                                        </span>
                                        <strong className="numero">{moneda(c.valor)}</strong>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Contenido>
                </Panel>
            </div>
        </section>
    );
}
