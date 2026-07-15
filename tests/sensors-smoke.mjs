import assert from "node:assert/strict";

import { AlertMonitor, AlertSeverity } from "../airgradientAlerts.js";
import {
    aqiStatusColor,
    co2StatusColor,
    formatMetricValue,
    noxStatusColor,
    overallStatus,
    parseAirMeasurements,
    pm25StatusColor,
    trend,
    tvocStatusColor,
} from "../airgradientSensors.js";

const localServerPayload = {
    wifi: -46,
    serialno: "ecda3b1eaaaf",
    rco2: 447,
    pm01: 3,
    pm02: 7,
    pm10: 8,
    pm003Count: 442,
    atmp: 25.87,
    atmpCompensated: 24.47,
    rhum: 43,
    rhumCompensated: 49,
    tvocIndex: 100,
    tvocRaw: 33051,
    noxIndex: 1,
    noxRaw: 16307,
};

const snapshot = parseAirMeasurements(localServerPayload);

assert.equal(snapshot.co2, 447);
assert.equal(snapshot.pm1, 3);
assert.equal(snapshot.pm25, 7);
assert.equal(snapshot.pm10, 8);
assert.equal(snapshot.pm003Count, 442);
assert.equal(snapshot.temperature, 24.47);
assert.equal(snapshot.humidity, 49);
assert.equal(snapshot.tvoc, 100);
assert.equal(snapshot.tvocUnit, "index");
assert.equal(snapshot.nox, 1);
assert.equal(snapshot.noxUnit, "index");
assert.equal(Math.round(snapshot.aqi), 29);

const nestedPayload = {
    device: {
        measurements: [
            {
                rco2: "812",
                pm02: "13.2",
                atmpCompensated: "22.4",
                rhumCompensated: "45.5",
            },
            {
                tvocIndex: "110",
                noxIndex: "3",
                pm003Count: "1200",
            },
        ],
    },
};

const nested = parseAirMeasurements(nestedPayload);

assert.equal(nested.co2, 812);
assert.equal(nested.pm25, 13.2);
assert.equal(nested.temperature, 22.4);
assert.equal(nested.humidity, 45.5);
assert.equal(nested.tvoc, 110);
assert.equal(nested.tvocUnit, "index");
assert.equal(nested.nox, 3);
assert.equal(nested.noxUnit, "index");
assert.equal(nested.pm003Count, 1200);

assert.equal(co2StatusColor(799.9), "green");
assert.equal(co2StatusColor(800), "yellow");
assert.equal(pm25StatusColor(35), "orange");
assert.equal(aqiStatusColor(301), "maroon");
assert.equal(overallStatus({ aqi: 42, co2: 1500, pm25: 8 }), "orange");
assert.equal(overallStatus({ aqi: 350, co2: 700, pm25: 8 }), "maroon");

// Regression: PM2.5 values that used to fall in the gaps between EPA
// breakpoints (e.g. 12.1-12.05) must not fall through to the AQI-500 fallback.
assert.equal(
    Math.round(parseAirMeasurements({ pm02: 12.05 }).aqi),
    51,
);
assert.equal(
    Math.round(parseAirMeasurements({ pm02: 350.4 }).aqi),
    400,
);
assert.equal(Math.round(parseAirMeasurements({ pm02: 300 }).aqi), 350);

// Regression: NOx/TVOC unit tagging must follow whichever candidate key
// actually supplied the value, not just "is an index key present anywhere".
const mixedUnits = parseAirMeasurements({ nox_ppb: 5, noxIndex: 300 });
assert.equal(mixedUnits.nox, 5);
assert.equal(mixedUnits.noxUnit, "ppb");

// Regression: index-scale NOx/TVOC readings must not be classified with
// ppb-scale thresholds.
assert.equal(tvocStatusColor(100, "index"), "green");
assert.equal(tvocStatusColor(100, "ppb"), "yellow");
assert.equal(noxStatusColor(1, "index"), "green");
assert.equal(noxStatusColor(1, "ppb"), "green");
assert.equal(noxStatusColor(100, "index"), "orange");
assert.equal(noxStatusColor(100, "ppb"), "orange");

// Regression: a corrupted/partial 200 OK body must surface as an error
// instead of silently becoming an all-null "successful" reading.
assert.throws(() => parseAirMeasurements("{not valid json"));

assert.equal(formatMetricValue(24.47), "24.5");
assert.equal(formatMetricValue(100.2), "100");
assert.equal(formatMetricValue(9), "9");
assert.deepEqual(trend(7, 13.2, "µg/m³", true), {
    label: "↓ -6.2 µg/m³",
    context: "from last reading",
    className: "trend-improved",
    direction: "down",
    delta: -6.199999999999999,
    improves: true,
});

const monitor = new AlertMonitor(true);
const notice = { co2: 900 };

assert.deepEqual(monitor.evaluateAt(notice, 0), []);
let alerts = monitor.evaluateAt(notice, 0);
assert.equal(alerts.length, 1);
assert.equal(alerts[0].severity, AlertSeverity.Notice);
assert.equal(alerts[0].title, "CO2 is above 800 ppm");
assert.deepEqual(monitor.evaluateAt(notice, 60 * 1000), []);

alerts = monitor.evaluateAt({ co2: 2101 }, 60 * 1000);
assert.equal(alerts.length, 1);
assert.equal(alerts[0].severity, AlertSeverity.Critical);

assert.equal(monitor.recordFetchErrorAt("timeout", 2 * 60 * 1000), null);
assert.equal(monitor.recordFetchErrorAt("timeout", 2 * 60 * 1000), null);
const offline = monitor.recordFetchErrorAt("connection refused", 2 * 60 * 1000);
assert.equal(offline.severity, AlertSeverity.Warning);
assert.match(offline.body, /connection refused/);

const cooldownMonitor = new AlertMonitor(true);
assert.deepEqual(cooldownMonitor.evaluateAt({ pm25: 80 }, 0), []);
assert.equal(cooldownMonitor.evaluateAt({ pm25: 80 }, 0).length, 1);
assert.deepEqual(cooldownMonitor.evaluateAt({ pm25: 80 }, 60 * 1000), []);
assert.equal(
    cooldownMonitor.evaluateAt({ pm25: 80 }, 20 * 60 * 1000).length,
    1,
);

const recoveryMonitor = new AlertMonitor(true);
assert.deepEqual(recoveryMonitor.evaluateAt({ pm25: 80 }, 0), []);
assert.deepEqual(recoveryMonitor.evaluateAt({ pm25: 8 }, 60 * 1000), []);
assert.deepEqual(recoveryMonitor.evaluateAt({ pm25: 80 }, 2 * 60 * 1000), []);
assert.equal(recoveryMonitor.evaluateAt({ pm25: 80 }, 3 * 60 * 1000).length, 1);

cooldownMonitor.setEnabled(false);
cooldownMonitor.setEnabled(true);
assert.deepEqual(cooldownMonitor.evaluateAt({ pm25: 200 }, 20 * 60 * 1000), []);

console.log("sensor smoke tests passed");
