import { History, UserSearch } from 'lucide-react';
import { Boton } from '../../../ui/Boton';
import { fechaHora } from '../../../utils/formato';
import { AccionBitacora } from './AccionBitacora';
import { camposCambiados } from './detalleCambio';
import { etiquetaModulo, type RegistroBitacora } from './hooks/useBitacora';
import { textoRegistro, textoAutor } from './textos';
import estilos from './bitacora.module.scss';

/** El cambio completo: quién, cuándo y cada campo antes y después. */
export function DetalleRegistro({
    registro,
    alVerAutor,
    alVerRegistro,
}: {
    registro: RegistroBitacora;
    alVerAutor: () => void;
    alVerRegistro: () => void;
}) {
    const campos = camposCambiados(registro.valorAnterior, registro.valorNuevo);
    const esCreacion = registro.valorAnterior === null;

    return (
        <div className={estilos.detalle}>
            <dl className={estilos.datos}>
                <div>
                    <dt>Fecha</dt>
                    <dd>{fechaHora(registro.fecha)}</dd>
                </div>
                <div>
                    <dt>Usuario</dt>
                    <dd>
                        {textoAutor(registro)}
                        <small>{registro.correo}</small>
                    </dd>
                </div>
                <div>
                    <dt>Módulo</dt>
                    <dd>{etiquetaModulo(registro.modulo)}</dd>
                </div>
                <div>
                    <dt>Acción</dt>
                    <dd>
                        <AccionBitacora accion={registro.accion} />
                    </dd>
                </div>
                <div>
                    <dt>Registro</dt>
                    <dd>{textoRegistro(registro)}</dd>
                </div>
            </dl>

            <h3 className={estilos.subtitulo}>{esCreacion ? 'Datos al crearse' : 'Cambios'}</h3>
            {campos.length === 0 ? (
                <p className={estilos.ayuda}>Se guardó sin cambios en los datos.</p>
            ) : (
                <div className="table-responsive">
                    <table className={`table ${estilos.cambios}`}>
                        <thead>
                            <tr>
                                <th scope="col">Campo</th>
                                {!esCreacion && <th scope="col">Antes</th>}
                                <th scope="col">{esCreacion ? 'Valor' : 'Después'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {campos.map((c) => (
                                <tr key={c.campo}>
                                    <th scope="row">{c.etiqueta}</th>
                                    {!esCreacion && <td>{c.anterior ?? '—'}</td>}
                                    <td>{c.nuevo ?? '(quitado)'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className={estilos.enlaces}>
                <Boton variante="secundario" icono={UserSearch} anchoCompleto onClick={alVerAutor}>
                    Ver todo lo de este usuario
                </Boton>
                <Boton variante="secundario" icono={History} anchoCompleto onClick={alVerRegistro}>
                    Ver el historial de este registro
                </Boton>
            </div>
        </div>
    );
}
