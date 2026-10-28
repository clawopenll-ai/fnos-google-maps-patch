# =====================================================================
# fnOS 相册 —— Google Maps 底图补丁：一键部署（Windows / PowerShell）
#
#   .\deploy.ps1 -NasIp 192.168.1.10 -NasUser admin
#   .\deploy.ps1 -NasIp 192.168.1.10 -NasUser admin -Action rollback
#   .\deploy.ps1 -NasIp 192.168.1.10 -NasUser admin -Action status
#
# 依赖：本机已配置 SSH 公钥登录
#   （Windows: ssh-keygen -t ed25519；再把 ~/.ssh/id_ed25519.pub 加到
#     NAS 上 <用户> 的 ~/.ssh/authorized_keys）
# =====================================================================
param(
  [Parameter(Mandatory = $true)][string]$NasIp,
  [string]$NasUser = "admin",
  [ValidateSet("install", "rollback", "status")]
  [string]$Action = "install",
  [string]$RemoteTmp = "/tmp/gmaps-patch",
  [int]$PhotoPort = 5666
)

$ErrorActionPreference = "Continue"
$PatchDir = Join-Path $PSScriptRoot ".."
$Assets = Join-Path $PatchDir "assets"
$DeployScript = Join-Path $PSScriptRoot "deploy-on-nas.sh"

Write-Host "=== fnOS 相册 Google Maps 补丁部署 ===" -ForegroundColor Cyan
Write-Host "NAS: $NasUser@$NasIp    动作: $Action"

# ---------- 1. SSH 连通性 & 认证检查 ----------
Write-Host "`n[1/4] 检查 SSH 连接 ..." -ForegroundColor Yellow
$sshArgs = @("-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=10")
& ssh @sshArgs "$NasUser@$NasIp" "echo SSH_OK" 2>&1 | ForEach-Object { Write-Host "   $_" }
if ($LASTEXITCODE -ne 0) {
  Write-Host "`n!! SSH 认证失败。请确认已把本机公钥加入 NAS 上 $NasUser 用户的 ~/.ssh/authorized_keys：" -ForegroundColor Red
  if (Test-Path "$env:USERPROFILE\.ssh\id_ed25519.pub") {
    Write-Host "   $(Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub")" -ForegroundColor Yellow
  }
  Write-Host "   Windows 上可用: ssh-keygen -t ed25519" -ForegroundColor Yellow
  exit 1
}

# ---------- 2. 上传补丁包 ----------
Write-Host "`n[2/4] 上传补丁包到 $RemoteTmp ..." -ForegroundColor Yellow
& ssh @sshArgs "$NasUser@$NasIp" "mkdir -p $RemoteTmp"
foreach ($f in @("l1Zo7QHRsLu3cCA9.js", "leaflet.js", "leaflet.css", "gmaps-config.js")) {
  $src = Join-Path $Assets $f
  if (-not (Test-Path $src)) { Write-Host "   跳过（不存在）: $f"; continue }
  & scp @sshArgs $src "$NasUser@$NasIp`:$RemoteTmp/$f"
  if ($LASTEXITCODE -ne 0) { Write-Host "!! 上传失败: $f" -ForegroundColor Red; exit 2 }
  Write-Host "   已上传: $f"
}
& scp @sshArgs $DeployScript "$NasUser@$NasIp`:$RemoteTmp/deploy-on-nas.sh"
if ($LASTEXITCODE -ne 0) { Write-Host "!! 上传部署脚本失败" -ForegroundColor Red; exit 2 }
Write-Host "   已上传: deploy-on-nas.sh"

# ---------- 3. 执行部署脚本 ----------
Write-Host "`n[3/4] 执行 $Action ..." -ForegroundColor Yellow
$sudoPrefix = ""
& ssh @sshArgs "$NasUser@$NasIp" "id -u" 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
  $who = (& ssh @sshArgs "$NasUser@$NasIp" "id -un" 2>&1 | Out-String).Trim()
  if ($who -ne "root") {
    $sudoPrefix = "sudo "
    Write-Host "   当前用户非 root，将使用 sudo（可能会提示输入密码）" -ForegroundColor DarkGray
  }
}
& ssh -t @sshArgs "$NasUser@$NasIp" "${sudoPrefix}bash $RemoteTmp/deploy-on-nas.sh $Action $RemoteTmp"
$rc = $LASTEXITCODE
if ($rc -ne 0) { Write-Host "!! 部署脚本返回 $rc" -ForegroundColor Red; exit $rc }

# ---------- 4. 验证资源可访问 ----------
if ($Action -eq "install") {
  Write-Host "`n[4/4] 验证 NAS 端资源 ..." -ForegroundColor Yellow
  $ok = $true
  foreach ($u in @("/p/assets/l1Zo7QHRsLu3cCA9.js", "/p/assets/leaflet.js", "/p/assets/leaflet.css", "/p/assets/gmaps-config.js")) {
    try {
      $r = Invoke-WebRequest -Uri "http://${NasIp}:${PhotoPort}$u" -UseBasicParsing -TimeoutSec 15 -Method Head
      Write-Host ("   OK  {0,-34} {1} bytes" -f $u, $r.Headers['Content-Length'])
    } catch {
      Write-Host ("   ERR {0,-34} {1}" -f $u, $_.Exception.Message) -ForegroundColor Red
      $ok = $false
    }
  }
  if ($ok) {
    Write-Host "`n部署成功。" -ForegroundColor Green
    Write-Host "请打开 http://${NasIp}:${PhotoPort}/p/map 并按 Ctrl+Shift+R 强制刷新。" -ForegroundColor Green
    Write-Host "控制台执行 __FNOS_GMAPS_PATCH__ 应输出 google-maps-v1" -ForegroundColor DarkGray
  } else {
    Write-Host "`n部分资源未就绪，请检查上一步输出。" -ForegroundColor Red
  }
} else {
  Write-Host "`n完成。" -ForegroundColor Green
}
