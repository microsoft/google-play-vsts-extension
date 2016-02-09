param (
    [string]$serviceAccountKey,
    [string]$apkFile,
    [string]$track,
    [string]$userFraction,
    [string]$changeLogFile
) 
  
$env:INPUT_serviceAccountKey = $serviceAccountKey
$env:INPUT_apkFile = $apkFile
$env:INPUT_track = $track
$env:INPUT_userFraction = $userFraction
$env:INPUT_changeLogFile = $changeLogFile

node GooglePlay.js