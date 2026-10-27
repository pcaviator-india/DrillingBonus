$ProgressPreference = "SilentlyContinue"
$ErrorActionPreference = "Stop"
$Base = "https://drillingbonus.vercel.app"
$s = $null
$csrf = (Invoke-WebRequest "$Base/api/auth/csrf" -UseBasicParsing -SessionVariable s -MaximumRedirection 3).Content | ConvertFrom-Json
$body = @{ email='admin@example.com'; password='admin123'; csrfToken=$csrf.csrfToken; json='true' }
Invoke-WebRequest "$Base/api/auth/callback/credentials" -Method Post -Body $body -WebSession $s -UseBasicParsing -MaximumRedirection 3 -ErrorAction SilentlyContinue | Out-Null

$rep = (Invoke-WebRequest "$Base/reports" -WebSession $s -UseBasicParsing -MaximumRedirection 3).Content
$sit = (Invoke-WebRequest "$Base/sites" -WebSession $s -UseBasicParsing -MaximumRedirection 3).Content

[System.Collections.Generic.List[string]]$out = @()
$out.Add("reports_unmapped_panel=$($rep -match 'Unmapped machines')")
$out.Add("reports_datepicker=$($rep -match 'type=\"date\"')")
$out.Add("sites_rigs_column=$($sit -match '>Rigs<')")
$out.Add("reports_len=$($rep.Length) sites_len=$($sit.Length)")
$out | Out-File "c:\Recon\DrillingBonus\scripts\check.txt" -Encoding utf8
Get-Content "c:\Recon\DrillingBonus\scripts\check.txt"