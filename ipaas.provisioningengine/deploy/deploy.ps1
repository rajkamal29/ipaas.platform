[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$MetadataPath,
    [Parameter(Mandatory = $true)][string]$ExpectedSha,
    [Parameter(Mandatory = $true)][string]$RepositoryOwner
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$containerName = 'ipaas-provisioning-engine'
$projectName = 'ipaas-provisioning-dev'
$composePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docker-compose.deploy.yml'))

function Invoke-Docker {
    param([string[]]$Arguments, [string]$Operation)
    try {
        $previousErrorActionPreference = $ErrorActionPreference
        try {
            # Windows PowerShell 5.1 surfaces normal native stderr as error records.
            $ErrorActionPreference = 'Continue'
            $output = @(& docker @Arguments 2>&1)
            $exitCode = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }
        if ($exitCode -ne 0) { throw 'Docker command failed' }
        return ($output -join [Environment]::NewLine).Trim()
    } catch {
        # Native output may contain configuration. Do not dump it or full inspect output.
        throw "Docker operation failed: $Operation. Check daemon access and deployment configuration."
    }
}
function Read-Integer {
    param([string]$Name, [int]$Default, [int]$Minimum, [int]$Maximum)
    $raw = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrEmpty($raw)) { return $Default }
    $value = 0
    if ($raw -notmatch '^\d+$' -or -not [int]::TryParse($raw, [ref]$value) -or $value -lt $Minimum -or $value -gt $Maximum) {
        throw "Invalid deployment setting: $Name."
    }
    return $value
}

if ($ExpectedSha -cnotmatch '^[a-f0-9]{40}$') { throw 'Invalid source SHA.' }
$owner = $RepositoryOwner.ToLowerInvariant()
if ($owner -notmatch '^[a-z0-9][a-z0-9-]*$') { throw 'Invalid repository owner.' }
$imageTag = "ghcr.io/$owner/ipaas-provisioning-engine:dev-$($ExpectedSha.Substring(0, 7))"
try {
    $metadata = Get-Content -LiteralPath $MetadataPath -Raw | ConvertFrom-Json
    if ($metadata.sourceSha -cne $ExpectedSha -or $metadata.image -cne $imageTag -or $metadata.digest -cnotmatch '^sha256:[a-f0-9]{64}$') {
        throw 'Mismatch'
    }
} catch { throw 'Image handoff does not match the selected successful CI publication.' }
$env:PROVISIONING_IMAGE = "ghcr.io/$owner/ipaas-provisioning-engine@$($metadata.digest)"
$env:PROVISIONING_IMAGE_TAG = $imageTag
$env:PROVISIONING_SOURCE_SHA = $ExpectedSha
$batch = Read-Integer 'PROVISIONING_POLL_BATCH_SIZE' 10 1 100
$concurrency = Read-Integer 'PROVISIONING_MAX_CONCURRENCY' 5 1 100
# GitHub mode: up to 30s dispatch plus bounded DB operations per item, and claim overhead.
# Keep a 15-minute minimum; increase for large batches/low concurrency.
$grace = [int][Math]::Max(900, [Math]::Ceiling($batch / [double]$concurrency) * 120 + 60)
$env:PROVISIONING_STOP_GRACE_SECONDS = [string]$grace
foreach ($name in @('DATABASE_URL', 'RUNTIME_DATABASE_URL', 'ENCRYPTION_MASTER_KEY', 'RUNTIME_IMAGE_MAPPINGS_JSON', 'PROVISIONING_GITHUB_DISPATCH_TOKEN', 'GITHUB_ACTIONS_OWNER', 'GITHUB_ACTIONS_REPOSITORY')) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) { throw "Missing deployment setting: $name." }
}

# Require the local Windows Docker Desktop endpoint and Linux containers.
if ($env:DOCKER_HOST -and $env:DOCKER_HOST -notmatch '^npipe://') { throw 'Deployment requires the local Docker Desktop daemon.' }
$endpoint = Invoke-Docker @('context', 'inspect', '--format', '{{.Endpoints.docker.Host}}') 'inspect local Docker endpoint'
if ($endpoint -notmatch '^npipe://') { throw 'Selected Docker context is not a local Windows named pipe.' }
$os = Invoke-Docker @('info', '--format', '{{.OSType}}') 'inspect container mode'
if ($os -ne 'linux') { throw 'Docker Desktop must run Linux containers.' }
$null = Invoke-Docker @('network', 'inspect', 'ipaas-network', '--format', '{{.Name}}') 'verify shared network'

# Explicit empty env file prevents accidental local .env interpolation. Secrets stay in process environment.
$emptyEnv = [IO.Path]::GetTempFileName()
try {
    $compose = @('compose', '--project-name', $projectName, '--env-file', $emptyEnv, '-f', $composePath)
    $null = Invoke-Docker ($compose + @('config', '--quiet')) 'validate deployment Compose'
    $existing = Invoke-Docker @('ps', '-a', '--filter', "name=^/$containerName$", '--format', '{{.ID}}') 'find existing service'
    $stopGrace = $grace
    if ($existing) {
        try {
            $labels = (Invoke-Docker @('inspect', '--format', '{{json .Config.Labels}}', $containerName) 'inspect service ownership') | ConvertFrom-Json
            if ($labels.'com.docker.compose.project' -ne $projectName -or $labels.'com.docker.compose.service' -ne 'provisioning-engine') { throw 'Foreign container' }
            $oldGrace = 0
            if (-not [int]::TryParse([string]$labels.'io.ipaas.provisioning.stop-grace-seconds', [ref]$oldGrace) -or $oldGrace -lt 60 -or $oldGrace -gt 13000) { throw 'Invalid previous grace' }
            $stopGrace = [Math]::Max($grace, $oldGrace)
        } catch { throw 'Existing container ownership/grace is not recognized; reconcile it manually before deployment.' }
    }
    $null = Invoke-Docker @('pull', $env:PROVISIONING_IMAGE) 'pull exact published digest'
    $revision = Invoke-Docker @('image', 'inspect', '--format', '{{json .Config.Labels}}', $env:PROVISIONING_IMAGE) 'verify image revision'
    try {
        if (($revision | ConvertFrom-Json).'org.opencontainers.image.revision' -cne $ExpectedSha) { throw 'Mismatch' }
    } catch { throw 'Published image revision does not match the successful CI commit.' }
    $expectedImageId = Invoke-Docker @('image', 'inspect', '--format', '{{.Id}}', $env:PROVISIONING_IMAGE) 'resolve local image identity'
    if ($expectedImageId -cnotmatch '^sha256:[a-f0-9]{64}$') { throw 'Invalid local image identity.' }
    # Validate configuration and shared schema without starting a poller or claiming work.
    $preflight = "try{const{loadConfig}=await import('./dist/config/environment.js');const c=loadConfig();if('SYNC_ENTITY_ID' in process.env||c.runtime.kind!=='github')throw Error();await import('./dist/scripts/verify-schema.js');}catch{process.stderr.write('Deployment preflight failed\n');process.exitCode=1;}"
    $null = Invoke-Docker ($compose + @('run', '--rm', '--no-deps', '--entrypoint', 'node', 'provisioning-engine', '--input-type=module', '-e', $preflight)) 'validate image configuration and shared schema'
    if ($existing) {
        $null = Invoke-Docker @('stop', '--time', [string]$stopGrace, $containerName) 'drain existing Provisioning Engine'
    }
    $null = Invoke-Docker ($compose + @('up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--force-recreate', 'provisioning-engine')) 'replace only Provisioning Engine'
    for ($sample = 0; $sample -lt 6; $sample++) {
        Start-Sleep -Seconds 5
        $state = Invoke-Docker @('inspect', '--format', '{{.State.Status}}|{{.Image}}|{{.RestartCount}}|{{.Config.Image}}', $containerName) 'verify running service'
        $parts = $state.Split('|')
        if ($parts.Count -ne 4 -or $parts[0] -ne 'running' -or $parts[1] -cne $expectedImageId -or $parts[2] -ne '0' -or $parts[3] -cne $env:PROVISIONING_IMAGE) {
            throw 'Deployment verification failed: expected image must remain running without restarts. Inspect service status using restricted diagnostics.'
        }
    }
    Write-Host "Verified $containerName running $imageTag at $($metadata.digest)."
    if ($env:GITHUB_STEP_SUMMARY) {
        @("Provisioning Engine: $imageTag", "Source: $ExpectedSha", "Digest: $($metadata.digest)", "Container: $containerName", "Stop grace: $grace seconds") | Out-File -LiteralPath $env:GITHUB_STEP_SUMMARY -Append -Encoding utf8
    }
} finally {
    Remove-Item -LiteralPath $emptyEnv -Force
}
