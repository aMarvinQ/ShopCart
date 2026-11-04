import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Toast, ToastContainer } from 'react-bootstrap';
import { ContextoAvisos, type DatosAviso, type TipoAviso } from './contexto';

/* Avisos breves, sin bloquear la pantalla. Como máximo 4 a la vez: la lista no crece sin límite. */
const MAXIMO = 4;
const DURACION_MS = 4_000;

const ICONOS: Record<TipoAviso, { icono: LucideIcon; clase: string }> = {
    exito: { icono: CircleCheck, clase: 'text-success' },
    error: { icono: CircleAlert, clase: 'text-danger' },
    aviso: { icono: TriangleAlert, clase: 'text-warning' },
    informacion: { icono: Info, clase: 'text-info' },
};

export function ProveedorAvisos({ children }: { children: ReactNode }) {
    const [avisos, setAvisos] = useState<(DatosAviso & { id: number })[]>([]);
    const siguiente = useRef(1);

    const mostrar = useCallback((aviso: DatosAviso) => {
        setAvisos((actuales) => [...actuales.slice(-(MAXIMO - 1)), { ...aviso, id: siguiente.current++ }]);
    }, []);
    const quitar = (id: number) => {
        setAvisos((actuales) => actuales.filter((a) => a.id !== id));
    };

    return (
        <ContextoAvisos value={mostrar}>
            {children}
            <ToastContainer position="bottom-end" containerPosition="fixed" className="p-3" style={{ zIndex: 1090 }}>
                {avisos.map(({ id, tipo, titulo, detalle }) => {
                    const { icono: Icono, clase } = ICONOS[tipo];
                    return (
                        <Toast
                            key={id}
                            autohide
                            delay={DURACION_MS}
                            onClose={() => {
                                quitar(id);
                            }}
                            bg="light"
                        >
                            <Toast.Header>
                                <Icono size={18} className={`me-2 ${clase}`} aria-hidden="true" />
                                <strong className="me-auto">{titulo}</strong>
                            </Toast.Header>
                            {detalle && <Toast.Body>{detalle}</Toast.Body>}
                        </Toast>
                    );
                })}
            </ToastContainer>
        </ContextoAvisos>
    );
}
