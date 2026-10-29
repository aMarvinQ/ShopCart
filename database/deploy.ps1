#Requires -Version 5.1
<#
.SYNOPSIS
    Despliega la base de datos ShopCart a partir de scripts SQL numerados.

.DESCRIPTION
    Fases, en este orden:
      bootstrap/        Crea la BD, logins, usuarios, RolApi y el control de versiones.
                        Requiere sysadmin; usa la cuenta Windows actual. Scripts idempotentes.
      migrations/       Estructura (tablas, índices, tipos tabla). Se aplican una sola vez;
                        un script ya aplicado no puede modificarse: se crea uno nuevo.
      programmability/  Funciones, vistas, SPs, triggers y permisos (CREATE OR ALTER).
                        Se vuelven a aplicar cuando cambia su contenido.
      seed/             Datos semilla. Se aplican una sola vez.

    Cada script de migrations/, programmability/ y seed/ se registra en
    Despliegue.VersionEsquema con su checksum SHA-256 mediante stored procedures.

    Las contraseñas se leen de database/.env y se entregan a sqlcmd por variables de
    entorno del proceso (nunca por línea de comandos ni en archivos versionados).

.PARAMETER Bootstrap
    Ejecuta solo la fase bootstrap con la cuenta Windows actual.

.PARAMETER Recrear
    Junto con -Bootstrap: elimina la base de datos ShopCart antes de crearla. Solo desarrollo.

.PARAMETER Probar
    Ejecuta tests/api conectado como shopcart_api (permisos) y tests/integridad conectado
    como shopcart_migrator (restricciones; cada prueba revierte sus datos), tests/calculos
    (funciones y vistas) y tests/procedimientos (SPs ejecutados como un miembro de RolApi).

.EXAMPLE
    .\deploy.ps1 -Bootstrap
    .\deploy.ps1
    .\deploy.ps1 -Probar
#>
[CmdletBinding()]
param(
    [switch]$Bootstrap,
    [switch]$Recrear,
    [switch]$Probar
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$NombreBaseDatos    = 'ShopCart'
$ServidorPorDefecto = 'localhost,14330'
$PatronNombreScript = '^\d{3}_[A-Za-z0-9_]+\.sql$'
$LoginMigrador      = 'shopcart_migrator'
$LoginApi           = 'shopcart_api'

function Import-ArchivoEnv {
    param([Parameter(Mandatory)][string]$Ruta)

    if (-not (Test-Path -LiteralPath $Ruta)) {
        throw "No existe '$Ruta'. Copia .env.example como .env y define las contraseñas."
    }

    $variables = @{}
    $numeroLinea = 0
    foreach ($linea in Get-Content -LiteralPath $Ruta -Encoding UTF8) {
        $numeroLinea++
        $texto = $linea.Trim()
        if ($texto -eq '' -or $texto.StartsWith('#')) { continue }

        $separador = $texto.IndexOf('=')
        if ($separador -lt 1) {
            # No se muestra el contenido de la línea: podría contener una contraseña.
            throw "Línea $numeroLinea inválida en .env: se esperaba CLAVE=valor."
        }
        $variables[$texto.Substring(0, $separador).Trim()] = $texto.Substring($separador + 1).Trim().Trim('"')
    }
    return $variables
}

function Get-ValorRequerido {
    param([hashtable]$Configuracion, [string]$Clave)

    if (-not $Configuracion.ContainsKey($Clave) -or [string]::IsNullOrWhiteSpace($Configuracion[$Clave])) {
        throw "Falta la variable '$Clave' en database/.env."
    }
    return $Configuracion[$Clave]
}

function Assert-Contrasena {
    param([string]$Clave, [string]$Valor)

    if ($Valor.Length -lt 12) { throw "$Clave debe tener al menos 12 caracteres." }
    if ($Valor.Contains("'"))  { throw "$Clave no puede contener comillas simples (')." }
    if ($Valor.Contains('$(')) { throw "$Clave no puede contener la secuencia `$( (reservada por sqlcmd)." }
}

function Invoke-ScriptSql {
    param(
        [Parameter(Mandatory)][string]$Ruta,
        [Parameter(Mandatory)][string]$Servidor,
        [string]$BaseDatos = 'master',
        [string]$Usuario,
        [string]$Contrasena
    )

    # -b: termina con error si falla un lote · -I: QUOTED_IDENTIFIER ON (requerido por índices filtrados)
    # -f 65001: lee el archivo como UTF-8 · -C: confía en el certificado del servidor local
    $argumentos = @('-S', $Servidor, '-d', $BaseDatos, '-b', '-I', '-C', '-f', '65001', '-i', $Ruta)

    if ([string]::IsNullOrEmpty($Usuario)) {
        $argumentos += '-E'
    }
    else {
        $argumentos += @('-U', $Usuario)
        $env:SQLCMDPASSWORD = $Contrasena
    }

    try {
        & sqlcmd @argumentos
        if ($LASTEXITCODE -ne 0) {
            throw "Falló el script '$(Split-Path -Leaf $Ruta)' (código de salida $LASTEXITCODE)."
        }
    }
    finally {
        Remove-Item Env:\SQLCMDPASSWORD -ErrorAction SilentlyContinue
    }
}

function Get-ChecksumScript {
    param([Parameter(Mandatory)][string]$Ruta)

    # Se normaliza el fin de línea para que el checksum no cambie entre Windows y Linux.
    $contenido = [System.IO.File]::ReadAllText($Ruta) -replace "`r`n", "`n"
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($contenido))
        return -join ($bytes | ForEach-Object { $_.ToString('X2') })
    }
    finally {
        $sha256.Dispose()
    }
}

function Get-ScriptsDeCarpeta {
    param([Parameter(Mandatory)][string]$Carpeta)

    $ruta = Join-Path $PSScriptRoot $Carpeta
    if (-not (Test-Path -LiteralPath $ruta)) { return @() }

    $archivos = @(Get-ChildItem -LiteralPath $ruta -Filter '*.sql' -File | Sort-Object Name)
    foreach ($archivo in $archivos) {
        if ($archivo.Name -notmatch $PatronNombreScript) {
            throw "Nombre de script inválido: '$Carpeta/$($archivo.Name)'. Formato esperado: 000_Descripcion.sql"
        }
    }
    return $archivos
}

function Assert-NumeracionUnica {
    param([string[]]$Carpetas)

    $todos = foreach ($carpeta in $Carpetas) { Get-ScriptsDeCarpeta -Carpeta $carpeta }
    $duplicados = @($todos | Group-Object { $_.Name.Substring(0, 3) } | Where-Object Count -gt 1)
    if ($duplicados.Count -gt 0) {
        $detalle = ($duplicados | ForEach-Object { ($_.Group | ForEach-Object Name) -join ', ' }) -join '; '
        throw "Números de script repetidos: $detalle"
    }
}

function New-ConexionMigrador {
    param([string]$Servidor, [string]$Contrasena)

    $constructor = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
    $constructor['Data Source']            = $Servidor
    $constructor['Initial Catalog']        = $NombreBaseDatos
    $constructor['User ID']                = $LoginMigrador
    $constructor['Password']               = $Contrasena
    $constructor['TrustServerCertificate'] = $true
    $constructor['Application Name']       = 'ShopCart.Deploy'

    $conexion = New-Object System.Data.SqlClient.SqlConnection $constructor.ConnectionString
    try {
        $conexion.Open()
    }
    catch {
        $conexion.Dispose()
        throw "No se pudo conectar como $LoginMigrador. ¿Ejecutaste '.\deploy.ps1 -Bootstrap'? Detalle: $($_.Exception.Message)"
    }
    return $conexion
}

function Get-ScriptsAplicados {
    param([Parameter(Mandatory)][System.Data.SqlClient.SqlConnection]$Conexion)

    $comando = $Conexion.CreateCommand()
    $comando.CommandType = [System.Data.CommandType]::StoredProcedure
    $comando.CommandText = 'Despliegue.SP_Despliegue_ObtenerScripts'

    $aplicados = @{}
    $lector = $comando.ExecuteReader()
    try {
        while ($lector.Read()) {
            $aplicados[$lector.GetString(0)] = $lector.GetString(1)
        }
    }
    finally {
        $lector.Dispose()
        $comando.Dispose()
    }
    return $aplicados
}

function Register-Script {
    param(
        [Parameter(Mandatory)][System.Data.SqlClient.SqlConnection]$Conexion,
        [Parameter(Mandatory)][string]$Script,
        [Parameter(Mandatory)][string]$Tipo,
        [Parameter(Mandatory)][string]$Checksum
    )

    $comando = $Conexion.CreateCommand()
    $comando.CommandType = [System.Data.CommandType]::StoredProcedure
    $comando.CommandText = 'Despliegue.SP_Despliegue_RegistrarScript'
    $comando.Parameters.Add('@Script',   [System.Data.SqlDbType]::NVarChar, 260).Value = $Script
    $comando.Parameters.Add('@Tipo',     [System.Data.SqlDbType]::VarChar,  15).Value  = $Tipo
    $comando.Parameters.Add('@Checksum', [System.Data.SqlDbType]::Char,     64).Value  = $Checksum
    try {
        [void]$comando.ExecuteNonQuery()
    }
    finally {
        $comando.Dispose()
    }
}

function Invoke-Fase {
    param(
        [Parameter(Mandatory)][System.Data.SqlClient.SqlConnection]$Conexion,
        [Parameter(Mandatory)][string]$Carpeta,
        [Parameter(Mandatory)][string]$Tipo,
        [Parameter(Mandatory)][bool]$Repetible,
        [Parameter(Mandatory)][string]$Servidor,
        [Parameter(Mandatory)][string]$Contrasena
    )

    Write-Host "Fase $Carpeta"
    $aplicados = Get-ScriptsAplicados -Conexion $Conexion

    foreach ($archivo in @(Get-ScriptsDeCarpeta -Carpeta $Carpeta)) {
        $checksum = Get-ChecksumScript -Ruta $archivo.FullName

        if ($aplicados.ContainsKey($archivo.Name)) {
            if ($aplicados[$archivo.Name] -eq $checksum) {
                Write-Host "  = $($archivo.Name) (sin cambios)"
                continue
            }
            if (-not $Repetible) {
                throw "El script '$Carpeta/$($archivo.Name)' ya fue aplicado y su contenido cambió. " +
                      "Los scripts de $Carpeta son inmutables: crea uno nuevo con el siguiente número."
            }
        }

        Write-Host "  > $($archivo.Name)"
        Invoke-ScriptSql -Ruta $archivo.FullName -Servidor $Servidor -BaseDatos $NombreBaseDatos `
                         -Usuario $LoginMigrador -Contrasena $Contrasena
        Register-Script -Conexion $Conexion -Script $archivo.Name -Tipo $Tipo -Checksum $checksum
    }
}

# --- Inicio -------------------------------------------------------------------------------

if ($Recrear -and -not $Bootstrap) { throw '-Recrear solo puede usarse junto con -Bootstrap.' }
if ($Bootstrap -and $Probar)       { throw 'Usa -Bootstrap y -Probar en ejecuciones separadas.' }
if (-not (Get-Command sqlcmd -ErrorAction SilentlyContinue)) {
    throw 'No se encontró sqlcmd en el PATH. Instala las herramientas de línea de comandos de SQL Server.'
}

$configuracion = Import-ArchivoEnv -Ruta (Join-Path $PSScriptRoot '.env')
$servidor = $ServidorPorDefecto
if ($configuracion.ContainsKey('SQL_SERVER') -and -not [string]::IsNullOrWhiteSpace($configuracion['SQL_SERVER'])) {
    $servidor = $configuracion['SQL_SERVER']
}
Write-Host "Servidor: $servidor · Base de datos: $NombreBaseDatos"

if ($Bootstrap) {
    $contrasenaMigrador = Get-ValorRequerido -Configuracion $configuracion -Clave 'SHOPCART_MIGRATOR_PASSWORD'
    $contrasenaApi      = Get-ValorRequerido -Configuracion $configuracion -Clave 'SHOPCART_API_PASSWORD'
    Assert-Contrasena -Clave 'SHOPCART_MIGRATOR_PASSWORD' -Valor $contrasenaMigrador
    Assert-Contrasena -Clave 'SHOPCART_API_PASSWORD'      -Valor $contrasenaApi

    if ($Recrear) {
        Write-Warning "Se eliminará la base de datos $NombreBaseDatos."
        Invoke-ScriptSql -Ruta (Join-Path $PSScriptRoot 'herramientas\EliminarBaseDatos.sql') -Servidor $servidor
    }

    # sqlcmd toma como variables de script las variables de entorno del proceso.
    $env:SHOPCART_MIGRATOR_PASSWORD = $contrasenaMigrador
    $env:SHOPCART_API_PASSWORD      = $contrasenaApi
    try {
        Write-Host 'Fase bootstrap'
        foreach ($archivo in @(Get-ScriptsDeCarpeta -Carpeta 'bootstrap')) {
            Write-Host "  > $($archivo.Name)"
            Invoke-ScriptSql -Ruta $archivo.FullName -Servidor $servidor
        }
    }
    finally {
        Remove-Item Env:\SHOPCART_MIGRATOR_PASSWORD -ErrorAction SilentlyContinue
        Remove-Item Env:\SHOPCART_API_PASSWORD -ErrorAction SilentlyContinue
    }
    Write-Host 'Bootstrap completado.'
    return
}

if ($Probar) {
    # tests/api: permisos, conectado como la API · tests/integridad: restricciones, como el migrador
    # tests/calculos: resultados de funciones y vistas con datos controlados, como el migrador
    # tests/procedimientos: el migrador prepara los datos y ejecuta cada SP haciéndose pasar por la API
    $suites = @(
        @{ Carpeta = 'tests\api';        Usuario = $LoginApi;      Clave = 'SHOPCART_API_PASSWORD' },
        @{ Carpeta = 'tests\integridad'; Usuario = $LoginMigrador; Clave = 'SHOPCART_MIGRATOR_PASSWORD' },
        @{ Carpeta = 'tests\calculos';   Usuario = $LoginMigrador; Clave = 'SHOPCART_MIGRATOR_PASSWORD' },
        @{ Carpeta = 'tests\procedimientos'; Usuario = $LoginMigrador; Clave = 'SHOPCART_MIGRATOR_PASSWORD' }
    )
    foreach ($suite in $suites) {
        $contrasena = Get-ValorRequerido -Configuracion $configuracion -Clave $suite.Clave
        Write-Host "Pruebas $($suite.Carpeta) (conectado como $($suite.Usuario))"
        foreach ($archivo in @(Get-ScriptsDeCarpeta -Carpeta $suite.Carpeta)) {
            Write-Host "  > $($archivo.Name)"
            Invoke-ScriptSql -Ruta $archivo.FullName -Servidor $servidor -BaseDatos $NombreBaseDatos `
                             -Usuario $suite.Usuario -Contrasena $contrasena
        }
    }
    Write-Host 'Pruebas completadas.'
    return
}

$contrasenaMigrador = Get-ValorRequerido -Configuracion $configuracion -Clave 'SHOPCART_MIGRATOR_PASSWORD'
Assert-NumeracionUnica -Carpetas @('migrations', 'programmability', 'seed')

$conexion = New-ConexionMigrador -Servidor $servidor -Contrasena $contrasenaMigrador
try {
    Invoke-Fase -Conexion $conexion -Carpeta 'migrations'      -Tipo 'MIGRACION'   -Repetible $false -Servidor $servidor -Contrasena $contrasenaMigrador
    Invoke-Fase -Conexion $conexion -Carpeta 'programmability' -Tipo 'PROGRAMABLE' -Repetible $true  -Servidor $servidor -Contrasena $contrasenaMigrador
    Invoke-Fase -Conexion $conexion -Carpeta 'seed'            -Tipo 'SEMILLA'     -Repetible $false -Servidor $servidor -Contrasena $contrasenaMigrador
}
finally {
    $conexion.Dispose()
}
Write-Host 'Despliegue completado.'
