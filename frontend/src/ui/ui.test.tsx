import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Selector } from './Selector';
import { TablaDatos } from './TablaDatos';

Element.prototype.scrollIntoView = vi.fn();

const OPCIONES = [
    { valor: 'gt', etiqueta: 'Guatemala' },
    { valor: 'mx', etiqueta: 'Mixco' },
    { valor: 'vn', etiqueta: 'Villa Nueva' },
];

function SelectorDePrueba() {
    const [valor, setValor] = useState<string | null>('gt');
    return <Selector etiqueta="Municipio" opciones={OPCIONES} valor={valor} alCambiar={setValor} />;
}

describe('Selector', () => {
    it('se maneja con teclado: abre, se mueve, elige y Escape no cambia el valor', async () => {
        const usuario = userEvent.setup();
        render(<SelectorDePrueba />);
        const selector = screen.getByRole('combobox', { name: 'Municipio' });
        selector.focus();

        await usuario.keyboard('{ArrowDown}{ArrowDown}{Enter}');
        expect(selector).toHaveTextContent('Mixco');
        expect(selector).toHaveAttribute('aria-expanded', 'false');

        await usuario.keyboard('{ArrowDown}{ArrowDown}{Escape}');
        expect(selector).toHaveTextContent('Mixco');
        expect(selector).toHaveFocus();

        await usuario.keyboard('vi{Enter}');
        expect(selector).toHaveTextContent('Villa Nueva');
    });

    it('al perder el foco se cierra', async () => {
        const usuario = userEvent.setup();
        render(<SelectorDePrueba />);
        const selector = screen.getByRole('combobox', { name: 'Municipio' });
        await usuario.click(selector);
        expect(selector).toHaveAttribute('aria-expanded', 'true');
        await usuario.tab();
        expect(selector).toHaveAttribute('aria-expanded', 'false');
    });
});

interface Fila {
    id: string;
    total: string;
}
const COLUMNAS: ColumnDef<Fila>[] = [
    { header: 'Pedido', accessorKey: 'id', meta: { ordenarPor: 'NUMERO' } },
    { header: 'Total', accessorKey: 'total', meta: { derecha: true } },
];

function tabla(props: Partial<Parameters<typeof TablaDatos<Fila>>[0]> = {}) {
    return render(
        <TablaDatos
            etiqueta="Pedidos"
            columnas={COLUMNAS}
            filas={[{ id: 'SC-1', total: 'Q10.00' }]}
            idFila={(f) => f.id}
            cargando={false}
            vacio="Sin pedidos"
            orden={{ ordenarPor: 'NUMERO', direccion: 'DESC' }}
            alOrdenar={vi.fn()}
            pagina={1}
            tamanoPagina={2}
            totalRegistros={1}
            alCambiarPagina={vi.fn()}
            {...props}
        />,
    );
}

describe('TablaDatos', () => {
    it('muestra el orden actual y pide a la API solo las columnas que se pueden ordenar', async () => {
        const alOrdenar = vi.fn();
        tabla({ alOrdenar });
        expect(screen.getByRole('columnheader', { name: 'Pedido' })).toHaveAttribute('aria-sort', 'descending');
        expect(screen.getByRole('columnheader', { name: 'Total' })).not.toHaveAttribute('aria-sort');
        await userEvent.click(screen.getByRole('button', { name: 'Pedido' }));
        expect(alOrdenar).toHaveBeenCalledWith('NUMERO');
    });

    it('cargando reserva una fila gris por registro de la página; sin datos muestra el estado vacío', () => {
        const { unmount } = tabla({ cargando: true, filas: undefined });
        expect(screen.getAllByTestId('fila-esqueleto')).toHaveLength(2);
        unmount();
        tabla({ filas: [] });
        expect(screen.getByText('Sin pedidos')).toBeVisible();
    });
});
