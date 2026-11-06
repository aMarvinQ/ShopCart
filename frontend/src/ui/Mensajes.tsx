import {
    CircleCheck,
    CircleX,
    CreditCard,
    Package,
    RefreshCw,
    Tag,
    TriangleAlert,
    Truck,
    Undo2,
    X,
    type LucideIcon,
} from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Modal, Offcanvas } from 'react-bootstrap';
import { Boton } from './Boton';
import { ICONO_MENSAJE, type TipoMensaje } from './iconosMensaje';
import estilos from './Mensajes.module.scss';

/** Mensaje dentro de la página. Un error se anuncia de inmediato; lo demás, sin interrumpir. */
export function Alerta({ tipo, titulo, children }: { tipo: TipoMensaje; titulo?: string; children: ReactNode }) {
    const Icono = ICONO_MENSAJE[tipo];
    return (
        <div role={tipo === 'error' ? 'alert' : 'status'} className={`alert ${estilos.alerta} ${estilos[tipo]}`}>
            <Icono size={20} aria-hidden="true" />
            <div>
                {titulo && <strong>{titulo}. </strong>}
                {children}
            </div>
        </div>
    );
}

const ESTADOS_PEDIDO: Partial<Record<string, { etiqueta: string; clase: string | undefined; icono: LucideIcon }>> = {
    PAGADO: { etiqueta: 'Pagado', clase: estilos.pagado, icono: CreditCard },
    EN_PREPARACION: { etiqueta: 'En preparación', clase: estilos.enPreparacion, icono: Package },
    ENVIADO: { etiqueta: 'Enviado', clase: estilos.enviado, icono: Truck },
    ENTREGADO: { etiqueta: 'Entregado', clase: estilos.entregado, icono: CircleCheck },
    CANCELADO: { etiqueta: 'Cancelado', clase: estilos.cancelado, icono: CircleX },
    DEVUELTO_PARCIAL: { etiqueta: 'Devuelto parcial', clase: estilos.devueltoParcial, icono: Undo2 },
    DEVUELTO: { etiqueta: 'Devuelto', clase: estilos.devuelto, icono: Undo2 },
};

const TONOS_INSIGNIA = {
    exito: estilos.entregado,
    aviso: estilos.enPreparacion,
    peligro: estilos.cancelado,
    neutro: estilos.devuelto,
};

/** Etiqueta de estado: color, icono y texto; nunca solo color. */
export function Insignia({
    tono,
    icono: Icono,
    children,
}: {
    tono: keyof typeof TONOS_INSIGNIA;
    icono: LucideIcon;
    children: ReactNode;
}) {
    return (
        <span className={`badge rounded-pill ${estilos.insignia} ${TONOS_INSIGNIA[tono] ?? ''}`}>
            <Icono size={16} aria-hidden="true" />
            {children}
        </span>
    );
}

/** Estado del pedido: color, icono y texto; nunca solo color. Un estado desconocido se muestra neutro. */
export function EstadoPedido({ codigo }: { codigo: string }) {
    const {
        etiqueta,
        clase,
        icono: Icono,
    } = ESTADOS_PEDIDO[codigo] ?? {
        etiqueta: codigo,
        clase: estilos.devuelto,
        icono: Tag,
    };
    return (
        <span className={`badge rounded-pill ${estilos.insignia} ${clase ?? ''}`}>
            <Icono size={16} aria-hidden="true" />
            {etiqueta}
        </span>
    );
}

/** Confirmación: solo para acciones destructivas. */
export function DialogoConfirmacion({
    mostrar,
    titulo,
    children,
    textoConfirmar,
    textoCancelar = 'Volver',
    cargando = false,
    alConfirmar,
    alCancelar,
}: {
    mostrar: boolean;
    titulo: string;
    children: ReactNode;
    textoConfirmar: string;
    textoCancelar?: string;
    cargando?: boolean;
    alConfirmar: () => void;
    alCancelar: () => void;
}) {
    const idTitulo = useId();
    return (
        <Modal
            show={mostrar}
            onHide={alCancelar}
            centered
            backdrop={cargando ? 'static' : true}
            keyboard={!cargando}
            aria-labelledby={idTitulo}
            contentClassName={estilos.dialogo}
        >
            <div className={estilos.dialogoCuerpo}>
                <span className={estilos.dialogoIcono}>
                    <TriangleAlert size={20} aria-hidden="true" />
                </span>
                <div>
                    <h2 id={idTitulo} className={estilos.dialogoTitulo}>
                        {titulo}
                    </h2>
                    <div className={estilos.dialogoTexto}>{children}</div>
                </div>
            </div>
            <div className={estilos.dialogoAcciones}>
                <Boton variante="fantasma" disabled={cargando} onClick={alCancelar}>
                    {textoCancelar}
                </Boton>
                <Boton variante="peligro" cargando={cargando} onClick={alConfirmar}>
                    {textoConfirmar}
                </Boton>
            </div>
        </Modal>
    );
}

/** Detalle sin salir de la lista: 480 px en escritorio, ancho completo en móvil; al cerrar, el foco vuelve a la fila. */
export function Cajon({
    mostrar,
    titulo,
    subtitulo,
    pie,
    alCerrar,
    children,
}: {
    mostrar: boolean;
    titulo: string;
    subtitulo?: string | undefined;
    pie?: ReactNode;
    alCerrar: () => void;
    children: ReactNode;
}) {
    const idTitulo = useId();
    return (
        <Offcanvas
            show={mostrar}
            onHide={alCerrar}
            placement="end"
            aria-labelledby={idTitulo}
            className={estilos.cajon}
        >
            <header className={estilos.cajonCabecera}>
                <div>
                    <h2 id={idTitulo} className={`${estilos.cajonTitulo} numero`}>
                        {titulo}
                    </h2>
                    {subtitulo && <p className={`${estilos.cajonSubtitulo} numero`}>{subtitulo}</p>}
                </div>
                <Boton variante="fantasma" icono={X} aria-label="Cerrar detalle" onClick={alCerrar} />
            </header>
            <div className={estilos.cajonCuerpo}>{children}</div>
            {pie && <footer className={estilos.cajonPie}>{pie}</footer>}
        </Offcanvas>
    );
}

/** Lista o pantalla sin contenido, con la acción que la resuelve. */
export function EstadoVacio({
    icono: Icono,
    titulo,
    mensaje,
    accion,
    nivel = 2,
}: {
    icono: LucideIcon;
    titulo: string;
    mensaje?: string;
    accion?: ReactNode;
    nivel?: 1 | 2;
}) {
    const Titulo = nivel === 1 ? 'h1' : 'h2';
    return (
        <div className={estilos.estado}>
            <Icono size={56} strokeWidth={1.25} className={estilos.estadoIcono} aria-hidden="true" />
            <Titulo className={estilos.estadoTitulo}>{titulo}</Titulo>
            {mensaje && <p className={estilos.estadoMensaje}>{mensaje}</p>}
            {accion}
        </div>
    );
}

/** Error con mensaje claro, acción para reintentar y referencia para soporte. */
export function EstadoError({
    titulo,
    mensaje,
    referencia,
    alReintentar,
}: {
    titulo: string;
    mensaje?: string;
    referencia?: string | undefined;
    alReintentar?: (() => void) | undefined;
}) {
    return (
        <div role="alert" className={estilos.estado}>
            <TriangleAlert size={56} strokeWidth={1.25} className={estilos.estadoIconoError} aria-hidden="true" />
            <h2 className={estilos.estadoTitulo}>{titulo}</h2>
            {mensaje && <p className={estilos.estadoMensaje}>{mensaje}</p>}
            {alReintentar && (
                <Boton variante="secundario" tamano="sm" icono={RefreshCw} onClick={alReintentar}>
                    Reintentar
                </Boton>
            )}
            {referencia && <span className={`${estilos.estadoReferencia} numero`}>Ref.: {referencia}</span>}
        </div>
    );
}
