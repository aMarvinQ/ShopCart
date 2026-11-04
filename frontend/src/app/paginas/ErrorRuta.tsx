import { isRouteErrorResponse, useRouteError } from 'react-router';
import { esErrorApi } from '../../api/errores';
import { EstadoError } from '../../ui/EstadoError';
import { NoEncontrada } from './NoEncontrada';

/*
    Límite de errores: un fallo inesperado en una pantalla no deja la página en blanco. No muestra
    detalles técnicos. El caso típico tras publicar una versión nueva es que ya no exista el archivo
    de una pantalla; recargar lo resuelve, por eso el reintento recarga.
*/
export function ErrorRuta() {
    const error = useRouteError();
    if (isRouteErrorResponse(error) && error.status === 404) return <NoEncontrada />;
    return (
        <main className="container py-5">
            <title>Error · ShopCart</title>
            <EstadoError
                titulo="Algo salió mal"
                mensaje="No pudimos mostrar esta página. Intenta de nuevo en unos momentos."
                referencia={esErrorApi(error) ? error.requestId : undefined}
                alReintentar={() => {
                    window.location.reload();
                }}
            />
        </main>
    );
}
