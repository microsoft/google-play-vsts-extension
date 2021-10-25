# Migrating from GooglePlayRelease@3 to GooglePlayRelease@4

You will need to fill a new required input - "Application Id".

The key difference is the "Action" input:
- If you used to publish a single APK, choose "Upload single apk" option.
- If you used to publish a primary APK and additional APKs, choose "Upload multiple apk/aab files" option.
- If you had "Update only store listing" input enabled in your GooglePlayRelease@3 configuration, choose "Only update store listing" option.

# Migrating from GooglePlayReleaseBundle@3 to GooglePlayRelease@4

The key difference is the "Action" input:
- If you used to publish a single bundle, choose "Upload single bundle" option.
- You may now also publish multiple AAB files as a part of the same release by choosing the "Upload multiple apk/aab files" option.

# General migration tips

- Some inputs have been reordered in the UI. Please refer to the [GooglePlayRelease@4 documentation](/README.md#google-play-release) for further info.
- You may no longer upload mapping files in case of multi-file release. We may implement this feature in the future if requested.
- "Update APK(s)" input is no longer available. Now the APKs are uploaded by default. If you only need to update changelog or store listing, choose "Only update store listing" value of the "Action" input.

# GooglePlayRelease@4 YAML code examples

## Releasing a single APK file

```yaml
- task: GooglePlayRelease@4
  displayName: 'Release apk'
  inputs:
    serviceEndpoint: 'ServiceEndpointName'
    applicationId: 'com.org.appId'
    action: 'SingleApk'
    apkFile: '/path/to/application.apk'
    track: 'internal'
```

## Releasing a single APK file with mapping

```yaml
- task: GooglePlayRelease@4
  displayName: 'Release apk with mapping'
  inputs:
    serviceEndpoint: 'ServiceEndpointName'
    applicationId: 'com.org.appId'
    action: 'SingleApk'
    apkFile: '/path/to/application.apk'
    track: 'internal'
    shouldUploadMappingFile: true
    mappingFilePath: /path/to/mapping.txt
```

## Releasing a single bundle file

```yaml
- task: GooglePlayRelease@4
  displayName: 'Release aab'
  inputs:
    serviceEndpoint: 'ServiceEndpointName'
    applicationId: 'com.org.appId'
    action: 'SingleBundle'
    bundleFile: '/path/to/application.aab'
    track: 'internal'
```

## Releasing bundle and APK as a part of the same release

```yaml
- task: GooglePlayRelease@4
  displayName: 'Release aab with mapping'
  inputs:
    serviceEndpoint: 'ServiceEndpointName'
    applicationId: 'com.org.appId'
    action: 'MultiApkAab'
    apkFiles: '/path/to/application.apk'
    bundleFiles: '/path/to/application.aab'
    track: 'internal'
```

## Releasing two APKs and one bundle using different advanced options

You can find additional info about each input in the input description or in the [GooglePlayRelease@4 documentation](/README.md#google-play-release).

```yaml
- task: GooglePlayRelease@4
  displayName: 'Advanced release'
  inputs:
    serviceEndpoint: 'ServiceEndpointName'
    applicationId: 'com.org.appId'
    action: 'MultiApkAab'
    bundleFiles: /path/to/application.aab
    apkFiles: |
      /path/to/application1.apk
      /path/to/application2.apk
    shouldPickObbFile: true # OBB file will be automatically picked up for each APK if present
    shouldAttachMetadata: true # Metadata in fastlane format
    metadataRootPath: '/path/to/metadata'
    track: 'internal'
    changeUpdatePriority: true
    updatePriority: '2'
    rolloutToUserFraction: true
    userFraction: '0.6'
    releaseName: 'Release name'
    versionCodeFilterType: 'list'
    replaceList: '4215,4216'
```

## Update only store listing

```yaml
- task: GooglePlayRelease@4
  displayName: 'Update only store listing'
  inputs:
    serviceEndpoint: 'ServiceEndpointName'
    applicationId: 'com.org.appId'
    action: 'OnlyStoreListing'
    shouldAttachMetadata: true
    metadataRootPath: '/path/to/metadata'
```
