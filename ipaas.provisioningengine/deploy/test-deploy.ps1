$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
& (Join-Path $PSScriptRoot 'test-local-demo.ps1')
$sha = 'a' * 40
$digest = 'sha256:' + ('b' * 64)
$imageId = 'sha256:' + ('c' * 64)
$image = "ghcr.io/owner/ipaas-provisioning-engine@$digest"
$tag = 'ghcr.io/owner/ipaas-provisioning-engine:dev-aaaaaaa'
$global:DeploymentTestsha = $sha
$global:DeploymentTestimageId = $imageId
$global:DeploymentTestimage = $image
$metadataPath = [IO.Path]::GetTempFileName()
$names = @('DATABASE_URL', 'RUNTIME_DATABASE_URL', 'ENCRYPTION_MASTER_KEY', 'RUNTIME_IMAGE_MAPPINGS_JSON', 'PROVISIONING_GITHUB_DISPATCH_TOKEN', 'GITHUB_ACTIONS_OWNER', 'GITHUB_ACTIONS_REPOSITORY', 'DOCKER_HOST', 'GITHUB_STEP_SUMMARY', 'PROVISIONING_POLL_BATCH_SIZE', 'PROVISIONING_MAX_CONCURRENCY', 'PROVISIONING_IMAGE', 'PROVISIONING_IMAGE_TAG', 'PROVISIONING_SOURCE_SHA', 'PROVISIONING_STOP_GRACE_SECONDS')
$saved = @{}
foreach ($name in $names) { $saved[$name] = [Environment]::GetEnvironmentVariable($name) }

function Assert-True($condition, $message) { if (-not $condition) { throw $message } }
function Start-Sleep { param([int]$Seconds) Assert-True ($Seconds -eq 5) 'Unexpected verification delay' }
function docker {
    $command = @($args)
    $global:DeploymentTestcalls.Add($command)
    $global:LASTEXITCODE = 0
    switch ($command[0]) {
        'context' { if ($global:DeploymentTestscenario -eq 'remote') { return 'tcp://remote:2375' }; return 'npipe:////./pipe/dockerDesktopLinuxEngine' }
        'info' { return 'linux' }
        'network' { return 'ipaas-network' }
        'ps' { if ($global:DeploymentTestscenario -eq 'first') { return '' }; return 'existing-service' }
        'pull' { if ($global:DeploymentTestscenario -eq 'pull') { $global:LASTEXITCODE = 1; return 'RAW_SECRET' }; return '' }
        'image' {
            if ($command -contains '{{.Id}}') { return $global:DeploymentTestimageId }
            return (@{'org.opencontainers.image.revision' = $global:DeploymentTestsha} | ConvertTo-Json -Compress)
        }
        'inspect' {
            if ($command -contains '{{json .Config.Labels}}') {
                $owner = 'ipaas-provisioning-dev'
                if ($global:DeploymentTestscenario -eq 'foreign') { $owner = 'other-platform-service' }
                return (@{'com.docker.compose.project' = $owner; 'com.docker.compose.service' = 'provisioning-engine'; 'io.ipaas.provisioning.stop-grace-seconds' = '1800'} | ConvertTo-Json -Compress)
            }
            if ($global:DeploymentTestscenario -eq 'verify') { return "exited|$global:DeploymentTestimageId|1|$global:DeploymentTestimage" }
            return "running|$global:DeploymentTestimageId|0|$global:DeploymentTestimage"
        }
        'stop' { return '' }
        'compose' {
            if ($command -contains 'up' -and $global:DeploymentTestscenario -in @('native-progress', 'native-failure')) {
                $nativeExit = if ($global:DeploymentTestscenario -eq 'native-failure') { 7 } else { 0 }
                # A real native child reproduces PS 5.1 stderr handling; Write-Error cannot.
                & node -e "process.stdout.write('captured status');process.stderr.write('RAW_SECRET native progress');process.exit($nativeExit)"
                $global:LASTEXITCODE = $LASTEXITCODE
                return
            }
            if (($global:DeploymentTestscenario -eq 'preflight' -and $command -contains 'run') -or ($global:DeploymentTestscenario -eq 'up' -and $command -contains 'up')) {
                $global:LASTEXITCODE = 1; return 'RAW_SECRET'
            }
            return ''
        }
        default { throw 'Unexpected Docker operation' }
    }
}
try {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $null) }
    foreach ($name in @('DATABASE_URL', 'RUNTIME_DATABASE_URL', 'ENCRYPTION_MASTER_KEY', 'RUNTIME_IMAGE_MAPPINGS_JSON', 'PROVISIONING_GITHUB_DISPATCH_TOKEN', 'GITHUB_ACTIONS_OWNER', 'GITHUB_ACTIONS_REPOSITORY')) {
        [Environment]::SetEnvironmentVariable($name, 'test-only')
    }
    foreach ($case in @('success', 'first', 'large', 'pull', 'preflight', 'foreign', 'remote', 'up', 'verify', 'metadata', 'native-progress', 'native-failure')) {
        $global:DeploymentTestscenario = $case
        $global:DeploymentTestcalls = New-Object 'System.Collections.Generic.List[object]'
        $env:PROVISIONING_POLL_BATCH_SIZE = '10'
        $env:PROVISIONING_MAX_CONCURRENCY = '5'
        if ($case -eq 'large') { $env:PROVISIONING_POLL_BATCH_SIZE = '100'; $env:PROVISIONING_MAX_CONCURRENCY = '1' }
        $source = $sha
        if ($case -eq 'metadata') { $source = 'd' * 40 }
        @{sourceSha = $source; digest = $digest; image = $tag} | ConvertTo-Json | Set-Content -LiteralPath $metadataPath
        $failure = $null
        $deploymentOutput = @()
        try { $deploymentOutput = @(& (Join-Path $PSScriptRoot 'deploy.ps1') -MetadataPath $metadataPath -ExpectedSha $sha -RepositoryOwner 'owner' *>&1) }
        catch { $failure = $_.Exception.Message }
        $success = $case -in @('success', 'first', 'large', 'native-progress')
        Assert-True (($null -eq $failure) -eq $success) "Unexpected outcome for $case : $failure"
        Assert-True (-not (($deploymentOutput | Out-String).Contains('RAW_SECRET'))) 'Native output leaked from deployment'
        Assert-True ($ErrorActionPreference -eq 'Stop') 'Error preference was not preserved'
        if ($case -eq 'native-failure') {
            Assert-True ($failure -eq 'Docker operation failed: replace only Provisioning Engine. Check daemon access and deployment configuration.') 'Native nonzero exit did not produce the sanitized failure'
        }
        if ($failure) { Assert-True (-not $failure.Contains('RAW_SECRET')) 'Native diagnostic leaked' }
        $stops = @($global:DeploymentTestcalls | Where-Object { $_[0] -eq 'stop' })
        if ($case -in @('pull', 'preflight', 'foreign', 'remote', 'metadata', 'first')) { Assert-True ($stops.Count -eq 0) "Unsafe stop in $case" }
        if ($case -eq 'success') { Assert-True ($stops[0][2] -eq '1800') 'Previous drain grace was not preserved' }
        if ($case -eq 'large') { Assert-True ($stops[0][2] -eq '12060') 'Large batch drain grace was not computed' }
        $digestPulled = $false
        foreach ($command in $global:DeploymentTestcalls) {
            if ($command[0] -eq 'pull') { $digestPulled = $command[1] -eq $image }
            if ($command[0] -eq 'compose' -and $command -contains 'run') {
                Assert-True (-not ($command -contains '--pull')) 'Compose 2.27 preflight must not use --pull'
                Assert-True $digestPulled 'Exact digest must be pulled before preflight'
                Assert-True ($env:PROVISIONING_IMAGE -eq $image) 'Preflight must use the published digest'
            }
            if ($command[0] -eq 'compose' -and $command -contains 'up') {
                Assert-True ($env:PROVISIONING_IMAGE -eq $image) 'Deployment must use the published digest'
                $pullIndex = [Array]::IndexOf($command, '--pull')
                Assert-True ($pullIndex -ge 0 -and $command[$pullIndex + 1] -eq 'never') 'Compose up must retain --pull never'
            }
            Assert-True (-not ($command -contains 'down' -or $command -contains 'prune' -or $command -contains 'build' -or $command -contains 'kill' -or $command -contains 'rm')) 'Unsafe Docker operation'
            if ($command[0] -eq 'stop') { Assert-True ($command[-1] -eq 'ipaas-provisioning-engine') 'Unrelated container stopped' }
            if ($command[0] -eq 'pull') { Assert-True ($command[1] -eq $image) 'Image pull was not digest-pinned' }
        }
        # Expected native failures have been asserted; do not fail pwsh's CI exit check.
        $global:LASTEXITCODE = 0
        Write-Host "Passed deployment scenario: $case"
    }
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $saved[$name]) }
    Remove-Item -LiteralPath $metadataPath -Force
}
