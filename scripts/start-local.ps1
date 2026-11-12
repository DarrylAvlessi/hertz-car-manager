$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $projectRoot "logs"
$logPath = Join-Path $logDirectory "startup.log"
$frontendPort = 8443
$backendPort = 3101
$mysqlPort = 3306

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

function Write-StartupLog {
  param([string]$Message)

  Add-Content -Path $logPath -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
}

function Test-PortListening {
  param([int]$Port)

  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $connection = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    $waitHandle = $connection.AsyncWaitHandle
    try {
      if (-not $waitHandle.WaitOne(500)) {
        return $false
      }

      $client.EndConnect($connection)
      return $true
    } finally {
      $waitHandle.Close()
    }
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Test-HttpService {
  param(
    [int]$Port,
    [string]$Path
  )

  $response = $null
  try {
    $request = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$Port$Path")
    $request.Timeout = 2000
    $response = $request.GetResponse()
    return $response.StatusCode -eq [System.Net.HttpStatusCode]::OK
  } catch {
    return $false
  } finally {
    if ($response) {
      $response.Close()
    }
  }
}

function Start-LocalService {
  param(
    [string]$Name,
    [int]$Port,
    [string]$HealthPath,
    [string]$Command,
    [string]$OutputLog,
    [string]$ErrorLog
  )

  if (Test-HttpService -Port $Port -Path $HealthPath) {
    Write-StartupLog "$Name is already available on port $Port."
    return
  }

  if (Test-PortListening -Port $Port) {
    Write-StartupLog "ERROR: port $Port is occupied; $Name was not started."
    return
  }

  Start-Process `
    -FilePath $script:npmPath `
    -ArgumentList $Command `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDirectory $OutputLog) `
    -RedirectStandardError (Join-Path $logDirectory $ErrorLog) | Out-Null

  Write-StartupLog "Starting $Name on port $Port."

  $deadline = (Get-Date).AddSeconds(60)
  while (-not (Test-HttpService -Port $Port -Path $HealthPath) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
  }

  if (-not (Test-HttpService -Port $Port -Path $HealthPath)) {
    throw "$Name did not become available on port $Port within 60 seconds."
  }

  Write-StartupLog "$Name is ready on port $Port."
}

try {
  $npmCommand = Get-Command "npm.cmd" -ErrorAction Stop
  $script:npmPath = $npmCommand.Source

  Start-LocalService `
    -Name "Frontend Vite" `
    -Port $frontendPort `
    -HealthPath "/" `
    -Command "run dev -- --host 127.0.0.1" `
    -OutputLog "frontend.stdout.log" `
    -ErrorLog "frontend.stderr.log"

  $mysqlDeadline = (Get-Date).AddSeconds(30)
  while (-not (Test-PortListening -Port $mysqlPort) -and (Get-Date) -lt $mysqlDeadline) {
    Start-Sleep -Seconds 3
  }

  if (-not (Test-PortListening -Port $mysqlPort)) {
    throw "MySQL is not available after 30 seconds. Start MySQL in Laragon."
  }

  Start-LocalService `
    -Name "API Hertz" `
    -Port $backendPort `
    -HealthPath "/health" `
    -Command "run server:dev" `
    -OutputLog "backend.stdout.log" `
    -ErrorLog "backend.stderr.log"
} catch {
  Write-StartupLog "Startup error: $($_.Exception.Message)"
  exit 1
}
