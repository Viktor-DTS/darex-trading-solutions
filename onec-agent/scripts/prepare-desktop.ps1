# Minimize agent console, force foreground to 1C (works even if user watches agent window).
param(
    [switch]$SkipMinimize
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

if (-not ('WinDesk' -as [type])) {
    Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WinDesk {
    public delegate bool CB(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] public static extern bool EnumWindows(CB c, IntPtr p);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int m);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
    public const int SW_RESTORE = 9;
    public const int SW_MINIMIZE = 6;
    public const byte VK_MENU = 0x12;
    public const uint KEYEVENTF_KEYUP = 0x0002;
}
"@
}

function Title-Matches([string]$title, [string[]]$needles) {
    if (-not $title) { return $false }
    foreach ($n in $needles) {
        if ($title.IndexOf($n, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
    }
    return $false
}

function Find-BestWindow([string[]]$needles, [string[]]$exclude) {
    $bestHwnd = [IntPtr]::Zero
    $bestTitle = ''
    $cb = {
        param($hWnd, $lParam)
        if (-not [WinDesk]::IsWindowVisible($hWnd)) { return $true }
        $sb = New-Object System.Text.StringBuilder 512
        [void][WinDesk]::GetWindowText($hWnd, $sb, 512)
        $t = $sb.ToString()
        if (-not $t) { return $true }
        foreach ($ex in $exclude) {
            if ($t.IndexOf($ex, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
        }
        if (Title-Matches $t $needles) {
            if ($script:bestHwnd -eq [IntPtr]::Zero -or $t.Length -gt $script:bestTitle.Length) {
                $script:bestHwnd = $hWnd
                $script:bestTitle = $t
            }
        }
        return $true
    }
    [WinDesk]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
    return @{ Hwnd = $bestHwnd; Title = $bestTitle }
}

function Minimize-Window([IntPtr]$hwnd) {
    if ($hwnd -eq [IntPtr]::Zero) { return $false }
    if ([WinDesk]::IsIconic($hwnd)) { return $true }
    return [WinDesk]::ShowWindow($hwnd, [WinDesk]::SW_MINIMIZE)
}

function Force-ForegroundWindow([IntPtr]$hwnd) {
    if ($hwnd -eq [IntPtr]::Zero) { return $false }
    # Alt — зняти блокування SetForegroundWindow (користувач дивиться на консоль агента)
    [WinDesk]::keybd_event([WinDesk]::VK_MENU, 0, 0, [UIntPtr]::Zero) | Out-Null
    [WinDesk]::keybd_event([WinDesk]::VK_MENU, 0, [WinDesk]::KEYEVENTF_KEYUP, [UIntPtr]::Zero) | Out-Null
    Start-Sleep -Milliseconds 80

    $fg = [WinDesk]::GetForegroundWindow()
    $curTid = [WinDesk]::GetCurrentThreadId()
    $fgPid = [uint32]0
    $fgTid = 0
    if ($fg -ne [IntPtr]::Zero) {
        $fgTid = [WinDesk]::GetWindowThreadProcessId($fg, [ref]$fgPid)
    }
    $tgtPid = [uint32]0
    $tgtTid = [WinDesk]::GetWindowThreadProcessId($hwnd, [ref]$tgtPid)

    if ($fgTid -ne 0) { [void][WinDesk]::AttachThreadInput($curTid, $fgTid, $true) }
    if ($tgtTid -ne 0) { [void][WinDesk]::AttachThreadInput($curTid, $tgtTid, $true) }

    [void][WinDesk]::ShowWindow($hwnd, [WinDesk]::SW_RESTORE)
    [void][WinDesk]::BringWindowToTop($hwnd)
    $ok = [WinDesk]::SetForegroundWindow($hwnd)

    if ($tgtTid -ne 0) { [void][WinDesk]::AttachThreadInput($curTid, $tgtTid, $false) }
    if ($fgTid -ne 0) { [void][WinDesk]::AttachThreadInput($curTid, $fgTid, $false) }

    Start-Sleep -Milliseconds 200
    return $ok -or ([WinDesk]::GetForegroundWindow() -eq $hwnd)
}

if (-not $SkipMinimize) {
    $con = [WinDesk]::GetConsoleWindow()
    if ($con -ne [IntPtr]::Zero) {
        [void](Minimize-Window $con)
        Write-Output 'MIN|console'
    }
    foreach ($needle in @('DTS 1C Agent', 'DTS 1С-агент', 'dist-portable')) {
        $agent = Find-BestWindow @($needle) @()
        if ($agent.Hwnd -ne [IntPtr]::Zero) {
            [void](Minimize-Window $agent.Hwnd)
            Write-Output ('MIN|' + $agent.Title)
        }
    }
}

$onec = Find-BestWindow @('Предприятие', 'Ведомость', 'Управление торговым') @('DTS', 'Agent', 'Cursor', 'PowerShell', 'cmd.exe')
if ($onec.Hwnd -ne [IntPtr]::Zero) {
    $ok = Force-ForegroundWindow $onec.Hwnd
    if ($ok) {
        Write-Output ('FOCUS|' + $onec.Title)
        exit 0
    }
    Write-Output ('FAIL|SetForegroundWindow failed for ' + $onec.Title)
    exit 1
}

Write-Output 'FAIL|1C window not found'
exit 1
