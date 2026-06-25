param(
  [Parameter(Mandatory=$true)]
  [string]$TargetPath
)

if (!(Test-Path $TargetPath)) {
  throw "TargetPath does not exist: $TargetPath"
}

New-Item -ItemType Directory -Force (Join-Path $TargetPath ".ai-rules") | Out-Null
New-Item -ItemType Directory -Force (Join-Path $TargetPath ".agents\skills") | Out-Null
New-Item -ItemType Directory -Force (Join-Path $TargetPath ".codex") | Out-Null

if (!(Test-Path (Join-Path $TargetPath "AGENTS.md"))) {
  Copy-Item ".\templates\AGENTS.template.md" (Join-Path $TargetPath "AGENTS.md") -Force
}

if (!(Test-Path (Join-Path $TargetPath ".ai-rules\00-system-index.md"))) {
  Copy-Item ".\templates\root-router.template.md" (Join-Path $TargetPath ".ai-rules\00-system-index.md") -Force
}

Write-Host "Base schema scaffolding installed into $TargetPath"
Write-Host "Now run Codex in that codebase and use `$codebase-schema-integrator."
