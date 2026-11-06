import { BarraCambios } from '../../../../ui/BarraCambios';
import { AreaTexto, Campo } from '../../../../ui/Campo';
import { Interruptor } from '../../../../ui/Controles';
import { Alerta, DialogoConfirmacion } from '../../../../ui/Mensajes';
import { Tarjeta } from '../../../../ui/Navegacion';
import { Selector } from '../../../../ui/Selector';
import { fechaHora } from '../../../../utils/formato';
import { TarjetaProducto } from '../../../tienda/TarjetaProducto';
import { useGeneralProducto, type Producto } from './hooks/useEdicionProducto';
import estilos from './productos.module.scss';

function VistaPrevia({ producto }: { producto: Producto }) {
    const variante = producto.variantes.find((v) => v.esSeleccionInicial) ?? producto.variantes[0];
    const imagen = producto.imagenes.find((i) => i.esPrincipal) ?? producto.imagenes[0];
    return (
        <TarjetaProducto
            producto={{
                idProducto: producto.idProducto,
                nombre: producto.nombre,
                slug: producto.slug,
                categoria: producto.categoria,
                slugCategoria: '',
                precio: variante?.precio ?? 0,
                disponible: producto.variantes.some((v) => v.activo && v.disponible > 0),
                imagenPrincipal: imagen?.rutaImagen ?? null,
                textoAlternativo: imagen?.textoAlternativo ?? null,
            }}
            prioridad
        />
    );
}

export function GeneralProducto({ producto }: { producto: Producto }) {
    const general = useGeneralProducto(producto);
    const {
        register,
        watch,
        setValue,
        formState: { errors },
    } = general.formulario;

    return (
        <form noValidate className={estilos.general} onSubmit={(e) => void general.enviar(e)}>
            <div className="row g-3">
                <div className="col-lg-8">
                    <Tarjeta className={estilos.bloque}>
                        <h2>Información</h2>
                        {general.errorGeneral && <Alerta tipo="error">{general.errorGeneral}</Alerta>}
                        <Campo etiqueta="Nombre" error={errors.nombre?.message} {...register('nombre')} />
                        <div className="row gx-3">
                            <div className="col-md-6">
                                <Campo
                                    etiqueta="Dirección en la tienda"
                                    error={errors.slug?.message}
                                    {...register('slug')}
                                />
                            </div>
                            <div className="col-md-6">
                                <Selector
                                    etiqueta="Categoría"
                                    valor={watch('idCategoria')}
                                    error={errors.idCategoria?.message}
                                    opciones={general.opcionesCategoria}
                                    alCambiar={(valor) => {
                                        setValue('idCategoria', valor, { shouldDirty: true, shouldValidate: true });
                                    }}
                                />
                            </div>
                        </div>
                        <AreaTexto
                            etiqueta="Descripción (opcional)"
                            filas={5}
                            maxLength={4000}
                            error={errors.descripcion?.message}
                            {...register('descripcion')}
                        />
                    </Tarjeta>
                </div>
                <div className="col-lg-4">
                    <div className={estilos.lateral}>
                        <Tarjeta className={estilos.bloque}>
                            <h2>Publicación</h2>
                            <Interruptor
                                etiqueta="Visible en la tienda"
                                checked={producto.activo}
                                disabled={general.cambiando || general.motivoNoVisible !== null}
                                onChange={general.alternarVisible}
                            />
                            {general.motivoNoVisible && (
                                <small className={estilos.detalle}>{general.motivoNoVisible}</small>
                            )}
                            {!producto.categoriaActiva && (
                                <Alerta tipo="aviso">
                                    Su categoría está desactivada: no se verá hasta reactivarla.
                                </Alerta>
                            )}
                            <small className={estilos.detalle}>
                                {producto.fechaModificacion
                                    ? `Última edición: ${fechaHora(producto.fechaModificacion)}`
                                    : `Creado: ${fechaHora(producto.fechaCreacion)}`}
                            </small>
                        </Tarjeta>
                        <Tarjeta className={estilos.bloque}>
                            <h2>Vista previa</h2>
                            <VistaPrevia producto={producto} />
                        </Tarjeta>
                    </div>
                </div>
            </div>
            {general.hayCambios && <BarraCambios guardando={general.guardando} alDescartar={general.descartar} />}
            <DialogoConfirmacion
                mostrar={general.porDesactivar}
                titulo={`¿Ocultar ${producto.nombre}?`}
                textoConfirmar="Sí, ocultar"
                cargando={general.cambiando}
                alCancelar={general.desistir}
                alConfirmar={general.confirmarDesactivar}
            >
                Dejará de verse en la tienda. Los pedidos ya hechos no cambian y puedes volver a mostrarlo.
            </DialogoConfirmacion>
            <DialogoConfirmacion
                mostrar={general.aviso.bloqueado}
                titulo="¿Salir sin guardar?"
                textoConfirmar="Sí, salir"
                textoCancelar="Seguir editando"
                alCancelar={general.aviso.quedarse}
                alConfirmar={general.aviso.salir}
            >
                Se perderán los cambios de esta pestaña.
            </DialogoConfirmacion>
        </form>
    );
}
