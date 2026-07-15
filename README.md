# AirGradient GNOME Extension

GNOME Shell 50+ panel extension for the same AirGradient local-server workflow
used by `airgradient-desktop`.

The extension is intentionally icon-only in the top bar. The icon color reflects
the current air-quality status. Clicking it opens a compact Shell popup with
gauges for AQI, CO2, particles, TVOC, NOx, temperature, humidity, trends, fetch
status, and a manual refresh action.

## Shared Config

The extension reads and writes the desktop app config file:

```text
$XDG_CONFIG_HOME/airgradient-desktop/config.json
```

If `XDG_CONFIG_HOME` is not set, it falls back to:

```text
$HOME/.config/airgradient-desktop/config.json
```

The JSON shape is compatible with `airgradient-desktop`:

```json
{
  "server_url": "http://192.168.1.201",
  "refresh_interval_secs": 30,
  "notifications_enabled": true,
  "start_minimized": false
}
```

`server_url` is the base URL. The extension always fetches:

```text
<server_url>/measures/current
```

The preferences window accepts bare hosts such as `192.168.1.201`, normalizes
them to HTTP, strips path/query/fragment, and stores the normalized base URL.

## Code Layout

- `extension.js`: Shell lifecycle and orchestration.
- `airgradientSensors.js`: payload parsing, thresholds, AQI fallback, trends.
- `airgradientAlerts.js`: notification policy and cooldown state.
- `airgradientPresentation.js`: popup view models and metric definitions.
- `airgradientHttpClient.js`: Soup/Gio HTTP adapter.
- `desktopConfig.js`: shared desktop JSON config compatibility.
- `desktopConfigMonitor.js`: shared config file watcher.
- `airgradientPopup.js`: GNOME Shell popup and panel icon widgets.
- `prefs.js`: libadwaita preferences window for the shared config.

## Requirements

- GNOME Shell 50+
- GJS 1.88+
- `gnome-extensions`
- `glib-compile-schemas`
- Node.js and npm for linting, formatting, and smoke tests
- `mutter-devkit` package for nested Wayland shell testing

## Development

Install JavaScript tooling:

```sh
npm install
```

Run parser/config smoke tests:

```sh
node tests/sensors-smoke.mjs
node tests/config-smoke.mjs
```

Run the full repo check:

```sh
npm run check
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for module boundaries,
dependency direction, and the testing strategy.

Format code:

```sh
npm run format
```

Pack a distributable extension bundle:

```sh
npm run pack
```

## CI/CD

GitHub Actions runs `npm run check` for branch pushes and pull requests.

Releases are published by the `Release` workflow. Push a version tag:

```sh
git tag v1.0.0
git push origin v1.0.0
```

Or run the workflow manually from GitHub Actions and provide a version such as
`1.0.0` or `v1.0.0`. The workflow validates the extension, packs it, creates the
tag for manual runs if needed, and uploads the extension zip to a GitHub Release.

### Publishing to extensions.gnome.org

GNOME does not offer an official API for automated uploads, and every release
still goes through manual review by GNOME staff regardless of how it's
submitted. To publish a new version there, download the
`airgradient@worxbend.dev.shell-extension.zip` asset from the GitHub Release
and upload it by hand at https://extensions.gnome.org/upload/. This
deliberately keeps GNOME account credentials out of CI.

Install the bundle for the current user:

```sh
npm run install:local
```

Start a nested GNOME Shell development session:

```sh
npm run dev:shell
```

Inside the nested session, enable the extension:

```sh
gnome-extensions enable airgradient@worxbend.dev
```

Open preferences:

```sh
npm run prefs
```

Watch shell logs while debugging:

```sh
journalctl -f -o cat /usr/bin/gnome-shell
```

Watch preferences logs:

```sh
journalctl -f -o cat /usr/bin/gjs
```

## GNOME References

- https://gjs.guide/extensions/development/creating.html
- https://gjs.guide/extensions/development/preferences.html
- https://gjs.guide/extensions/development/targeting-older-gnome.html
- https://release.gnome.org/50/developers/
