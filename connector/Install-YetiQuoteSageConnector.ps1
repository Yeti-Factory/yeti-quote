param(
    [string]$ApiBaseUrl = "https://yeti-quote.yeti-lab.fr",
    [string]$SageDataFile = "",
    [securestring]$Token
)

$ErrorActionPreference = "Stop"
$installDirectory = "$env:ProgramData\YetiQuote\SageConnector"
$scriptSource = Join-Path $PSScriptRoot "YetiQuote.SageConnector.ps1"
$scriptDestination = Join-Path $installDirectory "YetiQuote.SageConnector.ps1"
$configPath = Join-Path $installDirectory "config.json"
$taskName = "Synchronisation des clients Sage"
$taskPath = "\YetiQuote\"

function Find-SageMobileDataSource {
    $aliasDirectory = Join-Path $env:ProgramData "Ciel\Applications\Ciel Gestion Commerciale\Compléments utilisateur\Alias"
    if (-not (Test-Path -LiteralPath $aliasDirectory)) { return $null }

    $alias = Get-ChildItem -LiteralPath $aliasDirectory -Filter "*.SgWgcAlias" -File |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if ($null -eq $alias) { return $null }

    $windowsEncoding = [Text.Encoding]::GetEncoding(1252)
    $source = $windowsEncoding.GetString([IO.File]::ReadAllBytes($alias.FullName)).Trim()
    if ($source.StartsWith("!Srv!", [StringComparison]::OrdinalIgnoreCase)) { return $source }
    return $null
}

if (-not (Test-Path -LiteralPath $scriptSource)) {
    throw "Script du connecteur introuvable : $scriptSource"
}
$mobileDataSource = Find-SageMobileDataSource
if ([string]::IsNullOrWhiteSpace($SageDataFile)) {
    $SageDataFile = $mobileDataSource
}
if ([string]::IsNullOrWhiteSpace($SageDataFile)) {
    throw "Aucun dossier Sage local ou hébergé n'a été détecté."
}
if (-not $SageDataFile.StartsWith("!Srv!", [StringComparison]::OrdinalIgnoreCase) -and
    -not (Test-Path -LiteralPath $SageDataFile)) {
    throw "Dossier Sage introuvable : $SageDataFile"
}
if ($null -eq $Token) {
    $Token = Read-Host "Jeton du connecteur configuré dans Coolify" -AsSecureString
}
if ($Token.Length -lt 32) {
    throw "Le jeton doit contenir au moins 32 caractères."
}

New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
Copy-Item -LiteralPath $scriptSource -Destination $scriptDestination -Force

$config = [ordered]@{
    apiBaseUrl = $ApiBaseUrl.TrimEnd("/")
    sageDataFile = $SageDataFile
    sourceName = "$env:COMPUTERNAME / $env:USERNAME"
    encryptedToken = ConvertFrom-SecureString $Token
}
$config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8

$powerShell32 = "$env:WINDIR\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
$arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$scriptDestination`" -ConfigPath `"$configPath`""
$action = New-ScheduledTaskAction -Execute $powerShell32 -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Days 3650) -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $taskName -TaskPath $taskPath -Action $action -Trigger $trigger `
    -Settings $settings -Description "Lecture des fiches clients Sage 50 et synchronisation vers YetiQuote." `
    -Force | Out-Null
Start-ScheduledTask -TaskName $taskName -TaskPath $taskPath

Write-Host "Connecteur installé et prêt. Sage ne sera lu qu'après une demande dans YetiQuote."
Write-Host $(if ($SageDataFile.StartsWith("!Srv!")) { "Source Sage : Données Mobiles." } else { "Source Sage : dossier local." })
Write-Host "Journal : $installDirectory\connector.log"
