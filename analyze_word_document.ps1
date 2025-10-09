# PowerShell script for Word document analysis
param(
    [string]$FilePath = "C:\dts-service\Наряд на работу V2.51.0У  ТО.docx"
)

Write-Host "=== WORD DOCUMENT ANALYSIS ===" -ForegroundColor Green
Write-Host "File: $FilePath" -ForegroundColor Yellow

# Check if file exists
if (-not (Test-Path $FilePath)) {
    Write-Host "File not found: $FilePath" -ForegroundColor Red
    exit 1
}

try {
    # Create Word Application
    $Word = New-Object -ComObject Word.Application
    $Word.Visible = $false
    
    # Open document
    $Doc = $Word.Documents.Open($FilePath)
    
    Write-Host "Document opened successfully" -ForegroundColor Green
    Write-Host "Paragraphs count: $($Doc.Paragraphs.Count)" -ForegroundColor Cyan
    Write-Host "Tables count: $($Doc.Tables.Count)" -ForegroundColor Cyan
    
    Write-Host "`n" + "="*60 -ForegroundColor White
    
    # Analyze paragraphs
    $paragraphCount = 0
    for ($i = 1; $i -le $Doc.Paragraphs.Count; $i++) {
        $paragraph = $Doc.Paragraphs.Item($i)
        if ($paragraph.Range.Text.Trim() -ne "") {
            $paragraphCount++
            Write-Host "`nPARAGRAPH ${paragraphCount}:" -ForegroundColor Magenta
            Write-Host "Text: $($paragraph.Range.Text.Trim())" -ForegroundColor White
            
            # Analyze formatting
            $range = $paragraph.Range
            Write-Host "Alignment: $($range.ParagraphFormat.Alignment)" -ForegroundColor Gray
            
            # Analyze font
            Write-Host "Font: $($range.Font.Name)" -ForegroundColor Gray
            Write-Host "Size: $($range.Font.Size)" -ForegroundColor Gray
            Write-Host "Bold: $($range.Font.Bold)" -ForegroundColor Gray
            Write-Host "Italic: $($range.Font.Italic)" -ForegroundColor Gray
            Write-Host "Underline: $($range.Font.Underline)" -ForegroundColor Gray
            
            # Analyze indents
            Write-Host "Left indent: $($range.ParagraphFormat.LeftIndent)" -ForegroundColor Gray
            Write-Host "Right indent: $($range.ParagraphFormat.RightIndent)" -ForegroundColor Gray
            Write-Host "First line indent: $($range.ParagraphFormat.FirstLineIndent)" -ForegroundColor Gray
            Write-Host "Line spacing: $($range.ParagraphFormat.LineSpacing)" -ForegroundColor Gray
        }
    }
    
    Write-Host "`n" + "="*60 -ForegroundColor White
    
    # Analyze tables
    for ($i = 1; $i -le $Doc.Tables.Count; $i++) {
        $table = $Doc.Tables.Item($i)
        Write-Host "`nTABLE ${i}:" -ForegroundColor Magenta
        Write-Host "Rows: $($table.Rows.Count)" -ForegroundColor Cyan
        Write-Host "Columns: $($table.Columns.Count)" -ForegroundColor Cyan
        
        # Analyze cells
        for ($row = 1; $row -le $table.Rows.Count; $row++) {
            for ($col = 1; $col -le $table.Columns.Count; $col++) {
                $cell = $table.Cell($row, $col)
                $cellText = $cell.Range.Text.Trim()
                if ($cellText -ne "") {
                    Write-Host "  [$row,$col]: $cellText" -ForegroundColor White
                    
                    # Analyze cell formatting
                    $cellRange = $cell.Range
                    Write-Host "    Font: $($cellRange.Font.Name)" -ForegroundColor Gray
                    Write-Host "    Size: $($cellRange.Font.Size)" -ForegroundColor Gray
                    Write-Host "    Bold: $($cellRange.Font.Bold)" -ForegroundColor Gray
                    Write-Host "    Alignment: $($cellRange.ParagraphFormat.Alignment)" -ForegroundColor Gray
                }
            }
        }
    }
    
    Write-Host "`n" + "="*60 -ForegroundColor White
    Write-Host "Analysis completed successfully!" -ForegroundColor Green
    Write-Host "Copy the output above and send it to me to create an accurate template." -ForegroundColor Yellow
    
    # Close document
    $Doc.Close()
    $Word.Quit()
    
    # Release COM objects
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($Doc) | Out-Null
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($Word) | Out-Null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
    
} catch {
    Write-Host "Error analyzing document: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Make sure Microsoft Word is installed on the computer." -ForegroundColor Yellow
}