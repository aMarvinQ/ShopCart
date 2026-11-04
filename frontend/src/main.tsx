import '@fontsource-variable/inter';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './estilos/principal.scss';

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Falta el elemento raíz de la aplicación.');

createRoot(raiz).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
