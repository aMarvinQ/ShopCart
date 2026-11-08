import { esErrorApi } from '../../../api/errores';
import { Boton } from '../../../ui/Boton';
import { AreaTexto, Campo } from '../../../ui/Campo';
import { Casilla } from '../../../ui/Controles';
import { Esqueleto } from '../../../ui/Esqueleto';
import { Alerta, EstadoError } from '../../../ui/Mensajes';
import { Selector } from '../../../ui/Selector';
import { moneda } from '../../../utils/formato';
import { TIPOS_DESCUENTO, useFormularioCupon } from './hooks/useFormularioCupon';
import estilos from './cupones.module.scss';

export function FormularioCupon({ id, alTerminar }: { id: number | null; alTerminar: () => void }) {
    const edicion = useFormularioCupon(id, alTerminar);
    const { cupon, bloqueado, detalle } = edicion;
    const {
        register,
        watch,
        setValue,
        formState: { errors },
    } = edicion.formulario;

    if (id !== null && detalle.isPending) {
        return (
            <div role="status" aria-label="Cargando cupón">
                <Esqueleto alto="24rem" radio="12px" />
            </div>
        );
    }
    if (id !== null && detalle.isError) {
        return (
            <EstadoError
                titulo="No pudimos cargar el cupón"
                mensaje={detalle.error.message}
                referencia={esErrorApi(detalle.error) ? detalle.error.requestId : undefined}
                alReintentar={() => void detalle.refetch()}
            />
        );
    }

    const esPorcentaje = watch('tipoDescuento') === 'PORCENTAJE';
    return (
        <form noValidate className={estilos.formulario} onSubmit={(e) => void edicion.enviar(e)}>
            {edicion.errorGeneral && <Alerta tipo="error">{edicion.errorGeneral}</Alerta>}
            {cupon && (
                <p className={estilos.resumen}>
                    {cupon.usosActuales} {cupon.usosActuales === 1 ? 'uso' : 'usos'}
                    {cupon.montoDescontado !== undefined && ` · ${moneda(cupon.montoDescontado)} descontados`}
                </p>
            )}
            {bloqueado && (
                <Alerta tipo="aviso">
                    Este cupón ya se usó: su código, tipo, valor y categoría quedan fijos. Para cambiar la promoción,
                    crea otro cupón.
                </Alerta>
            )}
            <Campo
                etiqueta="Código"
                maxLength={30}
                disabled={bloqueado}
                ayuda="Se guarda en mayúsculas."
                error={errors.codigo?.message}
                {...register('codigo', {
                    onChange: (evento: { target: HTMLInputElement }) => {
                        evento.target.value = evento.target.value.toUpperCase();
                    },
                })}
            />
            <AreaTexto
                etiqueta="Descripción"
                filas={2}
                maxLength={300}
                ayuda="El cliente la ve al aplicar el cupón."
                error={errors.descripcion?.message}
                {...register('descripcion')}
            />
            <div className={estilos.dosCampos}>
                <Selector
                    etiqueta="Tipo de descuento"
                    valor={watch('tipoDescuento')}
                    opciones={TIPOS_DESCUENTO}
                    disabled={bloqueado}
                    alCambiar={(valor) => {
                        setValue('tipoDescuento', valor, { shouldDirty: true });
                    }}
                />
                <Campo
                    etiqueta={esPorcentaje ? 'Valor (%)' : 'Valor (Q)'}
                    inputMode="decimal"
                    disabled={bloqueado}
                    error={errors.valor?.message}
                    {...register('valor')}
                />
            </div>
            <Campo
                etiqueta="Monto mínimo de compra (Q)"
                inputMode="decimal"
                ayuda="0 si no tiene mínimo."
                error={errors.montoMinimo?.message}
                {...register('montoMinimo')}
            />
            <div className={estilos.dosCampos}>
                <Campo etiqueta="Inicio" type="date" error={errors.fechaInicio?.message} {...register('fechaInicio')} />
                <Campo
                    etiqueta="Fin (incluido)"
                    type="date"
                    error={errors.fechaFin?.message}
                    {...register('fechaFin')}
                />
            </div>
            <div className={estilos.dosCampos}>
                <Campo
                    etiqueta="Límite de usos total"
                    inputMode="numeric"
                    placeholder="Sin límite"
                    ayuda={
                        cupon && cupon.usosActuales > 0
                            ? `Mínimo ${String(cupon.usosActuales)}, los usos actuales.`
                            : undefined
                    }
                    error={errors.limiteUsosTotal?.message}
                    {...register('limiteUsosTotal')}
                />
                <Campo
                    etiqueta="Límite por cliente"
                    inputMode="numeric"
                    placeholder="Sin límite"
                    ayuda="Se cuenta por correo."
                    error={errors.limiteUsosPorCliente?.message}
                    {...register('limiteUsosPorCliente')}
                />
            </div>
            <Selector
                etiqueta="Aplica a"
                valor={watch('idCategoria')}
                opciones={edicion.opcionesCategoria}
                disabled={bloqueado}
                alCambiar={(valor) => {
                    setValue('idCategoria', valor, { shouldDirty: true });
                }}
            />
            <Casilla etiqueta="Solo clientes registrados" {...register('soloRegistrados')} />
            <Boton type="submit" anchoCompleto cargando={edicion.guardando}>
                {edicion.esNuevo ? 'Crear cupón' : 'Guardar cambios'}
            </Boton>
        </form>
    );
}
