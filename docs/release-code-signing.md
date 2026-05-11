# Windows Code Signing Release Notes

This project uses `electron-builder` to create the Windows NSIS installer. Public
release builds should be Authenticode-signed so Windows and Microsoft
Edge can show a verified publisher instead of treating the installer as an
unknown app. Small-group releases can be built unsigned when paying for a code
signing certificate is not worth it yet.

## What Changed

- `build.win.signAndEditExecutable` is disabled by default so small-group
  releases can build without paid signing credentials.
- The GitHub release workflow detects signing secrets. If they are present, it
  builds and verifies a signed installer. If they are missing, it builds an
  unsigned installer and records that fact in `dist/UNSIGNED-RELEASE.txt`.
- `scripts/verify-signatures.ps1` checks generated `.exe` files with
  `Get-AuthenticodeSignature`.
- Certificate file extensions are ignored by git to reduce the chance of
  accidentally committing private signing material.

## Optional GitHub Secrets

Add these repository secrets when you want a signed public release. The workflow
maps them to both `WIN_CSC_*` and `CSC_*` environment variables for
`electron-builder`. If these secrets are not configured, the release workflow
still creates an unsigned installer.

| Secret | Value |
| --- | --- |
| `WIN_CSC_LINK` | Base64-encoded `.pfx` or `.p12` certificate, or another `electron-builder`-supported certificate reference |
| `WIN_CSC_KEY_PASSWORD` | Password for the certificate |

To encode a local certificate file on Windows:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\windows-code-signing.pfx")) | Set-Content -NoNewline "WIN_CSC_LINK.txt"
```

Put the contents of `WIN_CSC_LINK.txt` into the GitHub secret named
`WIN_CSC_LINK`. Put the certificate password into `WIN_CSC_KEY_PASSWORD`.

Do not commit the certificate file or password to this repository.

## Local Build

Unsigned local builds are the default:

```powershell
npm run build
```

To test signing locally, set the variables for the current shell and enable
signing before building:

```powershell
$env:WIN_CSC_LINK = "C:\path\to\windows-code-signing.pfx"
$env:WIN_CSC_KEY_PASSWORD = "certificate-password"
npx electron-builder --config.win.signAndEditExecutable=true
npm run verify:signatures
```

## Release Verification

After a release build, verify the generated installers:

```powershell
npm run verify:signatures
```

Expected result:

- Every generated `dist/*.exe` reports `Status: Valid`.
- The signer subject shows the expected publisher identity.

## SmartScreen Expectation

Code signing improves trust, but it may not remove SmartScreen warnings
immediately for a new app or a new file hash. Microsoft SmartScreen evaluates
publisher reputation and file reputation. New installers can still need download
history before warnings disappear.

References:

- https://www.electron.build/code-signing.html
- https://www.electron.build/code-signing-win.html
- https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation
- https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options
