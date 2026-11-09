import { CircleCheck, Clock } from 'lucide-react';
import { useId } from 'react';
import { Boton } from '../../../ui/Boton';
import { MarcoCampo } from '../../../ui/Campo';
import { fechaHora } from '../../../utils/formato';
import { numero, textoRango, useParametro } from './hooks/useParametro';
import type { Parametro } from './hooks/useParametros';
import type { Grupo } from './presentacion';
import estilos from './parametros.module.scss';

const valorLegible = (parametro: Parametro, unidad?: string) =>
    parametro.tipoDato === 'TEXTO'
        ? parametro.valor
        : `${numero(Number(parametro.valor))}${unidad ? ` ${unidad}` : ''}`;

export function TarjetaParametro({
    parametro,
    titulo,
    grupo,
    unidad,
    nota,
}: {
    parametro: Parametro;
    titulo: string;
    grupo: Grupo;
    unidad?: string | undefined;
    nota?: string | undefined;
}) {
    const id = useId();
    const edicion = useParametro(parametro, unidad);
    const rango = textoRango(parametro, unidad);
    const marca = edicion.error ? estilos.conError : edicion.pendiente ? estilos.pendiente : '';

    return (
        <article className={`${estilos.tarjeta} ${marca}`}>
            <div className={estilos.info}>
                <h2 className={estilos.nombre}>
                    {titulo}
                    <span className={estilos.grupo}>{grupo}</span>
                </h2>
                <p className={estilos.descripcion}>{parametro.descripcion}</p>
                {nota && <p className={estilos.descripcion}>{nota}</p>}
                <p className={estilos.meta}>
                    <code>{parametro.clave}</code>
                    {parametro.fechaModificacion && (
                        <span>
                            <Clock size={14} aria-hidden="true" /> Modificado el{' '}
                            {fechaHora(parametro.fechaModificacion)}
                        </span>
                    )}
                </p>
            </div>
            <form
                noValidate
                className={estilos.edicion}
                onSubmit={(evento) => {
                    evento.preventDefault();
                    edicion.enviar();
                }}
            >
                <MarcoCampo
                    id={id}
                    etiqueta="Valor"
                    ayuda={rango ? `Entre ${rango}` : undefined}
                    error={edicion.error ?? undefined}
                >
                    <div className={estilos.fila}>
                        <div className="input-group">
                            <input
                                id={id}
                                className={`form-control ${edicion.error ? 'is-invalid' : ''}`}
                                inputMode={parametro.tipoDato === 'ENTERO' ? 'numeric' : 'decimal'}
                                aria-label={`Valor: ${titulo}`}
                                aria-invalid={Boolean(edicion.error)}
                                aria-describedby={`${id}-pie`}
                                value={edicion.valor}
                                onChange={({ target }) => {
                                    edicion.cambiar(target.value);
                                }}
                            />
                            {unidad && <span className="input-group-text">{unidad}</span>}
                        </div>
                        <Boton type="submit" disabled={!edicion.pendiente} cargando={edicion.guardando}>
                            Guardar
                        </Boton>
                    </div>
                </MarcoCampo>
                {edicion.pendiente && (
                    <p className={estilos.estado}>
                        Valor guardado: <strong>{valorLegible(parametro, unidad)}</strong>
                        <Boton variante="enlace" tamano="sm" onClick={edicion.descartar}>
                            Descartar
                        </Boton>
                    </p>
                )}
                {edicion.guardado && (
                    <p className={`${estilos.estado} ${estilos.guardado}`} role="status">
                        <CircleCheck size={16} aria-hidden="true" /> Guardado hace un momento
                    </p>
                )}
            </form>
        </article>
    );
}
