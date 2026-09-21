[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$MetadataPath,
    [Parameter(Mandatory = $true)][string]$ExpectedSha,
    [Parameter(Mandatory = $true)][string]$RepositoryOwner
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$containerName = 'ipaas-api'
$projectName = 'ipaas-api-dev'
$serviceName = 'api'
$composePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docker-compose.deploy.yml'))

function Invoke-Docker {
    param([string[]]$Arguments, [string]$Operation)

    $tempOut = [IO.Path]::GetTempFileName()
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        try {
            # Windows PowerShell 5.1 treats ordinary native stderr as error records
            # and can corrupt native output captured through 2>&1. Capture the raw
            # streams in a file and use the native exit code as the source of truth.
            $ErrorActionPreference = 'Continue'
            & docker @Arguments *> $tempOut
            $exitCode = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }

        if ($exitCode -ne 0) { throw 'Docker command failed' }

        $raw = Get-Content -LiteralPath $tempOut -Raw -ErrorAction SilentlyContinue
        if (-not $raw) { return '' }

        $normalized = ($raw -replace "`r`n", "`n") -replace "`r", "`n"
        return (($normalized -split "`n" | Where-Object { $_.Trim() -ne '' }) -join [Environment]::NewLine).Trim()
    } catch {
        # Docker output may contain expanded runtime configuration. Never surface it.
        throw "Docker operation failed: $Operation. Check daemon access and deployment configuration."
    } finally {
        Remove-Item -LiteralPath $tempOut -Force -ErrorAction SilentlyContinue
    }
}

function Test-ApiEndpoint {
    param([string]$Path, [string]$ExpectedStatus)
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3000$Path" -TimeoutSec 5
        if ($response.StatusCode -ne 200) { return $false }
        $body = $response.Content | ConvertFrom-Json
        return @($body.PSObject.Properties).Count -eq 1 -and $body.status -ceq $ExpectedStatus
    } catch {
        return $false
    }
}

if ($ExpectedSha -cnotmatch '^[a-f0-9]{40}$') { throw 'Invalid source SHA.' }
$owner = $RepositoryOwner.ToLowerInvariant()
if ($owner -notmatch '^[a-z0-9][a-z0-9-]*$') { throw 'Invalid repository owner.' }
$imageTag = "ghcr.io/$owner/ipaas-api:dev-$($ExpectedSha.Substring(0, 7))"
try {
    $metadata = Get-Content -LiteralPath $MetadataPath -Raw | ConvertFrom-Json
    if ($metadata.sourceSha -cne $ExpectedSha -or $metadata.image -cne $imageTag -or $metadata.digest -cnotmatch '^sha256:[a-f0-9]{64}$') {
        throw 'Mismatch'
    }
} catch { throw 'Image handoff does not match the selected successful CI publication.' }

$env:API_IMAGE = "ghcr.io/$owner/ipaas-api@$($metadata.digest)"
$env:API_IMAGE_TAG = $imageTag
$env:API_SOURCE_SHA = $ExpectedSha
foreach ($name in @('DATABASE_URL', 'NODE_ENV', 'PORT')) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
        throw "Missing deployment setting: $name."
    }
}
if ($env:NODE_ENV -cne 'production' -or $env:PORT -cne '3000') {
    throw 'Invalid API runtime deployment settings.'
}

# Require the local Windows Docker Desktop endpoint and Linux containers.
if ($env:DOCKER_HOST -and $env:DOCKER_HOST -notmatch '^npipe://') { throw 'Deployment requires the local Docker Desktop daemon.' }
$endpoint = Invoke-Docker @('context', 'inspect', '--format', '{{.Endpoints.docker.Host}}') 'inspect local Docker endpoint'
if ($endpoint -notmatch '^npipe://') { throw 'Selected Docker context is not a local Windows named pipe.' }
$os = Invoke-Docker @('info', '--format', '{{.OSType}}') 'inspect container mode'
if ($os -ne 'linux') { throw 'Docker Desktop must run Linux containers.' }
$null = Invoke-Docker @('network', 'inspect', 'ipaas-network', '--format', '{{.Name}}') 'verify shared network'

# An explicit empty env file prevents accidental local .env interpolation.
$emptyEnv = [IO.Path]::GetTempFileName()
try {
    $compose = @('compose', '--project-name', $projectName, '--env-file', $emptyEnv, '-f', $composePath)
    $null = Invoke-Docker ($compose + @('config', '--quiet')) 'validate deployment Compose'
    $existing = Invoke-Docker @('ps', '-a', '--filter', "name=^/$containerName$", '--format', '{{.ID}}') 'find existing service'
    if ($existing) {
        try {
            $labels = (Invoke-Docker @('inspect', '--format', '{{json .Config.Labels}}', $containerName) 'inspect service ownership') | ConvertFrom-Json
            if ($labels.'com.docker.compose.project' -ne $projectName -or $labels.'com.docker.compose.service' -ne $serviceName) { throw 'Foreign container' }
        } catch { throw 'Existing container ownership is not recognized; reconcile it manually before deployment.' }
    }

    $null = Invoke-Docker @('pull', $env:API_IMAGE) 'pull exact published digest'
    $revision = Invoke-Docker @('image', 'inspect', '--format', '{{json .Config.Labels}}', $env:API_IMAGE) 'verify image revision'
    try {
        if (($revision | ConvertFrom-Json).'org.opencontainers.image.revision' -cne $ExpectedSha) { throw 'Mismatch' }
    } catch { throw 'Published image revision does not match the successful CI commit.' }
    $expectedImageId = Invoke-Docker @('image', 'inspect', '--format', '{{.Id}}', $env:API_IMAGE) 'resolve local image identity'
    if ($expectedImageId -cnotmatch '^sha256:[a-f0-9]{64}$') { throw 'Invalid local image identity.' }

    if ($existing) {
        $null = Invoke-Docker @('stop', '--time', '15', $containerName) 'stop existing API container'
    }
    $null = Invoke-Docker ($compose + @('up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--force-recreate', $serviceName)) 'replace API container'

    try {
        $labels = (Invoke-Docker @('inspect', '--format', '{{json .Config.Labels}}', $containerName) 'verify deployment ownership') | ConvertFrom-Json
        if ($labels.'com.docker.compose.project' -ne $projectName -or $labels.'com.docker.compose.service' -ne $serviceName -or $labels.'io.ipaas.api.source-sha' -cne $ExpectedSha -or $labels.'io.ipaas.api.image-tag' -cne $imageTag) {
            throw 'Mismatch'
        }
        $networks = (Invoke-Docker @('inspect', '--format', '{{json .NetworkSettings.Networks}}', $containerName) 'verify service network') | ConvertFrom-Json
        if ($null -eq $networks.'ipaas-network') { throw 'Missing network' }
    } catch { throw 'Deployed container ownership or network verification failed.' }

    $verified = $false
    for ($sample = 0; $sample -lt 6; $sample++) {
        Start-Sleep -Seconds 5
        $state = Invoke-Docker @('inspect', '--format', '{{.State.Status}}|{{.Image}}|{{.RestartCount}}|{{.Config.Image}}', $containerName) 'verify running service'
        $parts = $state.Split('|')
        if ($parts.Count -ne 4 -or $parts[0] -ne 'running' -or $parts[1] -cne $expectedImageId -or $parts[2] -ne '0' -or $parts[3] -cne $env:API_IMAGE) {
            throw 'Deployment verification failed: expected image must remain running without restarts.'
        }
        if ((Test-ApiEndpoint '/health' 'ok') -and (Test-ApiEndpoint '/ready' 'ready')) {
            $verified = $true
            break
        }
    }
    if (-not $verified) { throw 'API health or readiness verification failed without exposing service details.' }

    Write-Host "Verified $containerName running $imageTag at $($metadata.digest)."
    if ($env:GITHUB_STEP_SUMMARY) {
        @("API: $imageTag", "Source: $ExpectedSha", "Digest: $($metadata.digest)", "Container: $containerName", 'URL: http://localhost:3000') |
            Out-File -LiteralPath $env:GITHUB_STEP_SUMMARY -Append -Encoding utf8
    }
} finally {
    Remove-Item -LiteralPath $emptyEnv -Force
}
