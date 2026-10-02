$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$Shortcut = $WshShell.CreateShortcut("$DesktopPath\Banii mei.lnk")
$TargetDir = $PSScriptRoot
if (-not $TargetDir) { $TargetDir = Get-Location }
$Shortcut.TargetPath = "$TargetDir\BaniiMei.exe"
$Shortcut.WorkingDirectory = "$TargetDir"
$Shortcut.IconLocation = "$TargetDir\app.ico"
$Shortcut.Description = "Banii mei - Aplicație gestiune buget și credite"
$Shortcut.Save()
Write-Host "Scurtătura 'Banii mei' a fost creată pe Desktop!" -ForegroundColor Green

