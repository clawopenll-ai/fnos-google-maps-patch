# =====================================================================
# 本機測試用最小靜態伺服器（純 TcpListener，不需 URL ACL / 管理員權限）
#
#   powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 8765
#   然後開啟 http://127.0.0.1:8765/index.html
# =====================================================================
param(
  [string]$Root = "",
  [int]$Port = 8765
)

if ([string]::IsNullOrWhiteSpace($Root)) {
  $Root = Split-Path -Parent $MyInvocation.MyCommand.Path
}

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.mjs'  = 'application/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.ico'  = 'image/x-icon'
}

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Output "serving $Root on http://127.0.0.1:$Port/"
Write-Output "按 Ctrl+C 结束"

while ($true) {
  try {
    $client = $listener.AcceptTcpClient()
    $stream = $client.GetStream()
    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII)
    $request = $reader.ReadLine()
    while ($reader.ReadLine() -ne '') { }

    $path = '/'
    if ($request -match '^\S+\s+(\S+)') { $path = $matches[1] }
    $path = $path.Split('?')[0]
    if ($path -eq '/') { $path = '/index.html' }

    $full = Join-Path $Root ($path.TrimStart('/') -replace '/', '\')
    if (-not $full.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)) {
      $full = Join-Path $Root 'index.html'
    }

    if (Test-Path -LiteralPath $full -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      $type = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $head = "HTTP/1.1 200 OK`r`nContent-Type: $type`r`nContent-Length: $($bytes.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
      $hb = [System.Text.Encoding]::ASCII.GetBytes($head)
      $stream.Write($hb, 0, $hb.Length)
      $stream.Write($bytes, 0, $bytes.Length)
      Write-Output ("  {0} -> {1} ({2}B)" -f $path, [System.IO.Path]::GetFileName($full), $bytes.Length)
    } else {
      $body = [System.Text.Encoding]::UTF8.GetBytes('404')
      $head = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
      $hb = [System.Text.Encoding]::ASCII.GetBytes($head)
      $stream.Write($hb, 0, $hb.Length)
      $stream.Write($body, 0, $body.Length)
      Write-Output ("  {0} -> 404" -f $path)
    }
    $stream.Flush()
    $client.Close()
  } catch {
    Write-Output ("error: " + $_.Exception.Message)
  }
}
