# Wallet Transaction Analysis Scripts

## Overview
These scripts analyze GalaChain wallet trading activity and calculate statistics.

## Available Scripts

### 1. `analyze-wallet-real-data.js`
Fetches and displays only real data from public APIs:
- ✅ Current wallet balances (GalaChain DEX API)
- ✅ Current token prices (CoinGecko API)
- ❌ Transaction history (not available via public API)

Usage:
```bash
node analyze-wallet-real-data.js "eth|WalletAddress" "2025-09-23"
```

### 2. `analyze-wallet-transactions.js`
Comprehensive analysis with volume estimates based on current holdings:
- Current portfolio value and composition
- Estimated trading volumes (calculated from holdings)
- Risk metrics and diversification analysis

Usage:
```bash
node analyze-wallet-transactions.js "eth|WalletAddress" "2025-09-23"
```

### 3. `analyze-wallet-transactions-simple.js`
Simplified version focusing on current state analysis:
- Current balances and values
- Portfolio concentration metrics
- Period-based analysis (start date to current time)

Usage:
```bash
node analyze-wallet-transactions-simple.js "eth|WalletAddress" "2025-09-23"
```

## Transaction Data Limitations

GalaChain transaction history is not available through public APIs. To get actual transaction data:

### Option 1: Manual Export from GalaScan
1. Visit: https://galascan.gala.com/wallet/[your-wallet-address]
2. Wait for transactions to load (JavaScript rendered)
3. Use browser DevTools to extract data:
   ```javascript
   // In browser console after page loads:
   copy(Array.from(document.querySelectorAll('tbody tr')).map(row => {
     const cells = Array.from(row.querySelectorAll('td')).map(c => c.textContent.trim());
     return cells;
   }))
   ```
4. Save the copied data to a JSON file

### Option 2: Browser Automation
Use Puppeteer or Playwright to automate browser scraping:
```bash
npm install puppeteer
node scrape-galascan-transactions.js "eth|WalletAddress" "2025-09-23"
```

### Option 3: API Authentication
If you have GalaChain API credentials:
- Add API key to requests
- Access authenticated endpoints for transaction history

## Current Wallet Status (eth|Ce74B68cd1e9786F4BD3b9f7152D6151695A0bA5)

As of 2025-09-25:
- **Holdings**: 33,487.83 GALA (~$496)
- **Minor holdings**: Trace amounts of GWETH and GUSDC
- **Portfolio concentration**: 100% in GALA
- **Transaction history**: View on [GalaScan](https://galascan.gala.com/wallet/eth%7CCe74B68cd1e9786F4BD3b9f7152D6151695A0bA5)

## API Endpoints Used

### Working Endpoints:
- Balances: `https://dex-backend-prod1.defi.gala.com/user/assets?address={wallet}&limit=20`
- Prices: `https://api.coingecko.com/api/v3/simple/price`

### Non-working (require auth):
- Transactions: All transaction endpoints return 404 or require authentication
- GalaScan API: No public API available

## Notes
- URL encode wallet addresses: replace `|` with `%7C`
- API limit for assets: maximum 20 items per request
- Prices are real-time from CoinGecko
- Volume estimates in analyze-wallet-transactions.js are calculated, not actual