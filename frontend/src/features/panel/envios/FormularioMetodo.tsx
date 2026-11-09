import { esErrorApi } from '../../../api/errores';
import { Boton } from '../../../ui/Boton';
import { Campo } from '../../../ui/Campo';
import { Casilla, Interruptor } from '../../../ui/Controles';
import { Esqueleto } from '../../../ui/Esqueleto';
import { Alerta, EstadoError } from '../../../ui/Mensajes';
import { useFormularioMetodo } from './hooks/useFormularioMetodo';
import estilos from './envios.module.scss';

export function FormularioMetodo({ id, alTerminar }: { id: number | null; alTerminar: () => void }) {
    const edicion = useFormularioMetodo(id, alTerminar);
    const { metodo, detalle } = edicion;
    const {
        register,
        watch,
        setValue,
        formState: { errors },
    } = edicion.formulario;

    if (id !== null && detalle.isPending) {
        return (
            <div role="status" aria-label="Cargando método de envío">
                <Esqueleto alto="22rem" radio="12px" />
            </div>
        );
    }
    if (id !== null && detalle.isError) {
        return (
            <EstadoError
                titulo="No pudimos cargar el método de envío"
                mensaje={detalle.error.message}
                referencia={esErrorApi(detalle.error) ? detalle.error.requestId : undefined}
                alReintentar={() => void detalle.refetch()}
            />
        );
    }

    const gratis = watch('gratis');
    return (
        <form noValidate className={estilos.formulario} onSubmit={(e) => void edicion.enviar(e)}>
            {edicion.errorGeneral && <Alerta tipo="error">{edicion.errorGeneral}</Alerta>}
            {metodo?.pedidos !== undefined && (
                <p className={estilos.resumen}>
                    Usado en {metodo.pedidos.toLocaleString('en-US')} {metodo.pedidos === 1 ? 'pedido' : 'pedidos'}. Un
                    costo nuevo solo aplica a compras nuevas.
                </p>
            )}
            <Campo etiqueta="Nombre" maxLength={100} error={errors.nombre?.message} {...register('nombre')} />
            <Campo
                etiqueta="Descripción para el cliente"
                maxLength={300}
                ayuda="Opcional. Se muestra al elegir el envío."
                error={errors.descripcion?.message}
                {...register('descripcion')}
            />
            <div>
                <Campo
                    etiqueta="Costo (Q)"
                    inputMode="decimal"
                    disabled={gratis}
                    error={errors.costo?.message}
                    {...register('costo')}
                />
                <Casilla
                    etiqueta="Gratis"
                    {...register('gratis', {
                        onChange: (evento: { target: HTMLInputElement }) => {
                            if (evento.target.checked) setValue('costo', '0.00', { shouldValidate: true });
                        },
                    })}
                />
            </div>
            <div className={estilos.dosCampos}>
                <Campo
                    etiqueta="Días estimados, mínimo"
                    inputMode="numeric"
                    maxLength={3}
                    error={errors.diasEstimadosMin?.message}
                    {...register('diasEstimadosMin')}
                />
                <Campo
                    etiqueta="Días estimados, máximo"
                    inputMode="numeric"
                    maxLength={3}
                    error={errors.diasEstimadosMax?.message}
                    {...register('diasEstimadosMax')}
                />
            </div>
            <p className={estilos.resumen}>0 y 0 se muestra como “Hoy”.</p>
            {edicion.esNuevo && (
                <div className={estilos.activar}>
                    <Interruptor etiqueta="Activar al guardar" {...register('activar')} />
                </div>
            )}
            <Boton type="submit" anchoCompleto cargando={edicion.guardando}>
                {edicion.esNuevo ? 'Crear método' : 'Guardar cambios'}
            </Boton>
        </form>
    );
}
