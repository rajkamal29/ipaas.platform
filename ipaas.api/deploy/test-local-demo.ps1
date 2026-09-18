$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'local-demo.ps1')

$targets = @('DATABASE_URL', 'NODE_ENV', 'PORT')
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
    $failure = $null
    try { $output = @(Initialize-ApiDeploymentEnvironment *>&1) }
    catch { $failure = $_.Exception.Message }
    Assert-Demo ($null -ne $failure -and $failure.Contains('PLATFORM_RUNTIME_DATABASE_URL')) 'Missing database setting was not identified'

    foreach ($scope in @('User', 'Process', 'Machine')) {
        $script:demoValues = @{ "$scope/PLATFORM_RUNTIME_DATABASE_URL" = $sentinel }
        $output = @(Initialize-ApiDeploymentEnvironment *>&1)
        Assert-Demo ($output.Count -eq 0) 'Configuration loader emitted a value'
        Assert-Demo ($env:DATABASE_URL -ceq $sentinel) 'Database URL was not mapped'
        Assert-Demo ($env:NODE_ENV -ceq 'production' -and $env:PORT -ceq '3000') 'Runtime defaults are incorrect'
        Write-Host "Passed API local-demo scope: $scope"
    }

    $repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
    $files = @(& git -C $repo ls-files --cached --others --exclude-standard)
    foreach ($relative in $files) {
        $path = Join-Path $repo $relative
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            Assert-Demo (-not [IO.File]::ReadAllText($path).Contains($sentinel)) 'Synthetic secret was persisted in a repository file'
        }
    }
    Write-Host 'Passed API local-demo secret handling'
} finally {
    foreach ($name in $targets) { [Environment]::SetEnvironmentVariable($name, $saved[$name]) }
}
