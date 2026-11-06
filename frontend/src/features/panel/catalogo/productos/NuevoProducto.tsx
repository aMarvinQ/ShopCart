import { Boton, BotonEnlace } from '../../../../ui/Boton';
import { AreaTexto, Campo } from '../../../../ui/Campo';
import { Alerta, DialogoConfirmacion } from '../../../../ui/Mensajes';
import { MigaPan, Tarjeta } from '../../../../ui/Navegacion';
import { Selector } from '../../../../ui/Selector';
import { EditorVariantes } from './EditorVariantes';
import { useNuevoProducto } from './hooks/useNuevoProducto';
import { PanelImagenes } from './PanelImagenes';
import estilos from './productos.module.scss';

type Nuevo = ReturnType<typeof useNuevoProducto>;

function Informacion({ nuevo }: { nuevo: Nuevo }) {
    const {
        register,
        formState: { errors },
    } = nuevo.formulario;
    const nombre = register('nombre');
    const slug = register('slug');
    return (
        <Tarjeta className={estilos.bloque}>
            <h2>Información</h2>
            <Campo
                etiqueta="Nombre"
                error={errors.nombre?.message}
                {...nombre}
                onChange={(evento) => {
                    void nombre.onChange(evento);
                    nuevo.alEscribirNombre(evento.target.value);
                }}
            />
            <div className="row gx-3">
                <div className="col-md-6">
                    <Campo
                        etiqueta="Dirección en la tienda"
                        error={errors.slug?.message}
                        {...slug}
                        onChange={(evento) => {
                            void slug.onChange(evento);
                            nuevo.alEditarSlug();
                        }}
                    />
                </div>
                <div className="col-md-6">
                    <Selector
                        etiqueta="Categoría"
                        marcador="Elige la categoría"
                        valor={nuevo.formulario.watch('idCategoria')}
                        error={errors.idCategoria?.message}
                        opciones={nuevo.opcionesCategoria}
                        alCambiar={nuevo.alCambiarCategoria}
                    />
                </div>
            </div>
            <AreaTexto
                etiqueta="Descripción (opcional)"
                maxLength={4000}
                error={errors.descripcion?.message}
                {...register('descripcion')}
            />
        </Tarjeta>
    );
}

function Variantes({ nuevo }: { nuevo: Nuevo }) {
    return (
        <Tarjeta className={estilos.bloque}>
            <h2>Variantes</h2>
            <EditorVariantes generador={nuevo.generador} />
        </Tarjeta>
    );
}

export default function NuevoProducto() {
    const nuevo = useNuevoProducto();
    return (
        <form noValidate className={estilos.pagina} onSubmit={(e) => void nuevo.enviar(e)}>
            <title>Nuevo producto · ShopCart</title>
            <MigaPan rutas={[{ etiqueta: 'Catálogo', a: '/panel/catalogo' }, { etiqueta: 'Nuevo producto' }]} />
            <h1 className={estilos.titulo}>Nuevo producto</h1>
            {nuevo.errorGeneral && <Alerta tipo="error">{nuevo.errorGeneral}</Alerta>}
            <div className={estilos.dosColumnas}>
                <div className={estilos.columna}>
                    <Informacion nuevo={nuevo} />
                    <Variantes nuevo={nuevo} />
                </div>
                <div className={estilos.columna}>
                    <PanelImagenes panel={nuevo.panelImagenes} />
                </div>
            </div>
            <div className={estilos.acciones}>
                <BotonEnlace to="/panel/catalogo" variante="fantasma">
                    Cancelar
                </BotonEnlace>
                <Boton type="submit" cargando={nuevo.creando}>
                    Crear producto
                </Boton>
            </div>
            <DialogoConfirmacion
                mostrar={nuevo.aviso.bloqueado}
                titulo="¿Salir sin crear el producto?"
                textoConfirmar="Sí, salir"
                textoCancelar="Seguir editando"
                alCancelar={nuevo.aviso.quedarse}
                alConfirmar={nuevo.aviso.salir}
            >
                Se perderá lo que escribiste.
            </DialogoConfirmacion>
        </form>
    );
}
