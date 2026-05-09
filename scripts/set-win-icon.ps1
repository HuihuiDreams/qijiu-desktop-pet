param(
  [Parameter(Mandatory = $true)]
  [string]$ExePath,

  [Parameter(Mandatory = $true)]
  [string]$IconPath
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class NativeResource {
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern IntPtr BeginUpdateResource(string pFileName, bool bDeleteExistingResources);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool UpdateResource(IntPtr hUpdate, IntPtr lpType, IntPtr lpName, ushort wLanguage, byte[] lpData, uint cbData);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool EndUpdateResource(IntPtr hUpdate, bool fDiscard);
}
'@

function Read-UInt16LE($bytes, $offset) {
  return [BitConverter]::ToUInt16($bytes, $offset)
}

function Read-UInt32LE($bytes, $offset) {
  return [BitConverter]::ToUInt32($bytes, $offset)
}

function Write-UInt16LE($list, $value) {
  $bytes = [BitConverter]::GetBytes([UInt16]$value)
  $list.AddRange($bytes)
}

function Write-UInt32LE($list, $value) {
  $bytes = [BitConverter]::GetBytes([UInt32]$value)
  $list.AddRange($bytes)
}

if (!(Test-Path -LiteralPath $ExePath)) {
  throw "Executable not found: $ExePath"
}

if (!(Test-Path -LiteralPath $IconPath)) {
  throw "Icon not found: $IconPath"
}

$iconBytes = [System.IO.File]::ReadAllBytes($IconPath)
$reserved = Read-UInt16LE $iconBytes 0
$type = Read-UInt16LE $iconBytes 2
$count = Read-UInt16LE $iconBytes 4

if ($reserved -ne 0 -or $type -ne 1 -or $count -lt 1) {
  throw "Invalid ICO file: $IconPath"
}

$images = @()
for ($i = 0; $i -lt $count; $i++) {
  $entryOffset = 6 + ($i * 16)
  $size = Read-UInt32LE $iconBytes ($entryOffset + 8)
  $imageOffset = Read-UInt32LE $iconBytes ($entryOffset + 12)
  $image = New-Object byte[] $size
  [Array]::Copy($iconBytes, $imageOffset, $image, 0, $size)

  $images += [PSCustomObject]@{
    Width = $iconBytes[$entryOffset]
    Height = $iconBytes[$entryOffset + 1]
    ColorCount = $iconBytes[$entryOffset + 2]
    Reserved = $iconBytes[$entryOffset + 3]
    Planes = Read-UInt16LE $iconBytes ($entryOffset + 4)
    BitCount = Read-UInt16LE $iconBytes ($entryOffset + 6)
    Size = $size
    Id = $i + 1
    Bytes = $image
  }
}

$group = New-Object 'System.Collections.Generic.List[byte]'
Write-UInt16LE $group 0
Write-UInt16LE $group 1
Write-UInt16LE $group $count

foreach ($image in $images) {
  $group.Add([byte]$image.Width)
  $group.Add([byte]$image.Height)
  $group.Add([byte]$image.ColorCount)
  $group.Add([byte]$image.Reserved)
  Write-UInt16LE $group $image.Planes
  Write-UInt16LE $group $image.BitCount
  Write-UInt32LE $group $image.Size
  Write-UInt16LE $group $image.Id
}

$rtIcon = [IntPtr]3
$rtGroupIcon = [IntPtr]14
$mainIconId = [IntPtr]1
$languageNeutral = [UInt16]0

$handle = [NativeResource]::BeginUpdateResource($ExePath, $false)
if ($handle -eq [IntPtr]::Zero) {
  throw "BeginUpdateResource failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
}

$discard = $true
try {
  foreach ($image in $images) {
    $ok = [NativeResource]::UpdateResource(
      $handle,
      $rtIcon,
      [IntPtr]$image.Id,
      $languageNeutral,
      $image.Bytes,
      [UInt32]$image.Bytes.Length
    )

    if (!$ok) {
      throw "UpdateResource RT_ICON failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
    }
  }

  $groupBytes = $group.ToArray()
  $ok = [NativeResource]::UpdateResource(
    $handle,
    $rtGroupIcon,
    $mainIconId,
    $languageNeutral,
    $groupBytes,
    [UInt32]$groupBytes.Length
  )

  if (!$ok) {
    throw "UpdateResource RT_GROUP_ICON failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
  }

  $discard = $false
}
finally {
  $ok = [NativeResource]::EndUpdateResource($handle, $discard)
  if (!$ok) {
    throw "EndUpdateResource failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
  }
}

Write-Host "Updated Windows icon resources: $ExePath"
