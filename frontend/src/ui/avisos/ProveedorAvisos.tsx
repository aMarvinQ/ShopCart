import { X } from 'lucide-react';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Toast } from 'react-bootstrap';
import { Boton } from '../Boton';
import { ICONO_MENSAJE } from '../iconosMensaje';
import estilos from './ProveedorAvisos.module.scss';
import { ContextoAvisos, type DatosAviso } from './contexto';

/* Avisos breves, sin bloquear la pantalla. Como máximo 4 a la vez: la lista no crece sin límite. */
const MAXIMO = 4;
const DURACION_MS = 4_000;

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
            <div className={estilos.contenedor}>
                {avisos.map(({ id, tipo, titulo, detalle, accion }) => {
                    const Icono = ICONO_MENSAJE[tipo];
                    const cerrar = () => {
                        quitar(id);
                    };
                    return (
                        <Toast
                            key={id}
                            bsPrefix={estilos.tarjeta ?? ''}
                            autohide
                            delay={DURACION_MS}
                            onClose={cerrar}
                            role={tipo === 'error' ? 'alert' : 'status'}
                        >
                            <Icono size={20} className={estilos[tipo]} aria-hidden="true" />
                            <div className={estilos.texto}>
                                <p className={estilos.titulo}>{titulo}</p>
                                {detalle && <p className={estilos.detalle}>{detalle}</p>}
                                {accion && (
                                    <Boton
                                        variante="enlace"
                                        tamano="sm"
                                        onClick={() => {
                                            cerrar();
                                            accion.alElegir();
                                        }}
                                    >
                                        {accion.etiqueta}
                                    </Boton>
                                )}
                            </div>
                            <Boton
                                variante="fantasma"
                                tamano="sm"
                                icono={X}
                                aria-label="Cerrar aviso"
                                onClick={cerrar}
                            />
                        </Toast>
                    );
                })}
            </div>
        </ContextoAvisos>
    );
}
