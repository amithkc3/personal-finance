# Personal Finance Plugin - Usage Guide

This plugin turns Obsidian into a powerful personal finance dashboard using strict **double-entry accounting** principles. It helps you track your Net Worth, Assets, Liabilities, Income, and Expenses directly from your notes.

## 1. Core Concepts
- **Double-Entry Accounting**: Every transaction gets balanced. Money leaving one account (e.g., Asset) must go to another (e.g., Expense).
- **Frontmatter Tracking**: Transactions are logged as frontmatter properties in Markdown files.
- **Strict Naming**: Accounts must strictly follow these prefixes:
    - `Asset-` (e.g., `Asset-Bank-Chase`)
    - `Liability-` (e.g., `Liability-CreditCard-Amex`)
    - `Income-` (e.g., `Income-Salary`)
    - `Expense-` (e.g., `Expense-Food`)
    - `Commodity-` (e.g., `Commodity-Gold`)

## 2. Dashboard Overview
The dashboard is your central hub. To open it, use the command palette (`Ctrl/Cmd + P`) and search for **"Personal Finance: Open Dashboard"** (or look for the wallet icon in the ribbon).

### Sections
1.  **Net Worth Card**: Real-time calculation of (Assets - Liabilities).
2.  **Actions**:
    -   **Create Snapshot**: Saves your current financial state to a file in `Finance/Snapshots`. Useful for history tracking.
    -   **Log Transaction**: Creates a new transaction file using the template.
    -   **Update Rates & Prices**: Opens a modal to update currency conversion rates (USD to your currency) and commodity prices (Gold, Stocks).
3.  **Transaction Table**: A list of your recent transactions. You can adjust the number of rows in Settings.
4.  **Net Worth Chart**: A line chart showing your financial progress over time (based on Snapshots).
5.  **Category Breakdowns**: Detailed views of your Assets, Liabilities, Income, and Expenses with pie charts.

## 3. Settings & Setup
Go to **Settings > Personal Finance** to configure the plugin.
-   **Currency Symbol**: Set your primary currency (e.g., ₹, $, €).
-   **Root Folder**: Default is `Finance` (will be created automatically).
-   **Transactions Folder**: Where your transaction notes are stored.
-   **USD to Local Rate**: Manual conversion rate for dual-currency support.

**Important Note**: The plugin stores its settings in `Finance/finance-settings.json` within your vault. This ensures your settings sync across devices if you use Obsidian Sync, Git, or iCloud.

## 4. How to Log Transactions
1.  Click **"Log Transaction"** on the dashboard.
2.  A new file is created in `Finance/Transactions`.
3.  Fill in the frontmatter properties. The sum of all values **must be 0** for a valid transaction.

### Example: Buying Groceries ($50)
You spent $50 from your Bank Account (Asset decreases) for Food (Expense increases).
-   **Asset-Bank**: `-50` (Money leaving)
-   **Expense-Food**: `50` (Expense incurred)
-   **SUM**: `0` (Valid)

### Example: Receiving Salary ($3000)
-   **Asset-Bank**: `3000` (Money entering)
-   **Income-Salary**: `-3000` 

> **Why is Income negative?**
> In double-entry accounting:
> - **Assets/Expenses** are distinct from **Liabilities/Equity/Income**.
> - To increase an Asset, you Debit it (positive).
> - To increase Income, you Credit it (negative).
> - **Simpler View**: Just ensure the sum is 0. If money comes IN to your Bank (+3000), it must come FROM somewhere (Income -3000).

### Frontmatter Format
```yaml
---
date: 2026-02-09T10:00
Asset-Bank-Chase: -50
Expense-Food: 50
---
```

## 5. Commodities (Stocks, Gold, Crypto)
You can track assets that change in value, like stocks or gold.

1.  **Log the Quantity**: Use the `Commodity-` prefix. This is the **number of units**, not the value.
    ```yaml
    ---
    date: 2026-02-09
    Asset-Bank: -2000
    Commodity-Gold: 10  <-- Bought 10 grams/units
    ---
    ```
2.  **Set the Price**:
    -   Click **"Update Rates & Prices"** on the dashboard.
    -   Enter the current price per unit in JSON format.
    -   **Example**:
        ```json
        {
          "Gold": {
            "value": 200,
            "currency": "$"
          },
          "AAPL": {
            "value": 185.50,
            "currency": "$"
          }
        }
        ```
    -   If you specify `currency: "$"`, the plugin will automatically convert it to your main currency using the rate you set in the same modal.

## 6. Mobile Usage
The dashboard is fully responsive.
-   **Charts**: The Net Worth chart maintains a fixed height (400px) and won't get squashed.
-   **Layout**: The grid layout adapts to single-column on phones.
-   **Touch**: Buttons and inputs are large enough for touch interaction.

## 7. Troubleshooting
-   **"Invalid Transactions" Button**: If you see a red button on the dashboard, it means some files don't sum to 0. Click it to see which ones.
-   **Chart Not Updating**: Create a new **Snapshot** to add a data point to the chart.
