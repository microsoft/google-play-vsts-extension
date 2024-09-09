param (
    [string]$serviceAccountKey,
    [string]$serviceEndpoint,
    [string]$packageName,
    [string]$sourceTrack,
    [string]$destinationTrack,
    [string]$userFraction,
    [string]$changeLogFile,
    [string]$languageCode,
    [boolean]$releaseNotesContainLanguageTags
) 
  
$env:INPUT_serviceAccountKey = $serviceAccountKey
$env:INPUT_serviceEndpoint = $serviceEndpoint
$env:INPUT_packageName = $packageName
$env:INPUT_sourceTrack = $sourceTrack
$env:INPUT_destinationTrack = $destinationTrack
$env:INPUT_userFraction = $userFraction
$env:INPUT_changeLogFile = $changeLogFile
$env:INPUT_languageCode = $languageCode
$env:INPUT_releaseNotesContainLanguageTags = $releaseNotesContainLanguageTags

node google-play-promote.js
