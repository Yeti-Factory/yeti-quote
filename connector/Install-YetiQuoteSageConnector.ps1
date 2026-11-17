param(
    [string]$ApiBaseUrl = "https://yeti-quote.yeti-factory.com",
    [string]$SageDataFile = "C:\ProgramData\Ciel\Applications\Ciel Gestion Commerciale\YETI FACTORY\CDMDATA",
    [securestring]$Token
)

$ErrorActionPreference = "Stop"
$installDirectory = "$env:ProgramData\YetiQuote\SageConnector"
$scriptSource = Join-Path $PSScriptRoot "YetiQuote.SageConnector.ps1"
$scriptDestination = Join-Path $installDirectory "YetiQuote.SageConnector.ps1"
$configPath = Join-Path $installDirectory "config.json"
$taskName = "Synchronisation des clients Sage"
$taskPath = "\YetiQuote\"

if (-not (Test-Path -LiteralPath $scriptSource)) {
    throw "Script du connecteur introuvable : $scriptSource"
}
if (-not (Test-Path -LiteralPath $SageDataFile)) {
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
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 5) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 3)

Register-ScheduledTask -TaskName $taskName -TaskPath $taskPath -Action $action -Trigger $trigger `
    -Settings $settings -Description "Lecture des fiches clients Sage 50 et synchronisation vers YetiQuote." `
    -Force | Out-Null

Write-Host "Connecteur installé. Première synchronisation prévue dans moins de deux minutes."
Write-Host "Journal : $installDirectory\connector.log"
