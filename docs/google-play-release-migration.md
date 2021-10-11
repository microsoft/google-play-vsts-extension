# Migrating from GooglePlayRelease@3 to GooglePlayRelease@4

You will need to fill a new required input - "Application Id".

They key difference is the "Action" input:
- If you used to publish a single APK, choose "Upload single apk" option.
- If you used to publish a primary APK and additional APKs, choose "Upload multiple apk/aab files" option.
- If you had "Update only store listing" input enabled in your GooglePlayRelease@3 configuration, choose "Only update store listing" option.

# Migrating from GooglePlayReleaseBundle@3 to GooglePlayRelease@4

They key difference is the "Action" input:
- If you used to publish a single bundle, choose "Upload single bundle" option.
- You may now also publish multiple AAB files as a part of the same release by choosing the "Upload multiple apk/aab files" option.

# General migration tips

- Some inputs have been reordered in the UI. Please refer to the [GooglePlayRelease@4 documentation](/README.md#google-play-release) for further info.
- You may no longer upload mapping files in case of multi-file release. We may implement this feature in the future if requested.
- "Update APK(s)" input is no longer available. Now the APKs are uploaded by default. If you only need to update changelog or store listing, choose "Only update store listing" value of the "Action" input.
