echo "====[ Installing Dependencies..."
npm install --only=prod
node bin/tfxupload.js --installonly

echo "====[ Creating VSIX..."
tfx extension create --manifest-globs vsts-extension-google-play.json --override '{ "public": true }'
