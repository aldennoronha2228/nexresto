# NexResto Desktop (Windows)

This folder contains an updater-enabled Electron wrapper for NexResto.

## Why this exists

Older ZIP/EXE builds do not auto-update. Users must install this updater-enabled installer once.
After that, future releases are detected and installed automatically.

## Local build

1. Install desktop dependencies:

```bash
cd desktop
npm install
```

2. Build installer:

```bash
npm run dist
```

3. Verify installer signature (recommended before distribution):

```bash
npm run verify:signature
```

Installer output will be in `desktop/dist`.

## Release and auto-update channel

- GitHub Action in `.github/workflows/windows-desktop-release.yml` publishes release artifacts.
- `electron-updater` checks GitHub Releases for updates.
- Updates are downloaded in background and applied on restart.

## Prevent "Suspicious download blocked" on Windows/Chrome

Unsigned `.exe` files are commonly blocked by browser Safe Browsing and Windows SmartScreen.

To reduce blocking significantly:

1. Use a code-signing certificate (OV or EV).
2. Add certificate secrets in GitHub repository settings:
	- `CSC_LINK` and `CSC_KEY_PASSWORD` (or `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`)
	- Optional subject name: `CSC_NAME` / `WIN_CSC_NAME`
3. Publish only signed installers (workflow now enforces this for publish jobs).
4. Keep product name, executable name, and icon stable across releases.

If a browser blocks direct `.exe` downloads, use the CI build artifact `.zip` package and verify the included `.sha256` checksum before running the installer.

Notes:

- EV certificates generally gain SmartScreen reputation faster.
- A new certificate or brand-new app can still show warnings temporarily until reputation builds.

## One-time migration for existing users

Users with old ZIP/EXE builds must manually install the new installer one time.
After this migration, updates are automatic.
