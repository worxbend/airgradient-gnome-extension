// Presentation mapping for the Shell popup. The functions here transform domain
// snapshots into simple view models, keeping St/Clutter widget code thin.
import {
    aqiStatusColor,
    co2StatusColor,
    formatMetricValue,
    noxStatusColor,
    pm25StatusColor,
    trend,
    tvocStatusColor,
} from "./airgradientSensors.js";

export const STATUS_COLORS = Object.freeze({
    blue: "#3584e4",
    gray: "#9a9996",
    green: "#33d17a",
    maroon: "#a51d2d",
    orange: "#ff7800",
    purple: "#9141ac",
    red: "#ed333b",
    yellow: "#f5c211",
});

export const METRIC_DEFINITIONS = Object.freeze([
    {
        name: "CO2",
        unit: "ppm",
        key: "co2",
        classifyStatus: co2StatusColor,
    },
    {
        name: "PM2.5",
        unit: "ug/m3",
        key: "pm25",
        classifyStatus: pm25StatusColor,
    },
    {
        name: "PM1.0",
        unit: "ug/m3",
        key: "pm1",
    },
    {
        name: "PM10",
        unit: "ug/m3",
        key: "pm10",
    },
    {
        name: "PM0.3 Count",
        unit: "count",
        key: "pm003Count",
    },
    {
        name: "TVOC",
        unit: "ppb",
        key: "tvoc",
        classifyStatus: tvocStatusColor,
    },
    {
        name: "NOx",
        unit: "ppb",
        key: "nox",
        classifyStatus: noxStatusColor,
    },
    {
        name: "Temperature",
        unit: "C",
        key: "temperature",
        lowerIsBetter: false,
    },
    {
        name: "Humidity",
        unit: "%",
        key: "humidity",
        lowerIsBetter: false,
    },
]);

export function endpointForServerUrl(serverUrl) {
    return `${serverUrl.replace(/\/+$/u, "")}/measures/current`;
}

export function colorForStatus(status) {
    return STATUS_COLORS[status] ?? STATUS_COLORS.gray;
}

export function aqiLevel(value) {
    if (value === null) return "Unknown";
    if (value <= 50) return "Good";
    if (value <= 100) return "Moderate";
    if (value <= 150) return "Unhealthy for Sensitive Groups";
    if (value <= 200) return "Unhealthy";
    if (value <= 300) return "Very Unhealthy";
    return "Hazardous";
}

export function aqiDescription(value) {
    if (value === null) return "Waiting for a measurement.";
    if (value <= 50)
        return "Air quality is satisfactory, and air pollution poses little or no risk.";
    if (value <= 100)
        return "Air quality is acceptable, but unusually sensitive people may notice effects.";
    if (value <= 150) return "Sensitive groups may experience health effects.";
    if (value <= 200)
        return "Some members of the general public may experience health effects.";
    if (value <= 300)
        return "Health alert: risk of health effects is increased for everyone.";
    return "Health warning: everyone is more likely to be affected.";
}

export function buildAqiViewModel(snapshot, previousSnapshot) {
    const value = snapshot?.aqi ?? null;
    const status = aqiStatusColor(value);
    const trendView = trend(value, previousSnapshot?.aqi ?? null, "AQI", true);

    return {
        color: colorForStatus(status),
        description: aqiDescription(value),
        level: aqiLevel(value),
        status,
        trend: trendView,
        value: formatMetricValue(value),
    };
}

export function buildMetricViewModel(definition, snapshot, previousSnapshot) {
    const value = snapshot?.[definition.key] ?? null;
    const unit = metricUnit(snapshot, definition);
    const status = metricStatus(definition, value, unit);

    return {
        color: colorForStatus(status),
        name: definition.name,
        status,
        trend: trend(
            value,
            previousSnapshot?.[definition.key] ?? null,
            unit,
            definition.lowerIsBetter ?? true,
        ),
        unit,
        value: formatMetricValue(value),
    };
}

export function buildMetricViewModels(snapshot, previousSnapshot) {
    return METRIC_DEFINITIONS.map((definition) =>
        buildMetricViewModel(definition, snapshot, previousSnapshot),
    );
}

function metricUnit(snapshot, definition) {
    if (definition.key === "tvoc") return snapshot?.tvocUnit ?? definition.unit;
    if (definition.key === "nox") return snapshot?.noxUnit ?? definition.unit;
    return definition.unit;
}

function metricStatus(definition, value, unit) {
    if (definition.classifyStatus) return definition.classifyStatus(value, unit);
    return "gray";
}
