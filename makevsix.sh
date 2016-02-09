#!/bin/bash
echo ""
echo "Copyright (c) Microsoft. All rights reserved."
echo "Licensed under the MIT license. See LICENSE file in the project root for full license information."
echo ""

if ! npm --version > /dev/null ; then
    echo "npm not found. please install npm and run again."
    return 1;
fi

if ! tfx --version > /dev/null ; then
    echo "tfx-cli not found. installing..."
    npm install -g tfx-cli
fi

echo "Installing Dependencies..."
npm install --only=prod
node bin/tfxupload.js --installonly

if [ $1 == "create" ] ; then
  echo "Creating VSIX..."
  tfx extension create --manifest-globs vso-extension-android.json --override '{ "public": true }'
fi

if [ $1 == "createtest" ] ; then
  echo "Creating Test VSIX..."
  tfx extension create --manifest-globs vso-extension-android.json --override '{ "public": "false", "name": "Google Play Store Deploy-Dev", "id": "vso-extension-android-dev", "publisher": "ms-mobiledevops-test"}' --share-with mobiledevops x04ty29er --token $PUBLISH_ACCESSTOKEN
fi

if [ $1 == "publishtest" ] ; then
  echo "Creating and publishing test VSIX..."
  tfx extension publish --manifest-globs vso-extension-android.json --override '{ "public": "false", "name": "Google Play Store Deploy-Dev", "id": "vso-extension-android-dev", "publisher": "ms-mobiledevops-test"}' --share-with mobiledevops x04ty29er --token $PUBLISH_ACCESSTOKEN
fi