# Start Breeze TTS 2 for Tablefolk's "Breeze" speech engine on Windows:
# HoppouAI's breeze-server (Breeze-TTS-2.cpp, Apache-2.0, Vulkan) with the
# 2.46 GB q4_k-dd2 model, downloaded once into %LOCALAPPDATA%\tablefolk-breeze.
# The model comes from Tablefolk's R2 mirror in 64 MiB parts (checked against
# the SHA-256 in its parts.json), else from Hugging Face.
#
#   powershell -ExecutionPolicy Bypass -File tools\breeze-server.ps1 [-Port 8137] [-DownloadOnly]
# Breeze TTS 2's weights are for research and non-commercial use only
# (BreezeBlue's licence). The same as tools/breeze-server.sh on Linux.
# (Untested on Windows.) About 3 GB of graphics memory; with -TeCpu and a
# breeze-server that has --te-cpu (HoppouAI/Breeze-TTS-2.cpp#17), about 2.1 GB.
param([int]$Port = 8137, [switch]$DownloadOnly, [switch]$TeCpu)
$ErrorActionPreference = "Stop"; $ProgressPreference = "SilentlyContinue"
$Ver = "v0.1.5"; $ModelName = "breeze-tts-2-q4_k-dd2.gguf"
$R2 = @("https://geebr-models.mindroot.io", "https://geebr-models-2.mindroot.io", "https://geebr-models-3.mindroot.io", "https://geebr-models-4.mindroot.io")
$Dir = Join-Path $env:LOCALAPPDATA "tablefolk-breeze"; New-Item -ItemType Directory -Force (Join-Path $Dir "voices") | Out-Null

$BinDir = Join-Path $Dir "breeze-$Ver"
$Bin = Get-ChildItem -Path $BinDir -Recurse -Filter breeze-server.exe -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $Bin) {
  $Zip = "breeze-tts-2-$Ver-windows-x64-vulkan.zip"
  Write-Host "downloading breeze-server $Ver (Windows x64, Vulkan, 74 MB)..."
  Invoke-WebRequest "https://github.com/HoppouAI/Breeze-TTS-2.cpp/releases/download/$Ver/$Zip" -OutFile (Join-Path $Dir $Zip)
  Expand-Archive (Join-Path $Dir $Zip) -DestinationPath $BinDir -Force; Remove-Item (Join-Path $Dir $Zip)
  $Bin = Get-ChildItem -Path $BinDir -Recurse -Filter breeze-server.exe | Select-Object -First 1
}

$Model = Join-Path $Dir $ModelName
if (-not (Test-Path $Model)) {
  try {
    $Man = Invoke-RestMethod "$($R2[0])/breeze-tts-2/$ModelName.parts.json"
    $Parts = Join-Path $Dir "parts"; New-Item -ItemType Directory -Force $Parts | Out-Null
    Write-Host "downloading $ModelName from the Tablefolk mirror ($($Man.parts.Count) parts, 2.46 GB)..."
    # four parts at a time, spread over the four hostnames
    $jobs = @()
    for ($i = 0; $i -lt $Man.parts.Count; $i++) {
      $p = $Man.parts[$i]; $out = Join-Path $Parts $p
      if ((Test-Path $out) -and (Get-Item $out).Length -gt 0) { continue }
      $url = "$($R2[$i % 4])/breeze-tts-2/$p"
      $jobs += Start-Job -ScriptBlock { param($u, $o) $ProgressPreference = "SilentlyContinue"; Invoke-WebRequest $u -OutFile "$o.part"; Move-Item "$o.part" $o -Force } -ArgumentList $url, $out
      if ($jobs.Count -ge 4) { $jobs | Wait-Job | Receive-Job; $jobs = @(); Write-Host -NoNewline "." }
    }
    if ($jobs.Count) { $jobs | Wait-Job | Receive-Job }; Write-Host ""
    $dst = [System.IO.File]::Create("$Model.part")
    foreach ($p in $Man.parts) { $src = [System.IO.File]::OpenRead((Join-Path $Parts $p)); $src.CopyTo($dst); $src.Close() }
    $dst.Close()
    if ((Get-FileHash "$Model.part" -Algorithm SHA256).Hash.ToLower() -ne $Man.sha256) { Remove-Item "$Model.part"; throw "checksum mismatch" }
    Move-Item "$Model.part" $Model; Remove-Item -Recurse $Parts
  } catch {
    Write-Host "mirror failed ($_); downloading from Hugging Face..."
    Invoke-WebRequest "https://huggingface.co/HoppouAI/Breeze-TTS-2.cpp/resolve/main/$ModelName" -OutFile "$Model.part"
    Move-Item "$Model.part" $Model
  }
}
if ($DownloadOnly) { Write-Host "ready: $($Bin.FullName) $Model"; exit 0 }
$SrvArgs = @($Model, "--host", "127.0.0.1", "--port", "$Port", "--cors", "--chunk-max", "40", "--voices-dir", (Join-Path $Dir "voices"))
if ($TeCpu) { $SrvArgs += "--te-cpu" }
Set-Location $Dir
& $Bin.FullName @SrvArgs
