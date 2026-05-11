param(
  [string]$Path = "dist"
)

$ErrorActionPreference = "Stop"

$resolvedPath = Resolve-Path -LiteralPath $Path -ErrorAction Stop
$item = Get-Item -LiteralPath $resolvedPath

if ($item.PSIsContainer) {
  $files = Get-ChildItem -LiteralPath $item.FullName -Filter "*.exe" -File
} else {
  $files = @($item)
}

if (-not $files -or $files.Count -eq 0) {
  throw "No .exe files found at $($item.FullName). Build the installer first."
}

$failed = @()

foreach ($file in $files) {
  $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
  $subject = if ($signature.SignerCertificate) {
    $signature.SignerCertificate.Subject
  } else {
    "(no signer certificate)"
  }

  Write-Host "File: $($file.FullName)"
  Write-Host "Status: $($signature.Status)"
  Write-Host "Signer: $subject"
  Write-Host ""

  if ($signature.Status -ne "Valid") {
    $failed += $file.FullName
  }
}

if ($failed.Count -gt 0) {
  throw "Unsigned or invalid signatures: $($failed -join ', ')"
}

Write-Host "All installer signatures are valid."
