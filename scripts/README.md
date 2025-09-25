# GSwap Trading Analysis Scripts

Scripts for analyzing wallet trading activity on GalaChain by scraping GalaScan.

## Installation

```bash
cd scripts
npm install
```

## Scripts

### 1. analyze-wallet-trades.js
Comprehensive wallet analysis using multiple data sources (API + web scraping fallback).

```bash
node analyze-wallet-trades.js <wallet-address> <start-date>

# Examples:
node analyze-wallet-trades.js 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb 2024-01-01
node analyze-wallet-trades.js eth|742d35cc6634c0532925a3b844bc9e7595f0beb 2024-06-01
```

### 2. scrape-galascan-wallet.js
Direct web scraping of GalaScan wallet pages using Puppeteer.

```bash
node scrape-galascan-wallet.js <wallet-address> <start-date>

# Examples:
node scrape-galascan-wallet.js 0xCe74B68cd1e9786F4BD3b9f7152D6151695A0bA5 2024-01-01
node scrape-galascan-wallet.js "eth|Ce74B68cd1e9786F4BD3b9f7152D6151695A0bA5" 2024-06-01
```

## Output

Both scripts calculate and display:
- **Initial & Current Balance**: Starting and ending portfolio values
- **P&L**: Total profit/loss in USD and percentage
- **Win Rate**: Percentage of profitable trades
- **Total Trades**: Number of swap transactions
- **Total Volume**: Sum of all trade values
- **Total Fees**: Estimated transaction fees paid
- **Average Trade Size**: Mean value per trade
- **Token Volumes**: Breakdown by token

Results are saved to JSON files with timestamp:
- `wallet-analysis-{address}-{timestamp}.json`
- `galascan-analysis-{address}-{timestamp}.json`

## Notes

- Wallet address can be provided with or without `eth|` prefix
- Dates should be in `YYYY-MM-DD` format
- Scripts fetch current token prices from CoinGecko
- Web scraping may be rate-limited by GalaScan
- Puppeteer requires Chrome/Chromium to be installed

## Limitations

- GalaScan may have rate limiting or anti-scraping measures
- Historical price data is estimated using current prices
- Transaction fees are estimated at 0.3% if not available
- Only analyzes swap transactions, not transfers or other operations