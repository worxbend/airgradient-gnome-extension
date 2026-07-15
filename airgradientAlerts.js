// Domain alert policy ported from airgradient-desktop. This module intentionally
// has no GNOME imports so cooldown, escalation, and consecutive-reading rules
// can be tested without a running Shell session.
import { asFiniteNumber } from "./airgradientSensors.js";

export const AlertSeverity = Object.freeze({
    Notice: "notice",
    Warning: "warning",
    Critical: "critical",
});

const ALERT_COOLDOWN_MS = 20 * 60 * 1000;
const ALERT_CONSECUTIVE_READINGS = 2;

const ALERT_SEVERITY_ORDER = {
    notice: 0,
    warning: 1,
    critical: 2,
};

const ALERT_KIND = {
    co2: "Co2",
    aqi: "Aqi",
    pm25: "Pm25",
    tvoc: "Tvoc",
    nox: "Nox",
    humidityLow: "HumidityLow",
    humidityHigh: "HumidityHigh",
    deviceOffline: "DeviceOffline",
};

const ALERT_POLICIES = Object.freeze([
    {
        kind: ALERT_KIND.co2,
        value: (snapshot) => snapshot?.co2,
        classify: classifyCo2Alert,
        text: (severity) => {
            if (severity === AlertSeverity.Notice)
                return [
                    "CO2 is above 800 ppm",
                    "Ventilation may be low. Open a window or increase fresh-air ventilation.",
                ];
            if (severity === AlertSeverity.Warning)
                return [
                    "CO2 is high",
                    "CO2 is above 1200 ppm. Ventilate now if possible or reduce room occupancy.",
                ];
            return [
                "CO2 is very high",
                "CO2 is above 2000 ppm. Leave briefly or improve ventilation immediately if possible.",
            ];
        },
    },
    {
        kind: ALERT_KIND.aqi,
        value: (snapshot) => snapshot?.aqi,
        classify: classifyAqiAlert,
        text: (severity) => {
            if (severity === AlertSeverity.Notice)
                return [
                    "AQI is unhealthy for sensitive groups",
                    "Reduce exposure if you are sensitive. Consider filtration or source control.",
                ];
            if (severity === AlertSeverity.Warning)
                return [
                    "AQI is unhealthy",
                    "Air quality may affect everyone. Reduce pollutant sources and improve filtration.",
                ];
            return [
                "AQI is very unhealthy",
                "Limit exposure. Use filtration and avoid adding indoor pollution sources.",
            ];
        },
    },
    {
        kind: ALERT_KIND.pm25,
        value: (snapshot) => snapshot?.pm25,
        classify: classifyPm25Alert,
        text: (severity) => {
            if (severity === AlertSeverity.Notice)
                return [
                    "PM2.5 is elevated",
                    "Run an air purifier or improve HVAC filtration; reduce cooking, smoke, or dust sources.",
                ];
            if (severity === AlertSeverity.Warning)
                return [
                    "PM2.5 is high",
                    "Particle pollution is high. Use filtration and avoid activities that create particles.",
                ];
            return [
                "PM2.5 is very high",
                "Limit exposure and use strong filtration. Check whether outdoor smoke or indoor sources are present.",
            ];
        },
    },
    {
        kind: ALERT_KIND.tvoc,
        value: (snapshot) => snapshot?.tvoc,
        unit: (snapshot) => snapshot?.tvocUnit,
        classify: classifyTvocAlert,
        text: (severity) =>
            severity === AlertSeverity.Critical
                ? [
                      "VOC level is high",
                      "Ventilate now and remove or seal likely chemical sources if safe to do so.",
                  ]
                : [
                      "VOC level is elevated",
                      "Ventilate and check recent sources: cleaning products, paint, adhesives, or hobby materials.",
                  ],
    },
    {
        kind: ALERT_KIND.nox,
        value: (snapshot) => snapshot?.nox,
        unit: (snapshot) => snapshot?.noxUnit,
        classify: classifyNoxAlert,
        text: (severity) =>
            severity === AlertSeverity.Critical
                ? [
                      "NOx level is high",
                      "Increase ventilation and check combustion sources such as gas cooking or heaters.",
                  ]
                : [
                      "NOx level is elevated",
                      "If cooking or using combustion appliances, use exhaust ventilation or open a window.",
                  ],
    },
    {
        kind: ALERT_KIND.humidityLow,
        value: (snapshot) => snapshot?.humidity,
        classify: classifyHumidityLowAlert,
        text: () => [
            "Humidity is low",
            "Air is dry. Consider humidification if the room feels uncomfortable.",
        ],
    },
    {
        kind: ALERT_KIND.humidityHigh,
        value: (snapshot) => snapshot?.humidity,
        classify: classifyHumidityHighAlert,
        text: (severity) =>
            severity === AlertSeverity.Critical
                ? [
                      "Humidity is very high",
                      "Dehumidify or ventilate now and check for dampness or leaks.",
                  ]
                : [
                      "Humidity is high",
                      "Ventilate or dehumidify to reduce dampness and mold risk.",
                  ],
    },
]);

export class AlertMonitor {
    constructor(enabled = true) {
        this.enabled = Boolean(enabled);
        this.consecutive = new Map();
        this.activeSeverity = new Map();
        this.lastSent = new Map();
        this.fetchFailures = 0;
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
        if (!this.enabled) this.clear();
    }

    clear() {
        this.consecutive.clear();
        this.activeSeverity.clear();
        this.lastSent.clear();
        this.fetchFailures = 0;
    }

    evaluate(snapshot, now = Date.now()) {
        return this.evaluateAt(snapshot, now);
    }

    evaluateAt(snapshot, now = Date.now()) {
        if (!this.enabled) return [];

        const timestamp = toTimestamp(now);
        this.fetchFailures = 0;

        return ALERT_POLICIES.flatMap((policy) =>
            this._evaluatePolicy(policy, snapshot, timestamp),
        );
    }

    recordFetchError(error, now = Date.now()) {
        return this.recordFetchErrorAt(error, now);
    }

    recordFetchErrorAt(error, now = Date.now()) {
        if (!this.enabled) return null;

        this.fetchFailures = Math.min(
            this.fetchFailures + 1,
            Number.MAX_SAFE_INTEGER,
        );
        if (this.fetchFailures < 3) return null;

        return this._makeAlert(
            ALERT_KIND.deviceOffline,
            AlertSeverity.Warning,
            toTimestamp(now),
            "AirGradient device is unreachable",
            `No fresh sensor data after repeated attempts. Last error: ${String(error)}`,
        );
    }

    _evaluatePolicy(policy, snapshot, now) {
        const unit = policy.unit?.(snapshot);
        const severity = policy.classify(policy.value(snapshot), unit);
        if (severity === null) {
            this.consecutive.delete(policy.kind);
            this.activeSeverity.delete(policy.kind);
            return [];
        }

        const count = Math.min(
            (this.consecutive.get(policy.kind) ?? 0) + 1,
            Number.MAX_SAFE_INTEGER,
        );
        this.consecutive.set(policy.kind, count);
        if (count < ALERT_CONSECUTIVE_READINGS) return [];

        const [title, body] = policy.text(severity);
        const alert = this._makeAlert(policy.kind, severity, now, title, body);
        return alert ? [alert] : [];
    }

    _makeAlert(kind, severity, now, title, body) {
        const activeSeverity = this.activeSeverity.get(kind);
        const escalated =
            activeSeverity !== undefined &&
            ALERT_SEVERITY_ORDER[severity] >
                ALERT_SEVERITY_ORDER[activeSeverity];
        const lastSent = this.lastSent.get(kind);
        const cooledDown =
            lastSent === undefined ||
            Math.max(0, now - lastSent) >= ALERT_COOLDOWN_MS;

        if (!escalated && !cooledDown) return null;

        this.activeSeverity.set(kind, severity);
        this.lastSent.set(kind, now);

        return {
            id: `airgradient-${kind}`.toLowerCase(),
            title,
            body,
            severity,
        };
    }
}

function classifyCo2Alert(value) {
    const number = asFiniteNumber(value);
    if (number === null) return null;
    if (number > 2000) return AlertSeverity.Critical;
    if (number > 1200) return AlertSeverity.Warning;
    if (number > 800) return AlertSeverity.Notice;
    return null;
}

function classifyAqiAlert(value) {
    const number = asFiniteNumber(value);
    if (number === null) return null;
    if (number > 200) return AlertSeverity.Critical;
    if (number > 150) return AlertSeverity.Warning;
    if (number > 100) return AlertSeverity.Notice;
    return null;
}

function classifyPm25Alert(value) {
    const number = asFiniteNumber(value);
    if (number === null) return null;
    if (number > 150) return AlertSeverity.Critical;
    if (number > 55) return AlertSeverity.Warning;
    if (number > 35) return AlertSeverity.Notice;
    return null;
}

// Thresholds mirror the ppb/index bands in airgradientSensors.js's
// tvocStatusColor/noxStatusColor so alert escalation lines up with the
// severity colors shown in the popup.
function classifyTvocAlert(value, unit = "ppb") {
    const number = asFiniteNumber(value);
    if (number === null) return null;

    if (unit === "index") {
        if (number > 350) return AlertSeverity.Critical;
        if (number > 200) return AlertSeverity.Warning;
        return null;
    }

    if (number > 660) return AlertSeverity.Critical;
    if (number > 220) return AlertSeverity.Warning;
    return null;
}

function classifyNoxAlert(value, unit = "ppb") {
    const number = asFiniteNumber(value);
    if (number === null) return null;

    if (unit === "index") {
        if (number > 200) return AlertSeverity.Critical;
        if (number > 50) return AlertSeverity.Warning;
        return null;
    }

    if (number > 150) return AlertSeverity.Critical;
    if (number > 50) return AlertSeverity.Warning;
    return null;
}

function classifyHumidityLowAlert(value) {
    const number = asFiniteNumber(value);
    if (number === null) return null;
    return number < 30 ? AlertSeverity.Notice : null;
}

function classifyHumidityHighAlert(value) {
    const number = asFiniteNumber(value);
    if (number === null) return null;
    if (number > 75) return AlertSeverity.Critical;
    if (number > 65) return AlertSeverity.Notice;
    return null;
}

function toTimestamp(value) {
    if (value instanceof Date) return value.getTime();
    const number = asFiniteNumber(value);
    return number === null ? Date.now() : number;
}
