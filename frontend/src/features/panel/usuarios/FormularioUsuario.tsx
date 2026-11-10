import { Boton } from '../../../ui/Boton';
import { Campo, CampoContrasena } from '../../../ui/Campo';
import { Alerta } from '../../../ui/Mensajes';
import { AYUDA_CONTRASENA } from '../../cuenta/esquemas';
import { ROLES_INTERNOS, useFormularioUsuario } from './hooks/useFormularioUsuario';
import type { FilaUsuario } from './hooks/useUsuariosPanel';
import estilos from './usuarios.module.scss';

/** Alta de un usuario del panel o, con `usuario`, edición: el correo se ve pero no cambia, y sin contraseña. */
export function FormularioUsuario({
    usuario = null,
    alTerminar,
}: {
    usuario?: FilaUsuario | null;
    alTerminar: () => void;
}) {
    const { formulario, editando, errorGeneral, guardando, enviar } = useFormularioUsuario(usuario, alTerminar);
    const {
        register,
        formState: { errors, isDirty },
    } = formulario;

    return (
        <form noValidate className={estilos.formulario} onSubmit={(e) => void enviar(e)}>
            {errorGeneral && <Alerta tipo="error">{errorGeneral}</Alerta>}
            <div className={estilos.dosCampos}>
                <Campo
                    etiqueta="Nombre"
                    autoComplete="off"
                    maxLength={100}
                    error={errors.nombre?.message}
                    {...register('nombre')}
                />
                <Campo
                    etiqueta="Apellido"
                    autoComplete="off"
                    maxLength={100}
                    error={errors.apellido?.message}
                    {...register('apellido')}
                />
            </div>
            <Campo
                etiqueta="Correo de trabajo"
                type="email"
                autoComplete="off"
                readOnly={editando}
                ayuda={
                    editando ? 'El correo no se cambia: identifica la cuenta.' : 'Con este correo ingresará al panel.'
                }
                error={errors.correo?.message}
                {...register('correo')}
            />
            <Campo
                etiqueta="Teléfono (opcional)"
                type="tel"
                autoComplete="off"
                maxLength={20}
                error={errors.telefono?.message}
                {...register('telefono')}
            />
            {!editando && (
                <CampoContrasena
                    etiqueta="Contraseña inicial"
                    autoComplete="new-password"
                    ayuda={`${AYUDA_CONTRASENA} Compártela por un medio seguro.`}
                    error={errors.contrasena?.message}
                    {...register('contrasena')}
                />
            )}
            <fieldset className={estilos.roles} aria-describedby={editando ? 'aviso-rol' : undefined}>
                <legend>Rol</legend>
                {ROLES_INTERNOS.map(({ valor, etiqueta, alcance }) => (
                    <label key={valor} className={estilos.opcionRol}>
                        <input type="radio" value={valor} className="form-check-input" {...register('rol')} />
                        <span>
                            <strong>{etiqueta}</strong>
                            <small>{alcance}</small>
                        </span>
                    </label>
                ))}
                {editando && (
                    <small id="aviso-rol" className={estilos.detalle}>
                        Si cambias el rol se cerrarán sus sesiones abiertas: al volver a ingresar tendrá el nuevo.
                    </small>
                )}
            </fieldset>
            <Boton type="submit" anchoCompleto cargando={guardando} disabled={editando && !isDirty}>
                {editando ? 'Guardar cambios' : 'Crear usuario'}
            </Boton>
        </form>
    );
}
