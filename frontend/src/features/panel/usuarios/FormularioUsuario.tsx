import { Boton } from '../../../ui/Boton';
import { Campo, CampoContrasena } from '../../../ui/Campo';
import { Alerta } from '../../../ui/Mensajes';
import { AYUDA_CONTRASENA } from '../../cuenta/esquemas';
import { ROLES_INTERNOS, useCrearUsuario } from './hooks/useCrearUsuario';
import estilos from './usuarios.module.scss';

export function FormularioUsuario({ alTerminar }: { alTerminar: () => void }) {
    const { formulario, errorGeneral, creando, enviar } = useCrearUsuario(alTerminar);
    const {
        register,
        formState: { errors },
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
                ayuda="Con este correo ingresará al panel."
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
            <CampoContrasena
                etiqueta="Contraseña inicial"
                autoComplete="new-password"
                ayuda={`${AYUDA_CONTRASENA} Compártela por un medio seguro.`}
                error={errors.contrasena?.message}
                {...register('contrasena')}
            />
            <fieldset className={estilos.roles}>
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
            </fieldset>
            <Boton type="submit" anchoCompleto cargando={creando}>
                Crear usuario
            </Boton>
        </form>
    );
}
