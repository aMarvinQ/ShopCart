import { Check, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Boton } from '../../../ui/Boton';
import { Campo } from '../../../ui/Campo';
import { Casilla } from '../../../ui/Controles';
import type { ValorAtributo } from './hooks/useAtributosPanel';
import estilos from './catalogo.module.scss';

const COLOR_INICIAL = '#3d5a80';

export function Muestra({ color }: { color: string | null }) {
    if (!color) return null;
    return <span className={estilos.muestra} style={{ backgroundColor: color }} aria-hidden="true" />;
}

/** Texto y color de un valor, para agregarlo o editarlo. Puede ir dentro de otro formulario: no lo envía. */
export function DatosValor({
    inicial,
    textoBoton,
    ocupado,
    enfocar = false,
    conColorInicial = false,
    alGuardar,
    alCancelar,
}: {
    inicial?: ValorAtributo;
    textoBoton: string;
    ocupado: boolean;
    enfocar?: boolean;
    conColorInicial?: boolean;
    alGuardar: (texto: string, color: string | null) => Promise<unknown>;
    alCancelar?: () => void;
}) {
    const [texto, setTexto] = useState(inicial?.valor ?? '');
    const [conColor, setConColor] = useState(inicial ? Boolean(inicial.codigoHex) : conColorInicial);
    const [color, setColor] = useState(inicial?.codigoHex ?? COLOR_INICIAL);
    const [error, setError] = useState<string | undefined>();
    const campo = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (enfocar) campo.current?.focus();
    }, [enfocar]);

    const guardar = () => {
        const limpio = texto.trim();
        if (!limpio) {
            setError('Escribe el valor.');
            return;
        }
        setError(undefined);
        alGuardar(limpio, conColor ? color : null).then(
            () => {
                if (!inicial) {
                    setTexto('');
                    setConColor(conColorInicial);
                }
                alCancelar?.();
            },
            (fallo: unknown) => {
                setError(fallo instanceof Error ? fallo.message : 'No se pudo guardar el valor.');
            },
        );
    };

    return (
        <div className={estilos.datosValor}>
            <Campo
                ref={campo}
                etiqueta="Valor"
                maxLength={50}
                value={texto}
                error={error}
                onChange={({ target }) => {
                    setTexto(target.value);
                }}
                onKeyDown={(evento) => {
                    if (evento.key === 'Enter') {
                        evento.preventDefault();
                        guardar();
                    }
                }}
            />
            <div className={estilos.color}>
                <Casilla
                    etiqueta="Con color"
                    checked={conColor}
                    onChange={({ target }) => {
                        setConColor(target.checked);
                    }}
                />
                {conColor && (
                    <input
                        type="color"
                        aria-label="Color del valor"
                        className="form-control form-control-color"
                        value={color}
                        onChange={({ target }) => {
                            setColor(target.value);
                        }}
                    />
                )}
            </div>
            <div className={estilos.datosValorBotones}>
                <Boton
                    variante="secundario"
                    tamano="sm"
                    icono={inicial ? Check : Plus}
                    cargando={ocupado}
                    onClick={guardar}
                >
                    {textoBoton}
                </Boton>
                {alCancelar && (
                    <Boton variante="fantasma" tamano="sm" icono={X} onClick={alCancelar}>
                        Cancelar
                    </Boton>
                )}
            </div>
        </div>
    );
}
