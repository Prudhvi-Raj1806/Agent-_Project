<#
  Creates the Veda shortcuts (with the Veda icon):
    Desktop      "Veda"       starts everything and opens the Veda window
    Start Menu   "Veda", "Stop Veda"
  Optional:
    -StartAtLogin   also starts Veda's services (no window) when you sign in to Windows
    -Remove         deletes every shortcut this script made

  Run:  powershell -ExecutionPolicy Bypass -File launcher\install-shortcuts.ps1
#>
param(
  [switch]$StartAtLogin,
  [switch]$Remove
)

$Root = Split-Path -Parent $PSScriptRoot
$icon = Join-Path $PSScriptRoot 'veda.ico'
$desktop = [Environment]::GetFolderPath('Desktop')
$startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Veda'
$startup = [Environment]::GetFolderPath('Startup')

$shortcuts = @(
  @{ Path = Join-Path $desktop 'Veda.lnk';           Script = 'veda.ps1';      Extra = '';          Window = 1; Label = 'Start Veda' },
  @{ Path = Join-Path $startMenu 'Veda.lnk';         Script = 'veda.ps1';      Extra = '';          Window = 1; Label = 'Start Veda' },
  @{ Path = Join-Path $startMenu 'Stop Veda.lnk';    Script = 'stop-veda.ps1'; Extra = '';          Window = 7; Label = 'Stop Veda' }
)
if ($StartAtLogin) {
  $shortcuts += @{ Path = Join-Path $startup 'Veda services.lnk'; Script = 'veda.ps1'; Extra = ' -NoWindow'; Window = 7; Label = 'Start Veda in the background' }
}

if ($Remove) {
  foreach ($path in @((Join-Path $desktop 'Veda.lnk'), (Join-Path $startup 'Veda services.lnk'))) {
    if (Test-Path $path) { Remove-Item $path -Force; Write-Host "Removed $path" }
  }
  if (Test-Path $startMenu) { Remove-Item $startMenu -Recurse -Force; Write-Host "Removed $startMenu" }
  exit 0
}

New-Item -ItemType Directory -Force -Path $startMenu | Out-Null
$shell = New-Object -ComObject WScript.Shell
foreach ($entry in $shortcuts) {
  $link = $shell.CreateShortcut($entry.Path)
  $link.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $link.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $PSScriptRoot $entry.Script)`"$($entry.Extra)"
  $link.WorkingDirectory = $Root
  $link.IconLocation = $icon
  $link.Description = $entry.Label
  $link.WindowStyle = $entry.Window
  $link.Save()
  Write-Host "Created $($entry.Path)"
}
