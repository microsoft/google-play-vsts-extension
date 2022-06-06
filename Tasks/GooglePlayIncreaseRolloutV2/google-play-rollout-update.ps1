param (
    [string]$serviceAccountKey,
    [string]$serviceEndpoint,
    [string]$packageName,
    [string]$userFraction
) 
  
$env:INPUT_serviceAccountKey = $serviceAccountKey
$env:INPUT_serviceEndpoint = $serviceEndpoint
$env:INPUT_packageName = $packageName
$env:INPUT_userFraction = $userFraction

node google-play-rollout-update.js
