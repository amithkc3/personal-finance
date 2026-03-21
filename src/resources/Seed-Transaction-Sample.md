---
comment: Genesis seed transaction — do not edit
date: {{SEED_DATE}}
hash: {{SEED_HASH}}
transaction_id: 0
is_valid: true
Asset-Bank1: 0
Asset-Bank2: 0
Asset-Cash: 0
Liability-CreditCard: 0
Expense-Groceries: 0
Income-Salary: 0
Commodity-Gold: 0
UnitPrice-Gold: 0
---

# Seed Transaction & Usage Guidelines

Welcome to the Personal Finance plugin! This is the genesis block for the transaction integrity chain. It is required for the blockchain-linked ledger to verify your transaction history. **Please do not delete or modify this file.**

## How to use transactions

Look at the frontmatter properties at the top of this file for an example of valid account prefixes. They are initialized to `0` so they do not affect your dashboard balances right now. 
*(Note: You can remove these sample account names. To create custom accounts, simply add any properties to a transaction using the valid prefixes below. They will be dynamically added to your dashboard as long as at least one transaction exists with that property, and removed if none exist!)*

**Valid Prefixes:**
- `Asset-`: Tracks what you own (e.g., `Asset-Bank1`, `Asset-Cash`).
- `Liability-`: Tracks what you owe (e.g., `Liability-CreditCard`, `Liability-Mortgage`).
- `Income-`: Tracks money coming in (e.g., `Income-Salary`).
- `Expense-`: Tracks money going out (e.g., `Expense-Groceries`).
- `Commodity-`: Tracks quantities of non-currency assets (e.g., `Commodity-Gold`).
- `UnitPrice-`: (Optional) Specifies the transaction-specific price of a commodity. Used during validation to calculate the cash equivalent of the commodity trade.

## Validation & Zero-Sum Rule
The plugin enforces single or double-entry accounting through a strict "Zero-Sum Rule". For a transaction to be valid, it must balance out:
*(Total Assets) - (Total Liabilities) + (Total Income) - (Total Expenses) = 0*

- When computing this balance, the plugin converts commodities to their monetary value by multiplying `Commodity-<Name>` by its corresponding `UnitPrice-<Name>` (or falling back to your global settings if unit price isn't specified).
- **If a transaction is invalid**, the plugin marks `is_valid: false` and adds an `Invalid_reason` property. Common invalid reasons include: `Transactions does not zero sum!`, `Missing price for commodity`, etc.

## Blockchain Integrity & Action Commands
The Dashboard provides two main action commands for transaction integrity:
1. **Validate New Transactions**: Finds new transaction files without a hash. It checks the zero-sum rule and commodity prices. If valid, it generates a cryptographic `hash`, sets `is_valid: true`, and links it to the previous transaction by injecting `prev_valid_transaction` and `Prev_valid_transaction_hash`. This securely locks the transaction onto the ledger.
2. **Verify Transaction Integrity**: Mathematically verifies the ledger by re-calculating hashes and matching them backwards towards this genesis block. If tampering or accidental editing occurs after a file is locked, this command will detect it and add an `integrity_error` property to the compromised files.

## Snapshots
The Snapshot feature takes a point-in-time calculation of all your raw balances (Assets, Liabilities) and stores it as a static record in the Snapshots folder. 
This is used to populate your historical Net Worth line chart over time. Since snapshot values are saved permanently, subsequent changes to prices or old transactions won't rewrite your financial history unless you delete the snapshot and re-calculate.
