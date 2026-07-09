$ProjectRootMapped = $PSScriptRoot
$Desktop       = [Environment]::GetFolderPath("Desktop")
$OutputAPK     = "$Desktop\TheOne.apk"
$AndroidSDK    = "C:\Users\santa\AppData\Local\Android\Sdk"

# Paths using the physical path to prevent Node/Gradle "different roots" path mismatches
$AndroidDirMapped  = "$ProjectRootMapped\android"
$JDK17Mapped       = "$ProjectRootMapped\jdk17\jdk-17.0.11+9"
$GradleAPKMapped   = "$AndroidDirMapped\app\build\outputs\apk\release\app-release.apk"

# Set environment
$env:JAVA_HOME    = $JDK17Mapped
$env:ANDROID_HOME = $AndroidSDK
$env:Path         = "C:\Users\santa\node-v20.18.0-win-x64;$JDK17Mapped\bin;$AndroidSDK\platform-tools;$env:Path"

Write-Host ""
Write-Host "=== THE ONE - Clean APK Build ===" -ForegroundColor DarkYellow
Write-Host "  JAVA_HOME    : $env:JAVA_HOME" -ForegroundColor Gray
Write-Host "  ANDROID_HOME : $env:ANDROID_HOME" -ForegroundColor Gray
Write-Host "  Output       : $OutputAPK" -ForegroundColor Gray
Write-Host "  Project Root : $ProjectRootMapped" -ForegroundColor Gray
Write-Host ""

try {
    # Step 1 - Ensure local sound assets are downloaded
    Write-Host "=== [1/4] Checking local sound assets ===" -ForegroundColor Cyan
    $SoundsDir = "$ProjectRootMapped\assets\sounds"
    if (!(Test-Path $SoundsDir)) {
        New-Item -ItemType Directory -Path $SoundsDir -Force | Out-Null
    }

    $Sounds = @{
        "click.wav"   = "https://assets.mixkit.co/active_storage/sfx/2568/2568-84.wav"
        "success.wav" = "https://assets.mixkit.co/active_storage/sfx/2019/2019-84.wav"
        "cancel.wav"  = "https://assets.mixkit.co/active_storage/sfx/2517/2517-84.wav"
        "slide.wav"   = "https://assets.mixkit.co/active_storage/sfx/2700/2700-84.wav"
    }

    foreach ($file in $Sounds.Keys) {
        $filePath = "$SoundsDir\$file"
        if (!(Test-Path $filePath)) {
            Write-Host "  Downloading: $file..." -ForegroundColor Gray
            try {
                Invoke-WebRequest -Uri $Sounds[$file] -OutFile $filePath -UserAgent "Mozilla/5.0" -ErrorAction Stop
                Write-Host "    Successfully downloaded $file" -ForegroundColor Green
            } catch {
                Write-Host "    Failed to download $($file) - Error: $_. Writing silent WAV fallback." -ForegroundColor Yellow
                # Write a valid 44-byte silent WAV file to prevent compilation crash
                [IO.File]::WriteAllBytes($filePath, [Convert]::FromBase64String("UklGRiQAAABXQVZFZm10IBQAAAABAAEAIQ8AACEPAAABAAgAZGF0YQAAAAA="))
            }
        } else {
            Write-Host "  $file already exists." -ForegroundColor Gray
        }
    }
    Write-Host "  Sound assets check complete." -ForegroundColor Green
    Write-Host ""

    # Step 2 - Manually wipe stale CMake + build caches (avoids GLOB mismatch errors)
    Write-Host "=== [2/4] Wiping stale build caches ===" -ForegroundColor Cyan

    $foldersToDelete = @(
        "$AndroidDirMapped\app\.cxx",
        "$AndroidDirMapped\app\build",
        "$AndroidDirMapped\build"
    )

    foreach ($folder in $foldersToDelete) {
        if (Test-Path $folder) {
            Write-Host "  Deleting: $folder" -ForegroundColor Gray
            Remove-Item -Recurse -Force $folder -ErrorAction SilentlyContinue
        }
    }

    # Also remove old manual bundle if present
    $oldBundle = "$AndroidDirMapped\app\src\main\assets\index.android.bundle"
    if (Test-Path $oldBundle) {
        Remove-Item $oldBundle -Force
        Write-Host "  Removed old bundle artifact." -ForegroundColor Gray
    }

    Write-Host "  Cache wipe complete." -ForegroundColor Green
    Write-Host ""

    # Step 3 - Gradle assembleRelease (NO clean task - we already cleaned manually above)
    Write-Host "=== [3/4] Gradle assembleRelease ===" -ForegroundColor Cyan
    Set-Location $AndroidDirMapped
    & ".\gradlew.bat" assembleRelease --no-daemon `
        "-Dorg.gradle.java.home=$JDK17Mapped"

    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "  ERROR: Gradle build failed. Check output above." -ForegroundColor Red
        exit 1
    }

    # Step 4 - Copy to Desktop
    Write-Host ""
    Write-Host "=== [4/4] Copying APK to Desktop ===" -ForegroundColor Cyan
    if (Test-Path $GradleAPKMapped) {
        Copy-Item $GradleAPKMapped -Destination $OutputAPK -Force
        $sizeMB = [math]::Round((Get-Item $OutputAPK).Length / 1MB, 1)
        Write-Host ""
        Write-Host "  BUILD SUCCESSFUL" -ForegroundColor Green
        Write-Host "  APK on Desktop: TheOne.apk ($sizeMB MB)" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "  ERROR: APK not found. Check Gradle output above." -ForegroundColor Red
        exit 1
    }
} finally {
    Write-Host ""
    Set-Location $PSScriptRoot
}
