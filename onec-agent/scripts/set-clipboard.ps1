# Copy UTF-8 text file to Windows clipboard (ASCII-only script).
param(
    [Parameter(Mandatory = $true)]
    [string]$TextFile
)

$t = Get-Content -LiteralPath $TextFile -Raw -Encoding UTF8
Set-Clipboard -Value $t
