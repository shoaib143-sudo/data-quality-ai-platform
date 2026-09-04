param(
  [string]$RepoPath = (Get-Location).Path,
  [string]$Branch = 'main',
  [string]$BackupRoot = "$HOME\data-quality-ai-platform-backups"
)

$ErrorActionPreference = 'Stop'

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found in PATH."
  }
}

Require-Command git

$repo = Resolve-Path $RepoPath
Set-Location $repo

if (-not (Test-Path '.git')) {
  throw "RepoPath '$repo' is not a Git repository."
}

$dirty = git status --porcelain
if ($LASTEXITCODE -ne 0) { throw 'Unable to read Git working tree status.' }
if ($dirty) {
  throw "Local working tree has uncommitted changes. Commit or stash them before syncing so nothing is overwritten."
}

$origin = git remote get-url origin
if ($LASTEXITCODE -ne 0 -or -not $origin) { throw 'Git remote origin is not configured.' }

Write-Host "Fetching origin..."
git fetch --prune origin
if ($LASTEXITCODE -ne 0) { throw 'git fetch failed.' }

$localBranch = (git branch --show-current).Trim()
if ($localBranch -ne $Branch) {
  git switch $Branch
  if ($LASTEXITCODE -ne 0) { throw "Unable to switch to branch '$Branch'." }
}

Write-Host "Fast-forwarding $Branch..."
git pull --ff-only origin $Branch
if ($LASTEXITCODE -ne 0) { throw 'git pull --ff-only failed. Resolve branch divergence manually.' }

$head = (git rev-parse HEAD).Trim()
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path $BackupRoot "$stamp-$($head.Substring(0,12))"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

Write-Host "Creating local Git bundle snapshot..."
$bundle = Join-Path $backupDir 'data-quality-ai-platform.bundle'
git bundle create $bundle --all
if ($LASTEXITCODE -ne 0) { throw 'git bundle snapshot failed.' }

$manifest = [ordered]@{
  created_at = (Get-Date).ToString('o')
  repository = $origin
  branch = $Branch
  commit = $head
  bundle = $bundle
}
$manifest | ConvertTo-Json | Set-Content -Path (Join-Path $backupDir 'manifest.json') -Encoding UTF8

Write-Host "Local repository synced to: $head"
Write-Host "Backup snapshot created at: $backupDir"
Write-Host "Restore example: git clone `"$bundle`" restored-data-quality-ai-platform"
