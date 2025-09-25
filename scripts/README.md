# Wallet Transaction Analysis Script

## Overview

`analyze-wallet-transactions.js` is a comprehensive wallet analysis tool that fetches and analyzes GalaChain wallet data, including:
- Real-time token balances from GalaChain DEX API
- Current token prices from CoinGecko
- Actual transaction history scraped from GalaScan using Puppeteer
- Trading statistics and portfolio analysis

## Prerequisites

Install required dependencies:
```bash
npm install node-fetch puppeteer
```

## Usage

```bash
node analyze-wallet-transactions.js <wallet-address> <start-date>
```

### Parameters
- `wallet-address`: GalaChain wallet address in format `eth|0x...`
- `start-date`: Start date for analysis in format `YYYY-MM-DD`

### Example
```bash
node analyze-wallet-transactions.js "eth|Ce74B68cd1e9786F4BD3b9f7152D6151695A0bA5" "2025-09-22"
```

## Features

### 1. Real-Time Data Fetching
- **Token Balances**: Fetches current holdings from GalaChain DEX API
- **Token Prices**: Gets latest USD prices from CoinGecko
- **Transaction History**: Scrapes actual transactions from GalaScan using Puppeteer

### 2. Transaction Scraping
The script uses Puppeteer to:
- Navigate to GalaScan wallet page
- Wait for JavaScript-rendered content to load
- Automatically expand view to 100 transactions per page
- Extract transaction details including:
  - Transaction hash
  - Method (e.g., DexV3Contract:BatchSubmit:Swap)
  - Age (relative timestamps)
  - Token types and amounts
  - Fees

### 3. Analysis Capabilities
- **Portfolio Composition**: Current token holdings and values
- **Transaction Filtering**: Filters transactions by date range
- **Trading Statistics**: 
  - Total transactions in period
  - Number of swap transactions
  - Estimated trading volume
  - Average trade size
- **Risk Metrics**:
  - Portfolio concentration
  - Diversification score
  - P&L estimation

## Output

The script provides:

1. **Console Output**: Detailed analysis displayed in terminal
2. **JSON File**: Complete data saved to `comprehensive-analysis-{wallet}-{timestamp}.json`

### Sample Output Structure
```
📈 WALLET TRADING STATISTICS
════════════════════════════════════
Wallet: eth|Ce74B6...
Period: Since 2025-09-22

📜 TRANSACTION HISTORY (from GalaScan)
────────────────────────────────────
Total Transactions Found: 100
Swap Transactions: 66

💼 CURRENT PORTFOLIO
────────────────────────────────────
Token     Balance      Price($)    Value($)
GALA      33,487.83    0.0149      $498.01
GWETH     0.000011     4032.39     $0.04
```

## Technical Details

### API Endpoints Used
- **Balances**: `https://dex-backend-prod1.defi.gala.com/user/assets?address={wallet}&limit=20`
- **Prices**: `https://api.coingecko.com/api/v3/simple/price`
- **Transactions**: Scraped from `https://galascan.gala.com/wallet/{wallet}`

### Pagination Handling
The script automatically:
- Expands the transaction view to show 100 items per page (from default 10)
- Attempts to load additional pages if available
- Continues loading until reaching the specified start date
- Handles up to 50 pages to prevent infinite loops

### Date Filtering
- Parses relative timestamps (e.g., "57 minutes ago")
- Filters transactions from start date to current time
- Includes transactions without timestamps by default

## Limitations

1. **Transaction History**: Limited to what's visible on GalaScan (typically 100-200 recent transactions)
2. **API Rate Limits**: May be subject to rate limiting from CoinGecko or GalaChain APIs
3. **Scraping Reliability**: Depends on GalaScan's HTML structure remaining consistent
4. **Authentication**: Some data may require authenticated API access

## Troubleshooting

### Common Issues

1. **No transactions found**
   - Verify wallet address format (should be `eth|` followed by address)
   - Check if wallet has transaction history on GalaScan
   - Ensure Puppeteer can launch (may need `--no-sandbox` flag)

2. **Timeout errors**
   - Increase timeout values in the script
   - Check internet connection
   - GalaScan may be temporarily unavailable

3. **Module errors**
   - Add `"type": "module"` to package.json to suppress ES module warnings
   - Ensure all dependencies are installed

### Debug Mode
To see the browser window during scraping (useful for debugging):
```javascript
// Change in the script:
headless: false  // instead of headless: 'new'
```

## Notes

- URL encoding: The pipe character `|` in wallet addresses is automatically encoded to `%7C`
- Maximum 20 items per API request for balance fetching
- Prices are fetched in real-time and may vary
- Volume estimates are calculated based on current holdings, not actual historical data

## Example Analysis Results

For wallet `eth|Ce74B68cd1e9786F4BD3b9f7152D6151695A0bA5` (Sept 22-25, 2025):
- **100 transactions** scraped
- **66 swap transactions** identified  
- **Portfolio value**: $498.06
- **Concentration**: 100% GALA
- **Estimated P&L**: -$49.76 (-9.08%)