@REM ----------------------------------------------------------------------------
@REM Apache Maven Wrapper startup batch script
@REM ----------------------------------------------------------------------------

@echo off
@setlocal

set ERROR_CODE=0

@REM Resolve Java: JAVA_HOME (batch exist + PowerShell fallback for symlinks), .jdks, then PATH
set "JAVA_EXE="
if exist "%JAVA_HOME%\bin\java.exe" (
  set "JAVA_EXE=%JAVA_HOME%\bin\java.exe"
  goto javaFound
)
@REM JAVA_HOME may be a symlink: try running java via PowerShell
if defined JAVA_HOME (
  powershell -NoProfile -Command "$j=$env:JAVA_HOME+'\bin\java.exe'; & $j -version 2>$null; if($?) { $j }" > "%TEMP%\mvnw_java.txt" 2>nul
  for /f "usebackq delims=" %%a in ("%TEMP%\mvnw_java.txt") do set "JAVA_EXE=%%a"
  del "%TEMP%\mvnw_java.txt" 2>nul
  if defined JAVA_EXE goto javaFound
)
@REM Try common JDK 17+ installs under Program Files (Microsoft/Java)
for /d %%d in ("%ProgramFiles%\Microsoft\jdk-17*-hotspot") do (
  if exist "%%d\bin\java.exe" (
    set "JAVA_EXE=%%d\bin\java.exe"
    goto javaFound
  )
)
for /d %%d in ("%ProgramFiles%\Java\jdk-17*") do (
  if exist "%%d\bin\java.exe" (
    set "JAVA_EXE=%%d\bin\java.exe"
    goto javaFound
  )
)
@REM Try .jdks subdirs (batch)
for /d %%d in ("%USERPROFILE%\.jdks\*") do (
  if exist "%%d\bin\java.exe" (
    set "JAVA_EXE=%%d\bin\java.exe"
    goto javaFound
  )
)
@REM PowerShell: recursive search under .jdks and JAVA_HOME (handles symlinks)
set "TMP_JAVA=%TEMP%\mvnw_java.txt"
powershell -NoProfile -Command "try { $d=$env:USERPROFILE+'\\.jdks'; $p=[System.IO.Directory]::GetFiles($d,'java.exe',[System.IO.SearchOption]::AllDirectories); if($p){$p[0]} else { $d2=$env:JAVA_HOME; if($d2){ $q=[System.IO.Directory]::GetFiles($d2,'java.exe',[System.IO.SearchOption]::AllDirectories); if($q){$q[0]} } } } catch {}" > "%TMP_JAVA%" 2>nul
for /f "usebackq delims=" %%a in ("%TMP_JAVA%") do set "JAVA_EXE=%%a"
del "%TMP_JAVA%" 2>nul
if defined JAVA_EXE goto javaFound
@REM Fallback: use java from PATH
where java >nul 2>&1
if errorlevel 1 (
  echo Error: No JDK found. Set JAVA_HOME to a JDK 17+ directory that contains bin\java.exe
  echo Example: set JAVA_HOME=C:\Program Files\Java\jdk-17
  echo Current JAVA_HOME = "%JAVA_HOME%"
  set ERROR_CODE=1
  goto end
)
set "JAVA_EXE=java"
:javaFound

@REM Find project base dir (directory containing .mvn)
set MAVEN_PROJECTBASEDIR=%CD%
:findBaseDir
if exist "%MAVEN_PROJECTBASEDIR%\.mvn" goto baseDirFound
cd ..
if "%MAVEN_PROJECTBASEDIR%"=="%CD%" goto baseDirNotFound
set MAVEN_PROJECTBASEDIR=%CD%
goto findBaseDir
:baseDirFound
cd /d "%MAVEN_PROJECTBASEDIR%"
goto endDetectBaseDir
:baseDirNotFound
set MAVEN_PROJECTBASEDIR=%CD%
cd /d "%MAVEN_PROJECTBASEDIR%"
:endDetectBaseDir

set WRAPPER_JAR="%MAVEN_PROJECTBASEDIR%\.mvn\wrapper\maven-wrapper.jar"
set WRAPPER_LAUNCHER=org.apache.maven.wrapper.MavenWrapperMain
set WRAPPER_URL=https://repo.maven.apache.org/maven2/org/apache/maven/wrapper/maven-wrapper/3.2.0/maven-wrapper-3.2.0.jar

@REM Read wrapperUrl from properties if set
for /f "usebackq tokens=1,2 delims==" %%A in ("%MAVEN_PROJECTBASEDIR%\.mvn\wrapper\maven-wrapper.properties") do (
  if "%%A"=="wrapperUrl" set WRAPPER_URL=%%B
)

if not exist %WRAPPER_JAR% (
  echo Downloading Maven Wrapper...
  set "WRAPPER_OUT=%MAVEN_PROJECTBASEDIR%\.mvn\wrapper\maven-wrapper.jar"
  powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('%WRAPPER_URL%', $env:WRAPPER_OUT)"
  if errorlevel 1 (
    echo Failed to download Maven Wrapper. Check network or install Maven: winget install Apache.Maven
    set ERROR_CODE=1
    goto end
  )
)

"%JAVA_EXE%" -classpath %WRAPPER_JAR% "-Dmaven.multiModuleProjectDirectory=%MAVEN_PROJECTBASEDIR%" %WRAPPER_LAUNCHER% %*

if errorlevel 1 set ERROR_CODE=1

:end
@endlocal
exit /b %ERROR_CODE%
