# Personal Finance Plugin for Obsidian

A comprehensive personal finance dashboard for Obsidian, supporting double-entry accounting principles directly within your vault.

## Features

- **Double-Entry Accounting**: Track assets, liabilities, income, and expenses using frontmatter properties in your daily notes or dedicated transaction files.
- **Interactive Dashboard**:
    - **Net Worth**: Real-time calculation and display of your net worth.
    - **Recent Transactions Table**: View, filter, and validate recent transactions.
    - **Visualizations**: Charts for Net Worth over time and category breakdowns (Assets, Liabilities, Income, Expenses).
    - **Validation**: Built-in validation to ensure transaction balance (Assets - Liabilities + Income - Expenses = 0).
- **Snapshotting**: Create periodical snapshots of your financial state for historical tracking.
- **Flexible & Customizable**: Works with your existing folder structure (customizable in settings).
- **Mobile Friendly**: Responsive design that works great on mobile devices.

## Installation

### Manual Installation

1.  Create a folder named `personal-finance` inside your vault's `.obsidian/plugins/` directory.
2.  Copy `main.js`, `styles.css`, and `manifest.json` to that folder.
3.  Reload Obsidian and enable "Personal Finance" in Community Plugins settings.

### Recommended Folder Name

For best compatibility and consistency, please ensure the plugin folder is named `personal-finance`.

## Usage

### 1. Recording Transactions

Create a note (e.g., in a `Transactions` folder) and add frontmatter properties starting with the following prefixes:

- `Asset-`: e.g., `Asset-Bank`, `Asset-Cash`
- `Liability-`: e.g., `Liability-CreditCard`
- `Income-`: e.g., `Income-Salary`
- `Expense-`: e.g., `Expense-Groceries`
- `Commodity-`: e.g., `Commodity-Gold` (for tracking quantities)

**Example Transaction:**

```yaml
---
date: 2024-05-20T10:00
Asset-Bank: -50
Expense-Groceries: 50
---
```

### 2. The Dashboard

Open the dashboard by clicking the "Personal Finance" icon in the ribbon or using the command `Open Finance Dashboard`.

- **Top Row**: Shows your current Net Worth and quick actions (Snapshot, Log Transaction).
- **Recent Transactions**: Verify your recent entries. Green checks indicate balanced transactions.
- **Charts**: Visual breakdown of your finances.

### 3. Settings

Go to **Settings > Personal Finance** to configure:

- **Currency Symbol**: Set your preferred currency (e.g., $, ₹, €).
- **Folder Paths**: Define where snapshots and transaction files are stored.
- **Accounts**: Customize the list of accounts available for autocomplete.

## Development

1.  Clone the repository.
2.  Run `npm install`.
3.  Run `npm run dev` to start the watcher for development.
4.  Run `npm run build` to create a production build (minified).

## Releasing

1.  Update version in `manifest.json` and `versions.json`.
2.  Run `npm run build`.
3.  Create a new Release on GitHub.
4.  Upload the following files from the root folder:
    - `main.js`
    - `styles.css`
    - `manifest.json`

