# Receipt Studio

A local Electron desktop app for synthetic temperature-log receipts. It has a dark interface, separate sensor temperature ranges, a continuous receipt preview and PDF export.

The generated readings are simulated test data, not measurements from a temperature recorder. PDF metadata identifies them as synthetic. Do not use generated logs as evidence of actual cargo temperatures.

## Clone and run

Install Git and Node.js 22.12 or newer with npm. Node.js 22 or 24 LTS is recommended. Then run:

```sh
git clone https://github.com/suscabogdan/receipt-studio.git
cd receipt-studio
npm ci
npm start
```

`npm start` opens the desktop app. `npm run dev` and `npm run run` are aliases for the same command. No API keys, database, account, environment file or web server are needed.

Dependency installation and the first launch need internet. Electron 44 downloads its native runtime on first use, so the first `npm start` can take longer. Install development dependencies too, because Electron is a development dependency. Do not use `npm ci --omit=dev` or copy another machine's `node_modules` folder. Once dependencies and the runtime are installed, the app works offline. On later launches, run `npm start` again. Restart the app after editing the source.

This is a desktop app, not a hosted website. Opening `index.html` in a browser provides a preview only, without native PDF export.

### Windows

The npm instructions above are the recommended development workflow on 64-bit Windows 10/11. Two optional launchers are included:

- `Run-Source-Windows.cmd` checks for Node.js and installs locked dependencies if Electron is missing, then starts the app.
- `Start-Windows.cmd` runs the editable source without Node.js. It downloads the official Electron 44.9.1 Windows x64 runtime on first launch, verifies its SHA-256 checksum, and saves it in the ignored `.runtime-44.9.1-win-x64` folder. Later launches work offline. This launcher targets Intel/AMD x64 Windows, not 32-bit Windows or native ARM64.

Extract or clone the whole repository before using a launcher. Keep the source files together. No launcher requires administrator access or changes Windows security settings. A managed PC or network can still block downloads or execution.

### macOS and Linux

Use the same `npm ci` and `npm start` commands in a graphical desktop session. Electron downloads its native build for the current platform and CPU on first use. On macOS the window can close while the app remains in the Dock; use Quit to end it.

Linux needs Electron's system libraries. On Ubuntu 24.04, missing-library errors can normally be resolved with:

```sh
sudo apt-get update
sudo apt-get install libgtk-3-0t64 libnss3 libasound2t64 libgbm1
```

Package names vary by distribution. Run as a normal desktop user, not root. Do not disable Electron's sandbox to work around a permissions error. A headless server, SSH-only session or container without a display cannot open the normal desktop app.

If Linux reports that the SUID sandbox helper is not configured correctly, an administrator must configure the official Electron helper in this checkout. Only do this for a checkout and downloaded runtime you trust:

```sh
npx --no-install install-electron
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
npm start
```

Reinstalling dependencies removes this configuration. The app does not run these administrator commands automatically. The Linux CI runner configures the helper explicitly and keeps sandboxing enabled.

## Use the app

1. Select FINE NAME or VELTO TRANS.
2. Enter a registration number, date and start/end times.
3. Set separate Min/Max temperatures for the two sensors.
4. Choose a sampling interval and click Generate preview.
5. Inspect the receipt, then click Export to PDF and choose a destination.

Every generation creates a new random series. Export uses the exact preview values and never randomizes again. Changing an input disables export until the preview is regenerated. Recorder details contains editable model, serial number and set-point fields.

Range limits accept a decimal point or comma and must be between -100 and 100 degrees Celsius. Minimum and maximum values are excluded, including after one-decimal formatting. For example, a range of 2 to 4 permits 2.1 through 3.9. A range with no interior one-decimal value is rejected. If only one interior value exists, the series is constant.

Each sensor has an independent bounded random walk. Adjacent readings differ by at most 0.5 degrees Celsius. Shorter gaps use smaller steps, and every pair within 15 minutes also differs by at most 0.5 degrees. Values may repeat.

The end time is always included. An earlier end time means the following day; equal start and end times produce one reading. Midnight adds a dated heading within the same continuous receipt.

## Tests

After `npm ci`:

```sh
npm test
npm run test:electron
```

The core tests check the random ranges, temperature drift, layout, glyphs, PDF encoding and setup consistency. The Electron test opens the actual app with an isolated test profile and checks both company choices, generation, preview pixels, long receipts, zoom, scrolling, stale/dirty input protection and PDF export through IPC. It stubs the save dialog and writes test PDFs/screenshots locally. It does not test interacting with the operating system's native save dialog.

For a headless Linux CI session with Electron's libraries and Xvfb installed:

```sh
xvfb-run -a npm run test:electron
```

GitHub Actions runs a clean dependency install, the core tests and the Electron test on Windows, macOS and Linux for pushes and pull requests. The Actions tab records the result for each commit. Test outputs and preferences are ignored by Git. The bitmap fixture contains only numeric regression cells, not a complete source receipt.

## Source files

- `main.js` handles the desktop window, settings and PDF save dialog.
- `preload.js` exposes the isolated IPC bridge.
- `index.html`, `styles.css` and `renderer.js` implement the interface.
- `engine.js` generates readings and renders the receipt pixels.
- `glyphs.js` contains the bitmap character cells.
- `pdf.js` exports the same pixels as a PDF without a third-party PDF library.
- `tests/` contains the core and Electron runtime checks.

## Data and privacy

The app does not send inputs or generated readings to a server. Successful generation saves input preferences in Electron's per-user application data directory. Exported PDFs stay at the path you choose.

The repository does not contain saved inputs, user profiles, original reference photos/PDFs, generated receipts, installed dependencies or built executables. Do not commit real customer data or generated documents. Test mode uses `.test-data`; its outputs go to `test-artifacts`. `RECEIPT_STUDIO_TEST_DIR` can select a separate local profile for manual development testing.

## PDF and printing

The preview is a continuous, scrollable 355-pixel-wide bitmap. Export creates one custom-height PDF page with an RGB image, 8 bits per component and ASCII85/Flate compression. Page width is 141.9987 points. Page height grows at 0.4 points per image pixel. Character cells are 6 x 14 pixels and reading rows are 22 pixels apart. Zoom changes the preview only, not the exported pixels.

The receipt has side-by-side I1: FATA / I2: SPATE labels, matching dashed rules and no repeated footer or pagination. Longer logs extend the strip rather than shrink the text. Use printer roll/page-length settings suitable for the document. Fitting a long receipt onto short paper can shrink it. Automated tests do not prove physical print quality on a particular printer.

## Optional Windows builds

Building is separate from running the source. After installing dependencies:

```sh
npm test
npm run package:windows
npm run package:source
```

`Build-Windows.cmd` runs the core tests and Windows build. Outputs appear under the ignored `release/` directory. The Windows build targets x64 and produces an NSIS installer and a portable ZIP. Both include Electron and need no Node.js installation. They are unsigned and may trigger Windows warnings. No auto-updater, publishing service or signing certificate is configured. Generated installers are not part of this repository, and editing source does not change an existing build until you rebuild it.

`npm run package:source` creates a source-only ZIP using the installed build tools. Electron 44.9.1 and electron-builder 26.18.0 are pinned in the manifest and lockfile.
