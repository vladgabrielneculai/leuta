Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   Banii mei - Construire Windows Native" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Asigurare dependinte native WebView2
$nativeDir = Join-Path $PSScriptRoot "native-libs"
if (!(Test-Path (Join-Path $nativeDir "Microsoft.Web.WebView2.WinForms.dll"))) {
    Write-Host "`n1. Descarcare pachet oficial Microsoft.Web.WebView2..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $nativeDir | Out-Null
    $zipPath = Join-Path $nativeDir "wv2.zip"
    Invoke-WebRequest -Uri "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2" -OutFile $zipPath

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
    foreach ($entry in $zip.Entries) {
        if ($entry.FullName -eq "lib/net462/Microsoft.Web.WebView2.Core.dll") {
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $nativeDir "Microsoft.Web.WebView2.Core.dll"), $true)
        }
        elseif ($entry.FullName -eq "lib/net462/Microsoft.Web.WebView2.WinForms.dll") {
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $nativeDir "Microsoft.Web.WebView2.WinForms.dll"), $true)
        }
        elseif ($entry.FullName -eq "runtimes/win-x64/native/WebView2Loader.dll") {
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $nativeDir "WebView2Loader.dll"), $true)
        }
    }
    $zip.Dispose()
    Remove-Item $zipPath -Force
}

# 2. Copiere DLL-uri native in folderul radacina al aplicatiei (langa BaniiMei.exe)
Copy-Item -Path (Join-Path $nativeDir "Microsoft.Web.WebView2.Core.dll") -Destination $PSScriptRoot -Force
Copy-Item -Path (Join-Path $nativeDir "Microsoft.Web.WebView2.WinForms.dll") -Destination $PSScriptRoot -Force
Copy-Item -Path (Join-Path $nativeDir "WebView2Loader.dll") -Destination $PSScriptRoot -Force

# 3. Construire Next.js production bundle
Write-Host "`n2. Construire Next.js production bundle..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Eroare la construire Next.js!" -ForegroundColor Red
    exit $LASTEXITCODE
}

# 4. Compilare executabil Windows Native BaniiMei.exe
Write-Host "`n3. Compilare executabil Windows Native BaniiMei.exe..." -ForegroundColor Cyan
Stop-Process -Name BaniiMei -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 300

$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$refArgs = "/reference:System.Windows.Forms.dll,System.Drawing.dll,System.dll,`"$PSScriptRoot\Microsoft.Web.WebView2.WinForms.dll`",`"$PSScriptRoot\Microsoft.Web.WebView2.Core.dll`""

& $csc /target:winexe /out:BaniiMei.exe /win32icon:app.ico $refArgs BaniiMei.cs

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[SUCCES] Executabilul nativ BaniiMei.exe a fost generat cu succes!" -ForegroundColor Green
    Write-Host "Aplicatia ruleaza acum 100% nativ in propria sa fereastra Windows (fara Microsoft Edge)." -ForegroundColor Green
    Write-Host "Poti deschide BaniiMei.exe oricand sau poti rula 'npm run shortcut' pentru scurtatura pe Desktop." -ForegroundColor Yellow
} else {
    Write-Host "Eroare la compilare csc.exe!" -ForegroundColor Red
    exit $LASTEXITCODE
}
