# Temporary local demo only. Remove this helper when restoring GitHub configuration.
function Get-RunnerEnvironmentValue {
    param([string]$Name, [string]$Scope)
    [Environment]::GetEnvironmentVariable($Name, $Scope)
}

function Initialize-LocalDemoEnvironment {
    param([ValidateSet('deployment', 'runtime')][string]$Mode = 'deployment')
    $values = @{}
    $required = @('PLATFORM_RUNTIME_DATABASE_URL', 'PLATFORM_ENCRYPTION_MASTER_KEY')
    if ($Mode -eq 'runtime') { $required += 'PLATFORM_DATABASE_URL' }
    else { $required += 'PROVISIONING_GITHUB_DISPATCH_TOKEN' }
    foreach ($name in $required) {
        $value = $null
        foreach ($scope in @('User', 'Process', 'Machine')) {
            try { $value = Get-RunnerEnvironmentValue $name $scope }
            catch { throw "Cannot read runner-local setting: $name ($scope scope)." }
            if (-not [string]::IsNullOrWhiteSpace($value)) { break }
        }
        if ([string]::IsNullOrWhiteSpace($value)) {
            throw "Missing runner-local setting: $name. Configure it for the runner account and restart the runner."
        }
        $values[$name] = $value
    }
    # Keep values only in this process and child Docker processes; never persist or print them.
    if ($Mode -eq 'runtime') { $env:DATABASE_URL = $values['PLATFORM_DATABASE_URL'] }
    else { $env:DATABASE_URL = $values['PLATFORM_RUNTIME_DATABASE_URL'] }
    $env:RUNTIME_DATABASE_URL = $values['PLATFORM_RUNTIME_DATABASE_URL']
    $env:ENCRYPTION_MASTER_KEY = $values['PLATFORM_ENCRYPTION_MASTER_KEY']
    if ($Mode -eq 'deployment') {
        $env:PROVISIONING_GITHUB_DISPATCH_TOKEN = $values['PROVISIONING_GITHUB_DISPATCH_TOKEN']
    }
    $env:RUNTIME_IMAGE_MAPPINGS_JSON = '[{"source":"connectwise","target":"keka","registry":"GHCR","repository":"rajkamal29/ipaas-orchestration-engine","tag":"dev-latest"}]'
    $env:LOG_LEVEL = 'info'
    $env:PROVISIONING_POLL_INTERVAL_MS = '60000'
    $env:PROVISIONING_POLL_BATCH_SIZE = '10'
    $env:PROVISIONING_MAX_CONCURRENCY = '5'
}
