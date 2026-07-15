// GNOME Shell popup adapter. It renders already-prepared view models and avoids
// owning sensor parsing, threshold, HTTP, or config policy.
import Clutter from "gi://Clutter";
import St from "gi://St";

import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

import {
    buildAqiViewModel,
    buildMetricViewModels,
} from "./airgradientPresentation.js";

const INHERITED_VALUE_STATUSES = new Set(["gray", "unknown"]);

export class PanelStatusIcon {
    constructor() {
        this.actor = new St.Icon({
            icon_name: "weather-fog-symbolic",
            style_class: "system-status-icon airgradient-panel-icon",
        });
    }
}

export class AirGradientPopup {
    constructor({ menu, onRefresh, onOpenSettings }) {
        this._metricCards = [];
        this._build(menu, onRefresh, onOpenSettings);
    }

    destroy() {}

    updateSnapshot({ serverUrl, snapshot, previousSnapshot, updatedAt }) {
        this._subtitleLabel.text = `Updated ${updatedAt}`;
        this._footerLabel.text = serverUrl ?? "";
        this._updateAqi(buildAqiViewModel(snapshot, previousSnapshot));

        const metricViews = buildMetricViewModels(snapshot, previousSnapshot);
        for (const [index, view] of metricViews.entries())
            this._metricCards[index].update(view);

        this.setStatus("Latest measurements loaded.");
    }

    updateUnavailable(message, serverUrl) {
        this._subtitleLabel.text = "No fresh sensor data.";
        this._footerLabel.text = serverUrl ?? "";
        this.setStatus(`Fetch failed: ${message}`);
    }

    setStatus(message) {
        this._statusLabel.text = message;
    }

    _build(menu, onRefresh, onOpenSettings) {
        menu.box.add_style_class_name("airgradient-popup");
        menu.box.add_child(this._buildHeader());
        menu.addMenuItem(this._buildDashboardItem());

        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        menu.addMenuItem(this._buildStatusItem());
        menu.addMenuItem(this._buildActionItem("Refresh now", onRefresh));
        menu.addMenuItem(
            this._buildActionItem("Open Settings", onOpenSettings),
        );
        menu.addMenuItem(this._buildFooterItem());
    }

    _buildHeader() {
        const header = new St.BoxLayout({
            vertical: true,
            style_class: "airgradient-popup-header",
        });

        this._titleLabel = new St.Label({
            text: "AirGradient",
            style_class: "airgradient-popup-title",
        });
        this._subtitleLabel = new St.Label({
            text: "Waiting for sensor data.",
            style_class: "airgradient-popup-subtitle",
        });

        header.add_child(this._titleLabel);
        header.add_child(this._subtitleLabel);
        return header;
    }

    _buildStaticItem() {
        return new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
    }

    _buildDashboardItem() {
        const item = this._buildStaticItem();
        item.add_style_class_name("airgradient-dashboard-item");

        const dashboard = new St.BoxLayout({
            vertical: true,
            style_class: "airgradient-dashboard",
            x_expand: true,
        });
        const metricViews = buildMetricViewModels(null, null);
        const cards = metricViews.map((view) => new MetricGaugeCard(view));
        const cardByName = new Map(cards.map((card) => [card.name, card]));
        const topRow = new St.BoxLayout({
            style_class: "airgradient-dashboard-top-row",
            x_expand: true,
        });
        const climateColumn = new St.BoxLayout({
            vertical: true,
            style_class: "airgradient-climate-column",
            x_expand: true,
        });

        climateColumn.add_child(cardByName.get("Temperature").actor);
        climateColumn.add_child(cardByName.get("Humidity").actor);
        topRow.add_child(this._buildAqiCard());
        topRow.add_child(climateColumn);

        dashboard.add_child(topRow);
        dashboard.add_child(
            this._buildCardRow([
                cardByName.get("CO2"),
                cardByName.get("TVOC"),
                cardByName.get("NOx"),
            ]),
        );
        dashboard.add_child(
            this._buildCardRow([
                cardByName.get("PM0.3 Count"),
                cardByName.get("PM1.0"),
                cardByName.get("PM2.5"),
                cardByName.get("PM10"),
            ]),
        );

        this._metricCards = cards;
        item.add_child(dashboard);

        return item;
    }

    _buildAqiCard() {
        const card = new St.BoxLayout({
            vertical: true,
            style_class: "airgradient-primary-card",
            x_expand: true,
        });

        const top = new St.BoxLayout({ x_expand: true });
        this._aqiValueLabel = new St.Label({
            text: "--",
            style_class: "airgradient-aqi-value",
        });
        this._aqiLevelLabel = new St.Label({
            text: "Unknown",
            style_class: "airgradient-aqi-level",
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._aqiDescriptionLabel = new St.Label({
            text: "Waiting for a measurement.",
            style_class: "airgradient-aqi-description",
        });
        this._aqiTrendLabel = new St.Label({
            text: "No previous reading",
            style_class: "airgradient-popup-subtitle",
        });

        top.add_child(this._aqiValueLabel);
        top.add_child(this._aqiLevelLabel);
        card.add_child(top);
        card.add_child(this._aqiTrendLabel);

        return card;
    }

    _buildCardRow(cards) {
        const row = new St.BoxLayout({
            style_class: "airgradient-metric-card-row",
            x_expand: true,
        });

        for (const card of cards) if (card) row.add_child(card.actor);

        return row;
    }

    _buildStatusItem() {
        const item = this._buildStaticItem();
        this._statusLabel = new St.Label({
            text: "Not updated yet.",
            style_class: "airgradient-popup-subtitle",
        });
        item.add_child(this._statusLabel);
        return item;
    }

    _buildActionItem(label, onActivated) {
        const item = new PopupMenu.PopupMenuItem(label);
        item.connect("activate", onActivated);
        return item;
    }

    _buildFooterItem() {
        const item = this._buildStaticItem();
        this._footerLabel = new St.Label({
            text: "",
            style_class: "airgradient-popup-footer",
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
        });
        item.add_child(this._footerLabel);
        return item;
    }

    _updateAqi(view) {
        this._aqiValueLabel.text = view.value;
        this._aqiLevelLabel.text = view.level;
        this._aqiDescriptionLabel.text = view.description;
        this._aqiValueLabel.style = valueColorStyle(view);
        applyTrend(this._aqiTrendLabel, view.trend);
    }
}

class MetricGaugeCard {
    constructor(initialView) {
        this.name = initialView.name;
        this.actor = new St.BoxLayout({
            vertical: true,
            style_class: "airgradient-metric-card",
            x_expand: true,
        });
        const top = new St.BoxLayout({
            style_class: "airgradient-card-top",
            x_expand: true,
        });
        const valueRow = new St.BoxLayout({
            style_class: "airgradient-card-value-row",
            x_expand: true,
        });

        this._nameLabel = new St.Label({
            style_class: "airgradient-metric-name",
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._valueLabel = new St.Label({
            style_class: "airgradient-metric-value",
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._unitLabel = new St.Label({
            style_class: "airgradient-metric-unit",
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._trendLabel = new St.Label({
            style_class: "airgradient-popup-subtitle",
            x_align: Clutter.ActorAlign.START,
        });

        top.add_child(this._nameLabel);
        valueRow.add_child(this._valueLabel);
        valueRow.add_child(this._unitLabel);
        this.actor.add_child(top);
        this.actor.add_child(valueRow);
        this.actor.add_child(this._trendLabel);

        this.update(initialView);
    }

    update(view) {
        this.name = view.name;
        this._nameLabel.text = view.name;
        this._valueLabel.text = view.value;
        this._valueLabel.style = valueColorStyle(view);
        this._unitLabel.text = view.unit;
        applyTrend(this._trendLabel, view.trend);
    }
}

function applyTrend(label, trendView) {
    label.text = trendView.label;
}

function valueColorStyle(view) {
    if (INHERITED_VALUE_STATUSES.has(view.status)) return "";
    return view.color ? `color: ${view.color};` : "";
}
