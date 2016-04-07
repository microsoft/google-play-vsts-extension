echo '<table style="width: 100%; border-style: none;"><tr>
<td style="width: 140px; text-align: center;"><img src="android_default.png" style="max-width: 100%"/></td>
<td><strong>Visual Studio Team Services Extension for Google Play</strong><br />
<i>Provides build/release tasks that enable performing continuous delivery to the Google Play store from an automated VSTS build or release definition</i><br />
<a href="https://marketplace.visualstudio.com/items/ms-vsclient.google-play">Install now!</a>
</td>
</tr></table>
' > README.md

cat baseREADME.md >> README.md
cat baseREADME.md > docs/vsts-README.md

echo '## Terms of Use
By downloading and running this project, you agree to the license terms of the third party application software, Microsoft products, and components to be installed. 

The third party software and products are provided to you by third parties. You are responsible for reading and accepting the relevant license terms for all software that will be installed. Microsoft grants you no rights to third party software.

## License

```
The MIT License (MIT)

Copyright (c) Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
' >> README.md

echo 'Google Play and the Google Play logo are trademarks of Google Inc.' >> README.md
echo 'Google Play and the Google Play logo are trademarks of Google Inc.' >> docs/vsts-README.md

