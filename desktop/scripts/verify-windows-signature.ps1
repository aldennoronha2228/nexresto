param(
    [Parameter(Mandatory = $false)]
    [string]$Path = "./dist",

    [Parameter(Mandatory = $false)]
    [string]$ExpectedPublisher = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-InstallerPath {
    param([string]$InputPath)

    if (-not (Test-Path -LiteralPath $InputPath)) {
        throw "Path not found: $InputPath"
    }

    $item = Get-Item -LiteralPath $InputPath
    if (-not $item.PSIsContainer) {
        if ($item.Extension -ieq ".exe") {
            return $item.FullName
        }
        throw "Provided file is not an .exe: $($item.FullName)"
    }

    $exe = Get-ChildItem -LiteralPath $item.FullName -File -Filter "*.exe" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if (-not $exe) {
        throw "No .exe installers found in directory: $($item.FullName)"
    }

    return $exe.FullName
}

$installerPath = Resolve-InstallerPath -InputPath $Path
Write-Host "Verifying Authenticode signature: $installerPath"

$signature = Get-AuthenticodeSignature -FilePath $installerPath
if ($signature.Status -ne "Valid") {
    throw "Signature verification failed. Status: $($signature.Status); Message: $($signature.StatusMessage)"
}

$subject = "$($signature.SignerCertificate.Subject)"
if (-not [string]::IsNullOrWhiteSpace($ExpectedPublisher)) {
    if ($subject -notmatch [regex]::Escape($ExpectedPublisher)) {
        throw "Signature publisher mismatch. Expected to contain '$ExpectedPublisher' but got '$subject'"
    }
}

Write-Host "Signature is valid. Publisher: $subject"
