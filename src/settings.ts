import { App, PluginSettingTab, Setting } from "obsidian";
import PersonalFinancePlugin from "./main";

export interface CommodityPrice {
	value: number;
	currency: '₹' | '$';
}

export interface FinancePluginSettings {
	currencySymbol: '₹' | '$';
	commodityPrices: Record<string, CommodityPrice>;
}

export const DEFAULT_SETTINGS: FinancePluginSettings = {
	currencySymbol: '₹',
	commodityPrices: {}
}

export class FinanceSettingTab extends PluginSettingTab {
	plugin: PersonalFinancePlugin;

	constructor(app: App, plugin: PersonalFinancePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Personal Finance Settings' });

		new Setting(containerEl)
			.setName('Currency Symbol')
			.setDesc('Select the currency symbol to use throughout the plugin')
			.addDropdown(dropdown => dropdown
				.addOption('₹', '₹ (Rupee)')
				.addOption('$', '$ (Dollar)')
				.setValue(this.plugin.settings.currencySymbol)
				.onChange(async (value: '₹' | '$') => {
					this.plugin.settings.currencySymbol = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Commodity Prices')
			.setDesc('Configure commodity prices in JSON format. Example: {"QCOM": {"value": 150.50, "currency": "$"}}')
			.addTextArea(text => text
				.setPlaceholder('{"QCOM": {"value": 150.50, "currency": "$"}}')
				.setValue(JSON.stringify(this.plugin.settings.commodityPrices, null, 2))
				.onChange(async (value) => {
					try {
						const parsed = JSON.parse(value);
						this.plugin.settings.commodityPrices = parsed;
						await this.plugin.saveSettings();
					} catch (e) {
						// Invalid JSON, don't save
					}
				}));
	}
}
