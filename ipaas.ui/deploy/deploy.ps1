[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$MetadataPath,
    [Parameter(Mandatory = $true)][string]$ExpectedSha,
    [Parameter(Mandatory = $true)][string]$RepositoryOwner
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$containerName = 'ipaas-ui'
$projectName = 'ipaas-ui-dev'
$composePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docker-compose.deploy.yml'))

function Invoke-Docker {
    param([string[]]$Arguments, [string]$Operation)
    try {
        $output = @(& docker @Arguments 2>&1)
        if ($LASTEXITCODE -ne 0) { throw 'Docker command failed' }
        return ($output -join [Environment]::NewLine).Trim()
    } catch {
        # Native output may contain configuration. Do not dump it or full inspect output.
        throw "Docker operation failed: $Operation. Check daemon access and deployment configuration."
    }
}

if ($ExpectedSha -cnotmatch '^[a-f0-9]{40}$') { throw 'Invalid source SHA.' }
$owner = $RepositoryOwner.ToLowerInvariant()
if ($owner -notmatch '^[a-z0-9][a-z0-9-]*$') { throw 'Invalid repository owner.' }

try {
    $metadata = Get-Content -LiteralPath $MetadataPath -Raw | ConvertFrom-Json
    if ($metadata.sourceSha -cne $ExpectedSha -or $metadata.digest -cnotmatch '^sha256:[a-f0-9]{64}$') {
        throw 'Mismatch'
    }
} catch { throw 'Image handoff does not match the selected successful CI publication.' }

$env:UI_IMAGE = "ghcr.io/$owner/ipaas-ui@$($metadata.digest)"
$env:UI_IMAGE_TAG = $metadata.image
$env:UI_SOURCE_SHA = $ExpectedSha

# Require the local Windows Docker Desktop endpoint and Linux containers.
if ($env:DOCKER_HOST -and $env:DOCKER_HOST -notmatch '^npipe://') { throw 'Deployment requires the local Docker Desktop daemon.' }
$endpoint = Invoke-Docker @('context', 'inspect', '--format', '{{.Endpoints.docker.Host}}') 'inspect local Docker endpoint'
if ($endpoint -notmatch '^npipe://') { throw 'Selected Docker context is not a local Windows named pipe.' }
$os = Invoke-Docker @('info', '--format', '{{.OSType}}') 'inspect container mode'
if ($os -ne 'linux') { throw 'Docker Desktop must run Linux containers.' }
$null = Invoke-Docker @('network', 'inspect', 'ipaas-network', '--format', '{{.Name}}') 'verify shared network'

# Explicit empty env file prevents accidental local .env interpolation.
$emptyEnv = [IO.Path]::GetTempFileName()
try {
    $compose = @('compose', '--project-name', $projectName, '--env-file', $emptyEnv, '-f', $composePath)
    $null = Invoke-Docker ($compose + @('config', '--quiet')) 'validate deployment Compose'
    $existing = Invoke-Docker @('ps', '-a', '--filter', "name=^/$containerName$", '--format', '{{.ID}}') 'find existing service'
    if ($existing) {
        try {
            $labels = (Invoke-Docker @('inspect', '--format', '{{json .Config.Labels}}', $containerName) 'inspect service ownership') | ConvertFrom-Json
            if ($labels.'com.docker.compose.project' -ne $projectName -or $labels.'com.docker.compose.service' -ne 'ui') { throw 'Foreign container' }
        } catch { throw 'Existing container ownership is not recognized; reconcile it manually before deployment.' }
    }
    $null = Invoke-Docker @('pull', $env:UI_IMAGE) 'pull exact published digest'
    $revision = Invoke-Docker @('image', 'inspect', '--format', '{{json .Config.Labels}}', $env:UI_IMAGE) 'verify image revision'
    try {
        if (($revision | ConvertFrom-Json).'org.opencontainers.image.revision' -cne $ExpectedSha) { throw 'Mismatch' }
    } catch { throw 'Published image revision does not match the successful CI commit.' }
    $expectedImageId = Invoke-Docker @('image', 'inspect', '--format', '{{.Id}}', $env:UI_IMAGE) 'resolve local image identity'
    if ($expectedImageId -cnotmatch '^sha256:[a-f0-9]{64}$') { throw 'Invalid local image identity.' }
    if ($existing) {
        $null = Invoke-Docker @('stop', '--time', '15', $containerName) 'stop existing UI container'
    }
    $null = Invoke-Docker ($compose + @('up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--force-recreate', 'ui')) 'replace UI container'
    for ($sample = 0; $sample -lt 6; $sample++) {
        Start-Sleep -Seconds 5
        $state = Invoke-Docker @('inspect', '--format', '{{.State.Status}}|{{.Image}}|{{.RestartCount}}|{{.Config.Image}}', $containerName) 'verify running service'
        $parts = $state.Split('|')
        if ($parts.Count -ne 4 -or $parts[0] -ne 'running' -or $parts[1] -cne $expectedImageId -or $parts[2] -ne '0' -or $parts[3] -cne $env:UI_IMAGE) {
            throw 'Deployment verification failed: expected image must remain running without restarts. Inspect service status using restricted diagnostics.'
        }
    }
    Write-Host "Verified $containerName running $($env:UI_IMAGE_TAG) at $($metadata.digest)."
    if ($env:GITHUB_STEP_SUMMARY) {
        @("UI: $($env:UI_IMAGE_TAG)", "Source: $ExpectedSha", "Digest: $($metadata.digest)", "Container: $containerName", "URL: http://localhost:8080") | Out-File -LiteralPath $env:GITHUB_STEP_SUMMARY -Append -Encoding utf8
    }
} finally {
    Remove-Item -LiteralPath $emptyEnv -Force
}
