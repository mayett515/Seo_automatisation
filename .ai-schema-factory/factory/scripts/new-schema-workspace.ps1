param(
  [Parameter(Mandatory=$true)]
  [string]$Name
)

$root = Join-Path (Get-Location) $Name

New-Item -ItemType Directory -Force $root | Out-Null
New-Item -ItemType Directory -Force (Join-Path $root ".ai-rules") | Out-Null
New-Item -ItemType Directory -Force (Join-Path $root ".agents\skills") | Out-Null
New-Item -ItemType Directory -Force (Join-Path $root ".codex") | Out-Null
New-Item -ItemType Directory -Force (Join-Path $root "docs") | Out-Null
New-Item -ItemType Directory -Force (Join-Path $root "prompts") | Out-Null

Copy-Item ".\templates\AGENTS.template.md" (Join-Path $root "AGENTS.md") -Force
Copy-Item ".\templates\root-router.template.md" (Join-Path $root ".ai-rules\00-system-index.md") -Force
Copy-Item ".\templates\codex-config.template.toml" (Join-Path $root ".codex\config.toml") -Force

Write-Host "Created schema workspace: $root"
Write-Host "Next: open it in Zed and run codex."
