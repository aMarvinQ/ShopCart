import { useFormContext } from 'react-hook-form';
import { Campo } from '../../ui/Campo';
import { Selector } from '../../ui/Selector';
import type { DatosCamposDireccion } from './datosDireccion';
import { useCamposUbicacion } from './hooks/useCamposUbicacion';

/* Se usan dentro de un FormProvider cuyos datos incluyen los campos de dirección. */
export function CamposDestinatario() {
    const {
        register,
        formState: { errors },
    } = useFormContext<DatosCamposDireccion>();
    return (
        <>
            <Campo
                etiqueta="Quién recibe"
                autoComplete="name"
                error={errors.nombreDestinatario?.message}
                {...register('nombreDestinatario')}
            />
            <Campo
                etiqueta="Teléfono"
                type="tel"
                autoComplete="tel"
                error={errors.telefono?.message}
                {...register('telefono')}
            />
        </>
    );
}

export function CamposUbicacion() {
    const {
        register,
        formState: { errors },
    } = useFormContext<DatosCamposDireccion>();
    const { departamento, municipio } = useCamposUbicacion();
    return (
        <>
            <Campo
                etiqueta="Dirección"
                autoComplete="address-line1"
                error={errors.linea1?.message}
                {...register('linea1')}
            />
            <Campo
                etiqueta="Complemento (opcional)"
                autoComplete="address-line2"
                error={errors.linea2?.message}
                {...register('linea2')}
            />
            <div className="row gx-3">
                <div className="col-sm-6">
                    <Selector
                        etiqueta="Departamento"
                        valor={departamento.valor}
                        error={errors.idDepartamento?.message}
                        opciones={departamento.opciones}
                        alCambiar={departamento.alCambiar}
                        onBlur={departamento.onBlur}
                    />
                </div>
                <div className="col-sm-6">
                    <Selector
                        etiqueta="Municipio"
                        valor={municipio.valor}
                        error={errors.idMunicipio?.message}
                        disabled={departamento.valor === ''}
                        opciones={municipio.opciones}
                        alCambiar={municipio.alCambiar}
                        onBlur={municipio.onBlur}
                    />
                </div>
            </div>
            <Campo
                etiqueta="Código postal (opcional)"
                inputMode="numeric"
                autoComplete="postal-code"
                error={errors.codigoPostal?.message}
                {...register('codigoPostal')}
            />
            <Campo etiqueta="Referencias (opcional)" error={errors.referencias?.message} {...register('referencias')} />
        </>
    );
}
