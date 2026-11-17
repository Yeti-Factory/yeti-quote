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
        if ([string]::IsNullOrWhiteSpace([string]$value)) { return $null }
        return ([string]$value).Trim()
    }
    catch { return $null }
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
    Add-Content -LiteralPath $logPath -Value ("{0:s} {1}" -f (Get-Date), $Message) -Encoding UTF8
}

function Send-SageResult {
    param([string]$Endpoint, [hashtable]$Headers, [System.Collections.IDictionary]$Payload)
    $body = $Payload | ConvertTo-Json -Depth 8
    Invoke-RestMethod -Uri $Endpoint -Headers $Headers -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $body -TimeoutSec 60 | Out-Null
}

if (-not (Test-Path -LiteralPath $ConfigPath)) { throw "Configuration introuvable : $ConfigPath" }
$config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not (Test-Path -LiteralPath $config.sageDataFile)) {
    throw "Dossier Sage introuvable : $($config.sageDataFile)"
}
$secureToken = ConvertTo-SecureString ([string]$config.encryptedToken)
$credential = New-Object System.Management.Automation.PSCredential("token", $secureToken)
$headers = @{
    Authorization = "Bearer $($credential.GetNetworkCredential().Password)"
    "X-Sage-Connector-Source" = [string]$config.sourceName
}
$endpoint = "{0}/api/sage-connector" -f ([string]$config.apiBaseUrl).TrimEnd("/")

Write-ConnectorLog "Connecteur prêt ; Sage ne sera consulté qu'à la demande."
while ($true) {
    try {
        $response = Invoke-RestMethod -Uri $endpoint -Headers $headers -Method Get -TimeoutSec 30
        $request = $response.request
        if ($null -eq $request) {
            Start-Sleep -Seconds 5
            continue
        }

        $application = $null
        $document = $null
        $engine = $null
        try {
            $code = ([string]$request.code_sage).Trim()
            $application = New-Object -ComObject CielGestionCommerciale.Application
            $application.UIEnabled = $false
            $document = $application.OpenFile([string]$config.sageDataFile, "", "", 0)
            $engine = $application.CreateEngine(97004)
            if (-not $engine.Exist($code)) { throw "Le code client $code n'existe pas dans Sage." }
            $null = $engine.Load($code)

            $sageClient = [ordered]@{
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
            Send-SageResult $endpoint $headers ([ordered]@{
                requestId = [string]$request.id
                source = [string]$config.sourceName
                syncedAt = (Get-Date).ToUniversalTime().ToString("o")
                client = $sageClient
            })
            Write-ConnectorLog "Fiche $code synchronisée à la demande."
        }
        catch {
            Send-SageResult $endpoint $headers ([ordered]@{
                requestId = [string]$request.id
                source = [string]$config.sourceName
                error = $_.Exception.Message
            })
            Write-ConnectorLog "Lecture demandée impossible : $($_.Exception.Message)"
        }
        finally {
            Release-ComObject $engine
            Release-ComObject $document
            Release-ComObject $application
            [GC]::Collect()
            [GC]::WaitForPendingFinalizers()
        }
    }
    catch {
        Write-ConnectorLog "Serveur temporairement inaccessible : $($_.Exception.Message)"
        Start-Sleep -Seconds 10
    }
}
