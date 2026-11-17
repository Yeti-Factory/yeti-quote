param(
    [string]$ConfigPath = "$env:ProgramData\YetiQuote\SageConnector\config.json"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Read-SageField {
    param([object]$Engine, [string]$Name)
    try {
        $value = ""
        $null = $Engine.GetFieldValStr($Name, [ref]$value, 0, 0)
        $text = [string]$value
        if ([string]::IsNullOrWhiteSpace($text)) { return $null }
        return $text.Trim()
    }
    catch {
        return $null
    }
}

function Release-ComObject {
    param([object]$Value)
    if ($null -ne $Value -and [Runtime.InteropServices.Marshal]::IsComObject($Value)) {
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($Value)
    }
}

function Write-ConnectorLog {
    param([string]$Message)
    $logPath = Join-Path (Split-Path -Parent $ConfigPath) "connector.log"
    $line = "{0:s} {1}" -f (Get-Date), $Message
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
}

$application = $null
$document = $null
$engine = $null

try {
    if (-not (Test-Path -LiteralPath $ConfigPath)) {
        throw "Configuration introuvable : $ConfigPath"
    }
    $config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not (Test-Path -LiteralPath $config.sageDataFile)) {
        throw "Dossier Sage introuvable : $($config.sageDataFile)"
    }

    $secureToken = ConvertTo-SecureString ([string]$config.encryptedToken)
    $credential = New-Object System.Management.Automation.PSCredential("token", $secureToken)
    $token = $credential.GetNetworkCredential().Password
    $headers = @{ Authorization = "Bearer $token" }
    $endpoint = "{0}/api/sage-connector" -f ([string]$config.apiBaseUrl).TrimEnd("/")

    $request = Invoke-RestMethod -Uri $endpoint -Headers $headers -Method Get -TimeoutSec 30
    $codes = @($request.codes | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ })
    if ($codes.Count -eq 0) {
        Write-ConnectorLog "Aucun code client Sage à synchroniser."
        exit 0
    }

    $application = New-Object -ComObject CielGestionCommerciale.Application
    $application.UIEnabled = $false
    $document = $application.OpenFile([string]$config.sageDataFile, "", "", 0)
    $engine = $application.CreateEngine(97004)

    $clients = @()
    foreach ($code in $codes) {
        try {
            if (-not $engine.Exist($code)) {
                Write-ConnectorLog "Code client absent de Sage : $code"
                continue
            }
            $null = $engine.Load($code)
            $clients += [ordered]@{
                code = $code
                name = [string]$engine.Name
                billingAddress = [ordered]@{
                    company = Read-SageField $engine "FacSociete"
                    line1 = Read-SageField $engine "FacAdresse1"
                    line2 = Read-SageField $engine "FacAdresse2"
                    line3 = Read-SageField $engine "FacAdresse3"
                    postalCode = Read-SageField $engine "FacCP"
                    city = Read-SageField $engine "FacVille"
                    countryCode = Read-SageField $engine "FacCtyCode"
                    countryName = Read-SageField $engine "FacCtyName"
                }
                deliveryAddress = [ordered]@{
                    company = Read-SageField $engine "LivSociete"
                    line1 = Read-SageField $engine "LivAdresse1"
                    line2 = Read-SageField $engine "LivAdresse2"
                    line3 = Read-SageField $engine "LivAdresse3"
                    postalCode = Read-SageField $engine "LivCP"
                    city = Read-SageField $engine "LivVille"
                    countryCode = Read-SageField $engine "LivCtyCode"
                    countryName = Read-SageField $engine "LivCtyName"
                }
                email = Read-SageField $engine "Email"
                phone = Read-SageField $engine "FacTel"
                mobile = Read-SageField $engine "FacPortable"
                siret = Read-SageField $engine "Siret"
                vatNumber = Read-SageField $engine "NII"
                vatMode = Read-SageField $engine "ModeTVA"
                paymentMethodCode = Read-SageField $engine "ModeRegl"
                paymentMethodLabel = Read-SageField $engine "ModeReglLib"
                paymentTermCode = Read-SageField $engine "CodeEcheance"
                paymentTermLabel = Read-SageField $engine "Echeance"
                representativeCode = Read-SageField $engine "Repre"
                representativeName = Read-SageField $engine "RepreName"
                contact = [ordered]@{
                    title = Read-SageField $engine "TitreCtc"
                    name = Read-SageField $engine "NomCtc"
                    company = Read-SageField $engine "SocieteCtc"
                    role = Read-SageField $engine "FonctionCtc"
                    email = Read-SageField $engine "EmailCtc"
                    phone = Read-SageField $engine "TelCtc"
                    mobile = Read-SageField $engine "PortableCtc"
                }
            }
        }
        catch {
            Write-ConnectorLog "Lecture impossible pour $code : $($_.Exception.Message)"
        }
    }

    $payload = [ordered]@{
        source = [string]$config.sourceName
        syncedAt = (Get-Date).ToUniversalTime().ToString("o")
        clients = $clients
    } | ConvertTo-Json -Depth 8

    $response = Invoke-RestMethod -Uri $endpoint -Headers $headers -Method Post -ContentType "application/json; charset=utf-8" -Body $payload -TimeoutSec 60
    Write-ConnectorLog "Synchronisation terminée : $($response.updated) fiche(s) YetiQuote mise(s) à jour."
}
catch {
    Write-ConnectorLog "ERREUR : $($_.Exception.Message)"
    throw
}
finally {
    Release-ComObject $engine
    Release-ComObject $document
    Release-ComObject $application
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
