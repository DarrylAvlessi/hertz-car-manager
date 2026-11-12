$ErrorActionPreference = "Stop"

$launcherPath = Join-Path $PSScriptRoot "start-local.ps1"
$taskName = "Hertz Car Manager Local"
$powershellPath = Join-Path $PSHOME "powershell.exe"
$userIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcherPath`""

$action = New-ScheduledTaskAction -Execute $powershellPath -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userIdentity
$principal = New-ScheduledTaskPrincipal `
  -UserId $userIdentity `
  -LogonType Interactive `
  -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RestartCount 60 `
  -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description "Starts the local Hertz Car Manager frontend and API when the user signs in." `
  -Force | Out-Null

Write-Output "Automatic startup task registered for $userIdentity."
Write-Output "Starting the services now..."
& $launcherPath
