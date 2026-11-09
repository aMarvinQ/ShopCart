import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '../../../../api/cliente';
import { esErrorApi } from '../../../../api/errores';
import { useAvisos } from '../../../../ui/avisos/contexto';
import { aplicarErroresApi } from '../../../../utils/formularios';
import { CLAVE_METODOS, renovarMetodos } from './useMetodosEnvio';

const RE_MONTO = /^\d{1,10}(\.\d{1,2})?$/;
const RE_DIAS = /^\d{1,3}$/;
const diasValidos = (texto: string) => RE_DIAS.test(texto) && Number(texto) <= 255;

/** Las reglas de FU_Envios_ValidarMetodo, para avisar antes de enviar. */
const esquema = z
    .object({
        nombre: z.string().trim().min(1, 'Escribe el nombre.').max(100, 'Máximo 100 caracteres.'),
        descripcion: z.string().trim().max(300, 'Máximo 300 caracteres.'),
        gratis: z.boolean(),
        costo: z.string().trim().regex(RE_MONTO, 'Escribe un monto, como 35 o 42.50.'),
        diasEstimadosMin: z.string().trim(),
        diasEstimadosMax: z.string().trim(),
        activar: z.boolean(),
    })
    .superRefine((d, contexto) => {
        const problema = (campo: string, message: string) => {
            contexto.addIssue({ code: 'custom', path: [campo], message });
        };
        const [minimo, maximo] = [d.diasEstimadosMin, d.diasEstimadosMax];
        if (!diasValidos(minimo)) problema('diasEstimadosMin', 'De 0 a 255 días.');
        if (!diasValidos(maximo)) problema('diasEstimadosMax', 'De 0 a 255 días.');
        else if (diasValidos(minimo) && Number(maximo) < Number(minimo)) {
            problema('diasEstimadosMax', `Debe ser igual o mayor que el mínimo (${minimo}).`);
        }
    });
type Datos = z.infer<typeof esquema>;

const VACIO: Datos = {
    nombre: '',
    descripcion: '',
    gratis: false,
    costo: '',
    diasEstimadosMin: '',
    diasEstimadosMax: '',
    activar: true,
};

export function useFormularioMetodo(id: number | null, alTerminar: () => void) {
    const consultas = useQueryClient();
    const avisar = useAvisos();
    const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

    const detalle = useQuery({
        queryKey: [...CLAVE_METODOS, 'detalle', id],
        queryFn: ({ signal }) => api.get('/metodos-envio/{id}', { params: { id: id ?? 0 }, signal }),
        enabled: id !== null,
        staleTime: 0,
    });
    const metodo = detalle.data?.data;

    const valores = useMemo<Datos>(
        () =>
            metodo
                ? {
                      nombre: metodo.nombre,
                      descripcion: metodo.descripcion ?? '',
                      gratis: metodo.costo === 0,
                      costo: metodo.costo.toFixed(2),
                      diasEstimadosMin: String(metodo.diasEstimadosMin),
                      diasEstimadosMax: String(metodo.diasEstimadosMax),
                      activar: metodo.activo,
                  }
                : VACIO,
        [metodo],
    );
    const formulario = useForm<Datos>({
        resolver: zodResolver(esquema),
        values: valores,
        resetOptions: { keepDirtyValues: true },
    });

    const guardar = useMutation({
        mutationFn: async (datos: Datos) => {
            const cuerpo = {
                nombre: datos.nombre,
                descripcion: datos.descripcion || null,
                costo: datos.gratis ? 0 : Number(datos.costo),
                diasEstimadosMin: Number(datos.diasEstimadosMin),
                diasEstimadosMax: Number(datos.diasEstimadosMax),
            };
            if (id !== null && metodo) {
                return api.put('/metodos-envio/{id}', {
                    params: { id },
                    cuerpo: { ...cuerpo, versionFila: metodo.versionFila ?? '' },
                });
            }
            const creado = await api.post('/metodos-envio', { cuerpo });
            if (datos.activar) return creado;
            // El SP lo crea activo; apagarlo es un segundo paso. Si falla, ya existe y queda activo.
            try {
                return await api.patch('/metodos-envio/{id}/estado', {
                    params: { id: creado.data.idMetodoEnvio },
                    cuerpo: { activo: false },
                });
            } catch (error) {
                avisar({
                    tipo: 'aviso',
                    titulo: `${creado.data.nombre} se creó activo`,
                    detalle: `No se pudo desactivar: ${esErrorApi(error) ? error.message : 'intenta desde su tarjeta.'}`,
                });
                return creado;
            }
        },
        onSuccess: async ({ data }) => {
            avisar({
                tipo: 'exito',
                titulo: id === null ? `${data.nombre} creado` : `${data.nombre} actualizado`,
                detalle: data.activo ? 'Ya aparece en el pago.' : 'Queda inactivo: no aparece en el pago.',
            });
            await renovarMetodos(consultas);
            alTerminar();
        },
        onError: async (error) => {
            setErrorGeneral(
                aplicarErroresApi(
                    error,
                    formulario.setError,
                    ['nombre', 'descripcion', 'costo', 'diasEstimadosMin', 'diasEstimadosMax'],
                    'No pudimos guardar el método; intenta de nuevo.',
                    '',
                    {
                        NOMBRE_REGISTRADO: 'nombre',
                        NOMBRE_INVALIDO: 'nombre',
                        DESCRIPCION_INVALIDA: 'descripcion',
                        COSTO_INVALIDO: 'costo',
                        DIAS_ESTIMADOS_INVALIDOS: 'diasEstimadosMax',
                    },
                ),
            );
            // Si otra persona lo cambió, se trae lo real; lo escrito se conserva.
            if (id !== null) await detalle.refetch();
        },
    });

    return {
        esNuevo: id === null,
        detalle,
        metodo,
        formulario,
        errorGeneral,
        guardando: guardar.isPending,
        enviar: formulario.handleSubmit((datos) => {
            setErrorGeneral(null);
            guardar.mutate(datos);
        }),
    };
}
