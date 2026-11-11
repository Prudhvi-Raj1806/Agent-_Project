<#
  Stops Veda's production server and the Kokoro voice, and closes the Veda window.

  Processes are found by their command line, not by port (Windows doesn't report
  who owns a listening port to a normal user), and only ones that point into
  THIS project are touched, so unrelated programs are never stopped.
#>
$Root = Split-Path -Parent $PSScriptRoot
$rootLower = $Root.ToLowerInvariant()
$kokoroDir = (Join-Path $Root 'services\kokoro').ToLowerInvariant()
$windowProfile = (Join-Path $env:LOCALAPPDATA 'Veda\window-profile').ToLowerInvariant()

$all = @(Get-CimInstance Win32_Process)
$byId = @{}
foreach ($process in $all) { $byId[[int]$process.ProcessId] = $process }

function Get-Line($process) { if ($process.CommandLine) { $process.CommandLine.ToLowerInvariant() } else { '' } }
function Stop-Tree([int]$ProcessId) { & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null }

# `npm run start` runs: npm -> cmd /c "next start" -> node next. Walk up to the top of that
# wrapper chain so the whole chain stops together, but never past it (never the user's terminal).
function Get-WrapperTop($process) {
  $top = [int]$process.ProcessId
  $parentId = [int]$process.ParentProcessId
  while ($byId.ContainsKey($parentId)) {
    $parent = $byId[$parentId]
    $line = Get-Line $parent
    $isWrapper = ($line -match 'npm-cli\.js"?\s+run\s+start') -or ($line -match 'cmd(\.exe)?"?\s+/d\s+/s\s+/c\s+"?next\s+start')
    if (-not $isWrapper) { break }
    $top = [int]$parent.ProcessId
    $parentId = [int]$parent.ParentProcessId
  }
  return $top
}

# 1. The production server: `next start` running from this project.
$servers = @($all | Where-Object {
  $_.Name -eq 'node.exe' -and (Get-Line $_).Contains($rootLower) -and ((Get-Line $_) -match 'next"?\s+start')
})
if ($servers.Count -eq 0) { Write-Host '[Veda] The Veda server was not running.' }
foreach ($server in $servers) { Stop-Tree (Get-WrapperTop $server); Write-Host '[Veda] Stopped the Veda server.' }

# 2. Kokoro: the launcher and its python, both running this project's server.py.
$kokoro = @($all | Where-Object {
  ($_.Name -eq 'python.exe' -or $_.Name -eq 'uv.exe') -and (Get-Line $_).Contains($kokoroDir) -and (Get-Line $_).Contains('server.py')
})
if ($kokoro.Count -eq 0) { Write-Host '[Veda] The Kokoro voice was not running.' }
else {
  foreach ($process in $kokoro) { Stop-Tree ([int]$process.ProcessId) }
  Write-Host '[Veda] Stopped the Kokoro voice.'
}

# 3. The Veda app window: the browser started with Veda's own profile folder.
$windows = @($all | Where-Object {
  ($_.Name -eq 'msedge.exe' -or $_.Name -eq 'chrome.exe') -and (Get-Line $_).Contains($windowProfile)
})
foreach ($window in $windows) { Stop-Tree ([int]$window.ProcessId) }
if ($windows.Count -gt 0) { Write-Host '[Veda] Closed the Veda window.' }
