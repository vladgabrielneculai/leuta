$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$Shortcut = $WshShell.CreateShortcut("$DesktopPath\Leuța.lnk")
$TargetDir = $PSScriptRoot
if (-not $TargetDir) { $TargetDir = Get-Location }
$Shortcut.TargetPath = "$TargetDir\Leuta.exe"
$Shortcut.WorkingDirectory = "$TargetDir"
$Shortcut.IconLocation = "$TargetDir\app.ico"
$Shortcut.Description = "Leuța - Bugetul tău, ban cu ban"
$Shortcut.Save()
Write-Host "Scurtătura 'Leuța' a fost creată pe Desktop!" -ForegroundColor Green

