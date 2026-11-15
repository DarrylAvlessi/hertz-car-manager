$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $projectRoot "logs"
$logPath = Join-Path $logDirectory "startup.log"
$frontendPort = 8443
$backendPort = 3101
$mysqlPort = 3306
$serverEnvPath = Join-Path $projectRoot "server\.env"

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

function Write-StartupLog {
  param([string]$Message)

  Add-Content -Path $logPath -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
}

if (Test-Path $serverEnvPath) {
  $dbPortSetting = Get-Content $serverEnvPath |
    Where-Object { $_ -match '^\s*DB_PORT\s*=' } |
    Select-Object -Last 1

  if ($dbPortSetting) {
    if ($dbPortSetting -notmatch '^\s*DB_PORT\s*=\s*"?(\d+)"?\s*(?:#.*)?$') {
      throw "DB_PORT in server/.env must be a valid port number."
    }

    $mysqlPort = [int]$matches[1]
    if ($mysqlPort -lt 1 -or $mysqlPort -gt 65535) {
      throw "DB_PORT in server/.env must be between 1 and 65535."
    }
  }
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

  $nextMysqlLog = [DateTime]::MinValue
  while ($true) {
    try {
      if (-not (Test-HttpService -Port $frontendPort -Path "/")) {
        Start-LocalService `
          -Name "Frontend Vite" `
          -Port $frontendPort `
          -HealthPath "/" `
          -Command "run dev -- --host 127.0.0.1" `
          -OutputLog "frontend.stdout.log" `
          -ErrorLog "frontend.stderr.log"
      }

      if (Test-PortListening -Port $mysqlPort) {
        if ($nextMysqlLog -ne [DateTime]::MinValue) {
          Write-StartupLog "MySQL is available on port $mysqlPort."
          $nextMysqlLog = [DateTime]::MinValue
        }

        if (-not (Test-HttpService -Port $backendPort -Path "/health")) {
          Start-LocalService `
            -Name "API Hertz" `
            -Port $backendPort `
            -HealthPath "/health" `
            -Command "run server:dev" `
            -OutputLog "backend.stdout.log" `
            -ErrorLog "backend.stderr.log"
        }
      } elseif ((Get-Date) -ge $nextMysqlLog) {
        Write-StartupLog "Waiting for MySQL on port $mysqlPort before starting the API."
        $nextMysqlLog = (Get-Date).AddSeconds(30)
      }
    } catch {
      Write-StartupLog "Service supervision error: $($_.Exception.Message)"
    }

    Start-Sleep -Seconds 10
  }
} catch {
  Write-StartupLog "Startup error: $($_.Exception.Message)"
  exit 1
}
