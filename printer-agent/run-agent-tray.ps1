param(
  [string]$WorkDir = $PSScriptRoot,
  [string]$Executable = "TalablarAgent.exe"
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$exePath = Join-Path $WorkDir $Executable
if (-not (Test-Path $exePath)) {
  [System.Windows.Forms.MessageBox]::Show(
    "TalablarAgent.exe not found in: $WorkDir",
    "Talablar Agent",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  ) | Out-Null
  exit 1
}

$script:agentProcess = $null

function Start-AgentProcess {
  if ($script:agentProcess -and -not $script:agentProcess.HasExited) {
    return
  }
  $script:agentProcess = Start-Process `
    -FilePath $exePath `
    -WorkingDirectory $WorkDir `
    -WindowStyle Hidden `
    -PassThru
}

function Stop-AgentProcess {
  if (-not $script:agentProcess) {
    return
  }
  try {
    if (-not $script:agentProcess.HasExited) {
      Stop-Process -Id $script:agentProcess.Id -Force
    }
  } catch {
  } finally {
    $script:agentProcess = $null
  }
}

function Restart-AgentProcess {
  Stop-AgentProcess
  Start-Sleep -Milliseconds 300
  Start-AgentProcess
}

function Open-SetupWizard {
  Start-Process `
    -FilePath "cmd.exe" `
    -ArgumentList "/k", "`"$exePath`" --setup" `
    -WorkingDirectory $WorkDir `
    -WindowStyle Normal | Out-Null
}

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = [System.Drawing.SystemIcons]::Application
$notify.Text = "Talablar Printer Agent"
$notify.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$titleItem = $menu.Items.Add("Talablar Printer Agent")
$titleItem.Enabled = $false
[void]$menu.Items.Add("-")
$restartItem = $menu.Items.Add("Restart agent")
$setupItem = $menu.Items.Add("Change token/server")
$openFolderItem = $menu.Items.Add("Open folder")
[void]$menu.Items.Add("-")
$exitItem = $menu.Items.Add("Exit")

$restartItem.Add_Click({
  Restart-AgentProcess
})

$setupItem.Add_Click({
  Open-SetupWizard
})

$openFolderItem.Add_Click({
  Start-Process explorer.exe $WorkDir | Out-Null
})

$appContext = New-Object System.Windows.Forms.ApplicationContext
$exitItem.Add_Click({
  try {
    $timer.Stop()
  } catch {
  }
  Stop-AgentProcess
  $notify.Visible = $false
  $notify.Dispose()
  $menu.Dispose()
  $appContext.ExitThread()
})

$notify.ContextMenuStrip = $menu

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.Add_Tick({
  if ($script:agentProcess -and $script:agentProcess.HasExited) {
    Start-AgentProcess
    $notify.BalloonTipTitle = "Talablar Agent"
    $notify.BalloonTipText = "Agent restarted automatically."
    $notify.ShowBalloonTip(1500)
  }
})

Start-AgentProcess
$notify.BalloonTipTitle = "Talablar Agent"
$notify.BalloonTipText = "Running in system tray."
$notify.ShowBalloonTip(1200)
$timer.Start()

[System.Windows.Forms.Application]::Run($appContext)
