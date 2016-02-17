param (
    [string]$serviceAccountKey,
    [string]$serviceAccount,
    [string]$packageName,
    [string]$userFraction
) 
  
$env:INPUT_serviceAccountKey = $serviceAccountKey
$env:INPUT_serviceAccount = $serviceAccount
$env:INPUT_packageName = $packageName
$env:INPUT_userFraction = $userFraction

node google-play-rollout-update.js