import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useController, useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, type DatosDe } from '../../api/cliente';
import { esErrorApi } from '../../api/errores';
import { useAvisos } from '../../ui/avisos/contexto';
import { Boton } from '../../ui/Boton';
import { Campo } from '../../ui/Campo';
import { Casilla } from '../../ui/Controles';
import { Esqueleto } from '../../ui/Esqueleto';
import { Alerta, Cajon, DialogoConfirmacion, EstadoError, EstadoVacio } from '../../ui/Mensajes';
import { Tarjeta } from '../../ui/Navegacion';
import { Selector } from '../../ui/Selector';
import { aplicarErroresApi } from '../../utils/formularios';
import estilos from './cuenta.module.scss';

type Direccion = DatosDe<'get', '/direcciones'>[number];

const CLAVE = ['direcciones'];
const texto = (mensaje: string, maximo: number) =>
    z
        .string()
        .trim()
        .min(1, mensaje)
        .max(maximo, `Máximo ${String(maximo)} caracteres.`);

const esquema = z.object({
    alias: texto('Ponle un nombre, como Casa.', 50),
    nombreDestinatario: texto('Escribe quién recibe.', 150),
    telefono: z
        .string()
        .trim()
        .min(8, 'Debe tener al menos 8 dígitos.')
        .max(20, 'Máximo 20 caracteres.')
        .regex(/^[0-9+\- ]+$/, 'Usa solo dígitos, espacios, + y -.'),
    linea1: texto('Escribe la dirección.', 200),
    linea2: z.string().trim().max(200, 'Máximo 200 caracteres.'),
    idDepartamento: z.string().min(1, 'Elige el departamento.'),
    idMunicipio: z.string().min(1, 'Elige el municipio.'),
    codigoPostal: z
        .string()
        .trim()
        .regex(/^(\d{5})?$/, 'Deben ser 5 dígitos.'),
    referencias: z.string().trim().max(300, 'Máximo 300 caracteres.'),
    esPredeterminada: z.boolean(),
});
type Datos = z.infer<typeof esquema>;

const CAMPOS_API = [
    'alias',
    'nombreDestinatario',
    'telefono',
    'linea1',
    'linea2',
    'idMunicipio',
    'codigoPostal',
    'referencias',
] as const;

function FormularioDireccion({ direccion, alTerminar }: { direccion: Direccion | null; alTerminar: () => void }) {
    const consultas = useQueryClient();
    const avisar = useAvisos();
    const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
    const {
        register,
        handleSubmit,
        setError,
        setValue,
        control,
        watch,
        formState: { errors },
    } = useForm<Datos>({
        resolver: zodResolver(esquema),
        defaultValues: {
            alias: direccion?.alias ?? '',
            nombreDestinatario: direccion?.nombreDestinatario ?? '',
            telefono: direccion?.telefono ?? '',
            linea1: direccion?.linea1 ?? '',
            linea2: direccion?.linea2 ?? '',
            idDepartamento: direccion ? String(direccion.idDepartamento) : '',
            idMunicipio: direccion ? String(direccion.idMunicipio) : '',
            codigoPostal: direccion?.codigoPostal ?? '',
            referencias: direccion?.referencias ?? '',
            esPredeterminada: false,
        },
    });
    const departamento = useController({ control, name: 'idDepartamento' });
    const municipio = useController({ control, name: 'idMunicipio' });
    const idDepartamento = watch('idDepartamento');

    const departamentos = useQuery({
        queryKey: ['departamentos'],
        queryFn: ({ signal }) => api.get('/departamentos', { signal }),
        staleTime: Infinity,
    });
    const municipios = useQuery({
        queryKey: ['municipios', idDepartamento],
        queryFn: ({ signal }) =>
            api.get('/departamentos/{id}/municipios', { params: { id: Number(idDepartamento) }, signal }),
        enabled: idDepartamento !== '',
        staleTime: Infinity,
    });

    const guardar = useMutation({
        mutationFn: async (datos: Datos) => {
            const cuerpo = {
                alias: datos.alias,
                nombreDestinatario: datos.nombreDestinatario,
                telefono: datos.telefono,
                linea1: datos.linea1,
                linea2: datos.linea2 || null,
                idMunicipio: Number(datos.idMunicipio),
                codigoPostal: datos.codigoPostal || null,
                referencias: datos.referencias || null,
            };
            if (direccion) return api.put('/direcciones/{id}', { params: { id: direccion.idDireccion }, cuerpo });
            const { data } = await api.post('/direcciones', {
                cuerpo: { ...cuerpo, esPredeterminada: datos.esPredeterminada },
            });
            return { data: data.direcciones };
        },
        onSuccess: (respuesta) => {
            consultas.setQueryData(CLAVE, respuesta);
            avisar({ tipo: 'exito', titulo: direccion ? 'Dirección actualizada' : 'Dirección agregada' });
            alTerminar();
        },
        onError: (error) => {
            setErrorGeneral(
                aplicarErroresApi(error, setError, CAMPOS_API, 'No pudimos guardar la dirección; intenta de nuevo.'),
            );
        },
    });

    return (
        <form
            id="formulario-direccion"
            className={estilos.formulario}
            noValidate
            onSubmit={(e) =>
                void handleSubmit((datos) => {
                    setErrorGeneral(null);
                    guardar.mutate(datos);
                })(e)
            }
        >
            {errorGeneral && (
                <div className={estilos.mensajes}>
                    <Alerta tipo="error">{errorGeneral}</Alerta>
                </div>
            )}
            <Campo
                etiqueta="Nombre de la dirección"
                placeholder="Casa"
                error={errors.alias?.message}
                {...register('alias')}
            />
            <Campo
                etiqueta="Quién recibe"
                autoComplete="name"
                error={errors.nombreDestinatario?.message}
                {...register('nombreDestinatario')}
            />
            <Campo
                etiqueta="Teléfono"
                type="tel"
                autoComplete="tel"
                error={errors.telefono?.message}
                {...register('telefono')}
            />
            <Campo
                etiqueta="Dirección"
                autoComplete="address-line1"
                error={errors.linea1?.message}
                {...register('linea1')}
            />
            <Campo
                etiqueta="Complemento (opcional)"
                autoComplete="address-line2"
                error={errors.linea2?.message}
                {...register('linea2')}
            />
            <div className={estilos.dosColumnas}>
                <Selector
                    etiqueta="Departamento"
                    valor={departamento.field.value}
                    error={errors.idDepartamento?.message}
                    opciones={(departamentos.data?.data ?? []).map((d) => ({
                        valor: String(d.idDepartamento),
                        etiqueta: d.nombre,
                    }))}
                    alCambiar={(valor) => {
                        departamento.field.onChange(valor);
                        setValue('idMunicipio', '');
                    }}
                    onBlur={departamento.field.onBlur}
                />
                <Selector
                    etiqueta="Municipio"
                    valor={municipio.field.value}
                    error={errors.idMunicipio?.message}
                    disabled={idDepartamento === ''}
                    opciones={(municipios.data?.data ?? []).map((m) => ({
                        valor: String(m.idMunicipio),
                        etiqueta: m.nombre,
                    }))}
                    alCambiar={municipio.field.onChange}
                    onBlur={municipio.field.onBlur}
                />
            </div>
            <Campo
                etiqueta="Código postal (opcional)"
                inputMode="numeric"
                autoComplete="postal-code"
                error={errors.codigoPostal?.message}
                {...register('codigoPostal')}
            />
            <Campo etiqueta="Referencias (opcional)" error={errors.referencias?.message} {...register('referencias')} />
            {!direccion && <Casilla etiqueta="Usar como predeterminada" {...register('esPredeterminada')} />}
            <Boton type="submit" anchoCompleto cargando={guardar.isPending}>
                Guardar dirección
            </Boton>
        </form>
    );
}

export default function Direcciones() {
    const consultas = useQueryClient();
    const avisar = useAvisos();
    const [cajon, setCajon] = useState<{ direccion: Direccion | null } | null>(null);
    const [porEliminar, setPorEliminar] = useState<Direccion | null>(null);
    const consulta = useQuery({
        queryKey: CLAVE,
        queryFn: ({ signal }) => api.get('/direcciones', { signal }),
    });
    const alFallar = (error: Error) => {
        avisar({ tipo: 'error', titulo: 'No se pudo completar', detalle: error.message });
    };
    const predeterminar = useMutation({
        mutationFn: (id: number) => api.post('/direcciones/{id}/predeterminada', { params: { id } }),
        onSuccess: (respuesta) => {
            consultas.setQueryData(CLAVE, respuesta);
        },
        onError: alFallar,
    });
    const eliminar = useMutation({
        mutationFn: (id: number) => api.delete('/direcciones/{id}', { params: { id } }),
        onSuccess: (respuesta) => {
            consultas.setQueryData(CLAVE, respuesta);
            setPorEliminar(null);
        },
        onError: (error) => {
            setPorEliminar(null);
            alFallar(error);
        },
    });
    const lista = consulta.data?.data;

    return (
        <section className={estilos.perfil}>
            <title>Direcciones · ShopCart</title>
            <div className={estilos.encabezado}>
                <h1 className={estilos.titulo}>Direcciones</h1>
                <Boton
                    icono={Plus}
                    onClick={() => {
                        setCajon({ direccion: null });
                    }}
                >
                    Agregar dirección
                </Boton>
            </div>
            {consulta.isPending && (
                <div role="status" aria-label="Cargando direcciones" className={estilos.direcciones}>
                    {Array.from({ length: 2 }, (_, i) => (
                        <Tarjeta key={i} className={estilos.direccion}>
                            <Esqueleto ancho="40%" alto="1.25rem" />
                            <Esqueleto alto="4rem" />
                        </Tarjeta>
                    ))}
                </div>
            )}
            {consulta.isError && (
                <Tarjeta>
                    <EstadoError
                        titulo="No pudimos cargar tus direcciones"
                        mensaje={consulta.error.message}
                        referencia={esErrorApi(consulta.error) ? consulta.error.requestId : undefined}
                        alReintentar={() => void consulta.refetch()}
                    />
                </Tarjeta>
            )}
            {lista?.length === 0 && (
                <Tarjeta>
                    <EstadoVacio
                        icono={MapPin}
                        titulo="Aún no tienes direcciones"
                        mensaje="Guárdalas aquí para comprar más rápido."
                    />
                </Tarjeta>
            )}
            {lista && lista.length > 0 && (
                <ul className={estilos.direcciones}>
                    {lista.map((d) => (
                        <li key={d.idDireccion}>
                            <Tarjeta className={estilos.direccion}>
                                <h2 className={estilos.bloqueTitulo}>
                                    {d.alias}
                                    {d.esPredeterminada && (
                                        <span className={estilos.predeterminada}>Predeterminada</span>
                                    )}
                                </h2>
                                <address>
                                    {d.nombreDestinatario} · {d.telefono}
                                    <br />
                                    {d.linea1}
                                    {d.linea2 && `, ${d.linea2}`}
                                    <br />
                                    {d.municipio}, {d.departamento}
                                    {d.codigoPostal && ` · ${d.codigoPostal}`}
                                    {d.referencias && (
                                        <>
                                            <br />
                                            {d.referencias}
                                        </>
                                    )}
                                </address>
                                <div className={estilos.direccionAcciones}>
                                    <Boton
                                        variante="fantasma"
                                        tamano="sm"
                                        icono={Pencil}
                                        onClick={() => {
                                            setCajon({ direccion: d });
                                        }}
                                    >
                                        Editar
                                    </Boton>
                                    {!d.esPredeterminada && (
                                        <Boton
                                            variante="fantasma"
                                            tamano="sm"
                                            icono={Star}
                                            cargando={
                                                predeterminar.isPending && predeterminar.variables === d.idDireccion
                                            }
                                            onClick={() => {
                                                predeterminar.mutate(d.idDireccion);
                                            }}
                                        >
                                            Predeterminar
                                        </Boton>
                                    )}
                                    <Boton
                                        variante="fantasma"
                                        tamano="sm"
                                        icono={Trash2}
                                        onClick={() => {
                                            setPorEliminar(d);
                                        }}
                                    >
                                        Eliminar
                                    </Boton>
                                </div>
                            </Tarjeta>
                        </li>
                    ))}
                </ul>
            )}
            <Cajon
                mostrar={cajon !== null}
                titulo={cajon?.direccion ? 'Editar dirección' : 'Agregar dirección'}
                alCerrar={() => {
                    setCajon(null);
                }}
            >
                {cajon && (
                    <FormularioDireccion
                        key={cajon.direccion?.idDireccion ?? 'nueva'}
                        direccion={cajon.direccion}
                        alTerminar={() => {
                            setCajon(null);
                        }}
                    />
                )}
            </Cajon>
            <DialogoConfirmacion
                mostrar={porEliminar !== null}
                titulo={`¿Eliminar la dirección ${porEliminar?.alias ?? ''}?`}
                textoConfirmar="Sí, eliminar"
                cargando={eliminar.isPending}
                alCancelar={() => {
                    setPorEliminar(null);
                }}
                alConfirmar={() => {
                    if (porEliminar) eliminar.mutate(porEliminar.idDireccion);
                }}
            >
                Los pedidos ya realizados conservan su dirección.
            </DialogoConfirmacion>
        </section>
    );
}
