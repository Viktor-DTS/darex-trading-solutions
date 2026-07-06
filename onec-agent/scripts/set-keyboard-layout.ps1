# Switch keyboard layout on 1C foreground window (Ctrl+S needs EN layout).
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('SaveEnglish', 'Restore')]
    [string]$Action,
    [string]$Klid = '00000409',
    [string]$StateFile = '',
    [string]$NeedlesFile = ''
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$script:OneCNeedles = @('Enterprise', '1cv8', 'V8')
if (-not $NeedlesFile) {
    $NeedlesFile = Join-Path $PSScriptRoot 'window-needles.json'
}
if ($NeedlesFile -and (Test-Path -LiteralPath $NeedlesFile)) {
    try {
        $raw = Get-Content -LiteralPath $NeedlesFile -Raw -Encoding UTF8
        $cfg = $raw | ConvertFrom-Json
        if ($cfg.onecMain) { $script:OneCNeedles = @($cfg.onecMain) }
    } catch {}
}

if (-not ('KbdLayout' -as [type])) {
    Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class KbdLayout {
    public delegate bool CB(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] public static extern bool EnumWindows(CB c, IntPtr p);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int m);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] public static extern IntPtr GetKeyboardLayout(uint idThread);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr LoadKeyboardLayout(string pwszKLID, uint Flags);
    [DllImport("user32.dll")] public static extern IntPtr ActivateKeyboardLayout(IntPtr hkl, uint Flags);
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
    public const uint WM_INPUTLANGCHANGEREQUEST = 0x0050;
    public const uint KLF_ACTIVATE = 1;
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

function Focus-1cWindow {
    $script:bestHwnd = [IntPtr]::Zero
    $script:bestTitle = ''
    $cb = {
        param($hWnd, $lParam)
        if (-not [KbdLayout]::IsWindowVisible($hWnd)) { return $true }
        $sb = New-Object System.Text.StringBuilder 512
        [void][KbdLayout]::GetWindowText($hWnd, $sb, 512)
        $t = $sb.ToString()
        if (-not $t) { return $true }
        if ($t.IndexOf('DTS', [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and $t.IndexOf('Agent', [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
            return $true
        }
        if (Title-Matches $t $script:OneCNeedles) {
            $isReport = ($t.IndexOf('Ведомость', [System.StringComparison]::OrdinalIgnoreCase) -ge 0)
            $bestIsReport = $script:bestTitle -and ($script:bestTitle.IndexOf('Ведомость', [System.StringComparison]::OrdinalIgnoreCase) -ge 0)
            if ($isReport -and -not $bestIsReport) {
                $script:bestHwnd = $hWnd
                $script:bestTitle = $t
            } elseif ($bestIsReport -and -not $isReport) {
                # keep report window
            } elseif ($script:bestHwnd -eq [IntPtr]::Zero -or $t.Length -gt $script:bestTitle.Length) {
                $script:bestHwnd = $hWnd
                $script:bestTitle = $t
            }
        }
        return $true
    }
    [KbdLayout]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
    if ($script:bestHwnd -ne [IntPtr]::Zero) {
        [void][KbdLayout]::ShowWindow($script:bestHwnd, 9)
        [void][KbdLayout]::SetForegroundWindow($script:bestHwnd)
        Start-Sleep -Milliseconds 150
        return $script:bestTitle
    }
    return ''
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

function Ensure-StateDir([string]$filePath) {
    if (-not $filePath) { return }
    $dir = Split-Path -Parent $filePath
    if ($dir -and -not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

if ($Action -eq 'SaveEnglish') {
    if (-not $StateFile) { Write-Output 'FAIL|missing StateFile'; exit 1 }
    Ensure-StateDir $StateFile

    $focused = Focus-1cWindow
    if (-not $focused) {
        $fg = Get-ForegroundLayout
        if ($fg.Hkl -eq 0) { Write-Output 'FAIL|no foreground window'; exit 1 }
    }

    $fg = Get-ForegroundLayout
    if ($fg.Hkl -eq 0) { Write-Output 'FAIL|no foreground window'; exit 1 }

    $en = [KbdLayout]::LoadKeyboardLayout($Klid, [KbdLayout]::KLF_ACTIVATE)
    if ($en -eq [IntPtr]::Zero) { Write-Output 'FAIL|LoadKeyboardLayout'; exit 1 }
    $enVal = [Int64]$en.ToInt64()
    if (-not (Set-ForegroundLayout $enVal)) { Write-Output 'FAIL|activate english'; exit 1 }

    try {
        $state = @{ previousHkl = $fg.Hkl; englishHkl = $enVal; klid = $Klid } | ConvertTo-Json -Compress
        Set-Content -LiteralPath $StateFile -Value $state -Encoding UTF8 -NoNewline
    } catch {
        Write-Output ('FAIL|write state: ' + $_.Exception.Message)
        exit 1
    }
    Write-Output ('OK|EN|' + $Klid + '|prev=' + $fg.Hkl + '|win=' + $focused)
    exit 0
}

if ($Action -eq 'Restore') {
    if (-not $StateFile -or -not (Test-Path -LiteralPath $StateFile)) {
        Write-Output 'OK|skip'
        exit 0
    }
    try {
        [void](Focus-1cWindow)
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
