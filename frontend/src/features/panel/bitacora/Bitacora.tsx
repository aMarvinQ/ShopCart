import type { ColumnDef } from '@tanstack/react-table';
import { Download, Eye, ScrollText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { esErrorApi } from '../../../api/errores';
import { Boton } from '../../../ui/Boton';
import { Chip } from '../../../ui/Controles';
import { Cajon, EstadoError, EstadoVacio } from '../../../ui/Mensajes';
import { Selector } from '../../../ui/Selector';
import { SelectorFechas } from '../../../ui/SelectorFechas';
import { TablaDatos } from '../../../ui/TablaDatos';
import { fechaHora } from '../../../utils/formato';
import { AccionBitacora } from './AccionBitacora';
import { DetalleRegistro } from './DetalleRegistro';
import { resumenCambio } from './detalleCambio';
import {
    etiquetaModulo,
    OPCIONES_ACCION,
    OPCIONES_MODULO,
    ORDENES_MOVIL,
    useBitacora,
    type RegistroBitacora,
} from './hooks/useBitacora';
import { useExportarBitacora } from './hooks/useExportarBitacora';
import { textoAutor, textoRegistro } from './textos';
import estilos from './bitacora.module.scss';

const resumen = (r: RegistroBitacora) => resumenCambio(r.valorAnterior, r.valorNuevo);

export default function Bitacora() {
    const lista = useBitacora();
    const { consulta } = lista;
    const { exportar, exportando } = useExportarBitacora();
    const [abierto, setAbierto] = useState<RegistroBitacora | null>(null);

    const columnas = useMemo<ColumnDef<RegistroBitacora>[]>(
        () => [
            {
                id: 'fecha',
                header: 'Fecha y hora',
                meta: { ordenarPor: 'FECHA' },
                cell: ({ row }) => <span className="text-nowrap">{fechaHora(row.original.fecha)}</span>,
            },
            { id: 'usuario', header: 'Usuario', cell: ({ row }) => textoAutor(row.original) },
            {
                id: 'accion',
                header: 'Acción',
                meta: { ordenarPor: 'ACCION' },
                cell: ({ row }) => (
                    <span className={estilos.accion}>
                        <AccionBitacora accion={row.original.accion} />
                        <small>{etiquetaModulo(row.original.modulo)}</small>
                    </span>
                ),
            },
            {
                id: 'registro',
                header: 'Registro',
                cell: ({ row }) => <strong className={estilos.registro}>{textoRegistro(row.original)}</strong>,
            },
            { id: 'detalle', header: 'Detalle', cell: ({ row }) => resumen(row.original) },
            {
                id: 'ver',
                header: () => <span className="visually-hidden">Ver</span>,
                meta: { derecha: true },
                cell: ({ row }) => (
                    <Boton
                        variante="fantasma"
                        icono={Eye}
                        aria-label={`Ver el cambio completo de ${textoRegistro(row.original)}`}
                        onClick={() => {
                            setAbierto(row.original);
                        }}
                    />
                ),
            },
        ],
        [],
    );

    /* Filtrar desde el detalle lo cierra: lo siguiente es ver la lista filtrada. */
    const filtrarDesdeDetalle = (filtrar: (r: RegistroBitacora) => void) => () => {
        if (abierto) filtrar(abierto);
        setAbierto(null);
    };

    return (
        <section className={estilos.pagina}>
            <title>Bitácora · ShopCart</title>
            <h1 className={estilos.titulo}>Bitácora</h1>
            <TablaDatos
                etiqueta="Bitácora"
                columnas={columnas}
                filas={consulta.data?.data}
                idFila={(r) => String(r.idBitacora)}
                cargando={consulta.isPending}
                actualizando={consulta.isPlaceholderData}
                error={
                    consulta.isError ? (
                        <EstadoError
                            titulo="No pudimos cargar la bitácora"
                            mensaje={consulta.error.message}
                            referencia={esErrorApi(consulta.error) ? consulta.error.requestId : undefined}
                            alReintentar={() => void consulta.refetch()}
                        />
                    ) : undefined
                }
                vacio={
                    <EstadoVacio
                        icono={ScrollText}
                        titulo={lista.hayFiltros ? 'Sin movimientos con estos filtros' : 'Aún no hay movimientos'}
                        accion={
                            lista.hayFiltros ? (
                                <Boton variante="secundario" tamano="sm" onClick={lista.limpiarFiltros}>
                                    Limpiar filtros
                                </Boton>
                            ) : undefined
                        }
                    />
                }
                orden={lista.orden}
                alOrdenar={lista.ordenar}
                pagina={lista.pagina}
                tamanoPagina={lista.tamanoPagina}
                totalRegistros={consulta.data?.meta.totalRegistros ?? 0}
                unidad="eventos"
                alCambiarPagina={lista.irAPagina}
                ordenesMovil={ORDENES_MOVIL}
                alElegirOrdenMovil={({ ordenarPor, direccion }) => {
                    lista.fijarOrden(ordenarPor, direccion);
                }}
                tarjeta={(r) => (
                    <button
                        type="button"
                        className={estilos.tarjeta}
                        aria-label={`Ver el cambio completo de ${textoRegistro(r)}`}
                        onClick={() => {
                            setAbierto(r);
                        }}
                    >
                        <span className={estilos.tarjetaCabecera}>
                            <AccionBitacora accion={r.accion} />
                            <small className="numero">{fechaHora(r.fecha)}</small>
                        </span>
                        <strong>{textoRegistro(r)}</strong>
                        <span className={estilos.resumen}>{resumen(r)}</span>
                        <small className={estilos.ayuda}>
                            {textoAutor(r)} · {etiquetaModulo(r.modulo)}
                        </small>
                    </button>
                )}
                filtros={
                    <div className={estilos.filtros}>
                        <div className={estilos.selector}>
                            <Selector
                                etiqueta="Módulo"
                                compacto
                                valor={lista.modulo}
                                opciones={OPCIONES_MODULO}
                                alCambiar={(valor) => {
                                    lista.filtrar('modulo', valor);
                                }}
                            />
                        </div>
                        <div className={estilos.selector}>
                            <Selector
                                etiqueta="Acción"
                                compacto
                                valor={lista.accion}
                                opciones={OPCIONES_ACCION}
                                alCambiar={(valor) => {
                                    lista.filtrar('accion', valor);
                                }}
                            />
                        </div>
                        <SelectorFechas desde={lista.desde} hasta={lista.hasta} alCambiar={lista.elegirFechas} />
                        {lista.rango && <Chip etiqueta={lista.rango} alQuitar={lista.quitarFechas} />}
                        {lista.autorFiltrado && <Chip etiqueta={lista.autorFiltrado} alQuitar={lista.quitarAutor} />}
                        {lista.registroFiltrado && (
                            <Chip etiqueta={lista.registroFiltrado} alQuitar={lista.quitarRegistro} />
                        )}
                    </div>
                }
                acciones={
                    <Boton
                        variante="secundario"
                        icono={Download}
                        cargando={exportando}
                        onClick={() => {
                            exportar(lista.filtrosApi);
                        }}
                    >
                        Exportar
                    </Boton>
                }
            />
            <p className={estilos.ayuda}>
                Cada cambio queda aquí y nadie puede modificarlo ni borrarlo. Exportar descarga un Excel con los filtros
                activos (hasta 10,000 eventos).
            </p>
            <Cajon
                mostrar={abierto !== null}
                titulo="Detalle del cambio"
                alCerrar={() => {
                    setAbierto(null);
                }}
            >
                {abierto && (
                    <DetalleRegistro
                        registro={abierto}
                        alVerAutor={filtrarDesdeDetalle(lista.verAutor)}
                        alVerRegistro={filtrarDesdeDetalle(lista.verRegistro)}
                    />
                )}
            </Cajon>
        </section>
    );
}
