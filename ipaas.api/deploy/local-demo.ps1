# Temporary local demo: load secrets from the self-hosted runner account.
function Get-RunnerEnvironmentValue {
    param([string]$Name, [string]$Scope)
    [Environment]::GetEnvironmentVariable($Name, $Scope)
}

function Initialize-ApiDeploymentEnvironment {
    $name = 'PLATFORM_RUNTIME_DATABASE_URL'
    $value = $null
    foreach ($scope in @('User', 'Process', 'Machine')) {
        try { $value = Get-RunnerEnvironmentValue $name $scope }
        catch { throw "Cannot read runner-local setting: $name ($scope scope)." }
        if (-not [string]::IsNullOrWhiteSpace($value)) { break }
    }
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Missing runner-local setting: $name. Configure it for the runner account and restart the runner."
    }
    # Keep the secret only in this process and child Docker processes.
    $env:DATABASE_URL = $value
    $env:NODE_ENV = 'production'
    $env:PORT = '3000'
}
