import { Plus } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Boton } from '../../../ui/Boton';
import { Cajon } from '../../../ui/Mensajes';
import { PestanasFiltro } from '../../../ui/Navegacion';
import { DetallePedidoPanel } from '../pedidos/DetallePedidoPanel';
import { usePedidoAbierto } from '../pedidos/hooks/useGestionPedido';
import { Conciliacion } from './Conciliacion';
import { Existencias } from './Existencias';
import { FormularioMovimiento } from './FormularioMovimiento';
import type { FilaExistencia } from './hooks/useExistencias';
import { VISTAS, useVistaInventario } from './hooks/useVistaInventario';
import { Kardex } from './Kardex';
import estilos from './inventario.module.scss';

export default function Inventario() {
    const { vista, elegir, verKardexDe } = useVistaInventario();
    const { idAbierto, abrir, cerrar } = usePedidoAbierto();
    const [movimiento, setMovimiento] = useState<{ inicial: FilaExistencia | null } | null>(null);
    const registrar = useCallback((inicial: FilaExistencia) => {
        setMovimiento({ inicial });
    }, []);
    const cerrarMovimiento = () => {
        setMovimiento(null);
    };

    return (
        <section className={estilos.vista}>
            <title>Inventario · ShopCart</title>
            <div className={estilos.cabecera}>
                <h1 className={estilos.titulo}>Inventario</h1>
                <Boton
                    icono={Plus}
                    onClick={() => {
                        setMovimiento({ inicial: null });
                    }}
                >
                    Registrar movimiento
                </Boton>
            </div>
            <PestanasFiltro etiqueta="Vista de inventario" opciones={VISTAS} valor={vista} alCambiar={elegir} />
            {vista === 'existencias' && <Existencias alVerKardex={verKardexDe} alRegistrar={registrar} />}
            {vista === 'kardex' && <Kardex alAbrirPedido={abrir} />}
            {vista === 'conciliacion' && <Conciliacion />}
            <Cajon mostrar={movimiento !== null} titulo="Registrar movimiento" alCerrar={cerrarMovimiento}>
                {movimiento && <FormularioMovimiento inicial={movimiento.inicial} alTerminar={cerrarMovimiento} />}
            </Cajon>
            <DetallePedidoPanel id={idAbierto} alCerrar={cerrar} />
        </section>
    );
}
