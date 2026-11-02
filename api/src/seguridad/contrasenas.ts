import argon2 from 'argon2';

/*
    Contraseñas con Argon2id (OWASP). La base nunca recibe la contraseña, solo el hash.
    Parámetros: 64 MiB de memoria, 3 iteraciones, 4 hilos (los de la semilla de demostración).
*/
const OPCIONES = { type: argon2.argon2id, memoryCost: 65_536, timeCost: 3, parallelism: 4 } as const;

export function hashearContrasena(contrasena: string): Promise<string> {
    return argon2.hash(contrasena, OPCIONES);
}

export async function verificarContrasena(hash: string, contrasena: string): Promise<boolean> {
    try {
        return await argon2.verify(hash, contrasena);
    } catch {
        return false; // hash con formato inválido: no coincide
    }
}

/*
    Si el correo no existe, se verifica contra un hash ficticio del mismo costo: el tiempo de
    respuesta no revela qué correos tienen cuenta.
*/
let hashFicticio: Promise<string> | undefined;

export async function verificacionFicticia(contrasena: string): Promise<void> {
    hashFicticio ??= argon2.hash('contrasena-ficticia-para-igualar-tiempos', OPCIONES);
    await verificarContrasena(await hashFicticio, contrasena);
}
