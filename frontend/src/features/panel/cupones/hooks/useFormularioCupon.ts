import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '../../../../api/cliente';
import { useAvisos } from '../../../../ui/avisos/contexto';
import { hoyGuatemala } from '../../../../utils/calendario';
import { diaDe, finDelDia, inicioDelDia, ultimoDiaDe } from '../../../../utils/formato';
import { aplicarErroresApi } from '../../../../utils/formularios';
import { CLAVE_CATEGORIAS } from '../../catalogo/hooks/useCategoriasPanel';
import { CLAVE_CUPONES } from './useCuponesPanel';

const RE_MONTO = /^\d{1,10}(\.\d{1,2})?$/;
const MAXIMO_LIMITE = 1_000_000;

const limiteValido = (texto: string) => /^\d{1,7}$/.test(texto) && Number(texto) >= 1 && Number(texto) <= MAXIMO_LIMITE;

/** Las reglas de FU_Cupones_ValidarDatos y del SP, para avisar antes de enviar. */
function crearEsquema(esNuevo: boolean, usos: number) {
    return z
        .object({
            codigo: z
                .string()
                .trim()
                .regex(/^[A-Za-z0-9_-]{3,30}$/, 'De 3 a 30 letras sin tilde, números, guion o guion bajo.'),
            descripcion: z.string().trim().min(1, 'Escribe la descripción.').max(300, 'Máximo 300 caracteres.'),
            tipoDescuento: z.enum(['PORCENTAJE', 'MONTO_FIJO']),
            valor: z.string().trim().regex(RE_MONTO, 'Escribe un número, como 15 o 25.50.'),
            montoMinimo: z.string().trim().regex(RE_MONTO, 'Escribe un monto, como 100; 0 si no tiene mínimo.'),
            fechaInicio: z.string().min(1, 'Elige la fecha.'),
            fechaFin: z.string().min(1, 'Elige la fecha.'),
            limiteUsosTotal: z.string().trim(),
            limiteUsosPorCliente: z.string().trim(),
            idCategoria: z.string(),
            soloRegistrados: z.boolean(),
        })
        .superRefine((d, contexto) => {
            const problema = (campo: string, message: string) => {
                contexto.addIssue({ code: 'custom', path: [campo], message });
            };
            if (Number(d.valor) <= 0) problema('valor', 'Debe ser mayor que 0.');
            if (d.tipoDescuento === 'PORCENTAJE' && Number(d.valor) > 100) problema('valor', 'Máximo 100 %.');
            if (d.fechaFin && d.fechaInicio && d.fechaFin < d.fechaInicio) {
                problema('fechaFin', 'No puede ser anterior al inicio.');
            }
            if (esNuevo && d.fechaFin && d.fechaFin < hoyGuatemala()) problema('fechaFin', 'Esta fecha ya pasó.');
            const [total, porCliente] = [d.limiteUsosTotal, d.limiteUsosPorCliente];
            if (total && !limiteValido(total)) problema('limiteUsosTotal', 'De 1 a 1,000,000; vacío, sin límite.');
            else if (total && Number(total) < usos)
                problema('limiteUsosTotal', `Ya tiene ${String(usos)} usos: no puede ser menor.`);
            if (porCliente && !limiteValido(porCliente)) {
                problema('limiteUsosPorCliente', 'De 1 a 1,000,000; vacío, sin límite.');
            } else if (porCliente && total && Number(porCliente) > Number(total)) {
                problema('limiteUsosPorCliente', 'No puede superar el límite total.');
            }
        });
}
type Datos = z.infer<ReturnType<typeof crearEsquema>>;

const VACIO: Datos = {
    codigo: '',
    descripcion: '',
    tipoDescuento: 'PORCENTAJE',
    valor: '',
    montoMinimo: '0',
    fechaInicio: '',
    fechaFin: '',
    limiteUsosTotal: '',
    limiteUsosPorCliente: '',
    idCategoria: '',
    soloRegistrados: false,
};

export const TIPOS_DESCUENTO = [
    { valor: 'PORCENTAJE', etiqueta: 'Porcentaje' },
    { valor: 'MONTO_FIJO', etiqueta: 'Monto fijo' },
] as const;

export function useFormularioCupon(id: number | null, alTerminar: () => void) {
    const consultas = useQueryClient();
    const avisar = useAvisos();
    const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

    const detalle = useQuery({
        queryKey: [...CLAVE_CUPONES, 'detalle', id],
        queryFn: ({ signal }) => api.get('/cupones/{id}', { params: { id: id ?? 0 }, signal }),
        enabled: id !== null,
        staleTime: 0,
    });
    const categorias = useQuery({
        queryKey: CLAVE_CATEGORIAS,
        queryFn: ({ signal }) => api.get('/categorias', { signal }),
    });
    const cupon = detalle.data?.data;
    const usos = cupon?.usosActuales ?? 0;

    const valores = useMemo<Datos>(
        () =>
            cupon
                ? {
                      codigo: cupon.codigo,
                      descripcion: cupon.descripcion,
                      tipoDescuento: cupon.tipoDescuento,
                      valor: String(cupon.valor),
                      montoMinimo: String(cupon.montoMinimo),
                      fechaInicio: diaDe(cupon.fechaInicio),
                      fechaFin: ultimoDiaDe(cupon.fechaFin),
                      limiteUsosTotal: cupon.limiteUsosTotal === null ? '' : String(cupon.limiteUsosTotal),
                      limiteUsosPorCliente:
                          cupon.limiteUsosPorCliente === null ? '' : String(cupon.limiteUsosPorCliente),
                      idCategoria: cupon.idCategoria === null ? '' : String(cupon.idCategoria),
                      soloRegistrados: cupon.soloRegistrados,
                  }
                : VACIO,
        [cupon],
    );
    const esquema = useMemo(() => crearEsquema(id === null, usos), [id, usos]);
    const formulario = useForm<Datos>({
        resolver: zodResolver(esquema),
        values: valores,
        resetOptions: { keepDirtyValues: true },
    });

    const guardar = useMutation({
        mutationFn: (datos: Datos) => {
            // Un día sin cambios conserva su hora exacta: editar otro campo no mueve la vigencia.
            const fechaInicio =
                cupon && datos.fechaInicio === valores.fechaInicio
                    ? cupon.fechaInicio
                    : inicioDelDia(datos.fechaInicio);
            const fechaFin = cupon && datos.fechaFin === valores.fechaFin ? cupon.fechaFin : finDelDia(datos.fechaFin);
            const bloqueado = cupon?.terminosBloqueados === true;
            const cuerpo = {
                codigo: bloqueado ? cupon.codigo : datos.codigo,
                descripcion: datos.descripcion,
                tipoDescuento: bloqueado ? cupon.tipoDescuento : datos.tipoDescuento,
                valor: bloqueado ? cupon.valor : Number(datos.valor),
                montoMinimo: Number(datos.montoMinimo),
                fechaInicio,
                fechaFin,
                limiteUsosTotal: datos.limiteUsosTotal ? Number(datos.limiteUsosTotal) : null,
                limiteUsosPorCliente: datos.limiteUsosPorCliente ? Number(datos.limiteUsosPorCliente) : null,
                idCategoria: bloqueado ? cupon.idCategoria : datos.idCategoria ? Number(datos.idCategoria) : null,
                soloRegistrados: datos.soloRegistrados,
            };
            return id === null || !cupon
                ? api.post('/cupones', { cuerpo })
                : api.put('/cupones/{id}', {
                      params: { id },
                      cuerpo: { ...cuerpo, versionFila: cupon.versionFila ?? '' },
                  });
        },
        onSuccess: async ({ data }) => {
            avisar({ tipo: 'exito', titulo: id === null ? 'Cupón creado' : 'Cupón actualizado', detalle: data.codigo });
            await consultas.invalidateQueries({ queryKey: CLAVE_CUPONES });
            alTerminar();
        },
        onError: async (error) => {
            setErrorGeneral(
                aplicarErroresApi(
                    error,
                    formulario.setError,
                    [
                        'codigo',
                        'descripcion',
                        'valor',
                        'montoMinimo',
                        'fechaInicio',
                        'fechaFin',
                        'limiteUsosTotal',
                        'limiteUsosPorCliente',
                    ],
                    'No pudimos guardar el cupón; intenta de nuevo.',
                    '',
                    {
                        CODIGO_REGISTRADO: 'codigo',
                        LIMITE_MENOR_QUE_USOS: 'limiteUsosTotal',
                        VALOR_DESCUENTO_INVALIDO: 'valor',
                        MONTO_MINIMO_INVALIDO: 'montoMinimo',
                        RANGO_FECHAS_INVALIDO: 'fechaFin',
                        LIMITE_USOS_INVALIDO: 'limiteUsosPorCliente',
                    },
                ),
            );
            // Si otra persona lo cambió o ya se usó, se trae lo real; lo escrito se conserva.
            if (id !== null) await detalle.refetch();
        },
    });

    return {
        esNuevo: id === null,
        detalle,
        cupon,
        bloqueado: cupon?.terminosBloqueados === true,
        formulario,
        errorGeneral,
        guardando: guardar.isPending,
        opcionesCategoria: [
            { valor: '', etiqueta: 'Todo el catálogo' },
            ...(categorias.data?.data ?? [])
                .filter((c) => c.activo || c.idCategoria === cupon?.idCategoria)
                .map((c) => ({ valor: String(c.idCategoria), etiqueta: c.nombre })),
        ],
        enviar: formulario.handleSubmit((datos) => {
            setErrorGeneral(null);
            guardar.mutate(datos);
        }),
    };
}
