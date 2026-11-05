import { FormProvider } from 'react-hook-form';
import { Boton } from '../../ui/Boton';
import { Campo } from '../../ui/Campo';
import { Casilla } from '../../ui/Controles';
import { Alerta } from '../../ui/Mensajes';
import type { Direccion } from './datosDireccion';
import { CamposDestinatario, CamposUbicacion } from './CamposDireccion';
import { useFormularioDireccion } from './hooks/useDirecciones';
import estilos from './cuenta.module.scss';

/** Crear o editar una dirección de la libreta. `alGuardar` recibe el id si es nueva. */
export function FormularioDireccion({
    direccion,
    alGuardar,
}: {
    direccion: Direccion | null;
    alGuardar: (idNueva?: number) => void;
}) {
    const { formulario, errorGeneral, guardando, enviar } = useFormularioDireccion(direccion, alGuardar);
    const {
        register,
        formState: { errors },
    } = formulario;

    return (
        <FormProvider {...formulario}>
            <form className={estilos.formulario} noValidate onSubmit={(e) => void enviar(e)}>
                {errorGeneral && (
                    <div className={estilos.mensajes}>
                        <Alerta tipo="error">{errorGeneral}</Alerta>
                    </div>
                )}
                <Campo
                    etiqueta="Nombre de la dirección"
                    placeholder="Casa"
                    error={errors.alias?.message}
                    {...register('alias')}
                />
                <CamposDestinatario />
                <CamposUbicacion />
                {!direccion && <Casilla etiqueta="Usar como predeterminada" {...register('esPredeterminada')} />}
                <Boton type="submit" anchoCompleto cargando={guardando}>
                    Guardar dirección
                </Boton>
            </form>
        </FormProvider>
    );
}
