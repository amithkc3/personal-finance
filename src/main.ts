import { App, Plugin, BasesView, parsePropertyId, Modal, Notice } from 'obsidian';
import { DEFAULT_SETTINGS, FinancePluginSettings, FinanceSettingTab } from "./settings";
import { createPieChart, formatCurrency, createNetWorthLineChart, SnapshotDataPoint } from "./utils/charts";

export const FinanceDashboardViewType = 'finance-dashboard';

// Strict account prefix definitions
const ACCOUNT_PREFIXES = {
	ASSET: 'Asset-',
	LIABILITY: 'Liability-',
	EXPENSE: 'Expense-',
	INCOME: 'Income-',
	COMMODITY: 'Commodity-'
} as const;

export default class PersonalFinancePlugin extends Plugin {
	settings: FinancePluginSettings;

	async onload() {
		await this.loadSettings();

		// @ts-ignore
		this.registerBasesView(FinanceDashboardViewType, {
			name: 'Finance Dashboard',
			icon: 'lucide-wallet',
			factory: (controller: any, containerEl: HTMLElement) => {
				return new FinanceDashboardView(controller, containerEl, this) as any
			},
			options: () => ([]),
		});

		// @ts-ignore
		this.registerBasesView('transaction-table', {
			name: 'Transaction Table',
			icon: 'lucide-table',
			factory: (controller: any, containerEl: HTMLElement) => {
				return new TransactionTableView(controller, containerEl, this) as any
			},
			options: () => ([]),
		});

		// Add commands
		this.addCommand({
			id: 'update-currency-rate',
			name: 'Update USD to INR Rate',
			callback: () => new CurrencyRateModal(this.app, this).open()
		});

		this.addCommand({
			id: 'update-table-rows',
			name: 'Update Table Rows Count',
			callback: () => new TableRowsModal(this.app, this).open()
		});

		this.addCommand({
			id: 'update-commodity-prices',
			name: 'Update Commodity Prices',
			callback: () => new CommodityPricesModal(this.app, this).open()
		});

		this.addSettingTab(new FinanceSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<FinancePluginSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}


}

// Modal Classes
class CurrencyRateModal extends Modal {
	plugin: PersonalFinancePlugin;

	constructor(app: App, plugin: PersonalFinancePlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Update USD to INR Rate' });

		const input = contentEl.createEl('input', {
			type: 'number',
			value: this.plugin.settings.usdToInr.toString()
		});
		input.style.width = '100%';
		input.style.marginBottom = '10px';

		const button = contentEl.createEl('button', { text: 'Update' });
		button.addEventListener('click', async () => {
			const value = parseFloat(input.value);
			if (!isNaN(value) && value > 0) {
				this.plugin.settings.usdToInr = value;
				await this.plugin.saveSettings();
				new Notice(`Currency rate updated to ${value}`);
				this.close();
			} else {
				new Notice('Please enter a valid number');
			}
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class TableRowsModal extends Modal {
	plugin: PersonalFinancePlugin;

	constructor(app: App, plugin: PersonalFinancePlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Update Table Rows Count' });

		const input = contentEl.createEl('input', {
			type: 'number',
			value: this.plugin.settings.tableRowsToShow.toString()
		});
		input.style.width = '100%';
		input.style.marginBottom = '10px';

		const button = contentEl.createEl('button', { text: 'Update' });
		button.addEventListener('click', async () => {
			const value = parseInt(input.value);
			if (!isNaN(value) && value > 0) {
				this.plugin.settings.tableRowsToShow = value;
				await this.plugin.saveSettings();
				new Notice(`Table rows updated to ${value}`);
				this.close();
			} else {
				new Notice('Please enter a valid number');
			}
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class CommodityPricesModal extends Modal {
	plugin: PersonalFinancePlugin;

	constructor(app: App, plugin: PersonalFinancePlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Update Commodity Prices' });
		contentEl.createEl('p', { text: 'Enter JSON format: {"QCOM": {"value": 150.50, "currency": "$"}}' });

		const textarea = contentEl.createEl('textarea');
		textarea.value = JSON.stringify(this.plugin.settings.commodityPrices, null, 2);
		textarea.style.width = '100%';
		textarea.style.height = '200px';
		textarea.style.marginBottom = '10px';

		const button = contentEl.createEl('button', { text: 'Update' });
		button.addEventListener('click', async () => {
			try {
				const parsed = JSON.parse(textarea.value);
				this.plugin.settings.commodityPrices = parsed;
				await this.plugin.saveSettings();
				new Notice('Commodity prices updated');
				this.close();
			} catch (error) {
				new Notice('Invalid JSON format');
			}
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

interface AccountCategory {
	assets: Map<string, number>;
	liabilities: Map<string, number>;
	income: Map<string, number>;
	expenses: Map<string, number>;
}

function categorizeProperty(name: string): keyof AccountCategory | null {
	if (name.startsWith(ACCOUNT_PREFIXES.ASSET) || name.startsWith(ACCOUNT_PREFIXES.COMMODITY)) {
		return 'assets';
	} else if (name.startsWith(ACCOUNT_PREFIXES.LIABILITY)) {
		return 'liabilities';
	} else if (name.startsWith(ACCOUNT_PREFIXES.INCOME)) {
		return 'income';
	} else if (name.startsWith(ACCOUNT_PREFIXES.EXPENSE)) {
		return 'expenses';
	}
	return null;
}

function isAccountProperty(name: string): boolean {
	return categorizeProperty(name) !== null;
}

function getPropertyOrder(name: string): number {
	if (name.startsWith(ACCOUNT_PREFIXES.ASSET)) return 1;
	if (name.startsWith(ACCOUNT_PREFIXES.COMMODITY)) return 2;
	if (name.startsWith(ACCOUNT_PREFIXES.LIABILITY)) return 3;
	if (name.startsWith(ACCOUNT_PREFIXES.EXPENSE)) return 4;
	if (name.startsWith(ACCOUNT_PREFIXES.INCOME)) return 5;
	return 99;
}

function sortProperties(props: string[]): string[] {
	return props.slice().sort((a, b) => {
		// @ts-ignore
		const { name: nameA } = parsePropertyId(a);
		// @ts-ignore
		const { name: nameB } = parsePropertyId(b);
		return getPropertyOrder(nameA) - getPropertyOrder(nameB);
	});
}

// @ts-ignore
export class FinanceDashboardView extends BasesView {
	readonly type = FinanceDashboardViewType;
	private containerEl: HTMLElement;
	// @ts-ignore
	public app: App;
	public config: any;
	public data: any;
	private controller: any;
	private plugin: PersonalFinancePlugin;

	constructor(controller: any, parentEl: HTMLElement, plugin: PersonalFinancePlugin) {
		super(controller);
		this.controller = controller;
		this.plugin = plugin;
		this.containerEl = parentEl.createDiv('bases-finance-dashboard');
	}

	public categorizeAccounts(): AccountCategory {

		const categories: AccountCategory = {
			assets: new Map(),
			liabilities: new Map(),
			income: new Map(),
			expenses: new Map()
		};

		const propertiesToProcess = this.allProperties || this.config.getOrder();
		if (!propertiesToProcess) return categories;

		for (const prop of propertiesToProcess) {
			// @ts-ignore
			const { type, name } = parsePropertyId(prop);
			if (type !== 'note') continue;

			const category = categorizeProperty(name);
			if (!category) continue;

			// Use optimized getSummaryValue API
			// @ts-ignore
			const summaryValue = this.data.getSummaryValue(this.controller, this.data.data, prop, 'Sum');
			// @ts-ignore
			if (!summaryValue || summaryValue.data === null || summaryValue.data === undefined || typeof summaryValue.data !== 'number') continue;

			// @ts-ignore
			let sum = summaryValue.data;

			// Apply commodity pricing with currency conversion if applicable
			if (name.startsWith(ACCOUNT_PREFIXES.COMMODITY)) {
				const commodityName = name.replace(ACCOUNT_PREFIXES.COMMODITY, '');
				const pricing = this.plugin.settings.commodityPrices[commodityName];
				if (pricing) {
					sum = sum * pricing.value;

					// Convert currency if needed
					if (pricing.currency !== this.plugin.settings.currencySymbol) {
						if (pricing.currency === '$' && this.plugin.settings.currencySymbol === '₹') {
							sum = sum * this.plugin.settings.usdToInr;
						} else if (pricing.currency === '₹' && this.plugin.settings.currencySymbol === '$') {
							sum = sum / this.plugin.settings.usdToInr;
						}
					}
				}
			}

			categories[category].set(name, sum);
		}

		return categories;
	}

	public onDataUpdated(): void {
		this.containerEl.empty();
		this.containerEl.addClass('finance-dashboard-container');

		this.addStyles();

		const categories = this.categorizeAccounts();

		// Calculate totals
		const totalAssets = Array.from(categories.assets.values()).reduce((a, b) => a + b, 0);
		const totalLiabilities = Array.from(categories.liabilities.values()).reduce((a, b) => a + b, 0);
		const totalIncome = Array.from(categories.income.values()).reduce((a, b) => a + b, 0);
		const totalExpenses = Array.from(categories.expenses.values()).reduce((a, b) => a + b, 0);
		const netWorth = totalAssets + totalLiabilities; // liabilities are negative

		// Create dashboard components
		this.createNetWorthCard(netWorth, totalAssets, totalLiabilities);
		this.createAccountBreakdown(categories);
		this.createCharts(categories);
		this.createNetWorthChart();
		this.createSnapshotButton(categories);
	}

	private createNetWorthCard(netWorth: number, assets: number, liabilities: number): void {
		const card = this.containerEl.createDiv('dashboard-card net-worth-card');

		card.createEl('h2', { text: 'Net Worth' });

		const amount = card.createDiv('net-worth-amount');
		amount.textContent = formatCurrency(netWorth, this.plugin.settings.currencySymbol);
		amount.className = netWorth >= 0 ? 'positive' : 'negative';

		const breakdown = card.createDiv('net-worth-breakdown');

		const assetsRow = breakdown.createDiv('breakdown-row');
		assetsRow.createSpan({ text: 'Assets', cls: 'breakdown-label' });
		assetsRow.createSpan({ text: formatCurrency(assets, this.plugin.settings.currencySymbol), cls: 'breakdown-value positive' });

		const liabilitiesRow = breakdown.createDiv('breakdown-row');
		liabilitiesRow.createSpan({ text: 'Liabilities', cls: 'breakdown-label' });
		liabilitiesRow.createSpan({ text: formatCurrency(liabilities, this.plugin.settings.currencySymbol), cls: 'breakdown-value negative' });
	}

	private createAccountBreakdown(categories: AccountCategory): void {
		const container = this.containerEl.createDiv('account-breakdown-container');

		// Top Row: Assets and Liabilities side by side
		const topRow = container.createDiv('breakdown-row-container');

		// Assets column
		if (categories.assets.size > 0) {
			const assetsCol = topRow.createDiv('account-column');
			const assetTotal = Array.from(categories.assets.values()).reduce((sum, val) => sum + val, 0);

			const headerDiv = assetsCol.createDiv('column-header');
			headerDiv.createEl('h3', { text: 'Assets' });
			headerDiv.createSpan({ text: formatCurrency(assetTotal, this.plugin.settings.currencySymbol), cls: 'category-sum' });

			const assetEntries = Array.from(categories.assets.entries()).sort((a, b) => b[1] - a[1]);

			assetEntries.forEach(([name, value]) => {
				const row = assetsCol.createDiv('account-row');

				// Add color class
				if (name.startsWith(ACCOUNT_PREFIXES.COMMODITY)) {
					row.addClass('col-commodity');
				} else {
					row.addClass('col-asset');
				}

				// For commodities, get the raw quantity
				if (name.startsWith(ACCOUNT_PREFIXES.COMMODITY)) {
					const commodityName = name.replace(ACCOUNT_PREFIXES.COMMODITY, '');
					const pricing = this.plugin.settings.commodityPrices[commodityName];

					// Calculate raw units from value
					let units = 0;
					if (pricing) {
						let pricePerUnit = pricing.value;
						if (pricing.currency !== this.plugin.settings.currencySymbol) {
							if (pricing.currency === '$' && this.plugin.settings.currencySymbol === '₹') {
								pricePerUnit = pricePerUnit * this.plugin.settings.usdToInr;
							} else if (pricing.currency === '₹' && this.plugin.settings.currencySymbol === '$') {
								pricePerUnit = pricePerUnit / this.plugin.settings.usdToInr;
							}
						}
						units = value / pricePerUnit;
					}

					const nameDiv = row.createDiv({ cls: 'account-name-container' });
					nameDiv.createSpan({ text: name, cls: 'account-name' });
					if (units > 0) {
						nameDiv.createSpan({ text: ` (${units.toFixed(2)} units)`, cls: 'commodity-units' });
					}

					const valueSpan = row.createSpan({ text: formatCurrency(value, this.plugin.settings.currencySymbol), cls: 'account-value positive' });

					// Add pricing formula
					if (pricing) {
						const formulaDiv = row.createDiv({ cls: 'commodity-formula' });
						if (pricing.currency !== this.plugin.settings.currencySymbol) {
							formulaDiv.textContent = `${pricing.value} ${pricing.currency}/unit × ${this.plugin.settings.usdToInr} ${this.plugin.settings.currencySymbol}/USD`;
						} else {
							formulaDiv.textContent = `${pricing.value} ${pricing.currency}/unit`;
						}
					}
				} else {
					row.createSpan({ text: name, cls: 'account-name' });
					row.createSpan({ text: formatCurrency(value, this.plugin.settings.currencySymbol), cls: 'account-value positive' });
				}
			});
		}

		// Liabilities column
		if (categories.liabilities.size > 0) {
			const liabilitiesCol = topRow.createDiv('account-column');
			const liabilityTotal = Array.from(categories.liabilities.values()).reduce((sum, val) => sum + val, 0);

			const headerDiv = liabilitiesCol.createDiv('column-header');
			headerDiv.createEl('h3', { text: 'Liabilities' });
			headerDiv.createSpan({ text: formatCurrency(liabilityTotal, this.plugin.settings.currencySymbol), cls: 'category-sum' });

			const liabilityEntries = Array.from(categories.liabilities.entries()).sort((a, b) => a[1] - b[1]);

			liabilityEntries.forEach(([name, value]) => {
				const row = liabilitiesCol.createDiv('account-row');
				row.addClass('col-liability');
				row.createSpan({ text: name, cls: 'account-name' });
				row.createSpan({ text: formatCurrency(value, this.plugin.settings.currencySymbol), cls: 'account-value negative' });
			});
		}

		// Bottom Row: Income and Expenses side by side
		const bottomRow = container.createDiv('breakdown-row-container');

		// Income column
		if (categories.income.size > 0) {
			const incomeCol = bottomRow.createDiv('account-column');
			const incomeTotal = Array.from(categories.income.values()).reduce((sum, val) => sum + val, 0);

			const headerDiv = incomeCol.createDiv('column-header');
			headerDiv.createEl('h3', { text: 'Income' });
			headerDiv.createSpan({ text: formatCurrency(incomeTotal, this.plugin.settings.currencySymbol), cls: 'category-sum' });

			const incomeEntries = Array.from(categories.income.entries()).sort((a, b) => a[1] - b[1]);

			incomeEntries.forEach(([name, value]) => {
				const row = incomeCol.createDiv('account-row');
				row.addClass('col-income');
				row.createSpan({ text: name, cls: 'account-name' });
				row.createSpan({ text: formatCurrency(value, this.plugin.settings.currencySymbol), cls: 'account-value' });
			});
		}

		// Expenses column
		if (categories.expenses.size > 0) {
			const expensesCol = bottomRow.createDiv('account-column');
			const expenseTotal = Array.from(categories.expenses.values()).reduce((sum, val) => sum + val, 0);

			const headerDiv = expensesCol.createDiv('column-header');
			headerDiv.createEl('h3', { text: 'Expenses' });
			headerDiv.createSpan({ text: formatCurrency(expenseTotal, this.plugin.settings.currencySymbol), cls: 'category-sum' });

			const expenseEntries = Array.from(categories.expenses.entries()).sort((a, b) => b[1] - a[1]);

			expenseEntries.forEach(([name, value]) => {
				const row = expensesCol.createDiv('account-row');
				row.addClass('col-expense');
				row.createSpan({ text: name, cls: 'account-name' });
				row.createSpan({ text: formatCurrency(value, this.plugin.settings.currencySymbol), cls: 'account-value' });
			});
		}
	}

	private createCharts(categories: AccountCategory): void {
		const chartsContainer = this.containerEl.createDiv('charts-container');

		// Asset Distribution Chart
		if (categories.assets.size > 0) {
			const assetChartDiv = chartsContainer.createDiv('chart-wrapper');
			assetChartDiv.createEl('h3', { text: 'Asset Distribution' });
			const canvas = assetChartDiv.createEl('canvas');
			createPieChart(canvas, categories.assets, 'assets', this.plugin.settings.currencySymbol);
		}

		// Expense Distribution Chart
		if (categories.expenses.size > 0) {
			const expenseChartDiv = chartsContainer.createDiv('chart-wrapper');
			expenseChartDiv.createEl('h3', { text: 'Expense Distribution' });
			const canvas = expenseChartDiv.createEl('canvas');
			createPieChart(canvas, categories.expenses, 'expenses', this.plugin.settings.currencySymbol);
		}
	}

	private createSnapshotButton(categories: AccountCategory): void {
		const buttonContainer = this.containerEl.createDiv('snapshot-button-container');
		const button = buttonContainer.createEl('button', {
			text: 'Create Snapshot',
			cls: 'snapshot-button'
		});

		button.addEventListener('click', async () => {
			await this.createSnapshot(categories);
		});
	}

	private async createSnapshot(categories: AccountCategory): Promise<void> {
		try {
			// Ensure snapshots folder exists
			const folderPath = this.plugin.settings.snapshotsFolderPath;
			const folder = this.plugin.app.vault.getAbstractFileByPath(folderPath);

			if (!folder) {
				await this.plugin.app.vault.createFolder(folderPath);
			}

			// Create frontmatter with all accounts
			const frontmatter: Record<string, number> = {};

			for (const [name, value] of categories.assets) {
				frontmatter[name] = value;
			}
			for (const [name, value] of categories.liabilities) {
				frontmatter[name] = value;
			}
			for (const [name, value] of categories.income) {
				frontmatter[name] = value;
			}
			for (const [name, value] of categories.expenses) {
				frontmatter[name] = value;
			}

			// Add date
			const now = new Date();
			const dateStr = now.toISOString();

			// Create file content
			const yamlLines = ['---'];
			for (const [key, value] of Object.entries(frontmatter)) {
				yamlLines.push(`${key}: ${value}`);
			}
			yamlLines.push(`date: ${dateStr}`);
			yamlLines.push('---');
			yamlLines.push('');
			yamlLines.push(`Snapshot taken at: ${now.toLocaleString()}`);

			const content = yamlLines.join('\n');

			// Create filename with timestamp
			const filename = `snapshot-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}.md`;
			const filepath = `${folderPath}/${filename}`;

			await this.plugin.app.vault.create(filepath, content);
			// @ts-ignore
			new Notice(`Snapshot created: ${filename}`);
		} catch (error: any) {
			// @ts-ignore
			new Notice(`Error creating snapshot: ${error.message}`);
			console.error('Snapshot creation error:', error);
		}
	}

	private async loadSnapshots(): Promise<SnapshotDataPoint[]> {
		const snapshots: SnapshotDataPoint[] = [];
		const folderPath = this.plugin.settings.snapshotsFolderPath;

		try {
			const folder = this.plugin.app.vault.getAbstractFileByPath(folderPath);
			// @ts-ignore - TFolder has children property
			if (!folder || !folder.children) {
				return snapshots;
			}

			// Get all markdown files in the snapshots folder
			const files = folder.children.filter((file: any) => file.extension === 'md');

			for (const file of files) {
				try {
					const content = await this.plugin.app.vault.read(file);
					const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

					if (!frontmatterMatch) continue;

					const frontmatter = frontmatterMatch[1];
					const lines = frontmatter.split('\n');

					let date: Date | null = null;
					let assets = 0;
					let liabilities = 0;

					// @ts-ignore
					for (const line of lines) {
						const colonIndex = line.indexOf(':');
						if (colonIndex === -1) continue;

						const key = line.substring(0, colonIndex).trim();
						const value = line.substring(colonIndex + 1).trim();

						if (key === 'date') {
							date = new Date(value);
						} else if (key.startsWith('Asset-') || key.startsWith('Commodity-')) {
							assets += parseFloat(value) || 0;
						} else if (key.startsWith('Liability-')) {
							liabilities += parseFloat(value) || 0;
						}
					}

					if (date) {
						const netWorth = assets + liabilities; // liabilities are negative
						snapshots.push({ date, netWorth, assets, liabilities });
					}
				} catch (error) {
					console.error(`Error reading snapshot file ${file.path}:`, error);
				}
			}
		} catch (error) {
			console.error('Error loading snapshots:', error);
		}

		return snapshots;
	}

	private async createNetWorthChart(): Promise<void> {
		const snapshots = await this.loadSnapshots();

		if (snapshots.length === 0) {
			return; // Don't show chart if no snapshots
		}

		const chartContainer = this.containerEl.createDiv('net-worth-chart-container');
		chartContainer.createEl('h3', { text: 'Net Worth Over Time' });
		const canvas = chartContainer.createEl('canvas');
		createNetWorthLineChart(canvas, snapshots, this.plugin.settings.currencySymbol);
	}

	private addStyles(): void {
		const styleEl = document.getElementById('finance-dashboard-styles');
		if (styleEl) return;

		const style = document.createElement('style');
		style.id = 'finance-dashboard-styles';
		style.textContent = `
			.finance-dashboard-container {
				padding: 20px;
				font-family: var(--font-interface);
			}

			.dashboard-card {
				background: var(--background-secondary);
				border-radius: 12px;
				padding: 24px;
				margin-bottom: 20px;
				box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
				border: 1px solid var(--background-modifier-border);
			}

			.net-worth-card h2 {
				margin: 0 0 16px 0;
				font-size: 18px;
				color: var(--text-muted);
				text-transform: uppercase;
				letter-spacing: 1px;
			}

			.net-worth-amount {
				font-size: 48px;
				font-weight: 700;
				margin-bottom: 20px;
				font-family: var(--font-monospace);
			}

			.net-worth-amount.positive {
				color: #10b981;
			}

			.net-worth-amount.negative {
				color: #ef4444;
			}

			.net-worth-breakdown {
				border-top: 1px solid var(--background-modifier-border);
				padding-top: 16px;
			}

			.breakdown-row {
				display: flex;
				justify-content: space-between;
				align-items: center;
				padding: 8px 0;
			}

			.breakdown-label {
				font-size: 16px;
				color: var(--text-normal);
			}

			.breakdown-value {
				font-size: 20px;
				font-weight: 600;
				font-family: var(--font-monospace);
			}

			.breakdown-value.positive {
				color: #10b981;
			}

			.breakdown-value.negative {
				color: #ef4444;
			}

			.account-breakdown-container {
				display: flex;
				flex-direction: column;
				gap: 20px;
				margin-bottom: 20px;
			}

			.breakdown-row-container {
				display: grid;
				grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
				gap: 20px;
			}

			.account-column {
				background: var(--background-secondary);
				border-radius: 12px;
				padding: 20px;
				border: 1px solid var(--background-modifier-border);
			}

			.account-column h3 {
				margin: 0;
				font-size: 16px;
				color: var(--text-muted);
				text-transform: uppercase;
				letter-spacing: 1px;
			}

			.column-header {
				display: flex;
				justify-content: space-between;
				align-items: center;
				margin-bottom: 16px;
				border-bottom: 2px solid var(--background-modifier-border);
				padding-bottom: 8px;
			}

			.category-sum {
				font-size: 18px;
				font-weight: 700;
				color: var(--text-accent);
				font-family: var(--font-monospace);
			}

			.account-row {
				display: flex;
				flex-direction: column;
				padding: 10px 0;
				border-bottom: 1px solid var(--background-modifier-border-hover);
			}

			.account-name-container {
				display: flex;
				flex-direction: row;
				align-items: center;
				margin-bottom: 4px;
			}

			.account-row:last-child {
				border-bottom: none;
			}

			.account-name {
				font-size: 14px;
				color: var(--text-normal);
			}

			.account-value {
				font-size: 16px;
				font-weight: 600;
			}

			.commodity-units {
				font-size: 12px;
				color: var(--text-muted);
				font-weight: normal;
				margin-left: 4px;
			}

			.average-row {
				font-weight: 600;
				border-top: 2px solid var(--background-modifier-border);
				margin-top: 8px;
				padding-top: 12px;
			}

			.avg-value {
				color: var(--text-accent);
			}

			.account-value.positive {
				font-family: var(--font-monospace);
				color: #10b981;
			}

			.account-value.negative {
				color: #ef4444;
			}

			.account-row.col-asset {
				background-color: rgba(16, 185, 129, 0.05);
				border-radius: 4px;
				padding: 10px 8px;
			}

			.account-row.col-commodity {
				background-color: rgba(59, 130, 246, 0.05);
				border-radius: 4px;
				padding: 10px 8px;
			}

			.account-row.col-liability {
				background-color: rgba(251, 191, 36, 0.05);
				border-radius: 4px;
				padding: 10px 8px;
			}

			.account-row.col-income {
				background-color: rgba(16, 185, 129, 0.05);
				border-radius: 4px;
				padding: 10px 8px;
			}

			.account-row.col-expense {
				background-color: rgba(239, 68, 68, 0.05);
				border-radius: 4px;
				padding: 10px 8px;
			}

			.commodity-formula {
				font-size: 11px;
				color: var(--text-muted);
				font-family: var(--font-monospace);
				margin-top: 4px;
				padding-left: 4px;
			}

			.charts-container {
				display: grid;
				grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
				gap: 20px;
			}

			.chart-wrapper {
				background: var(--background-secondary);
				border-radius: 12px;
				padding: 20px;
				border: 1px solid var(--background-modifier-border);
			}

			.chart-wrapper h3 {
				margin: 0 0 16px 0;
				font-size: 16px;
				color: var(--text-muted);
				text-transform: uppercase;
				letter-spacing: 1px;
				text-align: center;
			}

			.chart-wrapper canvas {
				max-height: 300px;
			}

			.net-worth-chart-container {
				background: var(--background-secondary);
				border-radius: 12px;
				padding: 20px;
				margin-top: 20px;
				border: 1px solid var(--background-modifier-border);
			}

			.net-worth-chart-container h3 {
				margin: 0 0 16px 0;
				font-size: 16px;
				color: var(--text-muted);
				text-transform: uppercase;
				letter-spacing: 1px;
				text-align: center;
			}

			.net-worth-chart-container canvas {
				max-height: 400px;
			}

			.snapshot-button-container {
				margin-top: 30px;
				padding: 20px;
				display: flex;
				justify-content: center;
				align-items: center;
			}

			.snapshot-button {
				background: var(--interactive-accent);
				color: var(--text-on-accent);
				border: none;
				border-radius: 8px;
				padding: 12px 24px;
				font-size: 16px;
				font-weight: 600;
				cursor: pointer;
				transition: all 0.2s ease;
				box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
			}

			.snapshot-button:hover {
				background: var(--interactive-accent-hover);
				box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
				transform: translateY(-1px);
			}

			.snapshot-button:active {
				transform: translateY(0);
				box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
			}
		`;
		document.head.appendChild(style);
	}
}

// @ts-ignore
export class TransactionTableView extends BasesView {
	readonly type = 'transaction-table';
	private containerEl: HTMLElement;
	// @ts-ignore
	public app: App;
	public config: any;
	public data: any;
	private controller: any;
	private plugin: PersonalFinancePlugin;

	constructor(controller: any, parentEl: HTMLElement, plugin: PersonalFinancePlugin) {
		super(controller);
		this.controller = controller;
		this.plugin = plugin;
		this.containerEl = parentEl.createDiv('transaction-table-container');
	}

	private validateTransaction(entry: any, accountProps: string[]): boolean {
		let sum = 0;

		for (const prop of accountProps) {
			// @ts-ignore
			const value = entry.getValue(prop);
			// @ts-ignore
			if (value && value.data && typeof value.data === 'number') {
				// @ts-ignore
				sum += value.data;
			}
		}

		// Allow small floating point tolerance
		return Math.abs(sum) < 0.01;
	}

	private hasCommodity(entry: any, accountProps: string[]): boolean {
		for (const prop of accountProps) {
			// @ts-ignore
			const { name } = parsePropertyId(prop);
			if (name.startsWith(ACCOUNT_PREFIXES.COMMODITY)) {
				// @ts-ignore
				const value = entry.getValue(prop);
				// @ts-ignore
				if (value && value.data) return true;
			}
		}
		return false;
	}

	public onDataUpdated(): void {
		this.containerEl.empty();
		this.addStyles();

		const propertiesToShow = this.allProperties || this.config.getOrder();
		if (!propertiesToShow) {
			this.containerEl.createDiv({ text: 'No properties configured.' });
			return;
		}

		// Categorize properties
		let accountProps: string[] = [];
		const otherProps: { date?: string; comment?: string } = {};

		for (const prop of propertiesToShow) {
			// @ts-ignore
			const { type, name } = parsePropertyId(prop);
			if (type !== 'note') continue;

			if (isAccountProperty(name)) {
				accountProps.push(prop);
			} else if (name.toLowerCase() === 'date') {
				otherProps.date = prop;
			} else if (name.toLowerCase() === 'comment') {
				otherProps.comment = prop;
			}
		}

		// Sort account properties by category order
		accountProps = sortProperties(accountProps);

		// Create table
		const table = this.containerEl.createEl('table', { cls: 'transaction-table' });
		const thead = table.createEl('thead');
		const tbody = table.createEl('tbody');

		// Create header row
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: 'Date' });
		headerRow.createEl('th', { text: 'File' });
		if (otherProps.comment) {
			headerRow.createEl('th', { text: 'Comment' });
		}
		headerRow.createEl('th', { text: 'Valid' });

		for (const prop of accountProps) {
			// @ts-ignore
			const { name } = parsePropertyId(prop);
			const th = headerRow.createEl('th', { text: name });

			// Add color class based on category
			if (name.startsWith(ACCOUNT_PREFIXES.ASSET)) {
				th.addClass('col-asset');
			} else if (name.startsWith(ACCOUNT_PREFIXES.COMMODITY)) {
				th.addClass('col-commodity');
			} else if (name.startsWith(ACCOUNT_PREFIXES.LIABILITY)) {
				th.addClass('col-liability');
			} else if (name.startsWith(ACCOUNT_PREFIXES.EXPENSE)) {
				th.addClass('col-expense');
			} else if (name.startsWith(ACCOUNT_PREFIXES.INCOME)) {
				th.addClass('col-income');
			}
		}

		// Create summary row
		const summaryRow = tbody.createEl('tr', { cls: 'summary-row' });
		summaryRow.createEl('td', { text: 'TOTALS', cls: 'summary-label' });
		summaryRow.createEl('td', { text: '' });
		if (otherProps.comment) {
			summaryRow.createEl('td', { text: '' });
		}
		summaryRow.createEl('td', { text: '' });

		for (const prop of accountProps) {
			// @ts-ignore
			const { name } = parsePropertyId(prop);
			// @ts-ignore
			const summaryValue = this.data.getSummaryValue(this.controller, this.data.data, prop, 'Sum');
			const td = summaryRow.createEl('td', { cls: 'summary-value' });
			// @ts-ignore
			if (summaryValue && summaryValue.data && typeof summaryValue.data === 'number') {
				// Show raw quantity for commodities, currency for others
				if (name.startsWith(ACCOUNT_PREFIXES.COMMODITY)) {
					// @ts-ignore
					td.textContent = summaryValue.data.toFixed(2);
				} else {
					// @ts-ignore
					td.textContent = formatCurrency(summaryValue.data, this.plugin.settings.currencySymbol);
				}
			} else {
				td.textContent = '-';
			}
		}

		// Create data rows (limit based on settings)
		const entries = this.data.data || [];
		const entriesToDisplay = entries.slice(0, this.plugin.settings.tableRowsToShow);
		for (const entry of entriesToDisplay) {
			const row = tbody.createEl('tr');

			// Date column
			const dateCell = row.createEl('td');
			if (otherProps.date) {
				// @ts-ignore
				const dateValue = entry.getValue(otherProps.date);
				// @ts-ignore
				if (dateValue && dateValue.date) {
					// @ts-ignore
					dateCell.textContent = dateValue.date.toLocaleString();
				}
			}

			// File column
			const fileCell = row.createEl('td');
			const fileLink = fileCell.createEl('a', {
				text: entry.file.basename,
				cls: 'file-link'
			});
			fileLink.addEventListener('click', (e) => {
				e.preventDefault();
				// @ts-ignore
				this.app.workspace.openLinkText(entry.file.path, '', false);
			});

			// Comment column
			if (otherProps.comment) {
				const commentCell = row.createEl('td');
				// @ts-ignore
				const commentValue = entry.getValue(otherProps.comment);
				// @ts-ignore
				if (commentValue && commentValue.data) {
					// @ts-ignore
					const text = commentValue.data.toString();
					commentCell.textContent = text.length > 50 ? text.substring(0, 50) + '...' : text;
				}
			}

			// Validation column
			const validCell = row.createEl('td', { cls: 'validation-cell' });
			const hasCommodity = this.hasCommodity(entry, accountProps);

			if (hasCommodity) {
				validCell.textContent = '⚠';
				validCell.addClass('warning');
			} else {
				const isValid = this.validateTransaction(entry, accountProps);
				validCell.textContent = isValid ? '✓' : '✗';
				validCell.addClass(isValid ? 'valid' : 'invalid');
			}

			// Account columns
			for (const prop of accountProps) {
				const cell = row.createEl('td');
				// @ts-ignore
				const { name } = parsePropertyId(prop);

				// Add color class based on category
				if (name.startsWith(ACCOUNT_PREFIXES.ASSET)) {
					cell.addClass('col-asset');
				} else if (name.startsWith(ACCOUNT_PREFIXES.COMMODITY)) {
					cell.addClass('col-commodity');
				} else if (name.startsWith(ACCOUNT_PREFIXES.LIABILITY)) {
					cell.addClass('col-liability');
				} else if (name.startsWith(ACCOUNT_PREFIXES.EXPENSE)) {
					cell.addClass('col-expense');
				} else if (name.startsWith(ACCOUNT_PREFIXES.INCOME)) {
					cell.addClass('col-income');
				}

				// @ts-ignore
				const value = entry.getValue(prop);
				// @ts-ignore
				if (value && value.data && typeof value.data === 'number') {
					// Show raw quantity for commodities, currency for others
					if (name.startsWith(ACCOUNT_PREFIXES.COMMODITY)) {
						// @ts-ignore
						cell.textContent = value.data.toFixed(2);
					} else {
						// @ts-ignore
						cell.textContent = formatCurrency(value.data, this.plugin.settings.currencySymbol);
					}
				} else {
					cell.textContent = '-';
				}
			}
		}
	}

	private addStyles(): void {
		const styleEl = document.getElementById('transaction-table-styles');
		if (styleEl) return;

		const style = document.createElement('style');
		style.id = 'transaction-table-styles';
		style.textContent = `
			.transaction-table-container {
				padding: 20px;
				overflow-x: auto;
			}

			.transaction-table {
				width: 100%;
				border-collapse: collapse;
				font-family: var(--font-interface);
				font-size: 14px;
			}

			.transaction-table th {
				background: var(--background-secondary);
				color: var(--text-normal);
				padding: 12px;
				text-align: left;
				font-weight: 600;
				border: 1px solid var(--background-modifier-border);
				position: sticky;
				top: 0;
				z-index: 10;
			}

			.transaction-table td {
				padding: 10px 12px;
				border: 1px solid var(--background-modifier-border);
			}

			.transaction-table th:nth-child(1),
			.transaction-table td:nth-child(1) {
				width: 100px;
				max-width: 100px;
			}

			.transaction-table th:nth-child(2),
			.transaction-table td:nth-child(2) {
				width: 120px;
				max-width: 120px;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			.transaction-table th:nth-child(3),
			.transaction-table td:nth-child(3) {
				max-width: 150px;
				overflow: hidden;
				text-overflow: ellipsis;
			}

			.transaction-table th:nth-child(4),
			.transaction-table td:nth-child(4) {
				width: 50px;
				max-width: 50px;
				text-align: center;
			}

			.transaction-table tr:hover {
				background: var(--background-modifier-hover);
			}

			.summary-row {
				background: var(--background-secondary-alt);
				font-weight: 600;
				position: sticky;
				top: 45px;
				z-index: 9;
			}

			.summary-label {
				font-weight: 700;
				color: var(--text-accent);
			}

			.summary-value {
				font-family: var(--font-monospace);
				font-weight: 700;
			}

			.file-link {
				color: var(--text-accent);
				cursor: pointer;
				text-decoration: none;
			}

			.file-link:hover {
				text-decoration: underline;
			}

			.validation-cell {
				text-align: center;
				font-size: 18px;
				font-weight: 700;
			}

			.validation-cell.valid {
				color: #10b981;
			}

			.validation-cell.invalid {
				color: #ef4444;
			}

			.validation-cell.warning {
				color: #f59e0b;
			}

		.transaction-table th,
		.transaction-table td {
			min-width: 150px;
			max-width: 200px;
			word-wrap: break-word;
		}

		.col-asset {
			background-color: rgba(16, 185, 129, 0.1);
		}

		.col-commodity {
			background-color: rgba(59, 130, 246, 0.1);
		}

		.col-liability {
			background-color: rgba(251, 191, 36, 0.1);
		}

		.col-expense {
			background-color: rgba(239, 68, 68, 0.1);
		}

		.col-income {
			background-color: rgba(16, 185, 129, 0.1);
		}
	`;
		document.head.appendChild(style);
	}
}
