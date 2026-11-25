# install.ps1 - sets up Design Scheduling's helper for THIS Windows user on
# this PC (Phase 4, 2026-11-26). Run it with Install.cmd; Uninstall.cmd runs it
# with -Remove. No administrator rights: everything is under this user.
#
# What it does, and nothing else:
#   1. finds this PC's Stella Systems folder (from OneDrive, else it asks);
#   2. builds StellaHelper.exe from StellaHelper.cs, with the C# compiler that
#      comes with Windows, into %LOCALAPPDATA%\Stella\Design Scheduling helper;
#   3. writes helper.ini beside it (the folder, the browser, the hotkey);
#   4. registers stella-open: links for this user, so the app's Open button
#      reaches the helper;
#   5. starts the hotkey now and at each sign-in.
# -Remove undoes all five.

param([switch]$Remove)
$ErrorActionPreference = 'Stop'

$dest = Join-Path $env:LOCALAPPDATA 'Stella\Design Scheduling helper'
$exe = Join-Path $dest 'StellaHelper.exe'
$protocol = 'HKCU:\Software\Classes\stella-open'
$run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$runName = 'Stella Design Scheduling helper'

function Stop-Helper {
    Get-Process -Name 'StellaHelper' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe } | Stop-Process -Force
    Start-Sleep -Milliseconds 300
}

if ($Remove) {
    Stop-Helper
    if (Test-Path $protocol) { Remove-Item $protocol -Recurse -Force }
    Remove-ItemProperty -Path $run -Name $runName -ErrorAction SilentlyContinue
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    Write-Host 'Removed: the Open in Explorer links and the hotkey are off for you on this PC.'
    Write-Host 'In the app, untick "Open in Explorer is set up on this PC" under the cog.'
    exit 0
}

# ---- 1. Stella Systems on this PC ------------------------------------------
$root = $null
$engines = 'HKCU:\Software\SyncEngines\Providers\OneDrive'
if (Test-Path $engines) {
    $root = Get-ChildItem $engines | ForEach-Object { (Get-ItemProperty $_.PSPath).MountPoint } |
        Where-Object { $_ -and (Split-Path $_ -Leaf) -eq 'Stella Systems' -and (Test-Path $_) } | Select-Object -First 1
}
if (-not $root -and $env:OneDriveCommercial) {
    $guess = Join-Path $env:OneDriveCommercial 'Stella Systems'
    if (Test-Path $guess) { $root = $guess }
}
if (-not $root) {
    Add-Type -AssemblyName System.Windows.Forms
    $pick = New-Object System.Windows.Forms.FolderBrowserDialog
    $pick.Description = 'Choose this PC''s Stella Systems folder'
    if ($pick.ShowDialog() -ne 'OK') { Write-Host 'Nothing set up: no Stella Systems folder chosen.'; exit 1 }
    $root = $pick.SelectedPath
}
if ((Split-Path $root -Leaf) -ne 'Stella Systems') {
    Write-Host "That is $root, not the Stella Systems folder itself. Nothing set up."
    exit 1
}
Write-Host "Stella Systems: $root"

# ---- the browser the hotkey opens: the one links open in -------------------
$browser = ''
$prog = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice' -ErrorAction SilentlyContinue).ProgId
$name = if ($prog -like 'ChromeHTML*') { 'chrome.exe' } elseif ($prog -like 'MSEdgeHTM*') { 'msedge.exe' } else { $null }
if ($name) {
    foreach ($hive in 'HKCU:', 'HKLM:') {
        $p = (Get-ItemProperty "$hive\Software\Microsoft\Windows\CurrentVersion\App Paths\$name" -ErrorAction SilentlyContinue).'(default)'
        if ($p -and (Test-Path $p)) { $browser = $p; break }
    }
}

# ---- the hotkey -----------------------------------------------------------
$hotkey = 'Ctrl+Alt+N'
$typed = Read-Host "Hotkey for a new job [$hotkey] (Enter keeps it)"
if ($typed) { $hotkey = $typed.Trim() }

# ---- 2 and 3. build it, and its settings ----------------------------------
Stop-Helper
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$source = Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot 'StellaHelper.cs')
Add-Type -TypeDefinition $source -Language CSharp -OutputAssembly $exe -OutputType WindowsApplication `
    -ReferencedAssemblies 'System.Windows.Forms', 'System.Drawing'
@(
    '# Design Scheduling helper settings (written by install.ps1).'
    "root=$root"
    "browser=$browser"
    "hotkey=$hotkey"
    'url=https://stellamarinedesign.github.io/design-scheduling/'
) | Set-Content -Encoding UTF8 (Join-Path $dest 'helper.ini')

# ---- 4. stella-open: links, for this user ---------------------------------
New-Item -Path "$protocol\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path $protocol -Name '(default)' -Value 'URL:Design Scheduling folder link'
Set-ItemProperty -Path $protocol -Name 'URL Protocol' -Value ''
Set-ItemProperty -Path "$protocol\shell\open\command" -Name '(default)' -Value "`"$exe`" `"%1`""

# ---- 5. the hotkey, now and at each sign-in --------------------------------
Set-ItemProperty -Path $run -Name $runName -Value "`"$exe`" --hotkey"
Start-Process -FilePath $exe -ArgumentList '--hotkey'

Write-Host ''
Write-Host "Done. $hotkey adds a job from anywhere (its icon is in the system tray)."
Write-Host 'In the app, tick "Open in Explorer is set up on this PC" under the cog.'
Write-Host 'The first time a folder opens, the browser asks: tick "Always allow", then Open.'
