$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'local-demo.ps1')
$required = @('PLATFORM_RUNTIME_DATABASE_URL', 'PLATFORM_ENCRYPTION_MASTER_KEY', 'PROVISIONING_GITHUB_DISPATCH_TOKEN')
$targets = @('DATABASE_URL', 'RUNTIME_DATABASE_URL', 'ENCRYPTION_MASTER_KEY', 'PROVISIONING_GITHUB_DISPATCH_TOKEN', 'RUNTIME_IMAGE_MAPPINGS_JSON', 'LOG_LEVEL', 'PROVISIONING_POLL_INTERVAL_MS', 'PROVISIONING_POLL_BATCH_SIZE', 'PROVISIONING_MAX_CONCURRENCY')
$saved = @{}
foreach ($name in $targets) { $saved[$name] = [Environment]::GetEnvironmentVariable($name) }
$sentinel = 'synthetic-' + [Guid]::NewGuid().ToString('N')
$script:demoValues = @{}
function Get-RunnerEnvironmentValue {
    param([string]$Name, [string]$Scope)
    return $script:demoValues["$Scope/$Name"]
}
function Assert-Demo($condition, $message) { if (-not $condition) { throw $message } }
try {
    foreach ($missing in $required) {
        $script:demoValues = @{}
        foreach ($name in $required) {
            if ($name -ne $missing) { $script:demoValues["User/$name"] = $sentinel }
        }
        $failure = $null
        try { $output = @(Initialize-LocalDemoEnvironment *>&1) }
        catch { $failure = $_.Exception.Message }
        Assert-Demo ($null -ne $failure -and $failure.Contains($missing)) 'Missing setting was not identified'
        Assert-Demo (-not $failure.Contains($sentinel)) 'Secret leaked in failure'
        Write-Host "Passed local-demo missing setting: $missing"
    }
    # Runtime requires host DB, container DB and key, but never a dispatch token.
    $runtimeRequired = @('PLATFORM_DATABASE_URL', 'PLATFORM_RUNTIME_DATABASE_URL', 'PLATFORM_ENCRYPTION_MASTER_KEY')
    foreach ($missing in $runtimeRequired) {
        $script:demoValues = @{}
        foreach ($name in $runtimeRequired) {
            if ($name -ne $missing) { $script:demoValues["User/$name"] = $sentinel }
        }
        $failure = $null
        try { $output = @(Initialize-LocalDemoEnvironment -Mode runtime *>&1) }
        catch { $failure = $_.Exception.Message }
        Assert-Demo ($null -ne $failure -and $failure.Contains($missing)) 'Missing runtime setting was not identified'
        Assert-Demo (-not $failure.Contains($sentinel)) 'Runtime secret leaked in failure'
        Write-Host "Passed runtime-demo missing setting: $missing"
    }
    foreach ($scope in @('User', 'Process', 'Machine')) {
        $script:demoValues = @{}
        foreach ($name in $runtimeRequired) { $script:demoValues["$scope/$name"] = $sentinel }
        $script:demoValues["$scope/PLATFORM_DATABASE_URL"] = $sentinel + '-host'
        $output = @(Initialize-LocalDemoEnvironment -Mode runtime *>&1)
        Assert-Demo ($output.Count -eq 0) 'Runtime loader emitted values'
        Assert-Demo ($env:DATABASE_URL -eq ($sentinel + '-host') -and $env:RUNTIME_DATABASE_URL -eq $sentinel -and $env:ENCRYPTION_MASTER_KEY -eq $sentinel) 'Runtime database distinction or scope fallback failed'
        Write-Host "Passed runtime-demo scope without dispatch token: $scope"
    }
    foreach ($selectedScope in @('User', 'Process', 'Machine')) {
        $script:demoValues = @{}
        foreach ($name in $required) {
            $script:demoValues["$selectedScope/$name"] = $sentinel
            if ($selectedScope -eq 'User') { $script:demoValues["Process/$name"] = 'lower-priority' }
        }
        $output = @(Initialize-LocalDemoEnvironment *>&1)
        Assert-Demo ($output.Count -eq 0) 'Configuration loader must not emit values'
        Assert-Demo ($env:DATABASE_URL -eq $sentinel -and $env:RUNTIME_DATABASE_URL -eq $sentinel -and $env:ENCRYPTION_MASTER_KEY -eq $sentinel -and $env:PROVISIONING_GITHUB_DISPATCH_TOKEN -eq $sentinel) 'Secret mapping or scope priority failed'
        Write-Host "Passed local-demo scope: $selectedScope"
    }
    # Regression: backslash-escaped quotes are literal in a single-quoted PowerShell string.
    $output = @(Initialize-LocalDemoEnvironment -Mode deployment *>&1)
    Assert-Demo ($output.Count -eq 0) 'Deployment initialization must not emit values'
    try { $catalogue = ConvertFrom-Json -InputObject $env:RUNTIME_IMAGE_MAPPINGS_JSON -ErrorAction Stop }
    catch { throw 'Deployment catalogue must be valid JSON without literal quote escapes' }
    Assert-Demo (@($catalogue).Count -eq 1) 'Expected exactly one demo mapping'
    $expectedMapping = @{source = 'connectwise'; target = 'keka'; registry = 'GHCR'; repository = 'rajkamal29/ipaas-orchestration-engine'; tag = 'dev-latest'}
    Assert-Demo (@($catalogue[0].PSObject.Properties).Count -eq $expectedMapping.Count) 'Unexpected demo mapping fields'
    foreach ($field in $expectedMapping.Keys) {
        Assert-Demo ($catalogue[0].$field -ceq $expectedMapping[$field]) "Incorrect demo mapping field: $field"
    }
    Write-Host 'Passed deployment catalogue JSON parsing and exact mapping'
    Assert-Demo ($env:LOG_LEVEL -eq 'info' -and $env:PROVISIONING_POLL_INTERVAL_MS -eq '120000' -and $env:PROVISIONING_POLL_BATCH_SIZE -eq '10' -and $env:PROVISIONING_MAX_CONCURRENCY -eq '5') 'Unexpected demo defaults'
    # Exercise the application's actual parser and resolver, not a duplicate URL algorithm.
    Push-Location (Join-Path $PSScriptRoot '..')
    try {
        & node --input-type=module -e "import {loadRuntimeImageMappings} from './dist/config/runtime-images.js'; import {ConfigurationRuntimeImageResolver} from './dist/infrastructure/runtime-images/configuration-runtime-image-resolver.js'; const r=new ConfigurationRuntimeImageResolver(loadRuntimeImageMappings(process.env.RUNTIME_IMAGE_MAPPINGS_JSON)); if(r.resolve('connectwise','keka')!=='ghcr.io/rajkamal29/ipaas-orchestration-engine:dev-latest')process.exit(1);"
        Assert-Demo ($LASTEXITCODE -eq 0) 'Demo mapping failed actual runtime resolution'
        # Validate the full compiled configuration with synthetic child-process values only.
        & node --input-type=module -e "process.env.DATABASE_URL='postgresql://synthetic:synthetic@localhost:5432/synthetic';process.env.RUNTIME_DATABASE_URL=process.env.DATABASE_URL;process.env.ENCRYPTION_MASTER_KEY=Buffer.alloc(32).toString('base64');process.env.RUNTIME_PROVIDER='github';process.env.GITHUB_ACTIONS_OWNER='owner';process.env.GITHUB_ACTIONS_REPOSITORY='repo';process.env.GITHUB_ACTIONS_WORKFLOW='provision-runtime.yml';process.env.GITHUB_ACTIONS_REF='dev';process.env.GITHUB_ACTIONS_API_BASE_URL='https://api.github.com';process.env.GITHUB_TOKEN='synthetic-dispatch-token';delete process.env.SYNC_ENTITY_ID;import('./dist/config/environment.js').then(m=>{m.loadConfig();console.log('CONFIG OK')}).catch(()=>{console.error('Synthetic config validation failed');process.exit(1)});"
        Assert-Demo ($LASTEXITCODE -eq 0) 'Compiled configuration rejected helper-generated catalogue'

    } finally { Pop-Location }
    $workflowPath = Join-Path $PSScriptRoot '../../.github/workflows/provision-runtime.yml'
    $workflow = Get-Content -LiteralPath $workflowPath -Raw
    foreach ($binding in @('SYNC_ENTITY_ID: ${{ inputs.sync_entity_id }}', 'EXPECTED_RUNTIME_IMAGE: ${{ inputs.image_reference }}', 'RUNTIME_PROVIDER: docker', 'DOCKER_NETWORK: ipaas-network', 'Initialize-LocalDemoEnvironment -Mode runtime')) {
        Assert-Demo ($workflow.Contains($binding)) 'Runtime workflow lost a required binding'
    }
    Assert-Demo (-not $workflow.Contains('${{ secrets.') -and -not $workflow.Contains('${{ vars.')) 'Runtime workflow still requires repository configuration'
    Write-Host 'Passed runtime workflow identity, image, provider, network and local-loading bindings'
    $repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
    $files = @(& git -C $repo ls-files --cached --others --exclude-standard)
    foreach ($relative in $files) {
        $path = Join-Path $repo $relative
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            Assert-Demo (-not [IO.File]::ReadAllText($path).Contains($sentinel)) 'Synthetic secret was persisted in a repository file'
        }
    }
    Write-Host 'Passed local-demo defaults, actual image resolution and no secret persistence'
} finally {
    foreach ($name in $targets) { [Environment]::SetEnvironmentVariable($name, $saved[$name]) }
}
