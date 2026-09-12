$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$executable = Join-Path $projectRoot 'dist\win-unpacked\Lifeguard.exe'
$statePath = Join-Path $env:APPDATA 'lifeguard\lifeguard-state.json'
$beforeActionIds = @()
$beforeQuarantineIds = @()
if (Test-Path -LiteralPath $statePath) {
  $beforeState = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
  $beforeActionIds = @($beforeState.actions.id)
  $beforeQuarantineIds = @($beforeState.quarantine.id)
}

$running = @(Get-CimInstance Win32_Process -Filter "Name='Lifeguard.exe'" | Where-Object { $_.ExecutablePath -eq $executable })
if ($running.Count -gt 0) {
  Stop-Process -Id $running.ProcessId -Force
}

Push-Location $projectRoot
try {
  pnpm test
  if ($LASTEXITCODE -ne 0) { throw 'Unit tests failed.' }
  pnpm exec tsc --noEmit
  if ($LASTEXITCODE -ne 0) { throw 'TypeScript validation failed.' }
  pnpm package
  if ($LASTEXITCODE -ne 0) { throw 'Windows packaging failed.' }

  Start-Process -FilePath $executable -ArgumentList '--lifeguard-self-test' -WindowStyle Hidden -Wait
  $deadline = [DateTime]::UtcNow.AddSeconds(15)
  do {
    Start-Sleep -Milliseconds 250
    $state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
    $newEntries = @($state.quarantine | Where-Object { $beforeQuarantineIds -notcontains $_.id })
    $newActions = @($state.actions | Where-Object { $beforeActionIds -notcontains $_.id })
  } until (($newActions.rule -contains 'quarantine-restore') -or [DateTime]::UtcNow -ge $deadline)
  $rules = @($newActions.rule)
  $categories = @($newEntries.category)
  $restored = @($newEntries | Where-Object restoredAt)
  $active = @($newEntries | Where-Object { -not $_.restoredAt })
  $hashChecks = foreach ($entry in $newEntries) {
    $path = if ($entry.restoredAt) { $entry.originalPath } else { $entry.quarantinePath }
    (Test-Path -LiteralPath $path) -and ((Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant() -eq $entry.hash.ToLowerInvariant())
  }
  $allowedRoots = @(
    (Join-Path $env:APPDATA 'lifeguard\DemoDrive'),
    (Join-Path $env:USERPROFILE 'AppData\Local\Temp\Lifeguard-Demo')
  )
  $pathChecks = foreach ($entry in $newEntries) {
    @($allowedRoots | Where-Object { $entry.originalPath.StartsWith($_, [StringComparison]::OrdinalIgnoreCase) }).Count -gt 0
  }

  $checks = [ordered]@{
    FixedDriveDiscovered = @($state.storageIndex.volumes).Count -gt 0
    DuplicateQuarantined = $rules -contains 'whole-drive-exact-duplicate'
    StaleTempQuarantined = $rules -contains 'known-disposable-path'
    MemoryWorkerClosed = $rules -contains 'context-aware-memory-pressure'
    RestoreCompleted = ($rules -contains 'quarantine-restore') -and $restored.Count -ge 1
    BothStorageCategories = ($categories -contains 'duplicate') -and ($categories -contains 'temp')
    IntegrityHashesValid = ($hashChecks.Count -ge 2) -and ($hashChecks -notcontains $false)
    AllMutationsInsideFixtures = ($pathChecks.Count -ge 2) -and ($pathChecks -notcontains $false)
    RecoverableItemRemains = $active.Count -ge 1
  }

  $checks.GetEnumerator() | ForEach-Object {
    [PSCustomObject]@{ Check = $_.Key; Result = if ($_.Value) { 'PASS' } else { 'FAIL' } }
  } | Format-Table -AutoSize

  $failed = @($checks.GetEnumerator() | Where-Object { -not $_.Value })
  if ($failed.Count -gt 0) { throw "Native verification failed: $($failed.Key -join ', ')" }
  Write-Host "Native verification passed: $($newActions.Count) actions, $($newEntries.Count) storage items, $($active.Count) recoverable."
} finally {
  Pop-Location
}

if (-not $env:CI) {
  Start-Process -FilePath $executable -WindowStyle Hidden
}
