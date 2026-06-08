// AirGradient local-server payload normalization and sensor-domain helpers.
// Keep this module framework-free; Shell and preferences code consume its data
// structures instead of reaching into raw JSON payloads.
const STATUS_ORDER = {
    green: 0,
    yellow: 1,
    orange: 2,
    red: 3,
    purple: 4,
    maroon: 5,
    gray: 6,
};

export const StatusColor = Object.freeze({
    Green: "green",
    Yellow: "yellow",
    Orange: "orange",
    Red: "red",
    Purple: "purple",
    Maroon: "maroon",
    Gray: "gray",
});

export function parseAirMeasurements(raw) {
    const payload = normalizePayload(raw);

    const nox =
        extractMeasurementValue(payload, ["nox", "no2", "nox_ppb"]) ??
        extractMeasurementValue(payload, ["noxIndex", "nox_index"]);
    const noxUnit =
        nox === null
            ? null
            : hasAnyKey(payload, ["noxIndex", "nox_index"])
              ? "index"
              : "ppb";

    const tvoc =
        extractMeasurementValue(payload, [
            "tvoc",
            "tvoc_ppb",
            "tvoc_ppm",
            "voc",
        ]) ?? extractMeasurementValue(payload, ["tvocIndex", "tvoc_index"]);
    const tvocUnit =
        tvoc === null
            ? null
            : hasAnyKey(payload, ["tvocIndex", "tvoc_index"])
              ? "index"
              : "ppb";

    const pm25 = extractMeasurementValue(payload, [
        "pm02",
        "pm2_5",
        "pm25",
        "pm2.5",
    ]);
    const pm003Count = extractMeasurementValue(payload, [
        "pm003Count",
        "pm003_count",
        "pm0_3_count",
    ]);

    return {
        temperature: extractMeasurementValue(payload, [
            "atmpCompensated",
            "temperatureCompensated",
            "temperature_compensated",
            "atmp",
            "temperature",
            "temp",
            "temp_c",
            "temperature_c",
            "temperatureC",
        ]),
        humidity: extractMeasurementValue(payload, [
            "rhumCompensated",
            "humidityCompensated",
            "humidity_compensated",
            "rhum",
            "humidity",
            "hum",
            "relative_humidity",
            "rh",
            "humidity_pct",
        ]),
        aqi:
            extractMeasurementValue(payload, ["aqi", "air_quality_index"]) ??
            (pm25 === null ? null : pm25ToUsAqi(pm25)),
        co2: extractMeasurementValue(payload, ["rco2", "co2", "co2_ppm"]),
        nox,
        noxUnit,
        nox_unit: noxUnit,
        tvoc,
        tvocUnit,
        tvoc_unit: tvocUnit,
        pm1: extractMeasurementValue(payload, [
            "pm1",
            "pm1.0",
            "pm01",
            "pm_1_0",
        ]),
        pm25,
        pm10: extractMeasurementValue(payload, ["pm10", "pm10_0"]),
        pm003Count,
        pm003_count: pm003Count,
    };
}

export function co2StatusColor(value) {
    const number = asFiniteNumber(value);
    if (number === null) return StatusColor.Gray;
    if (number < 800) return StatusColor.Green;
    if (number < 1200) return StatusColor.Yellow;
    if (number < 2000) return StatusColor.Orange;
    return StatusColor.Red;
}

export function pm25StatusColor(value) {
    const number = asFiniteNumber(value);
    if (number === null) return StatusColor.Gray;
    if (number < 12) return StatusColor.Green;
    if (number < 35) return StatusColor.Yellow;
    if (number < 55) return StatusColor.Orange;
    return StatusColor.Red;
}

export function tvocStatusColor(value) {
    const number = asFiniteNumber(value);
    if (number === null) return StatusColor.Gray;
    if (number < 65) return StatusColor.Green;
    if (number < 220) return StatusColor.Yellow;
    if (number < 660) return StatusColor.Orange;
    return StatusColor.Red;
}

export function noxStatusColor(value) {
    const number = asFiniteNumber(value);
    if (number === null) return StatusColor.Gray;
    if (number < 20) return StatusColor.Green;
    if (number < 50) return StatusColor.Yellow;
    if (number < 150) return StatusColor.Orange;
    return StatusColor.Red;
}

export function aqiStatusColor(value) {
    const number = asFiniteNumber(value);
    if (number === null) return StatusColor.Gray;
    if (number <= 50) return StatusColor.Green;
    if (number <= 100) return StatusColor.Yellow;
    if (number <= 150) return StatusColor.Orange;
    if (number <= 200) return StatusColor.Red;
    if (number <= 300) return StatusColor.Purple;
    return StatusColor.Maroon;
}

export function overallStatus(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return StatusColor.Gray;

    const colors = [
        metricStatus(snapshot.aqi, aqiStatusColor),
        metricStatus(snapshot.pm25, pm25StatusColor),
        metricStatus(snapshot.co2, co2StatusColor),
        metricStatus(snapshot.tvoc, tvocStatusColor),
        metricStatus(snapshot.nox, noxStatusColor),
    ].filter((color) => color !== null);

    if (colors.length === 0) return StatusColor.Gray;

    return colors.reduce(
        (worst, color) =>
            STATUS_ORDER[color] > STATUS_ORDER[worst] ? color : worst,
        StatusColor.Green,
    );
}

export function formatMetricValue(value) {
    const number = asFiniteNumber(value);
    if (number === null) return "--";
    if (Math.abs(number) >= 100 || Math.abs(fraction(number)) < 0.05)
        return number.toFixed(0);
    return number.toFixed(1);
}

export function trend(current, previous, unit = "", lowerIsBetter = true) {
    const currentNumber = asFiniteNumber(current);
    if (currentNumber === null) {
        return {
            label: "No reading",
            context: "from last reading",
            className: "trend-neutral",
            direction: "none",
            delta: null,
            improves: false,
        };
    }

    const previousNumber = asFiniteNumber(previous);
    if (previousNumber === null) {
        return {
            label: "No previous reading",
            context: "from last reading",
            className: "trend-neutral",
            direction: "none",
            delta: null,
            improves: false,
        };
    }

    const delta = currentNumber - previousNumber;
    if (Math.abs(delta) < 0.05) {
        return {
            label: withUnit("→ 0", unit),
            context: "from last reading",
            className: "trend-neutral",
            direction: "flat",
            delta,
            improves: false,
        };
    }

    const improves = lowerIsBetter ? delta < 0 : delta > 0;
    const arrow = delta > 0 ? "↑" : "↓";
    const sign = delta > 0 ? "+" : "";

    return {
        label: withUnit(`${arrow} ${sign}${formatDelta(delta)}`, unit),
        context: "from last reading",
        className: improves ? "trend-improved" : "trend-worse",
        direction: delta > 0 ? "up" : "down",
        delta,
        improves,
    };
}

function normalizePayload(raw) {
    if (raw === null || raw === undefined) return {};
    if (typeof raw !== "string") return raw;

    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

function extractMeasurementValue(raw, candidates) {
    for (const name of candidates) {
        const direct = directKeyValue(raw, name);
        if (direct !== null) return direct;

        const lower = name.toLowerCase();
        const lowerDirect = directKeyValue(raw, lower);
        if (lowerDirect !== null) return lowerDirect;

        const nested = findNestedKey(raw, name);
        if (nested !== null) return nested;

        const lowerNested = findNestedKey(raw, lower);
        if (lowerNested !== null) return lowerNested;
    }

    return null;
}

function directKeyValue(raw, key) {
    if (!isPlainObject(raw) || !Object.hasOwn(raw, key)) return null;
    return asFiniteNumber(raw[key]);
}

function findNestedKey(raw, key) {
    if (Array.isArray(raw)) {
        for (const item of raw) {
            const found = findNestedKey(item, key);
            if (found !== null) return found;
        }
        return null;
    }

    if (!isPlainObject(raw)) return null;

    const direct = directKeyValue(raw, key);
    if (direct !== null) return direct;

    const lower = key.toLowerCase();
    const lowerDirect = directKeyValue(raw, lower);
    if (lowerDirect !== null) return lowerDirect;

    for (const value of Object.values(raw)) {
        const found = findNestedKey(value, key);
        if (found !== null) return found;
    }

    return null;
}

function hasAnyKey(raw, candidates) {
    return candidates.some((key) => {
        const lower = key.toLowerCase();
        return hasNestedKey(raw, key) || hasNestedKey(raw, lower);
    });
}

function hasNestedKey(raw, key) {
    if (Array.isArray(raw))
        return raw.some((value) => hasNestedKey(value, key));
    if (!isPlainObject(raw)) return false;
    return (
        Object.hasOwn(raw, key) ||
        Object.values(raw).some((value) => hasNestedKey(value, key))
    );
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asFiniteNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    const number = Number(trimmed);
    return Number.isFinite(number) ? number : null;
}

function pm25ToUsAqi(pm25) {
    const breakpoints = [
        [0, 12, 0, 50],
        [12.1, 35.4, 51, 100],
        [35.5, 55.4, 101, 150],
        [55.5, 150.4, 151, 200],
        [150.5, 250.4, 201, 300],
        [250.5, 500.4, 301, 500],
    ];

    for (const [cLow, cHigh, iLow, iHigh] of breakpoints) {
        if (pm25 >= cLow && pm25 <= cHigh) {
            return ((iHigh - iLow) / (cHigh - cLow)) * (pm25 - cLow) + iLow;
        }
    }

    return pm25 < 0 ? 0 : 500;
}

function metricStatus(value, classifier) {
    return asFiniteNumber(value) === null ? null : classifier(value);
}

function fraction(value) {
    return value - Math.trunc(value);
}

function formatDelta(value) {
    if (Math.abs(value) >= 10 || Math.abs(fraction(value)) < 0.05)
        return value.toFixed(0);
    return value.toFixed(1);
}

function withUnit(label, unit) {
    return unit ? `${label} ${unit}` : label;
}
