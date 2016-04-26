echo '<table style="width: 100%; border-style: none;"><tr>
<td width="140px" style="text-align: center;"><img src="android_default.png" style="max-width:100%" /></td>
<td><strong>Visual Studio Team Services Extension for Google Play</strong><br />
<i>Provides build/release tasks that enable performing continuous delivery to the Google Play store from an automated VSTS build or release definition</i><br />
<a href="https://marketplace.visualstudio.com/items/ms-vsclient.google-play">Install now!</a>
</td>
</tr></table>
' > README.md

cat baseREADME.md >> README.md
cat baseREADME.md > docs/vsts-README.md

echo 'Google Play and the Google Play logo are trademarks of Google Inc.' >> README.md
echo 'Google Play and the Google Play logo are trademarks of Google Inc.' >> docs/vsts-README.md
