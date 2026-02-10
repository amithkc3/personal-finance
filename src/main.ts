import { App, Plugin, BasesView, parsePropertyId, Modal, Notice, TFile, TFolder, TAbstractFile, setIcon } from 'obsidian';
import { DEFAULT_SETTINGS, FinancePluginSettings, FinanceSettingTab } from "./settings";
import { createPieChart, formatCurrency, createNetWorthLineChart, SnapshotDataPoint } from "./utils/charts";

// Resource imports
// @ts-ignore
import usageGuideContent from './resources/Personal-finances-usage-guide.md';
// @ts-ignore
import transactionTemplateContent from './resources/Transaction.md';
// @ts-ignore
import financesBaseContent from './resources/Finances.base';

export const FinanceDashboardViewType = 'finance-dashboard';

// Strict account prefix definitions
const ACCOUNT_PREFIXES = {
	ASSET: 'Asset-',
	LIABILITY: 'Liability-',
	EXPENSE: 'Expense-',
	INCOME: 'Income-',
	COMMODITY: 'Commodity-',
	UNIT_PRICE: 'UnitPrice-',
	INVALID_REASON: 'Invalid_reason'
} as const;

export default class PersonalFinancePlugin extends Plugin {
	settings: FinancePluginSettings;

	async onload() {
		await this.loadSettings();
		await this.ensureFileStructure();

		// Listen for external changes to settings (e.g. from sync)
		this.registerEvent(this.app.vault.on('modify', async (file) => {
			const settingsPath = `${this.settings.rootFolderPath}/finance-settings.json`;
			if (file.path === settingsPath) {
				await this.loadSettings();
			}
		}));

		// @ts-ignore
		this.registerBasesView(FinanceDashboardViewType, {
			name: 'Personal Finance Dashboard',
			icon: 'lucide-wallet',
			factory: (controller: any, containerEl: HTMLElement) => {
				return new FinanceDashboardView(controller, containerEl, this) as any
			},
			options: () => ([]),
		});


		// Add commands
		this.addCommand({
			id: 'update-rates-and-prices',
			name: 'Update Rates & Prices',
			callback: () => new RatesAndPricesModal(this.app, this).open()
		});

		this.addCommand({
			id: 'update-table-rows',
			name: 'Update Table Rows Count',
			callback: () => new TableRowsModal(this.app, this).open()
		});

		this.addSettingTab(new FinanceSettingTab(this.app, this));
	}

	async loadSettings() {
		// 1. Load local settings first to get the root folder path
		const localData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, localData);

		// 2. Try to load from vault settings file
		const settingsPath = `${this.settings.rootFolderPath}/finance-settings.json`;
		if (await this.app.vault.adapter.exists(settingsPath)) {
			try {
				const content = await this.app.vault.adapter.read(settingsPath);
				const vaultSettings = JSON.parse(content);
				// Override local settings with vault settings
				this.settings = Object.assign({}, this.settings, vaultSettings);
				// Also update local data to match, to keep them in sync
				await this.saveData(this.settings);
			} catch (e) {
				console.error('Error loading settings from vault:', e);
				new Notice('Error loading synced settings');
			}
		}
	}

	async saveSettings() {
		// 1. Save to local data
		await this.saveData(this.settings);

		// 2. Save to vault settings file
		try {
			const settingsPath = `${this.settings.rootFolderPath}/finance-settings.json`;

			// Ensure root folder exists (just in case)
			if (!(await this.app.vault.adapter.exists(this.settings.rootFolderPath))) {
				await this.app.vault.createFolder(this.settings.rootFolderPath);
			}

			if (await this.app.vault.adapter.exists(settingsPath)) {
				const file = this.app.vault.getAbstractFileByPath(settingsPath);
				if (file instanceof TFile) {
					await this.app.vault.modify(file, JSON.stringify(this.settings, null, 2));
				}
			} else {
				await this.app.vault.create(settingsPath, JSON.stringify(this.settings, null, 2));
			}
		} catch (e) {
			console.error('Error saving settings to vault:', e);
			new Notice('Error saving settings to vault file');
		}
	}

	async ensureFileStructure() {
		try {
			// Create Root Folder
			if (!(await this.app.vault.adapter.exists(this.settings.rootFolderPath))) {
				await this.app.vault.createFolder(this.settings.rootFolderPath);
			}

			// Create Transactions Folder
			if (!(await this.app.vault.adapter.exists(this.settings.transactionsFolderPath))) {
				await this.app.vault.createFolder(this.settings.transactionsFolderPath);
			}

			// Create Snapshots Folder
			if (!(await this.app.vault.adapter.exists(this.settings.snapshotsFolderPath))) {
				await this.app.vault.createFolder(this.settings.snapshotsFolderPath);
			}

			// 1. Create Usage Guide
			const guidePath = this.settings.usageGuideFilePath;
			// Create parent folder for usage guide if it doesn't exist
			const guideDir = guidePath.substring(0, guidePath.lastIndexOf('/'));
			if (guideDir && !(await this.app.vault.adapter.exists(guideDir))) {
				await this.app.vault.createFolder(guideDir);
			}

			if (!(await this.app.vault.adapter.exists(guidePath))) {
				await this.app.vault.create(guidePath, usageGuideContent);
			}

			// 2. Create Default Template
			if (!(await this.app.vault.adapter.exists(this.settings.templateFilePath))) {
				// Create parent folder for template if it doesn't exist
				const templateDir = this.settings.templateFilePath.substring(0, this.settings.templateFilePath.lastIndexOf('/'));
				if (templateDir && !(await this.app.vault.adapter.exists(templateDir))) {
					await this.app.vault.createFolder(templateDir);
				}

				// Inject the dynamic usage guide link
				// Remove extension from path for the wiki link
				const guideLinkPath = this.settings.usageGuideFilePath.replace(/\.md$/, '');
				const templateContent = transactionTemplateContent.replace('{{USAGE_GUIDE_LINK}}', guideLinkPath);

				await this.app.vault.create(this.settings.templateFilePath, templateContent);
				new Notice('Created default transaction template');
			}

			// 3. Create Finance.base
			const basePath = `${this.settings.rootFolderPath}/Finances.base`;
			if (!(await this.app.vault.adapter.exists(basePath))) {
				// Inject the dynamic transaction folder path
				const baseContent = financesBaseContent.replace('{{TRANSACTIONS_FOLDER}}', this.settings.transactionsFolderPath);
				await this.app.vault.create(basePath, baseContent);
			}

		} catch (error) {
			console.error('Error ensuring file structure:', error);
			new Notice('Error creating finance folders/template');
		}
	}
}


// Combined Modal
class RatesAndPricesModal extends Modal {
	plugin: PersonalFinancePlugin;

	constructor(app: App, plugin: PersonalFinancePlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Update Rates & Prices' });

		// 1. Commodity Prices Section (moved first)
		contentEl.createEl('h3', { text: 'Commodity Prices' });
		contentEl.createEl('p', { text: 'JSON format: {"QCOM": {"value": 150.50, "currency": "$"}}' });

		const pricesTextarea = contentEl.createEl('textarea');
		pricesTextarea.value = JSON.stringify(this.plugin.settings.commodityPrices, null, 2);
		pricesTextarea.style.width = '100%';
		pricesTextarea.style.height = '150px';
		pricesTextarea.style.marginBottom = '20px';

		// 2. Currency Rate Section
		contentEl.createEl('h3', { text: 'USD to INR Rate' });
		const rateInput = contentEl.createEl('input', {
			type: 'number',
			value: this.plugin.settings.usdToInr.toString()
		});
		rateInput.style.width = '100%';
		rateInput.style.marginBottom = '20px';

		// Save Button
		const button = contentEl.createEl('button', { text: 'Save All Changes', cls: 'mod-cta' });
		button.style.width = '100%';

		button.addEventListener('click', async () => {
			let rateUpdated = false;
			let pricesUpdated = false;

			// Process Rate
			const newRate = parseFloat(rateInput.value);
			if (!isNaN(newRate) && newRate > 0) {
				this.plugin.settings.usdToInr = newRate;
				rateUpdated = true;
			}

			// Process Prices
			try {
				const parsed = JSON.parse(pricesTextarea.value);

				// Apply default currency if missing
				for (const key in parsed) {
					const item = parsed[key];
					if (typeof item === 'object' && item !== null && typeof item.value === 'number') {
						if (!item.currency) {
							item.currency = this.plugin.settings.currencySymbol;
						}
					}
				}

				this.plugin.settings.commodityPrices = parsed;
				pricesUpdated = true;
			} catch (error) {
				new Notice('Invalid JSON in commodity prices');
				return; // Stop if JSON is invalid
			}

			await this.plugin.saveSettings();
			new Notice(`Settings updated! Rate: ${newRate}, Prices saved.`);
			this.close();
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
				new Notice(`Table rows updated to ${value} `);
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

class ValidateTransactionsModal extends Modal {
	private dashboardView: FinanceDashboardView;

	constructor(app: App, dashboardView: FinanceDashboardView) {
		super(app);
		this.dashboardView = dashboardView;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Validate Transactions' });

		contentEl.createEl('p', {
			text: 'Choose how to validate your transactions:'
		});

		// Option 1: Validate Invalid Transactions (GREEN)
		const option1Container = contentEl.createDiv({ cls: 'validation-option' });
		option1Container.style.marginBottom = '20px';
		option1Container.style.padding = '15px';
		option1Container.style.border = '1px solid var(--background-modifier-border)';
		option1Container.style.borderRadius = '8px';

		option1Container.createEl('h4', { text: 'Validate Invalid Transactions' });
		option1Container.createEl('p', {
			text: 'Validates new transactions without checksums. Computes commodity prices, generates checksums, and marks as valid/invalid.',
			cls: 'setting-item-description'
		});

		const validateInvalidBtn = option1Container.createEl('button', {
			text: 'Validate New Transactions'
		});
		validateInvalidBtn.style.width = '100%';
		validateInvalidBtn.style.backgroundColor = '#28a745';
		validateInvalidBtn.style.color = 'white';
		validateInvalidBtn.addEventListener('click', async () => {
			this.close();
			await this.dashboardView.validateInvalidTransactions();
		});

		// Option 2: Verify Transaction Integrity (BLUE/RED with input)
		const option2Container = contentEl.createDiv({ cls: 'validation-option' });
		option2Container.style.padding = '15px';
		option2Container.style.border = '1px solid var(--background-modifier-border)';
		option2Container.style.borderRadius = '8px';

		option2Container.createEl('h4', { text: 'Verify Transaction Integrity' });
		const desc = option2Container.createEl('p', {
			text: 'Uses checksum comparison to detect tampering. Verifies recent N transactions or all transactions (-1).',
			cls: 'setting-item-description'
		});

		// Input for N
		const inputContainer = option2Container.createDiv();
		inputContainer.style.marginTop = '10px';
		inputContainer.style.marginBottom = '10px';

		const label = inputContainer.createEl('label', { text: 'Number of transactions to verify (use -1 for all): ' });
		label.style.display = 'block';
		label.style.marginBottom = '5px';

		const input = inputContainer.createEl('input', {
			type: 'number',
			value: '50'
		});
		input.style.width = '100%';
		input.style.padding = '5px';
		input.min = '-1';

		const verifyBtn = option2Container.createEl('button', {
			text: 'Verify Transaction Integrity'
		});
		verifyBtn.style.width = '100%';
		verifyBtn.style.marginTop = '10px';
		verifyBtn.style.backgroundColor = 'var(--interactive-accent)';
		verifyBtn.style.color = 'white';
		verifyBtn.addEventListener('click', async () => {
			const count = parseInt(input.value);
			if (isNaN(count) || count < -1) {
				new Notice('Please enter a valid number (-1 for all, or positive number)');
				return;
			}
			this.close();
			await this.dashboardView.verifyTransactionIntegrity(count);
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// ... (AccountCategory interface and helper functions remain unchanged)

interface AccountCategory {
	assets: Map<string, number>;
	liabilities: Map<string, number>;
	income: Map<string, number>;
	expenses: Map<string, number>;
}

interface DashboardCache {
	lastUpdated: string;
	maxFileMtime: number;
	fileCount: number;
	sums: Record<string, number>;
	categories: {
		assets: Record<string, number>;
		liabilities: Record<string, number>;
		income: Record<string, number>;
		expenses: Record<string, number>;
	};
	netWorth: number;
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
	private cachedData: DashboardCache | null = null;

	constructor(controller: any, parentEl: HTMLElement, plugin: PersonalFinancePlugin) {
		super(controller);
		this.controller = controller;
		this.plugin = plugin;
		this.containerEl = parentEl.createDiv('bases-finance-dashboard');
	}

	private async getMaxFileMtime(): Promise<{ maxMtime: number; fileCount: number }> {
		const transactionsFolder = this.plugin.settings.transactionsFolderPath;
		const folder = this.plugin.app.vault.getAbstractFileByPath(transactionsFolder);

		if (!(folder instanceof TFolder)) {
			return { maxMtime: 0, fileCount: 0 };
		}

		const files = folder.children.filter((f) => f instanceof TFile && f.extension === 'md') as TFile[];
		let maxMtime = 0;
		for (const file of files) {
			if (file.stat.mtime > maxMtime) {
				maxMtime = file.stat.mtime;
			}
		}
		return { maxMtime, fileCount: files.length };
	}

	private async loadCache(): Promise<DashboardCache | null> {
		const cachePath = this.plugin.settings.dashboardDataPath;
		try {
			if (await this.plugin.app.vault.adapter.exists(cachePath)) {
				const content = await this.plugin.app.vault.adapter.read(cachePath);
				return JSON.parse(content) as DashboardCache;
			}
		} catch (e) {
			console.error('Error loading dashboard cache, will recalculate:', e);
			new Notice('Dashboard cache corrupted, recalculating...');
		}
		return null;
	}

	private async saveCache(cache: DashboardCache): Promise<void> {
		const cachePath = this.plugin.settings.dashboardDataPath;
		try {
			await this.plugin.app.vault.adapter.write(cachePath, JSON.stringify(cache, null, 2));
		} catch (e) {
			console.error('Error saving dashboard cache:', e);
		}
	}

	private categoriesToCache(categories: AccountCategory): DashboardCache['categories'] {
		return {
			assets: Object.fromEntries(categories.assets),
			liabilities: Object.fromEntries(categories.liabilities),
			income: Object.fromEntries(categories.income),
			expenses: Object.fromEntries(categories.expenses)
		};
	}

	private cacheToCategories(cache: DashboardCache): AccountCategory {
		return {
			assets: new Map(Object.entries(cache.categories.assets)),
			liabilities: new Map(Object.entries(cache.categories.liabilities)),
			income: new Map(Object.entries(cache.categories.income)),
			expenses: new Map(Object.entries(cache.categories.expenses))
		};
	}

	public async refreshDashboardData(force: boolean = false): Promise<{ categories: AccountCategory; netWorth: number; lastUpdated: string }> {
		const { maxMtime, fileCount } = await this.getMaxFileMtime();

		// Try to load existing cache
		if (!force) {
			const existingCache = await this.loadCache();
			if (existingCache && existingCache.maxFileMtime >= maxMtime && existingCache.fileCount === fileCount) {
				// Cache is valid, use it
				this.cachedData = existingCache;
				return {
					categories: this.cacheToCategories(existingCache),
					netWorth: existingCache.netWorth,
					lastUpdated: existingCache.lastUpdated
				};
			}
		}

		// Recalculate
		new Notice('Refreshing dashboard data...');
		const categories = this.categorizeAccounts();
		const netWorth = Array.from(categories.assets.values()).reduce((a, b) => a + b, 0) +
			Array.from(categories.liabilities.values()).reduce((a, b) => a + b, 0);

		// Build cache
		const sums: Record<string, number> = {};
		for (const [k, v] of categories.assets) sums[k] = v;
		for (const [k, v] of categories.liabilities) sums[k] = v;
		for (const [k, v] of categories.income) sums[k] = v;
		for (const [k, v] of categories.expenses) sums[k] = v;

		const cache: DashboardCache = {
			lastUpdated: new Date().toISOString(),
			maxFileMtime: maxMtime,
			fileCount: fileCount,
			sums: sums,
			categories: this.categoriesToCache(categories),
			netWorth: netWorth
		};

		await this.saveCache(cache);
		this.cachedData = cache;
		new Notice('Dashboard data refreshed!');

		return { categories, netWorth, lastUpdated: cache.lastUpdated };
	}

	public categorizeAccounts(): AccountCategory {
		// ... (implementation same as before)
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

		// Use cached data if available, otherwise calculate fresh
		let categories: AccountCategory;
		let netWorth: number;
		let lastUpdated: string | undefined;

		if (this.cachedData) {
			categories = this.cacheToCategories(this.cachedData);
			netWorth = this.cachedData.netWorth;
			lastUpdated = this.cachedData.lastUpdated;
		} else {
			// Fallback to direct calculation (first load before cache)
			categories = this.categorizeAccounts();
			const totalAssets = Array.from(categories.assets.values()).reduce((a, b) => a + b, 0);
			const totalLiabilities = Array.from(categories.liabilities.values()).reduce((a, b) => a + b, 0);
			netWorth = totalAssets + totalLiabilities;

			// Trigger async cache refresh in background
			this.refreshDashboardData(false).then(data => {
				// Update if data changed
				if (data.netWorth !== netWorth) {
					this.onDataUpdated();
				}
			});
		}

		// Create dashboard components in new layout order
		// Row 1: Compact Net Worth + Actions
		this.createTopRow(netWorth, categories, lastUpdated);

		// Row 2: Transaction Table (Moved here as requested)
		this.createTransactionTable();

		// Row 3: Net Worth Line Chart (full width)
		this.createNetWorthChart();

		// Row 4 & 5: Category blocks with integrated pie charts
		this.createCategoryBlocks(categories);
	}

	private createTopRow(netWorth: number, categories: AccountCategory, lastUpdated?: string): void {
		const topRow = this.containerEl.createDiv('dashboard-top-row');

		// 1. Net Worth Card (Left/Top)
		const netWorthCard = topRow.createDiv('compact-net-worth-card');

		// Header with Refresh Button
		const headerContainer = netWorthCard.createDiv('net-worth-header-container');
		headerContainer.style.display = 'flex';
		headerContainer.style.justifyContent = 'space-between';
		headerContainer.style.alignItems = 'center';
		headerContainer.style.width = '100%';
		headerContainer.style.marginBottom = '8px';

		headerContainer.createEl('h3', { text: 'NET WORTH', cls: 'net-worth-title' });

		const refreshBtn = headerContainer.createEl('button', {
			cls: 'refresh-button-small'
		});
		// Recycle icon (using text for now, could use setIcon if available)
		const refreshIcon = refreshBtn.createSpan({ cls: 'refresh-icon' });
		refreshIcon.textContent = '↻';
		refreshBtn.createSpan({ text: ' Refresh' });
		refreshBtn.addEventListener('click', async (e) => {
			e.stopPropagation();
			await this.refreshDashboardData(true);
			this.onDataUpdated();
		});

		const infoContainer = netWorthCard.createDiv('net-worth-info');
		const amount = infoContainer.createDiv('compact-net-worth-amount');
		amount.textContent = formatCurrency(netWorth, this.plugin.settings.currencySymbol);

		// Last updated indicator
		if (lastUpdated) {
			const lastUpdatedEl = netWorthCard.createDiv('last-updated-indicator');
			const date = new Date(lastUpdated);
			const timeAgo = this.getTimeAgo(date);
			lastUpdatedEl.textContent = `Last refreshed: ${timeAgo}`;
			lastUpdatedEl.style.fontSize = '0.75rem';
			lastUpdatedEl.style.color = 'var(--text-muted)';
			lastUpdatedEl.style.marginTop = '4px';
		}

		// 2. Actions Block (Right/Bottom)
		const actionsContainer = topRow.createDiv('dashboard-actions-block');

		// Log Transaction button (Large)
		const logTransactionBtn = actionsContainer.createEl('button', {
			cls: 'action-button action-button-large'
		});
		const logIcon = logTransactionBtn.createSpan({ cls: 'action-icon' });
		logIcon.textContent = '+';
		logTransactionBtn.createSpan({ text: ' Log Transaction' });
		logTransactionBtn.addEventListener('click', async () => {
			await this.logTransaction();
		});

		// Unified Update Rates/Prices button (Gear icon)
		const updateBtn = actionsContainer.createEl('button', {
			cls: 'action-button'
		});
		const iconContainer = updateBtn.createSpan({ cls: 'action-icon' });
		setIcon(iconContainer, 'settings');
		updateBtn.createSpan({ text: 'Update Rates & Prices' });
		updateBtn.addEventListener('click', () => {
			new RatesAndPricesModal(this.app, this.plugin).open();
		});
	}

	private getTimeAgo(date: Date): string {
		const now = new Date();
		const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

		if (seconds < 60) return 'just now';
		if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
		if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
		return `${Math.floor(seconds / 86400)} days ago`;
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

	// Compute simple hash for checksum (browser-compatible for Obsidian)
	private computeChecksum(accountProps: Record<string, number>): string {
		const sortedKeys = Object.keys(accountProps).sort();
		const data = sortedKeys.map(k => `${k}:${accountProps[k]}`).join('|');

		// Simple hash function (compatible with browser environment)
		let hash = 0;
		for (let i = 0; i < data.length; i++) {
			const char = data.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32-bit integer
		}

		// Convert to positive hex string
		return Math.abs(hash).toString(16).padStart(8, '0');
	}

	// Get commodity price - prioritize existing UnitPrice, then settings, then default
	private getCommodityPrice(commodityName: string, frontmatterObj: any): number {
		// 1. Check if UnitPrice already exists in transaction (historical price)
		const unitPriceKey = `${ACCOUNT_PREFIXES.UNIT_PRICE}${commodityName}`;
		console.log("getCommodityPrice called");
		console.log(unitPriceKey, frontmatterObj[unitPriceKey]);
		if (frontmatterObj[unitPriceKey] !== undefined) {
			const price = parseFloat(frontmatterObj[unitPriceKey]);
			return isNaN(price) ? 1 : price;
		}

		// 2. Get from settings and convert currency if needed
		const pricing = this.plugin.settings.commodityPrices[commodityName];
		if (!pricing) return 1; // Default fallback

		let price = pricing.value;
		// Convert to transaction currency if needed
		if (pricing.currency === '$' && this.plugin.settings.currencySymbol === '₹') {
			price *= this.plugin.settings.usdToInr;
		} else if (pricing.currency === '₹' && this.plugin.settings.currencySymbol === '$') {
			price /= this.plugin.settings.usdToInr;
		}
		return price;
	}

	// Validate only transactions where checksum doesn't exist (truly new transactions)
	public async validateInvalidTransactions(): Promise<void> {
		const transactionsFolder = this.plugin.settings.transactionsFolderPath;
		const folder = this.plugin.app.vault.getAbstractFileByPath(transactionsFolder);

		if (!(folder instanceof TFolder)) {
			new Notice('Transactions folder not found.');
			return;
		}

		const allFiles = folder.children.filter((file) => file instanceof TFile && file.extension === 'md') as TFile[];
		const filesToProcess: TFile[] = [];

		// Only process files WITHOUT checksum or with empty/undefined checksum
		for (const file of allFiles) {
			const content = await this.plugin.app.vault.read(file);
			const checksumMatch = content.match(/^checksum:\s*(.*)$/m);
			// Process if checksum doesn't exist OR if it exists but is empty/whitespace
			if (!checksumMatch || !checksumMatch[1] || checksumMatch[1].trim() === '') {
				filesToProcess.push(file);
			}
		}

		await this.validateTransaction(filesToProcess);
	}

	// Verify transaction integrity using checksums (for already-validated transactions)
	public async verifyTransactionIntegrity(count: number): Promise<void> {
		const transactionsFolder = this.plugin.settings.transactionsFolderPath;
		const folder = this.plugin.app.vault.getAbstractFileByPath(transactionsFolder);

		if (!(folder instanceof TFolder)) {
			new Notice('Transactions folder not found.');
			return;
		}

		const allFiles = folder.children.filter((file) => file instanceof TFile && file.extension === 'md') as TFile[];

		// Sort by mtime descending (most recent first)
		allFiles.sort((a, b) => b.stat.mtime - a.stat.mtime);

		// If count is -1 or >= total, verify all
		const filesToProcess = (count === -1 || count >= allFiles.length)
			? allFiles
			: allFiles.slice(0, count);

		await this.verifyTransactionChecksum(filesToProcess);
	}

	// Core validation logic for new transactions (without checksums)
	private async validateTransaction(filesToProcess: TFile[]): Promise<void> {
		let validCount = 0;
		let invalidCount = 0;

		new Notice(`Validating ${filesToProcess.length} new transactions...`);

		for (const file of filesToProcess) {
			try {
				const content = await this.plugin.app.vault.read(file);
				const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);

				if (!frontmatterMatch) continue;

				const frontmatter = frontmatterMatch[1] || '';
				const lines = frontmatter.split('\n');

				// Parse frontmatter into object for commodity price lookup
				const frontmatterObj: Record<string, any> = {};
				for (const line of lines) {
					const colonIndex = line.indexOf(':');
					if (colonIndex !== -1) {
						const key = line.substring(0, colonIndex).trim();
						const value = line.substring(colonIndex + 1).trim();
						frontmatterObj[key] = value;
					}
				}

				// Calculate sum including commodities with their unit prices
				let sum = 0;
				const accountProps: Record<string, number> = {};
				const newLines: string[] = [];
				const commodities: string[] = [];

				for (const line of lines) {
					const colonIndex = line.indexOf(':');
					if (colonIndex === -1) {
						newLines.push(line);
						continue;
					}

					const key = line.substring(0, colonIndex).trim();
					const value = line.substring(colonIndex + 1).trim();

					// Skip properties that shouldn't be in frontmatter or checksum
					if (key === 'is_valid' || key === ACCOUNT_PREFIXES.INVALID_REASON || key === 'checksum') {
						continue;
					}

					// Handle account properties
					if (key.startsWith(ACCOUNT_PREFIXES.ASSET) || key.startsWith(ACCOUNT_PREFIXES.LIABILITY) ||
						key.startsWith(ACCOUNT_PREFIXES.EXPENSE) || key.startsWith(ACCOUNT_PREFIXES.INCOME)) {
						const numValue = parseFloat(value);
						if (!isNaN(numValue)) {
							sum += numValue;
							accountProps[key] = numValue;
						}
					} else if (key.startsWith(ACCOUNT_PREFIXES.COMMODITY)) {
						// Track commodities for unit price computation
						const commodityName = key.substring(ACCOUNT_PREFIXES.COMMODITY.length);
						const numValue = parseFloat(value);
						if (!isNaN(numValue)) {
							commodities.push(commodityName);
							accountProps[key] = numValue;

							// Get or compute unit price
							const unitPrice = this.getCommodityPrice(commodityName, frontmatterObj);
							const unitPriceKey = `${ACCOUNT_PREFIXES.UNIT_PRICE}${commodityName}`;
							accountProps[unitPriceKey] = unitPrice;

							// Add commodity value to sum
							sum += numValue * unitPrice;
							console.log(line, numValue, unitPrice)
						}
					} else if (key.startsWith(ACCOUNT_PREFIXES.UNIT_PRICE)) {
						// Include existing UnitPrice in accountProps for checksum
						console.log(line, value)
						const numValue = parseFloat(value);
						if (!isNaN(numValue)) {
							accountProps[key] = numValue;
						}
					}

					newLines.push(line);
				}

				// Add UnitPrice properties for commodities (if not already present)
				for (const commodityName of commodities) {
					const unitPriceKey = `${ACCOUNT_PREFIXES.UNIT_PRICE}${commodityName}`;
					if (!frontmatterObj[unitPriceKey]) {
						const unitPrice = accountProps[unitPriceKey]; // Already computed above
						newLines.push(`${unitPriceKey}: ${unitPrice}`);
					}
				}

				// Compute checksum from account properties
				const checksum = this.computeChecksum(accountProps);

				console.log(sum);
				// Determine validity and build Invalid_reason if needed
				const isValid = Math.abs(sum) < 0.01;
				let invalidReason = '';

				if (!isValid) {
					invalidReason = `Transaction-difference-${sum.toFixed(2)}-should-be-0-please-fix`;
				}

				// Add validation properties
				if (invalidReason) {
					newLines.push(`${ACCOUNT_PREFIXES.INVALID_REASON}: ${invalidReason}`);
				}
				newLines.push(`checksum: ${checksum}`);
				newLines.push(`is_valid: ${isValid}`);

				// Reconstruct content
				const newFrontmatter = newLines.join('\n');
				const bodyContent = content.substring(frontmatterMatch[0].length);
				const newContent = `---\n${newFrontmatter}\n---${bodyContent}`;

				// Always update (since we're adding checksum and possibly UnitPrice)
				await this.plugin.app.vault.modify(file, newContent);

				if (isValid) {
					validCount++;
				} else {
					invalidCount++;
				}
			} catch (error) {
				console.error(`Error validating ${file.path}: `, error);
			}
		}

		new Notice(`Validation complete! ✓ ${validCount} valid, ✗ ${invalidCount} invalid`);
	}

	// Verify transaction integrity using checksum comparison
	private async verifyTransactionChecksum(filesToProcess: TFile[]): Promise<void> {
		let validCount = 0;
		let invalidCount = 0;
		let tamperedCount = 0;

		new Notice(`Verifying ${filesToProcess.length} transactions...`);

		for (const file of filesToProcess) {
			try {
				const content = await this.plugin.app.vault.read(file);
				const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);

				if (!frontmatterMatch) continue;

				const frontmatter = frontmatterMatch[1] || '';
				const lines = frontmatter.split('\n');

				// Parse frontmatter
				const frontmatterObj: Record<string, any> = {};
				for (const line of lines) {
					const colonIndex = line.indexOf(':');
					if (colonIndex !== -1) {
						const key = line.substring(0, colonIndex).trim();
						const value = line.substring(colonIndex + 1).trim();
						frontmatterObj[key] = value;
					}
				}

				// Extract stored checksum
				const storedChecksum = frontmatterObj['checksum'];

				// Recompute account properties and checksum
				let sum = 0;
				const accountProps: Record<string, number> = {};
				const newLines: string[] = [];

				for (const line of lines) {
					const colonIndex = line.indexOf(':');
					if (colonIndex === -1) {
						newLines.push(line);
						continue;
					}

					const key = line.substring(0, colonIndex).trim();
					const value = line.substring(colonIndex + 1).trim();

					// Skip validation-related properties
					if (key === 'is_valid' || key === ACCOUNT_PREFIXES.INVALID_REASON || key === 'checksum') {
						continue;
					}

					// Collect account properties for checksum
					if (key.startsWith(ACCOUNT_PREFIXES.ASSET) || key.startsWith(ACCOUNT_PREFIXES.LIABILITY) ||
						key.startsWith(ACCOUNT_PREFIXES.EXPENSE) || key.startsWith(ACCOUNT_PREFIXES.INCOME) ||
						key.startsWith(ACCOUNT_PREFIXES.COMMODITY) || key.startsWith(ACCOUNT_PREFIXES.UNIT_PRICE)) {
						const numValue = parseFloat(value);
						if (!isNaN(numValue)) {
							accountProps[key] = numValue;

							// Add to sum (commodities need UnitPrice multiplication)
							if (key.startsWith(ACCOUNT_PREFIXES.COMMODITY)) {
								const commodityName = key.substring(ACCOUNT_PREFIXES.COMMODITY.length);
								const unitPriceKey = `${ACCOUNT_PREFIXES.UNIT_PRICE}${commodityName}`;
								const unitPrice = accountProps[unitPriceKey] || parseFloat(frontmatterObj[unitPriceKey] || '0');
								sum += numValue * unitPrice;
							} else if (!key.startsWith(ACCOUNT_PREFIXES.UNIT_PRICE)) {
								sum += numValue;
							}
						}
					}

					newLines.push(line);
				}

				// Compute new checksum
				const computedChecksum = this.computeChecksum(accountProps);

				// Check for issues
				const checksumMismatch = storedChecksum !== computedChecksum;
				const sumInvalid = Math.abs(sum) >= 0.01;
				let invalidReason = '';
				if (sumInvalid) {
					invalidReason = `Transaction-difference-${sum.toFixed(2)}-should-be-0-please-fix`;
				}
				if (checksumMismatch) {
					if (invalidReason) invalidReason += ' ';
					invalidReason += `Checksum-mismatch-existing-${storedChecksum}-computed-${computedChecksum}`;
				}

				const isValid = !sumInvalid && !checksumMismatch;

				// Update frontmatter with validation results
				if (invalidReason) {
					newLines.push(`${ACCOUNT_PREFIXES.INVALID_REASON}: ${invalidReason}`);
				}
				newLines.push(`checksum: ${storedChecksum}`); // Keep original checksum
				newLines.push(`is_valid: ${isValid}`);
				// Reconstruct content
				const newFrontmatter = newLines.join('\n');
				const bodyContent = content.substring(frontmatterMatch[0].length);
				const newContent = `---\n${newFrontmatter}\n---${bodyContent}`;

				// Only update if content changed
				if (newContent !== content) {
					await this.plugin.app.vault.modify(file, newContent);
				}

				if (isValid) {
					validCount++;
				} else {
					invalidCount++;
					if (checksumMismatch) tamperedCount++;
				}
			} catch (error) {
				console.error(`Error verifying ${file.path}: `, error);
			}
		}

		const message = tamperedCount > 0
			? `Verification complete! ✓ ${validCount} valid, ✗ ${invalidCount} invalid(${tamperedCount} tampered)`
			: `Verification complete! ✓ ${validCount} valid, ✗ ${invalidCount} invalid`;
		new Notice(message);
	}

	private async logTransaction(): Promise<void> {
		try {
			const templatePath = this.plugin.settings.templateFilePath;
			const transactionsFolder = this.plugin.settings.transactionsFolderPath;

			if (!(await this.plugin.app.vault.adapter.exists(templatePath))) {
				new Notice('Template file not found. Please check settings.');
				return;
			}

			const templateFile = this.plugin.app.vault.getAbstractFileByPath(templatePath);
			if (!templateFile) {
				new Notice('Error loading template file.');
				return;
			}

			// Read template content
			const templateContent = await this.plugin.app.vault.read(templateFile as any);

			// Generate filename
			const now = new Date();
			const filename = `Transaction - ${now.getFullYear()} -${String(now.getMonth() + 1).padStart(2, '0')} -${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')} -${String(now.getMinutes()).padStart(2, '0')} -${String(now.getSeconds()).padStart(2, '0')}.md`;
			const filepath = `${transactionsFolder}/${filename}`;

			// Replace date placeholder if exists (simple replacement)
			// Note: Obsidian templates might handle this differently, but simple replacement works for custom logic
			const content = templateContent.replace('{{date:YYYY-MM-DDTHH:mm}}', now.toISOString().slice(0, 16));

			// Create file
			const newFile = await this.plugin.app.vault.create(filepath, content);

			// Open the new file
			// @ts-ignore
			const leaf = this.plugin.app.workspace.getLeaf(true);
			// @ts-ignore
			await leaf.openFile(newFile);

			new Notice('Transaction logged');
		} catch (error) {
			console.error('Error logging transaction:', error);
			new Notice('Error creating transaction file');
		}
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

	private createCategoryBlocks(categories: AccountCategory): void {
		// Row 3: Assets and Liabilities
		const topCategoriesRow = this.containerEl.createDiv('category-blocks-row');

		// Assets Block
		if (categories.assets.size > 0) {
			this.createCategoryBlock(
				topCategoriesRow,
				'Assets',
				categories.assets,
				'assets',
				'col-asset'
			);
		}

		// Liabilities Block
		if (categories.liabilities.size > 0) {
			this.createCategoryBlock(
				topCategoriesRow,
				'Liabilities',
				categories.liabilities,
				'liabilities',
				'col-liability'
			);
		}

		// Row 4: Income and Expenses
		const bottomCategoriesRow = this.containerEl.createDiv('category-blocks-row');

		// Income Block
		if (categories.income.size > 0) {
			this.createCategoryBlock(
				bottomCategoriesRow,
				'Income',
				categories.income,
				'income',
				'col-income'
			);
		}

		// Expenses Block
		if (categories.expenses.size > 0) {
			this.createCategoryBlock(
				bottomCategoriesRow,
				'Expenses',
				categories.expenses,
				'expenses',
				'col-expense'
			);
		}
	}

	private createCategoryBlock(
		container: HTMLElement,
		title: string,
		data: Map<string, number>,
		type: 'assets' | 'expenses' | 'liabilities' | 'income',
		colorClass: string
	): void {
		const block = container.createDiv('category-block');

		// Header with title and total
		const total = Array.from(data.values()).reduce((sum, val) => sum + val, 0);
		const header = block.createDiv('category-block-header');
		header.createEl('h3', { text: title.toUpperCase() });
		const totalSpan = header.createSpan({ cls: 'category-total' });
		totalSpan.textContent = formatCurrency(total, this.plugin.settings.currencySymbol);

		// Pie chart
		const chartContainer = block.createDiv('category-chart-container');
		const canvas = chartContainer.createEl('canvas');
		createPieChart(canvas, data, type, this.plugin.settings.currencySymbol);

		// Account breakdown list
		const listContainer = block.createDiv('category-list-container');
		const entries = Array.from(data.entries()).sort((a, b) => {
			// Sort by absolute value descending
			return Math.abs(b[1]) - Math.abs(a[1]);
		});

		entries.forEach(([name, value]) => {
			const row = listContainer.createDiv('account-row');
			row.addClass(colorClass);

			// Determine value styling class based on category type
			let valueClass = 'account-value';
			if (type === 'expenses') {
				valueClass += ' negative';
			} else if (type === 'income') {
				valueClass += ' positive';
			} else {
				valueClass += value >= 0 ? ' positive' : ' negative';
			}

			// For commodities, show units
			if (name.startsWith(ACCOUNT_PREFIXES.COMMODITY)) {
				row.removeClass(colorClass);
				row.addClass('col-commodity');

				const commodityName = name.replace(ACCOUNT_PREFIXES.COMMODITY, '');
				const pricing = this.plugin.settings.commodityPrices[commodityName];

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

				const valueSpan = row.createSpan({
					text: formatCurrency(value, this.plugin.settings.currencySymbol),
					cls: valueClass
				});

				if (pricing) {
					const formulaDiv = row.createDiv({ cls: 'commodity-formula' });
					if (pricing.currency !== this.plugin.settings.currencySymbol) {
						formulaDiv.textContent = `${units.toFixed(2)} units × ${pricing.value} ${pricing.currency}/unit × ${this.plugin.settings.usdToInr} ${this.plugin.settings.currencySymbol}/${pricing.currency}`;
					} else {
						formulaDiv.textContent = `${units.toFixed(2)} units × ${pricing.value} ${pricing.currency}/unit`;
					}
				} else {
					const debugDiv = row.createDiv({ cls: 'commodity-formula' });
					debugDiv.textContent = `⚠ Pricing not configured for "${commodityName}"`;
					debugDiv.style.color = 'var(--text-error)';
				}
			} else {
				row.createSpan({ text: name, cls: 'account-name' });
				row.createSpan({
					text: formatCurrency(value, this.plugin.settings.currencySymbol),
					cls: valueClass
				});
			}
		});
	}

	private getAccountProperties(): string[] {
		// @ts-ignore
		const propertiesToShow = this.allProperties || this.config.getOrder();
		if (!propertiesToShow) return [];

		const accountProps: string[] = [];

		for (const prop of propertiesToShow) {
			// @ts-ignore
			const { type, name } = parsePropertyId(prop);
			if (type !== 'note') continue;

			if (isAccountProperty(name)) {
				accountProps.push(prop);
			}
		}

		return sortProperties(accountProps);
	}

	private createTransactionTable(): void {
		const tableContainer = this.containerEl.createDiv('transaction-table-section');

		// Header with Validate Button
		const headerContainer = tableContainer.createDiv('table-header-container');
		headerContainer.style.display = 'flex';
		headerContainer.style.justifyContent = 'space-between';
		headerContainer.style.alignItems = 'center';
		headerContainer.style.marginBottom = '10px';

		headerContainer.createEl('h3', { text: 'Recent Transactions', cls: 'table-title' });

		const validateBtn = headerContainer.createEl('button', {
			cls: 'validate-button-small'
		});
		const validateIcon = validateBtn.createSpan({ cls: 'validate-icon' });
		validateIcon.textContent = '✓';
		validateBtn.createSpan({ text: ' Validate Transactions' });
		validateBtn.addEventListener('click', () => {
			new ValidateTransactionsModal(this.app, this).open();
		});

		const propertiesToShow = this.allProperties || this.config.getOrder();
		if (!propertiesToShow) {
			tableContainer.createDiv({ text: 'No properties configured.' });
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

		// Create table container for horizontal scrolling if needed
		const scrollContainer = tableContainer.createDiv('transaction-table-scroll-container');
		const table = scrollContainer.createEl('table', { cls: 'transaction-table' });
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

		// Sort by is_valid (invalid first) then by file modified time descending
		entries.sort((a: any, b: any) => {
			// Read stored is_valid property
			const isAValid = a.getRawProperty('is_valid') !== false;
			const isBValid = b.getRawProperty('is_valid') !== false;

			// If one is invalid and other is valid, invalid comes first
			if (isAValid !== isBValid) {
				return isAValid ? 1 : -1;
			}

			// Secondary sort: file modified time descending
			// @ts-ignore
			const timeA = a.file?.stat?.mtime || 0;
			// @ts-ignore
			const timeB = b.file?.stat?.mtime || 0;
			return timeB - timeA;
		});

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

			// Validation column - read stored is_valid property
			const validCell = row.createEl('td', { cls: 'validation-cell' });
			const isValid = entry.getRawProperty('is_valid') === true;

			if (isValid) {
				validCell.textContent = '✓';
				validCell.addClass('valid');
			} else {
				validCell.textContent = '✗';
				validCell.addClass('invalid');
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
			if (!(folder instanceof TFolder)) {
				return snapshots;
			}

			// Get all markdown files in the snapshots folder
			const files = folder.children.filter((file) => file instanceof TFile && file.extension === 'md') as TFile[];

			for (const file of files) {
				try {
					const content = await this.plugin.app.vault.read(file);
					const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

					if (!frontmatterMatch) continue;

					const frontmatter = frontmatterMatch[1] || '';
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

		// Header with Snapshot Button
		const headerContainer = chartContainer.createDiv('chart-header-container');
		headerContainer.style.display = 'flex';
		headerContainer.style.justifyContent = 'space-between';
		headerContainer.style.alignItems = 'center';
		headerContainer.style.marginBottom = '10px';

		headerContainer.createEl('h3', { text: 'Net Worth Over Time', cls: 'chart-title' });

		const snapshotBtn = headerContainer.createEl('button', {
			cls: 'snapshot-button-small'
		});
		const snapshotIcon = snapshotBtn.createSpan({ cls: 'snapshot-icon' });
		snapshotIcon.textContent = '+';
		snapshotBtn.createSpan({ text: ' Add Snapshot' });
		snapshotBtn.addEventListener('click', async () => {
			// categorizesAccounts returns AccountCategory which is what createSnapshot expects
			await this.createSnapshot(this.categorizeAccounts());
		});

		const canvas = chartContainer.createEl('canvas');
		createNetWorthLineChart(canvas, snapshots, this.plugin.settings.currencySymbol);
	}


}

