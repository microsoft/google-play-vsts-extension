param (
    [string]$serviceAccountKey,
    [string]$serviceEndpoint,
    [string]$applicationId,
    [string]$bundleFile,
    [string]$track,
    [string]$userFraction,
    [string]$changeLogFile
) 
  
$env:INPUT_serviceAccountKey = $serviceAccountKey
$env:INPUT_serviceEndpoint = $serviceEndpoint
$env:INPUT_applicationId = $applicationId
$env:INPUT_bundleFile = $bundleFile
$env:INPUT_track = $track
$env:INPUT_userFraction = $userFraction
$env:INPUT_changeLogFile = $changeLogFile

node GooglePlay.js
