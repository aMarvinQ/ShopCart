import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { api } from '../../../../../api/cliente';
import { useAvisos } from '../../../../../ui/avisos/contexto';
import { useAvisoSalida } from '../../../../../ui/useAvisoSalida';
import { aplicarErroresApi } from '../../../../../utils/formularios';
import { aSlug } from '../../../../../utils/slug';
import { CLAVE_CATEGORIAS } from '../../hooks/useCategoriasPanel';
import type { DatosPanelImagenes, ImagenDePanel } from '../PanelImagenes';
import { useGeneradorVariantes } from './useGeneradorVariantes';
import { CLAVE_PRODUCTOS } from './useProductosPanel';

const esquema = z.object({
    nombre: z.string().trim().min(1, 'Escribe el nombre.').max(200, 'Máximo 200 caracteres.'),
    slug: z
        .string()
        .trim()
        .min(1, 'Escribe la dirección.')
        .max(220, 'Máximo 220 caracteres.')
        .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Usa minúsculas, números y guiones.'),
    descripcion: z.string().trim().max(4000, 'Máximo 4000 caracteres.'),
    idCategoria: z.string().min(1, 'Elige la categoría.'),
});
type Datos = z.infer<typeof esquema>;

const MAXIMO_IMAGENES = 50;

export interface ImagenNueva {
    ruta: string;
    textoAlternativo: string;
    idAtributoValor: number | null;
}

export function useNuevoProducto() {
    const consultas = useQueryClient();
    const avisar = useAvisos();
    const navegar = useNavigate();
    const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
    const [slugEditado, setSlugEditado] = useState(false);
    const [atributoElegido, setAtributoElegido] = useState<number | null>(null);
    const [imagenes, setImagenes] = useState<ImagenNueva[]>([]);

    const formulario = useForm<Datos>({
        resolver: zodResolver(esquema),
        defaultValues: { nombre: '', slug: '', descripcion: '', idCategoria: '' },
    });
    const idCategoria = formulario.watch('idCategoria');
    const nombre = formulario.watch('nombre');

    const categorias = useQuery({
        queryKey: CLAVE_CATEGORIAS,
        queryFn: ({ signal }) => api.get('/categorias', { signal }),
    });
    const generador = useGeneradorVariantes(idCategoria ? Number(idCategoria) : null, nombre);

    const hayCambios = formulario.formState.isDirty || imagenes.length > 0 || generador.hayCambios;
    const aviso = useAvisoSalida(hayCambios);

    /* Reglas de FU_Catalogo_ValidarImagenes: cada grupo tiene su principal, y las imágenes por valor son
       todas de un mismo atributo y de valores que tengan alguna variante. Una imagen cuyo valor ya no tiene
       variante se trata como general; si el valor vuelve a marcarse, regresa a su grupo. */
    const valores = generador.valoresConVariante;
    const valorDe = (id: number | null) => valores.find((v) => v.idAtributoValor === id);
    const atributoEnUso = imagenes.map((i) => valorDe(i.idAtributoValor)?.idAtributo).find((a) => a !== undefined);
    const idAtributo =
        atributoEnUso ??
        generador.atributos.find((a) => a.idAtributo === atributoElegido)?.idAtributo ??
        generador.atributos[0]?.idAtributo ??
        null;
    const grupoDe = (img: ImagenNueva) => {
        const valor = valorDe(img.idAtributoValor);
        return valor && valor.idAtributo === atributoEnUso ? valor.idAtributoValor : null;
    };
    const delGrupo = (idValor: number | null) => imagenes.filter((i) => grupoDe(i) === idValor);
    const aPanel = (lista: readonly ImagenNueva[]): ImagenDePanel[] =>
        lista.map((img, i) => ({ clave: img.ruta, ruta: img.ruta, texto: img.textoAlternativo, esPrincipal: i === 0 }));
    const desplazadas = imagenes.filter((i) => i.idAtributoValor !== null && grupoDe(i) === null).length;

    const crear = useMutation({
        mutationFn: (datos: Datos) =>
            api.post('/productos', {
                cuerpo: {
                    idCategoria: Number(datos.idCategoria),
                    nombre: datos.nombre,
                    slug: datos.slug,
                    descripcion: datos.descripcion || null,
                    variantes: generador.cuerpo(),
                    imagenes: imagenes.map((img, orden) => {
                        const idValor = grupoDe(img);
                        return {
                            ruta: img.ruta,
                            textoAlternativo: img.textoAlternativo.trim() || datos.nombre,
                            idAtributoValor: idValor,
                            orden,
                            esPrincipal: imagenes.findIndex((i) => grupoDe(i) === idValor) === orden,
                        };
                    }),
                },
            }),
        onSuccess: async ({ data }) => {
            avisar({ tipo: 'exito', titulo: 'Producto creado', detalle: data.nombre });
            aviso.permitirSalida();
            await consultas.invalidateQueries({ queryKey: CLAVE_PRODUCTOS });
            // Se abre para que se pueda activar y revisar: la API lo crea inactivo.
            await navegar(`/panel/catalogo/productos/${String(data.idProducto)}`);
        },
        onError: (error) => {
            setErrorGeneral(
                aplicarErroresApi(
                    error,
                    formulario.setError,
                    ['nombre', 'slug', 'descripcion'],
                    'No pudimos crear el producto; intenta de nuevo.',
                    '',
                    { SLUG_REGISTRADO: 'slug' },
                ),
            );
        },
    });

    return {
        formulario,
        errorGeneral,
        creando: crear.isPending,
        aviso,
        generador,
        opcionesCategoria: (categorias.data?.data ?? [])
            .filter((c) => c.activo)
            .map((c) => ({ valor: String(c.idCategoria), etiqueta: c.nombre })),
        alCambiarCategoria: (valor: string) => {
            formulario.setValue('idCategoria', valor, { shouldDirty: true, shouldValidate: true });
            generador.reiniciar();
        },
        /** La dirección sigue al nombre hasta que alguien la edita a mano. */
        alEscribirNombre: (texto: string) => {
            if (!slugEditado) {
                formulario.setValue('slug', aSlug(texto, 220), {
                    shouldDirty: true,
                    shouldValidate: formulario.formState.isSubmitted,
                });
            }
        },
        alEditarSlug: () => {
            setSlugEditado(true);
        },
        panelImagenes: {
            ayuda: 'JPEG, PNG o WebP de hasta 5 MB. Sin imagen se crea, pero no se puede activar. Arrastra para ordenar: la primera de cada grupo es la principal.',
            general: aPanel(delGrupo(null)),
            atributos: generador.atributos.map((a) => ({ idAtributo: a.idAtributo, nombre: a.nombre })),
            idAtributo,
            atributoFijo: atributoEnUso !== undefined,
            elegirAtributo: setAtributoElegido,
            valores: valores
                .filter((v) => v.idAtributo === idAtributo)
                .map((v) => ({
                    idValor: v.idAtributoValor,
                    titulo: v.valor,
                    imagenes: aPanel(delGrupo(v.idAtributoValor)),
                })),
            sinValores: 'Marca valores en Variantes para subir sus imágenes.',
            aviso:
                desplazadas > 0
                    ? `${String(desplazadas)} ${desplazadas === 1 ? 'imagen pasó' : 'imágenes pasaron'} a Generales porque su valor ya no tiene variantes. Si lo marcas de nuevo, regresan.`
                    : undefined,
            ocupado: false,
            eliminable: true,
            cambiarTexto: (clave, texto) => {
                setImagenes((actuales) =>
                    actuales.map((img) => (img.ruta === clave ? { ...img, textoAlternativo: texto.trim() } : img)),
                );
                return texto.trim();
            },
            reordenar: (idValor, desde, hasta) => {
                const posiciones = imagenes.flatMap((img, i) => (grupoDe(img) === idValor ? [i] : []));
                const grupo = delGrupo(idValor);
                const [movida] = grupo.splice(desde, 1);
                if (!movida) return;
                grupo.splice(hasta, 0, movida);
                const copia = [...imagenes];
                posiciones.forEach((posicion, i) => {
                    const imagen = grupo[i];
                    if (imagen) copia[posicion] = imagen;
                });
                setImagenes(copia);
            },
            eliminar: (clave) => {
                setImagenes((actuales) => actuales.filter((img) => img.ruta !== clave));
            },
            subir: (rutas, idValor) => {
                setImagenes((actuales) => [
                    ...actuales,
                    ...rutas.map((ruta) => ({ ruta, textoAlternativo: nombre.trim(), idAtributoValor: idValor })),
                ]);
            },
        } satisfies DatosPanelImagenes,
        enviar: formulario.handleSubmit((datos) => {
            setErrorGeneral(null);
            const problema = generador.revisar();
            if (problema) {
                setErrorGeneral(problema);
                return;
            }
            if (imagenes.length > MAXIMO_IMAGENES) {
                setErrorGeneral(`Se admiten hasta ${String(MAXIMO_IMAGENES)} imágenes.`);
                return;
            }
            crear.mutate(datos);
        }),
    };
}
