# Start llama.cpp's llama-server with LFM3-1.7B for Tablefolk's endpoint brain
# on Windows (Brain options: "OpenAI-compatible endpoint", base URL
# http://127.0.0.1:8080/v1). Downloads once into %LOCALAPPDATA%\tablefolk-llm:
# ggml-org's official Vulkan build (MIT) and Liquid AI's LFM3-1.7B Q4_K_M GGUF
# (1.1 GB; LFM Open License 1.0, free for organisations under $10M revenue).
#
#   powershell -ExecutionPolicy Bypass -File tools\llama-server.ps1 [-Port 8080] [-DownloadOnly]
# The same as tools/llama-server.sh on Linux and macOS. (Untested on Windows.)
param([int]$Port = 8080, [switch]$DownloadOnly, [string]$Model = "")
$ErrorActionPreference = "Stop"; $ProgressPreference = "SilentlyContinue"
$Ver = "b12015"
$Dir = Join-Path $env:LOCALAPPDATA "tablefolk-llm"; New-Item -ItemType Directory -Force $Dir | Out-Null
$Arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
$BinDir = Join-Path $Dir "llama-$Ver"
$Bin = Get-ChildItem -Path $BinDir -Recurse -Filter llama-server.exe -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $Bin) {
  $Zip = "llama-$Ver-bin-win-vulkan-$Arch.zip"
  Write-Host "downloading llama.cpp $Ver ($Zip)..."
  Invoke-WebRequest "https://github.com/ggml-org/llama.cpp/releases/download/$Ver/$Zip" -OutFile (Join-Path $Dir $Zip)
  Expand-Archive (Join-Path $Dir $Zip) -DestinationPath $BinDir -Force; Remove-Item (Join-Path $Dir $Zip)
  $Bin = Get-ChildItem -Path $BinDir -Recurse -Filter llama-server.exe | Select-Object -First 1
}
if (-not $Model) { $Model = Join-Path $Dir "LFM3-1.7B-Q4_K_M.gguf" }
if (-not (Test-Path $Model)) {
  Write-Host "downloading LFM3-1.7B Q4_K_M (1.1 GB, once)..."
  Invoke-WebRequest "https://huggingface.co/LiquidAI/LFM3-1.7B-GGUF/resolve/main/LFM3-1.7B-Q4_K_M.gguf" -OutFile "$Model.part"
  Move-Item "$Model.part" $Model
}
if ($DownloadOnly) { Write-Host "ready: $($Bin.FullName) $Model"; exit 0 }
Write-Host "llama-server on http://127.0.0.1:$Port/v1 (Tablefolk: Brain options, OpenAI-compatible endpoint)"
& $Bin.FullName -m $Model --alias (([IO.Path]::GetFileNameWithoutExtension($Model)) -replace "-Q[0-9].*","") -ngl 99 -c 8192 --jinja --host 127.0.0.1 --port $Port
