---
description: Sync node work from private Shima repo to public Shima.wf repo
---

# Sync to Public (Shima → Shima.wf)

Copies all publishable node files from the private dev repo to the public repo,
excluding secrets, internal docs, test scripts, and dev-only tooling.

## Directories/files to SYNC (overwrite + add new)

| Path                    | Notes                                |
|-------------------------|--------------------------------------|
| `__init__.py`           | Node registration                    |
| `nodes/`                | All Python node files                |
| `js/`                   | All frontend JS files                |
| `api/`                  | API route handlers                   |
| `assets/`               | Styles, images, UI assets            |
| `config/`               | Node config files                    |
| `fonts/`                | Font files                           |
| `icons/`                | Icon files                           |
| `sticker_images/`       | Sticker assets                       |
| `utils/`                | Utility modules                      |
| `requirements.txt`      | Python dependencies                  |
| `pyproject.toml`        | Project metadata                     |
| `example_workflows/`    | Example workflow JSONs               |
| `exported_workflows/`   | Exported workflow JSONs              |
| `docs/user_docs/`       | User-facing documentation            |

## Files/directories to EXCLUDE (never copy)

| Path                              | Reason                            |
|-----------------------------------|-----------------------------------|
| `docs/design_docs/`              | Contains secrets and internal design |
| `docs/developer_docs/`           | Internal dev documentation        |
| `docs/internal/`                 | Internal tooling docs             |
| `docs/in-progress_docs/`         | Work in progress, not public      |
| `docs/media/`                    | Internal media assets             |
| `data/`                          | Runtime data directory            |
| `__pycache__/`                   | Python cache                      |
| `test_*.py`                      | Test scripts                      |
| `verify_*.py`                    | Verification scripts              |
| `clean_pycache.py`               | Dev utility                       |
| `export_synced_islands.py`       | Dev utility                       |
| `verification_output.txt`        | Test output                       |
| `.git/`                          | Git internals (each repo has own) |
| `.gitignore`                     | Each repo has its own             |
| `README.md`                      | Each repo has its own             |
| `.agents/`                       | Agent workflows (dev only)        |

## Steps

// turbo-all

1. Ensure Shima (private) is committed and clean:
```powershell
cd e:\ComfyDev\Shima
git status --short
```

2. Run the sync using robocopy (mirrors allowed dirs, skips excluded):
```powershell
$src = "e:\ComfyDev\Shima"
$dst = "e:\ComfyDev\Shima.wf"

# Sync directories
@("nodes", "js", "api", "assets", "config", "fonts", "icons", "sticker_images", "utils", "example_workflows", "exported_workflows") | ForEach-Object {
    robocopy "$src\$_" "$dst\$_" /MIR /NFL /NDL /NJH /NJS /NP
}

# Sync user_docs only (not other doc subdirs)
robocopy "$src\docs\user_docs" "$dst\docs\user_docs" /MIR /NFL /NDL /NJH /NJS /NP

# Sync individual root files
@("__init__.py", "requirements.txt", "pyproject.toml") | ForEach-Object {
    Copy-Item "$src\$_" "$dst\$_" -Force
}

Write-Host "Sync complete."
```

3. Review the changes in Shima.wf:
```powershell
cd e:\ComfyDev\Shima.wf
git add -A
git status --short
```

4. Verify no secrets leaked — check for sensitive patterns:
```powershell
cd e:\ComfyDev\Shima.wf
git diff --cached --name-only | Select-String -Pattern "secret|discord|\.env|password|token|key\.txt"
```
If any matches appear, investigate before committing.

5. Commit and push:
```powershell
cd e:\ComfyDev\Shima.wf
git commit -m "<describe the changes synced>"
git push origin main
```
