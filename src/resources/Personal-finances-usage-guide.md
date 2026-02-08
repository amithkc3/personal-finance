# Personal Finance Dashboard - Usage Guide

## Algorithm & Philosophy
This specific Vault setup implements a **Double-Entry Accounting** system using Obsidian Notes.
The core formula is: **Assets - Liabilities = Net Worth**.

Every transaction is a separate markdown file. By summing up the properties of all transaction files, we calculate your current financial state.

## Folder Structure
- **Finance/**: Root folder.
	- **Transactions/**: Holds all your individual transaction notes.
	- **Snapshots/**: Periodic snapshots of your Net Worth for historical tracking.
	- **Templates/**: Contains the transaction template.
- **Finances.base**: The central dashboard.

## Account Prefixes
The plugin strictly uses prefixes to categorize accounts. You **MUST** use these prefixes for the system to recognize your data.

| Prefix | Type | Example |
| :--- | :--- | :--- |
| **Asset-** | Money you have | `Asset-Bank`, `Asset-Cash`, `Asset-Stock` |
| **Liability-** | Money you owe | `Liability-CreditCard`, `Liability-Loan` |
| **Income-** | Money coming in | `Income-Salary`, `Income-Dividends` |
| **Expense-** | Money going out | `Expense-Food`, `Expense-Rent` |
| **Commodity-** | Assets held in units | `Commodity-Gold`, `Commodity-Bitcoin` |

> **Note:** For Commodities, the value in the note should be the **Total Value** in your currency, not the number of units.
> *Example:* If you have 10 units of Gold worth $2000 total, write `Commodity-Gold: 2000`.
> Configure the *Price per Unit* in the Plugin Settings to see unit calculations.

## How to Log a Transaction
1.  Click **"Log Transaction"** on the Dashboard (Top Right).
2.  A new file opens.
3.  Fill in the properties.

**Example 1: Buying Groceries ($100 from Bank)**
```yaml
Expense-Groceries: 100
Asset-Bank: -100
```
*Note: Assets decrease (negative), Expenses increase (positive).*

**Example 2: Receiving Salary ($5000 to Bank)**
```yaml
Income-Salary: 5000
Asset-Bank: 5000
```
*Note: Assets increase (positive), Income increases (positive).*

**Example 3: Paying Credit Card Bill ($500 from Bank)**
```yaml
Liability-CreditCard: 500
Asset-Bank: -500
```
*Note: Liability increases (which means debt is paid off/reduced from negative balance perspective if tracking that way, but typically in double entry: Debt Account Debit, Asset Credit. In this simple property sum system: Asset decreases (-500). Liability "value" should likely be treated as positive magnitude or negative balance depending on your preference. **Recommended:** Keep Liabilities as positive numbers in notes if they represent debt amount, or negative if representing net value. The plugin sums them up.*

## The Dashboard
- **Net Worth**: Real-time sum of all Assets and Liabilities.
- **Snapshot**: Click "Create Snapshot" to save your current Net Worth to a file in `Snapshots/`. This allows the "Net Worth Over Time" chart to function.
