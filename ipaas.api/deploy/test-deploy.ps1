$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
& (Join-Path $PSScriptRoot 'test-local-demo.ps1')

$sha = 'a' * 40
$digest = 'sha256:' + ('b' * 64)
$imageId = 'sha256:' + ('c' * 64)
$image = "ghcr.io/owner/ipaas-api@$digest"
$tag = 'ghcr.io/owner/ipaas-api:dev-aaaaaaa'
$metadataPath = [IO.Path]::GetTempFileName()
$names = @('DATABASE_URL', 'NODE_ENV', 'PORT', 'DOCKER_HOST', 'GITHUB_STEP_SUMMARY', 'API_IMAGE', 'API_IMAGE_TAG', 'API_SOURCE_SHA')
$saved = @{}
foreach ($name in $names) { $saved[$name] = [Environment]::GetEnvironmentVariable($name) }

function Assert-True($condition, $message) { if (-not $condition) { throw $message } }
function Start-Sleep { param([int]$Seconds) Assert-True ($Seconds -eq 5) 'Unexpected verification delay' }
function Invoke-WebRequest {
    param([switch]$UseBasicParsing, [string]$Uri, [int]$TimeoutSec)
    if ($global:ApiDeploymentScenario -eq 'endpoint') { throw 'RAW_SECRET endpoint detail' }
    if ($Uri.EndsWith('/health')) { return [pscustomobject]@{StatusCode = 200; Content = '{"status":"ok"}'} }
    if ($Uri.EndsWith('/ready')) { return [pscustomobject]@{StatusCode = 200; Content = '{"status":"ready"}'} }
    throw 'Unexpected endpoint'
}
function docker {
    $command = @($args)
    $global:ApiDeploymentCalls.Add($command)
    $global:LASTEXITCODE = 0
    switch ($command[0]) {
        'context' { if ($global:ApiDeploymentScenario -eq 'remote') { return 'tcp://remote:2375' }; return 'npipe:////./pipe/dockerDesktopLinuxEngine' }
        'info' { return 'linux' }
        'network' { return 'ipaas-network' }
        'ps' { if ($global:ApiDeploymentScenario -eq 'first') { return '' }; return 'existing-api' }
        'pull' { if ($global:ApiDeploymentScenario -eq 'pull') { $global:LASTEXITCODE = 1; return 'RAW_SECRET pull detail' }; return '' }
        'image' {
            if ($command -contains '{{.Id}}') { return $imageId }
            $revision = $sha
            if ($global:ApiDeploymentScenario -eq 'revision') { $revision = 'd' * 40 }
            return (@{'org.opencontainers.image.revision' = $revision} | ConvertTo-Json -Compress)
        }
        'inspect' {
            if ($command -contains '{{json .Config.Labels}}') {
                $project = 'ipaas-api-dev'
                if ($global:ApiDeploymentScenario -eq 'foreign') { $project = 'other-service' }
                return (@{'com.docker.compose.project' = $project; 'com.docker.compose.service' = 'api'; 'io.ipaas.api.source-sha' = $sha; 'io.ipaas.api.image-tag' = $tag} | ConvertTo-Json -Compress)
            }
            if ($command -contains '{{json .NetworkSettings.Networks}}') {
                if ($global:ApiDeploymentScenario -eq 'network') { return '{}' }
                return (@{'ipaas-network' = @{}} | ConvertTo-Json -Compress)
            }
            if ($global:ApiDeploymentScenario -eq 'verify') { return "exited|$imageId|1|$image" }
            return "running|$imageId|0|$image"
        }
        'stop' { return '' }
        'compose' {
            if ($global:ApiDeploymentScenario -eq 'up' -and $command -contains 'up') {
                $global:LASTEXITCODE = 1
                return 'RAW_SECRET compose detail'
            }
            return ''
        }
        default { throw 'Unexpected Docker operation' }
    }
}

try {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $null) }
    $env:DATABASE_URL = 'postgresql://RAW_SECRET@ipaas-postgres:5432/ipaas_platform'
    $env:NODE_ENV = 'production'
    $env:PORT = '3000'
    foreach ($case in @('success', 'first', 'metadata', 'foreign', 'remote', 'pull', 'revision', 'up', 'verify', 'network', 'endpoint')) {
        $global:ApiDeploymentScenario = $case
        $global:ApiDeploymentCalls = New-Object 'System.Collections.Generic.List[object]'
        $source = $sha
        if ($case -eq 'metadata') { $source = 'd' * 40 }
        @{sourceSha = $source; digest = $digest; image = $tag} | ConvertTo-Json | Set-Content -LiteralPath $metadataPath
        $failure = $null
        $deploymentOutput = @()
        try { $deploymentOutput = @(& (Join-Path $PSScriptRoot 'deploy.ps1') -MetadataPath $metadataPath -ExpectedSha $sha -RepositoryOwner 'owner' *>&1) }
        catch { $failure = $_.Exception.Message }
        $success = $case -in @('success', 'first')
        Assert-True (($null -eq $failure) -eq $success) "Unexpected outcome for $case : $failure"
        Assert-True (-not (($deploymentOutput | Out-String).Contains('RAW_SECRET'))) 'Deployment output leaked a secret'
        if ($failure) { Assert-True (-not $failure.Contains('RAW_SECRET')) 'Deployment failure leaked a secret' }

        $stops = @($global:ApiDeploymentCalls | Where-Object { $_[0] -eq 'stop' })
        if ($case -in @('metadata', 'foreign', 'remote', 'pull', 'revision', 'first')) {
            Assert-True ($stops.Count -eq 0) "Unsafe stop in $case"
        }
        foreach ($command in $global:ApiDeploymentCalls) {
            Assert-True (-not ($command -contains 'down' -or $command -contains 'prune' -or $command -contains 'build' -or $command -contains 'kill' -or $command -contains 'rm')) 'Unsafe Docker operation'
            if ($command[0] -eq 'stop') { Assert-True ($command[-1] -eq 'ipaas-api') 'Unrelated container stopped' }
            if ($command[0] -eq 'pull') { Assert-True ($command[1] -eq $image) 'Image pull was not digest-pinned' }
            if ($command[0] -eq 'compose' -and $command -contains 'up') {
                Assert-True ($command -contains '--no-build') 'Deployment attempted to build an image'
                $pullIndex = [Array]::IndexOf($command, '--pull')
                Assert-True ($pullIndex -ge 0 -and $command[$pullIndex + 1] -eq 'never') 'Compose must not repull a mutable tag'
                Assert-True ($command[-1] -eq 'api') 'Compose targeted another service'
            }
        }
        $global:LASTEXITCODE = 0
        Write-Host "Passed API deployment scenario: $case"
    }
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $saved[$name]) }
    Remove-Item -LiteralPath $metadataPath -Force
}
