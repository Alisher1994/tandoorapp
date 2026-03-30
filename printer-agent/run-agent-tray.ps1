param(
  [string]$WorkDir = $PSScriptRoot,
  [string]$Executable = "TalablarAgent.exe"
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Normalize-PathString {
  param([string]$Value)
  $text = [string]$Value
  if ([string]::IsNullOrWhiteSpace($text)) { return "" }
  $text = $text.Trim().Trim("'").Trim('"').Trim()
  if ($text.Length -gt 3) {
    $text = $text.TrimEnd('\')
  }
  return $text
}

function Resolve-AgentLocation {
  param(
    [string]$RequestedDir,
    [string]$ScriptDir,
    [string]$ExeName
  )

  $candidateDirs = [System.Collections.Generic.List[string]]::new()
  if ($RequestedDir) { [void]$candidateDirs.Add($RequestedDir) }
  if ($ScriptDir) { [void]$candidateDirs.Add($ScriptDir) }
  if ($ScriptDir) { [void]$candidateDirs.Add((Join-Path $ScriptDir "dist")) }
  if ($RequestedDir) { [void]$candidateDirs.Add((Join-Path $RequestedDir "dist")) }

  foreach ($dir in ($candidateDirs | Select-Object -Unique)) {
    if (-not $dir) { continue }
    try {
      $candidateExe = Join-Path $dir $ExeName
      if (Test-Path $candidateExe) {
        return @{
          WorkDir = $dir
          ExePath = $candidateExe
        }
      }
    } catch {
    }
  }

  return @{
    WorkDir = $null
    ExePath = $null
    Searched = ($candidateDirs | Select-Object -Unique) -join "; "
  }
}

function Read-EnvSettings {
  param([string]$EnvPath)
  $settings = @{
    SERVER_URL = ''
    AGENT_TOKEN = ''
  }
  if (-not (Test-Path $EnvPath)) {
    return $settings
  }

  foreach ($line in Get-Content $EnvPath -ErrorAction SilentlyContinue) {
    $raw = [string]$line
    if ([string]::IsNullOrWhiteSpace($raw)) { continue }
    if ($raw.TrimStart().StartsWith('#')) { continue }
    $parts = $raw.Split('=', 2)
    if ($parts.Length -ne 2) { continue }
    $key = $parts[0].Trim()
    $value = $parts[1].Trim()
    if ($settings.ContainsKey($key)) {
      $settings[$key] = $value
    }
  }

  return $settings
}

function Has-RequiredSettings {
  param([hashtable]$Settings)
  if (-not $Settings) { return $false }
  $server = [string]$Settings.SERVER_URL
  $token = [string]$Settings.AGENT_TOKEN
  return (-not [string]::IsNullOrWhiteSpace($server)) -and (-not [string]::IsNullOrWhiteSpace($token))
}

function Write-EnvSettings {
  param(
    [string]$EnvPath,
    [hashtable]$Settings
  )
  $lines = @(
    "SERVER_URL=$($Settings.SERVER_URL)",
    "AGENT_TOKEN=$($Settings.AGENT_TOKEN)"
  )
  Set-Content -Path $EnvPath -Value ($lines -join [Environment]::NewLine) -Encoding UTF8
}

function Show-ErrorMessage {
  param([string]$Message)
  [System.Windows.Forms.MessageBox]::Show(
    $Message,
    "Talablar Agent",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  ) | Out-Null
}

function Show-InfoMessage {
  param([string]$Message)
  [System.Windows.Forms.MessageBox]::Show(
    $Message,
    "Talablar Agent",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Information
  ) | Out-Null
}

$resolved = Resolve-AgentLocation `
  -RequestedDir (Normalize-PathString $WorkDir) `
  -ScriptDir (Normalize-PathString $PSScriptRoot) `
  -ExeName $Executable

if (-not $resolved.ExePath) {
  Show-ErrorMessage "TalablarAgent.exe не найден. Проверено: $($resolved.Searched)"
  exit 1
}

$WorkDir = $resolved.WorkDir
$exePath = $resolved.ExePath
$envPath = Join-Path $WorkDir '.env'
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

function Show-SettingsDialog {
  $settings = Read-EnvSettings -EnvPath $envPath

  $form = New-Object System.Windows.Forms.Form
  $form.Text = "Talablar Agent - Настройки"
  $form.Size = New-Object System.Drawing.Size(600, 260)
  $form.StartPosition = "CenterScreen"
  $form.FormBorderStyle = "FixedDialog"
  $form.MaximizeBox = $false
  $form.MinimizeBox = $false
  $form.TopMost = $true

  $labelServer = New-Object System.Windows.Forms.Label
  $labelServer.Text = "Адрес сервера:"
  $labelServer.Location = New-Object System.Drawing.Point(16, 20)
  $labelServer.Size = New-Object System.Drawing.Size(130, 20)
  $form.Controls.Add($labelServer)

  $textServer = New-Object System.Windows.Forms.TextBox
  $textServer.Location = New-Object System.Drawing.Point(16, 42)
  $textServer.Size = New-Object System.Drawing.Size(552, 23)
  $textServer.Text = [string]$settings.SERVER_URL
  $form.Controls.Add($textServer)

  $labelToken = New-Object System.Windows.Forms.Label
  $labelToken.Text = "Токен агента:"
  $labelToken.Location = New-Object System.Drawing.Point(16, 78)
  $labelToken.Size = New-Object System.Drawing.Size(130, 20)
  $form.Controls.Add($labelToken)

  $textToken = New-Object System.Windows.Forms.TextBox
  $textToken.Location = New-Object System.Drawing.Point(16, 100)
  $textToken.Size = New-Object System.Drawing.Size(552, 23)
  $textToken.Text = [string]$settings.AGENT_TOKEN
  $form.Controls.Add($textToken)

  $hint = New-Object System.Windows.Forms.Label
  $hint.Text = "После сохранения агент будет перезапущен автоматически."
  $hint.Location = New-Object System.Drawing.Point(16, 134)
  $hint.Size = New-Object System.Drawing.Size(552, 20)
  $form.Controls.Add($hint)

  $buttonSave = New-Object System.Windows.Forms.Button
  $buttonSave.Text = "Сохранить"
  $buttonSave.Location = New-Object System.Drawing.Point(376, 170)
  $buttonSave.Size = New-Object System.Drawing.Size(92, 30)
  $form.Controls.Add($buttonSave)

  $buttonCancel = New-Object System.Windows.Forms.Button
  $buttonCancel.Text = "Отмена"
  $buttonCancel.Location = New-Object System.Drawing.Point(476, 170)
  $buttonCancel.Size = New-Object System.Drawing.Size(92, 30)
  $form.Controls.Add($buttonCancel)

  $buttonCancel.Add_Click({
    $form.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $form.Close()
  })

  $buttonSave.Add_Click({
    $server = [string]$textServer.Text
    $token = [string]$textToken.Text
    $server = $server.Trim()
    $token = $token.Trim()

    if ([string]::IsNullOrWhiteSpace($server)) {
      Show-ErrorMessage "Укажите SERVER_URL."
      return
    }
    if ([string]::IsNullOrWhiteSpace($token)) {
      Show-ErrorMessage "Укажите AGENT_TOKEN."
      return
    }

    try {
      Write-EnvSettings -EnvPath $envPath -Settings @{
        SERVER_URL = $server
        AGENT_TOKEN = $token
      }
      $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
      $form.Close()
    } catch {
      Show-ErrorMessage ("Не удалось сохранить .env: " + $_.Exception.Message)
    }
  })

  $result = $form.ShowDialog()
  if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    Restart-AgentProcess
    Show-InfoMessage "Настройки сохранены. Агент перезапущен."
    return $true
  }
  return $false
}

$initialSettings = Read-EnvSettings -EnvPath $envPath
if (-not (Has-RequiredSettings -Settings $initialSettings)) {
  [void](Show-SettingsDialog)
  $validated = Read-EnvSettings -EnvPath $envPath
  if (-not (Has-RequiredSettings -Settings $validated)) {
    Show-ErrorMessage "Не заполнены SERVER_URL и AGENT_TOKEN. Агент не запущен."
    exit 1
  }
}

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = [System.Drawing.SystemIcons]::Application
$notify.Text = "Talablar Agent"
$notify.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$titleItem = $menu.Items.Add("Talablar Agent")
$titleItem.Enabled = $false
[void]$menu.Items.Add("-")
$restartItem = $menu.Items.Add("Перезапустить агент")
$settingsItem = $menu.Items.Add("Настройки (сервер/токен)")
$openFolderItem = $menu.Items.Add("Открыть папку")
[void]$menu.Items.Add("-")
$exitItem = $menu.Items.Add("Выход")

$restartItem.Add_Click({ Restart-AgentProcess })
$settingsItem.Add_Click({ Show-SettingsDialog })
$openFolderItem.Add_Click({ Start-Process explorer.exe $WorkDir | Out-Null })

$appContext = New-Object System.Windows.Forms.ApplicationContext

$exitItem.Add_Click({
  try { $timer.Stop() } catch {}
  Stop-AgentProcess
  $notify.Visible = $false
  $notify.Dispose()
  $menu.Dispose()
  $appContext.ExitThread()
})

$notify.ContextMenuStrip = $menu
$notify.Add_DoubleClick({ Show-SettingsDialog })

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.Add_Tick({
  if ($script:agentProcess -and $script:agentProcess.HasExited) {
    Start-AgentProcess
    $notify.BalloonTipTitle = "Talablar Agent"
    $notify.BalloonTipText = "Агент был перезапущен автоматически."
    $notify.ShowBalloonTip(1500)
  }
})

Start-AgentProcess
$notify.BalloonTipTitle = "Talablar Agent"
$notify.BalloonTipText = "Агент работает в системном трее."
$notify.ShowBalloonTip(1200)
$timer.Start()

[System.Windows.Forms.Application]::Run($appContext)
