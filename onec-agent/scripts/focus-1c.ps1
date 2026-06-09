# Focus window by title needles (UTF-8 JSON file). ASCII-only script body.
param(
    [string]$NeedlesFile = '',
    [switch]$PreferShort,
    [switch]$MainOnly,
    [switch]$FindOnly
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$needles = @()
if ($NeedlesFile -and (Test-Path -LiteralPath $NeedlesFile)) {
    try {
        $raw = Get-Content -LiteralPath $NeedlesFile -Raw -Encoding UTF8
        $parsed = $raw | ConvertFrom-Json
        if ($parsed -is [System.Array]) {
            $needles = @($parsed)
        } else {
            $needles = @([string]$parsed)
        }
    } catch {}
}

$found = New-Object System.Collections.Generic.List[string]
$shell = New-Object -ComObject WScript.Shell

if (-not ('WinFocus' -as [type])) {
    Add-Type 'using System;using System.Text;using System.Runtime.InteropServices;public class WinFocus{public delegate bool CB(IntPtr h,IntPtr l);[DllImport("user32.dll")]public static extern bool EnumWindows(CB c,IntPtr p);[DllImport("user32.dll")]public static extern int GetWindowText(IntPtr h,StringBuilder s,int m);[DllImport("user32.dll")]public static extern bool IsWindowVisible(IntPtr h);[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int c);}'
}

function Title-Matches([string]$title, $needleList) {
    if (-not $title) { return $false }
    foreach ($n in $needleList) {
        if (-not $n) { continue }
        if ($title.IndexOf($n, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
            return $true
        }
    }
    return $false
}

function Activate-Hwnd([IntPtr]$hwnd, [string]$title) {
    if ($hwnd -eq [IntPtr]::Zero) { return $false }
    [void][WinFocus]::ShowWindow($hwnd, 9)
    [void][WinFocus]::SetForegroundWindow($hwnd)
    try {
        if ($shell.AppActivate($title)) { return $true }
    } catch {}
    return $true
}

# 1) Enum all visible windows (finds save dialog "Сохранение")
if ($needles.Count -gt 0) {
    $bestHwnd = [IntPtr]::Zero
    $bestTitle = ''
    $cb = {
        param($hWnd, $lParam)
        if (-not [WinFocus]::IsWindowVisible($hWnd)) { return $true }
        $sb = New-Object System.Text.StringBuilder 512
        [void][WinFocus]::GetWindowText($hWnd, $sb, 512)
        $t = $sb.ToString()
        if ($t) { [void]$script:found.Add($t) }
        if (Title-Matches $t $needles) {
            if ($script:PreferShort) {
                if ($script:bestHwnd -eq [IntPtr]::Zero -or $t.Length -lt $script:bestTitle.Length) {
                    $script:bestHwnd = $hWnd
                    $script:bestTitle = $t
                }
            } else {
                if ($script:bestHwnd -eq [IntPtr]::Zero -or $t.Length -gt $script:bestTitle.Length) {
                    $script:bestHwnd = $hWnd
                    $script:bestTitle = $t
                }
            }
        }
        return $true
    }
    [WinFocus]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
    if ($bestHwnd -ne [IntPtr]::Zero) {
        if (-not $FindOnly) {
            Activate-Hwnd $bestHwnd $bestTitle | Out-Null
        }
        Write-Output ('OK|' + $bestTitle)
        exit 0
    }
}

# FindOnly + needles: не підставляти головне вікно 1С замість діалогу «Сохранение»
if ($FindOnly -and $needles.Count -gt 0) {
    $preview = ($found | Select-Object -Unique | Select-Object -First 20) -join ';;'
    Write-Output ('FAIL|' + $preview)
    exit 1
}

if ($MainOnly -or $needles.Count -eq 0) {
    $procNames = @('1cv8', '1cv8c', '1cestart')
    $best = $null
    foreach ($n in $procNames) {
        foreach ($p in @(Get-Process -Name $n -ErrorAction SilentlyContinue)) {
            $t = $p.MainWindowTitle
            if (-not $t) { continue }
            [void]$found.Add($t)
            if (-not $best -or $t.Length -gt $best.MainWindowTitle.Length) { $best = $p }
        }
    }
    if ($best) {
        try {
            if ($shell.AppActivate($best.Id)) {
                Write-Output ('OK|' + $best.MainWindowTitle)
                exit 0
            }
        } catch {}
        try {
            if ($shell.AppActivate($best.MainWindowTitle)) {
                Write-Output ('OK|' + $best.MainWindowTitle)
                exit 0
            }
        } catch {}
    }
}

# Heuristic main 1C
foreach ($p in Get-Process) {
    try {
        $t = $p.MainWindowTitle
        if ($t -and $t.Length -gt 20 -and ($t -match '1[.:]' -or $p.ProcessName -match '^1cv8')) {
            [void]$found.Add($t)
            try {
                if ($shell.AppActivate($p.Id)) {
                    Write-Output ('OK|' + $t)
                    exit 0
                }
            } catch {}
        }
    } catch {}
}

$preview = ($found | Select-Object -Unique | Select-Object -First 20) -join ';;'
Write-Output ('FAIL|' + $preview)
exit 1
