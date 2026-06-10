# Switch foreground window keyboard layout (for 1C shortcuts: Ctrl+S needs EN layout).
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('SaveEnglish', 'Restore')]
    [string]$Action,
    [string]$Klid = '00000409',
    [string]$StateFile = ''
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

if (-not ('KbdLayout' -as [type])) {
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public class KbdLayout {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] public static extern IntPtr GetKeyboardLayout(uint idThread);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr LoadKeyboardLayout(string pwszKLID, uint Flags);
    [DllImport("user32.dll")] public static extern IntPtr ActivateKeyboardLayout(IntPtr hkl, uint Flags);
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
    public const uint WM_INPUTLANGCHANGEREQUEST = 0x0050;
    public const uint KLF_ACTIVATE = 1;
}
"@
}

function Get-ForegroundLayout {
    $hwnd = [KbdLayout]::GetForegroundWindow()
    if ($hwnd -eq [IntPtr]::Zero) { return @{ Hwnd = 0; Hkl = 0 } }
    $procId = [uint32]0
    $tid = [KbdLayout]::GetWindowThreadProcessId($hwnd, [ref]$procId)
    $hkl = [KbdLayout]::GetKeyboardLayout($tid)
    return @{ Hwnd = [Int64]$hwnd.ToInt64(); Hkl = [Int64]$hkl.ToInt64() }
}

function Set-ForegroundLayout([Int64]$hklValue) {
    $hwnd = [KbdLayout]::GetForegroundWindow()
    if ($hwnd -eq [IntPtr]::Zero) { return $false }
    $hkl = [IntPtr]::new($hklValue)
    [void][KbdLayout]::ActivateKeyboardLayout($hkl, 0)
    [void][KbdLayout]::SendMessage($hwnd, [KbdLayout]::WM_INPUTLANGCHANGEREQUEST, [IntPtr]::Zero, $hkl)
    return $true
}

if ($Action -eq 'SaveEnglish') {
    if (-not $StateFile) { Write-Output 'FAIL|missing StateFile'; exit 1 }
    $fg = Get-ForegroundLayout
    if ($fg.Hkl -eq 0) { Write-Output 'FAIL|no foreground window'; exit 1 }

    $en = [KbdLayout]::LoadKeyboardLayout($Klid, [KbdLayout]::KLF_ACTIVATE)
    if ($en -eq [IntPtr]::Zero) { Write-Output 'FAIL|LoadKeyboardLayout'; exit 1 }
    $enVal = [Int64]$en.ToInt64()
    if (-not (Set-ForegroundLayout $enVal)) { Write-Output 'FAIL|activate english'; exit 1 }

    $state = @{ previousHkl = $fg.Hkl; englishHkl = $enVal; klid = $Klid } | ConvertTo-Json -Compress
    Set-Content -LiteralPath $StateFile -Value $state -Encoding UTF8 -NoNewline
    Write-Output ('OK|EN|' + $Klid + '|prev=' + $fg.Hkl)
    exit 0
}

if ($Action -eq 'Restore') {
    if (-not $StateFile -or -not (Test-Path -LiteralPath $StateFile)) {
        Write-Output 'OK|skip'
        exit 0
    }
    try {
        $state = Get-Content -LiteralPath $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json
        $prev = [Int64]$state.previousHkl
        if ($prev -ne 0) {
            [void](Set-ForegroundLayout $prev)
        }
        Write-Output ('OK|restored|' + $prev)
    } catch {
        Write-Output ('FAIL|' + $_.Exception.Message)
        exit 1
    } finally {
        try { Remove-Item -LiteralPath $StateFile -Force -ErrorAction SilentlyContinue } catch {}
    }
    exit 0
}

Write-Output 'FAIL|unknown'
exit 1
