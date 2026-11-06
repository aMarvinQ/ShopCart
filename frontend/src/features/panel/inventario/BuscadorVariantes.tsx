import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { BotonAdorno, CampoBusqueda } from '../../../ui/Campo';
import { ListaOpciones } from '../../../ui/Selector';
import type { FilaExistencia } from './hooks/useExistencias';
import { useBuscarVariantes } from './hooks/useMovimiento';
import estilos from './inventario.module.scss';

const ESPERA_MS = 300;

/**
 * Busca variantes por SKU o nombre y las muestra en el desplegable del sistema. La lista se cierra con
 * la X, Escape o al salir del campo, y conserva lo escrito: al volver al campo se abre de nuevo.
 * Con `yaElegidas` se eligen varias: la lista sigue abierta y una elegida se quita con otro clic.
 * Sin él se elige una sola: la lista se cierra y el campo se limpia.
 */
export function BuscadorVariantes({
    alElegir,
    yaElegidas,
    alQuitar,
}: {
    alElegir: (fila: FilaExistencia) => void;
    yaElegidas?: ReadonlySet<number>;
    alQuitar?: (idVariante: number) => void;
}) {
    const id = useId();
    const [texto, setTexto] = useState('');
    const [busqueda, setBusqueda] = useState('');
    const [abierto, setAbierto] = useState(false);
    const [activa, setActiva] = useState(0);
    const espera = useRef<ReturnType<typeof setTimeout>>(undefined);
    const lista = useRef<HTMLUListElement>(null);

    const consulta = useBuscarVariantes(busqueda);
    const resultados = consulta.data?.data ?? [];
    const indiceActivo = Math.min(activa, Math.max(resultados.length - 1, 0));
    const hayLista = abierto && resultados.length > 0;

    useEffect(
        () => () => {
            clearTimeout(espera.current);
        },
        [],
    );

    useEffect(() => {
        if (hayLista) lista.current?.children[indiceActivo]?.scrollIntoView({ block: 'nearest' });
    }, [hayLista, indiceActivo]);

    const escribir = (valor: string) => {
        setTexto(valor);
        setAbierto(true);
        setActiva(0);
        clearTimeout(espera.current);
        espera.current = setTimeout(() => {
            setBusqueda(valor.trim());
        }, ESPERA_MS);
    };

    const elegir = (fila: FilaExistencia) => {
        if (yaElegidas?.has(fila.idVariante)) {
            alQuitar?.(fila.idVariante);
            return;
        }
        alElegir(fila);
        if (!yaElegidas) {
            setTexto('');
            setBusqueda('');
            setAbierto(false);
        }
    };

    const alTeclear = (evento: KeyboardEvent<HTMLInputElement>) => {
        const fila = resultados[indiceActivo];
        if (evento.key === 'Enter') {
            // Enter nunca envía el formulario que contiene al buscador.
            evento.preventDefault();
            if (hayLista && fila) elegir(fila);
        } else if (evento.key === 'Escape') {
            setAbierto(false);
        } else if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
            evento.preventDefault();
            if (!hayLista) setAbierto(true);
            else
                setActiva(
                    evento.key === 'ArrowDown'
                        ? Math.min(indiceActivo + 1, resultados.length - 1)
                        : Math.max(indiceActivo - 1, 0),
                );
        }
    };

    return (
        <div className={estilos.buscadorVariantes}>
            <CampoBusqueda
                id={`${id}-campo`}
                etiqueta="Buscar por SKU o producto"
                compacto
                placeholder="Buscar por SKU o producto"
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={hayLista}
                aria-controls={`${id}-lista`}
                aria-activedescendant={hayLista ? `${id}-lista-opcion-${String(indiceActivo)}` : undefined}
                value={texto}
                onChange={({ target }) => {
                    escribir(target.value);
                }}
                onKeyDown={alTeclear}
                onClick={() => {
                    setAbierto(true);
                }}
                onBlur={() => {
                    setAbierto(false);
                }}
                adornoFin={
                    abierto && texto !== '' ? (
                        <BotonAdorno
                            icono={X}
                            etiqueta="Cerrar opciones"
                            onClick={() => {
                                setAbierto(false);
                            }}
                        />
                    ) : undefined
                }
            />
            <ListaOpciones
                ref={lista}
                id={`${id}-lista`}
                etiquetadaPor={`${id}-campo-etiqueta`}
                oculta={!hayLista}
                opciones={resultados.map((f) => ({
                    valor: String(f.idVariante),
                    etiqueta: f.producto,
                    detalle: `${f.sku}${f.descripcion ? ` · ${f.descripcion}` : ''} · disponible ${String(f.disponible)}`,
                }))}
                esElegida={({ valor }) => yaElegidas?.has(Number(valor)) ?? false}
                activa={indiceActivo}
                alPasar={setActiva}
                alElegir={(_, indice) => {
                    const fila = resultados[indice];
                    if (fila) elegir(fila);
                }}
            />
            {abierto && busqueda !== '' && consulta.isSuccess && resultados.length === 0 && (
                <p className={estilos.sinResultados}>Ninguna variante coincide.</p>
            )}
        </div>
    );
}
