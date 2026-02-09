import { App, PluginSettingTab, Setting } from "obsidian";
import PersonalFinancePlugin from "./main";

export interface CommodityPrice {
	value: number;
	currency: '₹' | '$';
}

export interface FinancePluginSettings {
	currencySymbol: '₹' | '$';
	commodityPrices: Record<string, CommodityPrice>;
	usdToInr: number;
	tableRowsToShow: number;
	rootFolderPath: string;
	transactionsFolderPath: string;
	snapshotsFolderPath: string;
	templateFilePath: string;
	usageGuideFilePath: string;
	dashboardDataPath: string;
}

export const DEFAULT_SETTINGS: FinancePluginSettings = {
	currencySymbol: '₹',
	commodityPrices: {},
	usdToInr: 83.0,
	tableRowsToShow: 10,
	rootFolderPath: 'Finance',
	transactionsFolderPath: 'Finance/Transactions',
	snapshotsFolderPath: 'Finance/Snapshots',
	templateFilePath: 'Finance/Templates/Transaction.md',
	usageGuideFilePath: 'Finance/Personal-finances-usage-guide.md',
	dashboardDataPath: 'Finance/dashboard-data.json'
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

		// General & Currency Section
		containerEl.createEl('h3', { text: 'General & Currency' });

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
			.setName('USD to INR Conversion Rate')
			.setDesc('Current exchange rate for converting USD to INR')
			.addText(text => text
				.setPlaceholder('83.0')
				.setValue(this.plugin.settings.usdToInr.toString())
				.onChange(async (value) => {
					const parsed = parseFloat(value);
					if (!isNaN(parsed) && parsed > 0) {
						this.plugin.settings.usdToInr = parsed;
						await this.plugin.saveSettings();
					}
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

		new Setting(containerEl)
			.setName('Table Rows to Display')
			.setDesc('Number of transaction rows to show in the table view')
			.addText(text => text
				.setPlaceholder('10')
				.setValue(this.plugin.settings.tableRowsToShow.toString())
				.onChange(async (value) => {
					const parsed = parseInt(value);
					if (!isNaN(parsed) && parsed > 0) {
						this.plugin.settings.tableRowsToShow = parsed;
						await this.plugin.saveSettings();
					}
				}));

		// File & Folder Structure Section
		containerEl.createEl('h3', { text: 'File & Folder Structure' });

		new Setting(containerEl)
			.setName('Root Finance Folder')
			.setDesc('Root folder for all finance related files')
			.addText(text => text
				.setPlaceholder('Finance')
				.setValue(this.plugin.settings.rootFolderPath)
				.onChange(async (value) => {
					this.plugin.settings.rootFolderPath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Transactions Folder Path')
			.setDesc('Folder where new transaction files will be created')
			.addText(text => text
				.setPlaceholder('Finance/Transactions')
				.setValue(this.plugin.settings.transactionsFolderPath)
				.onChange(async (value) => {
					this.plugin.settings.transactionsFolderPath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Snapshots Folder Path')
			.setDesc('Folder where net worth snapshots will be saved')
			.addText(text => text
				.setPlaceholder('Finance/Snapshots')
				.setValue(this.plugin.settings.snapshotsFolderPath)
				.onChange(async (value) => {
					this.plugin.settings.snapshotsFolderPath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Transaction Template Path')
			.setDesc('Path to the markdown file used as a template for new transactions')
			.addText(text => text
				.setPlaceholder('Finance/Templates/Transaction.md')
				.setValue(this.plugin.settings.templateFilePath)
				.onChange(async (value) => {
					this.plugin.settings.templateFilePath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Usage Guide Path')
			.setDesc('Path where the usage guide will be created and linked')
			.addText(text => text
				.setPlaceholder('Finance/Personal-finances-usage-guide.md')
				.setValue(this.plugin.settings.usageGuideFilePath)
				.onChange(async (value) => {
					this.plugin.settings.usageGuideFilePath = value;
					await this.plugin.saveSettings();
				}));
	}
}
