# deploy.ps1 - Deploya todas as Edge Functions do CloudDesk
# Uso: .\deploy.ps1

$PROJECT_REF = "tgjvjgvbqckoqjtgbjqx"

$functions = @(
    "desk-ai-respond",
    "get-contact-info",
    "desk-generate-embedding",
    "desk-embed-article",
    "check-widget-eligibility"
)

Write-Host ""
Write-Host "CloudDesk - Deploy de Edge Functions" -ForegroundColor Cyan
Write-Host "Projeto: $PROJECT_REF" -ForegroundColor DarkGray
Write-Host ""

$ok = 0
$fail = 0

foreach ($fn in $functions) {
    Write-Host "  Deployando $fn..." -NoNewline
    $result = npx supabase functions deploy $fn --project-ref $PROJECT_REF 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host " OK" -ForegroundColor Green
        $ok++
    } else {
        Write-Host " FALHOU" -ForegroundColor Red
        Write-Host $result -ForegroundColor DarkRed
        $fail++
    }
}

Write-Host ""
if ($fail -eq 0) {
    Write-Host "$ok OK - tudo deployado" -ForegroundColor Green
} else {
    Write-Host "$ok OK  $fail falhou" -ForegroundColor Yellow
}
Write-Host ""
