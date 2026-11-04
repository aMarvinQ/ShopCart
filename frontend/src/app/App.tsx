import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { crearClienteConsultas } from '../api/consultas';
import { ProveedorSesion } from '../sesion/ProveedorSesion';
import { ProveedorAvisos } from '../ui/avisos/ProveedorAvisos';
import { rutas } from './rutas';

const enrutador = createBrowserRouter(rutas);

export function App() {
    const [consultas] = useState(crearClienteConsultas);
    return (
        <QueryClientProvider client={consultas}>
            <ProveedorAvisos>
                <ProveedorSesion>
                    <RouterProvider router={enrutador} />
                </ProveedorSesion>
            </ProveedorAvisos>
        </QueryClientProvider>
    );
}
