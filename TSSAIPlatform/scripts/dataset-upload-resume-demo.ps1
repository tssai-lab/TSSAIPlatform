param(
    [string]$BaseUrl = "http://127.0.0.1:8080",
    [string]$FilePath = ".\tmp\dataset-10gb-demo.zip",
    [string]$DatasetName = "dataset-10gb-demo",
    [string]$Version = "v10gb",
    [ValidateSet("CV", "NLP")]
    [string]$Type = "CV",
    [string]$Remark = "10GB dataset resume acceptance demo",
    [int]$StopAfterChunks = 0,
    [int]$MaxRetries = 3,
    [switch]$CreateSparse10GB
)

$ErrorActionPreference = "Stop"

function Invoke-JsonPost {
    param(
        [string]$Uri,
        [object]$Body
    )
    Invoke-RestMethod `
        -Method Post `
        -Uri $Uri `
        -ContentType "application/json; charset=utf-8" `
        -Body ($Body | ConvertTo-Json -Depth 20)
}

function New-SparseLikeFile {
    param(
        [string]$Path,
        [long]$SizeBytes
    )
    $dir = Split-Path -Parent $Path
    if ($dir -and -not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
    }
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
    try {
        $stream.SetLength($SizeBytes)
    }
    finally {
        $stream.Dispose()
    }
}

function Write-ChunkFile {
    param(
        [System.IO.FileStream]$InputStream,
        [string]$ChunkPath,
        [long]$Offset,
        [int]$Length
    )
    $buffer = New-Object byte[] $Length
    $InputStream.Seek($Offset, [System.IO.SeekOrigin]::Begin) | Out-Null
    $read = $InputStream.Read($buffer, 0, $Length)
    $output = [System.IO.File]::Open($ChunkPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
    try {
        $output.Write($buffer, 0, $read)
    }
    finally {
        $output.Dispose()
    }
}

function Invoke-ChunkUpload {
    param(
        [string]$UploadId,
        [int]$PartIndex,
        [string]$ChunkPath
    )
    $response = & curl.exe -sS `
        -X POST `
        -F "uploadId=$UploadId" `
        -F "partIndex=$PartIndex" `
        -F "file=@$ChunkPath" `
        "$BaseUrl/api/dataset/upload/chunk"
    if ($LASTEXITCODE -ne 0) {
        throw "curl.exe failed with exit code $LASTEXITCODE"
    }
    $json = $response | ConvertFrom-Json
    if (-not $json.success) {
        throw $json.errorMessage
    }
    $json
}

if ($CreateSparse10GB -and -not (Test-Path -LiteralPath $FilePath)) {
    Write-Host "Creating sparse-like 10GiB demo file: $FilePath"
    New-SparseLikeFile -Path $FilePath -SizeBytes (10GB)
}

if (-not (Test-Path -LiteralPath $FilePath)) {
    throw "File not found: $FilePath. Use -CreateSparse10GB to create a 10GiB demo file."
}

$file = Get-Item -LiteralPath $FilePath
$fingerprint = "$($file.Name)|$($file.Length)|$($file.LastWriteTimeUtc.Ticks)|$DatasetName|$Version|$Type"

$init = Invoke-JsonPost `
    -Uri "$BaseUrl/api/dataset/upload/init" `
    -Body @{
        fileName = $file.Name
        fileSize = $file.Length
        fileFingerprint = $fingerprint
        datasetName = $DatasetName
        version = $Version
        type = $Type
        remark = $Remark
    }

if (-not $init.success) {
    throw $init.errorMessage
}

$progress = $init.data
$uploadId = $progress.uploadId
$chunkSize = [int]$progress.chunkSize
$totalChunks = [int]$progress.totalChunks
$uploaded = @{}
foreach ($idx in $progress.uploadedPartIndexes) {
    $uploaded[[int]$idx] = $true
}

Write-Host "uploadId=$uploadId"
Write-Host "fileSize=$($file.Length) bytes, chunkSize=$chunkSize, totalChunks=$totalChunks, uploaded=$($uploaded.Count)"

$chunkDir = Join-Path ([System.IO.Path]::GetTempPath()) "tss-dataset-upload-demo"
New-Item -ItemType Directory -Path $chunkDir -Force | Out-Null
$input = [System.IO.File]::OpenRead($file.FullName)
$uploadedThisRun = 0

try {
    for ($partIndex = 0; $partIndex -lt $totalChunks; $partIndex += 1) {
        if ($uploaded.ContainsKey($partIndex)) {
            continue
        }

        if ($StopAfterChunks -gt 0 -and $uploadedThisRun -ge $StopAfterChunks) {
            Write-Host "Simulated interruption after $uploadedThisRun newly uploaded chunks."
            break
        }

        $offset = [long]$partIndex * [long]$chunkSize
        $length = [int][Math]::Min($chunkSize, $file.Length - $offset)
        $chunkPath = Join-Path $chunkDir "part-$partIndex.bin"
        Write-ChunkFile -InputStream $input -ChunkPath $chunkPath -Offset $offset -Length $length

        $success = $false
        for ($attempt = 1; $attempt -le $MaxRetries; $attempt += 1) {
            try {
                $result = Invoke-ChunkUpload -UploadId $uploadId -PartIndex $partIndex -ChunkPath $chunkPath
                $uploaded.Clear()
                foreach ($idx in $result.data.uploadedPartIndexes) {
                    $uploaded[[int]$idx] = $true
                }
                $success = $true
                break
            }
            catch {
                if ($attempt -eq $MaxRetries) {
                    throw
                }
                Start-Sleep -Seconds $attempt
            }
        }

        Remove-Item -LiteralPath $chunkPath -Force -ErrorAction SilentlyContinue
        if ($success) {
            $uploadedThisRun += 1
            $percent = [Math]::Round(($uploaded.Count / $totalChunks) * 100, 2)
            Write-Host "Uploaded part $partIndex; progress=$($uploaded.Count)/$totalChunks ($percent%)"
        }
    }
}
finally {
    $input.Dispose()
}

$progressNow = Invoke-RestMethod -Method Get -Uri "$BaseUrl/api/dataset/upload/progress?uploadId=$uploadId"
if (-not $progressNow.success) {
    throw $progressNow.errorMessage
}

if ($progressNow.data.uploadedChunks -lt $progressNow.data.totalChunks) {
    Write-Host "Upload is not complete yet. Re-run this script with the same parameters to resume."
    $progressNow.data | ConvertTo-Json -Depth 20
    exit 0
}

$complete = Invoke-JsonPost -Uri "$BaseUrl/api/dataset/upload/complete" -Body @{ uploadId = $uploadId }
if (-not $complete.success) {
    throw $complete.errorMessage
}

Write-Host "Completed dataset upload."
$complete.data | ConvertTo-Json -Depth 20
