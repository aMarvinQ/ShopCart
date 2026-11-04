import { SearchX } from 'lucide-react';
import { Link } from 'react-router';

export function NoEncontrada() {
    return (
        <div className="text-center py-5">
            <title>Página no encontrada · ShopCart</title>
            <SearchX size={48} className="text-secondary mb-3" aria-hidden="true" />
            <h1 className="h3">No encontramos esta página</h1>
            <p className="text-secondary">Puede que el enlace esté mal escrito o que la página ya no exista.</p>
            <Link className="btn btn-primary" to="/">
                Ir a la tienda
            </Link>
        </div>
    );
}
