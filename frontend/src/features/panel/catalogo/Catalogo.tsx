import { PestanasFiltro } from '../../../ui/Navegacion';
import { useVistaUrl } from '../../../ui/useVistaUrl';
import { Atributos } from './Atributos';
import { Categorias } from './Categorias';
import estilos from './catalogo.module.scss';

const VISTAS = [
    { valor: 'categorias', etiqueta: 'Categorías' },
    { valor: 'atributos', etiqueta: 'Atributos' },
] as const;

export default function Catalogo() {
    const { vista, elegir } = useVistaUrl(VISTAS);
    return (
        <section className={estilos.vista}>
            <title>Catálogo · ShopCart</title>
            <h1 className={estilos.titulo}>Catálogo</h1>
            <PestanasFiltro etiqueta="Sección del catálogo" opciones={VISTAS} valor={vista} alCambiar={elegir} />
            {vista === 'categorias' && <Categorias />}
            {vista === 'atributos' && <Atributos />}
        </section>
    );
}
