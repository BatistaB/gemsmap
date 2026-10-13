# GEMs MAP {{VERSION}} for Windows, started by "Start GEMs MAP (Windows).bat".
# The first start prepares a private environment in runtime\ next to this app\ folder: its own copy of uv (pinned),
# Python {{PYTHON}} and GEMs MAP with its libraries. Nothing is installed elsewhere; delete the folder to remove it.
# Options are passed to gemsmap (for example --port 8766); --setup-only prepares the environment and stops.
$ErrorActionPreference = 'Stop'
$app = $PSScriptRoot
$root = Split-Path -Parent $app
$rt = Join-Path $root 'runtime'
$env:UV_PYTHON_INSTALL_DIR = Join-Path $rt 'python'
$env:UV_CACHE_DIR = Join-Path $rt 'cache'
$env:UV_PYTHON_PREFERENCE = 'only-managed'
$env:UV_PYTHON_DOWNLOADS = 'automatic'
$py = Join-Path $rt 'env\Scripts\python.exe'
$ready = Join-Path $rt 'ready-{{VERSION}}'
$setupOnly = $args -contains '--setup-only'
$rest = @($args | Where-Object { $_ -ne '--setup-only' })

function Fail($why) {
  Write-Host ''
  Write-Host "GEMs MAP could not be prepared: $why" -ForegroundColor Red
  Write-Host 'See README-FIRST.txt (Troubleshooting), or report it with the messages above:'
  Write-Host 'https://github.com/BatistaB/gemsmap/issues'
  exit 1
}

if (-not (Test-Path $ready)) {
  # Windows refuses paths over 260 characters by default, and the Python libraries use up to ~150 inside runtime\
  if ($root.Length -gt 90) {
    Fail ("the path of this folder is too long for Windows ($($root.Length) characters, at most 90):`n  $root`n" +
          "Move the GEMsMAP folder to a shorter place, for example C:\GEMsMAP or your Documents folder, and start again.")
  }
  Write-Host "GEMs MAP {{VERSION}}: first start. Preparing a private environment in:"
  Write-Host "  $rt"
  Write-Host 'This downloads Python and the scientific libraries once (a few hundred MB) and can take a few minutes.'
  Write-Host ''
  # always the pinned uv in runtime\uv: a uv installed elsewhere may be another version, or configured differently
  Write-Host '[1/3] Getting uv {{UV_VERSION}}'
  $uvDir = Join-Path $rt 'uv'
  $uv = Join-Path $uvDir 'uv.exe'
  if (-not (Test-Path $uv)) {
    try {
      [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
      $env:UV_UNMANAGED_INSTALL = $uvDir
      Invoke-RestMethod 'https://astral.sh/uv/{{UV_VERSION}}/install.ps1' | Invoke-Expression
    } catch { Fail "downloading uv failed (check the internet connection): $_" }
    if (-not (Test-Path $uv)) {
      $hit = Get-ChildItem -Path $uvDir -Recurse -Filter 'uv.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($hit) { $uv = $hit.FullName } else { Fail "uv was downloaded but not found in $uvDir" }
    }
  }
  # native programs report progress on stderr: never let that count as a PowerShell error
  $ErrorActionPreference = 'Continue'
  if (Test-Path (Join-Path $rt 'env')) { Remove-Item -Recurse -Force (Join-Path $rt 'env') }
  Write-Host '[2/3] Getting Python {{PYTHON}}'
  & $uv venv --quiet --python {{PYTHON}} (Join-Path $rt 'env')
  if ($LASTEXITCODE -ne 0) { Fail "creating the Python environment failed (uv exit code $LASTEXITCODE)" }
  Write-Host '[3/3] Installing GEMs MAP and its libraries'
  & $uv pip install --quiet --python $py (Join-Path $app '{{WHEEL}}')
  if ($LASTEXITCODE -ne 0) { Fail "installing GEMs MAP failed (uv exit code $LASTEXITCODE; check the internet connection)" }
  Set-Content -Path $ready -Value (Get-Date -Format o)
  Write-Host 'GEMs MAP is installed in this folder.'
}

if ($setupOnly) { Write-Host 'GEMs MAP {{VERSION}} is ready.'; exit 0 }
& $py -m gemsmap @rest
exit $LASTEXITCODE
