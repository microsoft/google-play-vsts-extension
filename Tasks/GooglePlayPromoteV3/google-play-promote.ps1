param (
    [string]$serviceAccountKey,
    [string]$serviceEndpoint,
    [string]$packageName,
    [string]$sourceTrack,
    [string]$destinationTrack,
    [string]$userFraction
) 
  
$env:INPUT_serviceAccountKey = $serviceAccountKey
$env:INPUT_serviceEndpoint = $serviceEndpoint
$env:INPUT_packageName = $packageName
$env:INPUT_sourceTrack = $sourceTrack
$env:INPUT_destinationTrack = $destinationTrack
$env:INPUT_userFraction = $userFraction

node google-play-promote.js
