import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
    DEFAULT_REFRESH_INTERVAL_SECS,
    MAX,
    MIN,
    defaultConfig,
    getConfigPath,
    normalizeRefreshInterval,
    normalizeServerUrl,
    readDesktopConfig,
    writeDesktopConfig,
} from "../desktopConfig.js";

assert.equal(DEFAULT_REFRESH_INTERVAL_SECS, 30);
assert.equal(MIN, 5);
assert.equal(MAX, 3600);

assert.deepEqual(defaultConfig(), {
    server_url: null,
    refresh_interval_secs: 30,
    notifications_enabled: true,
    start_minimized: false,
});

assert.equal(normalizeServerUrl(""), null);
assert.equal(normalizeServerUrl("192.168.1.201"), "http://192.168.1.201");
assert.equal(
    normalizeServerUrl("http://airgradient.local///"),
    "http://airgradient.local",
);
assert.equal(
    normalizeServerUrl(
        " https://airgradient.local:8443/measures/current?x=1#readings ",
    ),
    "https://airgradient.local:8443",
);
assert.equal(normalizeServerUrl("ftp://airgradient.local"), null);
assert.equal(normalizeServerUrl("http://"), null);
assert.equal(normalizeServerUrl("http://air gradient.local"), null);

assert.equal(normalizeRefreshInterval(null), 30);
assert.equal(normalizeRefreshInterval(1), 5);
assert.equal(normalizeRefreshInterval(9000), 3600);
assert.equal(normalizeRefreshInterval(12.4), 12);

const previousXdgConfigHome = process.env.XDG_CONFIG_HOME;
const previousHome = process.env.HOME;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "airgradient-config-"));

try {
    process.env.XDG_CONFIG_HOME = tempDir;
    process.env.HOME = "";

    assert.equal(
        getConfigPath(),
        path.posix.join(tempDir, "airgradient-desktop", "config.json"),
    );
    assert.deepEqual(readDesktopConfig(), defaultConfig());

    const written = writeDesktopConfig({
        server_url: "airgradient.local/measures/current",
        refresh_interval_secs: 2,
        notifications_enabled: false,
        start_minimized: true,
        ignored: "field",
    });

    assert.deepEqual(written, {
        server_url: "http://airgradient.local",
        refresh_interval_secs: 5,
        notifications_enabled: false,
        start_minimized: true,
    });
    assert.deepEqual(readDesktopConfig(), written);
} finally {
    if (previousXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previousXdgConfigHome;

    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;

    fs.rmSync(tempDir, { force: true, recursive: true });
}
