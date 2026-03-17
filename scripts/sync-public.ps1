# Hardened Sync Script: Shima (Dev) -> Shima.wf (Public)
# This script uses a STRICT WHITELIST approach to prevent security leaks.

$src = "e:\ComfyDev\Shima"
$dst = "e:\ComfyDev\shima_wf"

if (-not (Test-Path $dst)) {
    Write-Error "Public repository path not found: $dst"
    exit 1
}

Write-Host "--- SHIMA SYNC: HARDENED MODE ---" -ForegroundColor Cyan

# 1. CLEAN SOURCE CHECK
Write-Host "Checking if Shima (Dev) is clean..." -ForegroundColor Cyan
git -C $src status --short
$dirty = git -C $src status --short
if ($dirty) {
    Write-Host "!!! WARNING: Uncommitted changes in Shima (Dev). Commit or stash before syncing to public." -ForegroundColor Yellow
    # We don't exit here, but we warn the user.
}

# 2. WHITELISTED DIRECTORIES (robocopy MIR)
$allowedDirs = @(
    "nodes", 
    "js", 
    "api", 
    "assets", 
    "config", 
    "fonts", 
    "icons", 
    "sticker_images", 
    "utils", 
    "example_workflows", 
    "exported_workflows"
)

# 3. WHITELISTED ROOT FILES
$allowedFiles = @(
    "__init__.py", 
    "requirements.txt", 
    "pyproject.toml"
)

# SYNC DIRECTORIES
foreach ($dir in $allowedDirs) {
    if (Test-Path "$src\$dir") {
        Write-Host "Syncing folder: $dir..."
        # EXCLUDE: backups, disabled files, internal spreadsheets, test scripts, and agent/brain artifacts
        robocopy "$src\$dir" "$dst\$dir" /MIR /NFL /NDL /NJH /NJS /NP /XD .git .github __pycache__ .agents .gemini brain .system_generated /XF *.backup *.DISABLED *.disabled shima_sheets_working_copy.xlsx shima.wired_xl.base.json test_*.py
    }
}

# SYNC USER DOCS ONLY (Strictly whitelist user_docs, never other doc categories)
Write-Host "Syncing User Docs..."
if (-not (Test-Path "$dst\docs\user_docs")) { New-Item -ItemType Directory -Path "$dst\docs\user_docs" -Force }
# EXCLUDE README.md from user_docs if requested
robocopy "$src\docs\user_docs" "$dst\docs\user_docs" /MIR /NFL /NDL /NJH /NJS /NP /XD .git .github /XF README.md

# SYNC ROOT FILES
foreach ($file in $allowedFiles) {
    if (Test-Path "$src\$file") {
        Write-Host "Copying root file: $file..."
        Copy-Item "$src\$file" "$dst\$file" -Force
    }
}

Write-Host "`n--- SAFETY AUDIT ---" -ForegroundColor Yellow
cd $dst

# Search for sensitive strings in the staged changes
# Patterns for rotated keys: g2L$ (Enigma), F8Y6 (DB), a%HK (NextAuth), iYaW (JWT)
$sensitivePatterns = "secret|discord|sk_live|whsec|\.env|password|token|key\.txt|g2L\$|F8Y6|a%HK|iYaW"
$leaks = git status --short | Select-String -Pattern "docs/|nodes/|js/|api/|config/" | ForEach-Object { git diff --cached $_.ToString().Split()[-1] } | Select-String -Pattern $sensitivePatterns

if ($leaks) {
    Write-Host "!!! WARNING: SENSITIVE PATTERNS DETECTED IN SYNCED CONTENT !!!" -ForegroundColor Red
    $leaks | ForEach-Object { Write-Host "Match found: $_" -ForegroundColor Red }
    Write-Host "`nSync halted. Do NOT commit without reviewing the leaks above." -ForegroundColor Red
} else {
    Write-Host "No obvious leaks detected in documentation/code." -ForegroundColor Green
    Write-Host "`nSync complete. Review changes with 'git status'." -ForegroundColor Green
    Write-Host "Wait for 'LUZ VERDE' before pushing to public GitHub." -ForegroundColor Cyan
}
