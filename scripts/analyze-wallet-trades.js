#!/usr/bin/env node

/**
 * Wallet Trading Statistics Analyzer
 * Scrapes GalaScan to calculate aggregate trading statistics for a wallet
 */

import fetch from 'node-fetch';
import { parse } from 'node-html-parser';

class WalletAnalyzer {
  constructor(walletAddress, startDate) {
    this.walletAddress = walletAddress;
    this.startDate = new Date(startDate);
    this.galaChainAddress = walletAddress.startsWith('0x') 
      ? `eth|${walletAddress.slice(2).toLowerCase()}`
      : walletAddress;
    this.trades = [];
    this.tokenBalances = new Map();
    this.tokenPrices = new Map();
  }

  /**
   * Fetch current token prices from CoinGecko
   */
  async fetchTokenPrices() {
    try {
      const tokens = {
        'GALA': 'gala',
        'GUSDC': 'usd-coin',
        'GUSDT': 'tether',
        'GWETH': 'ethereum',
        'ETH': 'ethereum',
        'USDC': 'usd-coin',
        'USDT': 'tether'
      };

      const coinIds = [...new Set(Object.values(tokens))].join(',');
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd`
      );
      
      if (response.ok) {
        const data = await response.json();
        
        for (const [token, coinId] of Object.entries(tokens)) {
          this.tokenPrices.set(token, data[coinId]?.usd || 0);
        }
        
        console.log('📊 Fetched token prices:', Object.fromEntries(this.tokenPrices));
      }
    } catch (error) {
      console.warn('⚠️ Could not fetch token prices, using defaults');
      // Set default prices
      this.tokenPrices.set('GALA', 0.02);
      this.tokenPrices.set('GUSDC', 1);
      this.tokenPrices.set('GUSDT', 1);
      this.tokenPrices.set('GWETH', 3500);
      this.tokenPrices.set('ETH', 3500);
      this.tokenPrices.set('USDC', 1);
      this.tokenPrices.set('USDT', 1);
    }
  }

  /**
   * Fetch transactions from GalaScan API
   */
  async fetchTransactions() {
    console.log(`🔍 Fetching transactions for ${this.walletAddress} from GalaScan...`);
    
    const transactions = [];
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      try {
        // Properly URL encode the wallet address
        const encodedAddress = encodeURIComponent(this.walletAddress);
        
        // Try multiple GalaScan API endpoints
        const endpoints = [
          `https://api.galascan.gala.com/address/${encodedAddress}/transactions?page=${page}&limit=100`,
          `https://galascan.gala.com/api/v1/address/${encodedAddress}/transactions?page=${page}&limit=100`,
          `https://explorer-api.gala.com/address/${encodedAddress}/transactions?page=${page}&limit=100`
        ];
        
        let data = null;
        for (const endpoint of endpoints) {
          try {
            console.log(`  Trying endpoint: ${endpoint.split('?')[0]}...`);
            const response = await fetch(endpoint, {
              headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (compatible; WalletAnalyzer/1.0)'
              }
            });
            
            if (response.ok) {
              data = await response.json();
              console.log(`  ✅ Successfully fetched page ${page}`);
              break;
            }
          } catch (err) {
            // Try next endpoint
          }
        }
        
        if (!data) {
          console.log(`  ℹ️ No data available from page ${page}, trying web scraping...`);
          // Try web scraping as fallback
          await this.scrapeGalaScan(page);
          break;
        }
        
        // Parse transactions
        const pageTxs = data.transactions || data.data?.transactions || data.items || [];
        if (pageTxs.length === 0) {
          hasMore = false;
        } else {
          transactions.push(...pageTxs);
          page++;
          
          // Limit to prevent infinite loops
          if (page > 50) {
            console.log('  ⚠️ Reached page limit');
            hasMore = false;
          }
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`  ❌ Error fetching page ${page}:`, error.message);
        hasMore = false;
      }
    }
    
    console.log(`📋 Fetched ${transactions.length} total transactions`);
    return transactions;
  }

  /**
   * Scrape GalaScan website as fallback
   */
  async scrapeGalaScan(startPage = 1) {
    console.log('🌐 Attempting to scrape GalaScan website...');
    
    try {
      // Properly URL encode the wallet address - replace | with %7C
      const encodedAddress = this.walletAddress.replace('|', '%7C');
      // Use /wallet/ instead of /address/
      const url = `https://galascan.gala.com/wallet/${encodedAddress}`;
      console.log(`  URL: ${url}`);
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const html = await response.text();
      const root = parse(html);
      
      // Look for transaction data in various formats
      const scriptTags = root.querySelectorAll('script');
      for (const script of scriptTags) {
        const content = script.innerHTML;
        if (content.includes('transactions') || content.includes('swaps')) {
          // Try to extract JSON data
          const jsonMatch = content.match(/\{.*transactions.*\}/s);
          if (jsonMatch) {
            try {
              const data = JSON.parse(jsonMatch[0]);
              console.log('  ✅ Found transaction data in page');
              return this.parseScrapedData(data);
            } catch (e) {
              // Invalid JSON, continue
            }
          }
        }
      }
      
      // Try to find transaction table
      const txRows = root.querySelectorAll('tr[class*="transaction"], .tx-row, [data-tx]');
      console.log(`  Found ${txRows.length} transaction rows`);
      
      for (const row of txRows) {
        const tx = this.parseTransactionRow(row);
        if (tx) this.trades.push(tx);
      }
      
    } catch (error) {
      console.error('  ❌ Web scraping failed:', error.message);
    }
  }

  /**
   * Parse a transaction row from HTML
   */
  parseTransactionRow(row) {
    try {
      const cells = row.querySelectorAll('td');
      if (cells.length < 4) return null;
      
      // Try to extract transaction details
      const hashCell = cells[0].querySelector('a') || cells[0];
      const hash = hashCell.innerText?.trim();
      
      const methodCell = cells[1];
      const method = methodCell.innerText?.trim();
      
      // Only process swap transactions
      if (!method || !method.toLowerCase().includes('swap')) return null;
      
      const dateCell = cells[cells.length - 1];
      const dateStr = dateCell.innerText?.trim();
      const date = new Date(dateStr);
      
      if (date < this.startDate) return null;
      
      return {
        hash,
        method,
        date: date.toISOString(),
        // Additional fields would need more complex parsing
      };
      
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse swap transactions from fetched data
   */
  parseSwapTransactions(transactions) {
    console.log('🔄 Parsing swap transactions...');
    
    const swaps = [];
    
    for (const tx of transactions) {
      // Check if transaction is after start date
      const txDate = new Date(tx.timestamp || tx.date || tx.createdAt);
      if (txDate < this.startDate) continue;
      
      // Check if it's a swap transaction
      const method = tx.method || tx.function || tx.action || '';
      if (!method.toLowerCase().includes('swap')) continue;
      
      // Parse swap details
      const swap = {
        hash: tx.hash || tx.transactionHash || tx.id,
        date: txDate.toISOString(),
        method: method,
        tokenIn: this.extractToken(tx, 'in'),
        tokenOut: this.extractToken(tx, 'out'),
        amountIn: this.extractAmount(tx, 'in'),
        amountOut: this.extractAmount(tx, 'out'),
        fee: this.extractFee(tx),
        status: tx.status || 'success'
      };
      
      // Calculate USD values
      if (swap.tokenIn && swap.amountIn) {
        swap.valueIn = swap.amountIn * (this.tokenPrices.get(swap.tokenIn) || 0);
      }
      if (swap.tokenOut && swap.amountOut) {
        swap.valueOut = swap.amountOut * (this.tokenPrices.get(swap.tokenOut) || 0);
      }
      
      swaps.push(swap);
    }
    
    console.log(`  ✅ Found ${swaps.length} swap transactions`);
    return swaps;
  }

  /**
   * Extract token symbol from transaction
   */
  extractToken(tx, direction) {
    // Try various field names
    const fields = [
      `token${direction.charAt(0).toUpperCase() + direction.slice(1)}`,
      `${direction}Token`,
      `${direction}_token`,
      `${direction}Currency`
    ];
    
    for (const field of fields) {
      if (tx[field]) {
        const token = tx[field];
        // Clean up token symbol
        if (typeof token === 'string') {
          return token.replace(/\|.*/, '').toUpperCase();
        }
        if (token.symbol) return token.symbol.toUpperCase();
        if (token.name) return token.name.toUpperCase();
      }
    }
    
    // Try to extract from logs or input data
    if (tx.logs) {
      for (const log of tx.logs) {
        if (log.name === 'Swap' || log.event === 'Swap') {
          if (direction === 'in' && log.args?.tokenIn) return log.args.tokenIn;
          if (direction === 'out' && log.args?.tokenOut) return log.args.tokenOut;
        }
      }
    }
    
    return null;
  }

  /**
   * Extract amount from transaction
   */
  extractAmount(tx, direction) {
    const fields = [
      `amount${direction.charAt(0).toUpperCase() + direction.slice(1)}`,
      `${direction}Amount`,
      `${direction}_amount`,
      `${direction}Value`
    ];
    
    for (const field of fields) {
      if (tx[field]) {
        const amount = tx[field];
        if (typeof amount === 'number') return amount;
        if (typeof amount === 'string') return parseFloat(amount);
        if (amount.value) return parseFloat(amount.value);
      }
    }
    
    return 0;
  }

  /**
   * Extract fee from transaction
   */
  extractFee(tx) {
    if (tx.fee) return parseFloat(tx.fee);
    if (tx.gasFee) return parseFloat(tx.gasFee);
    if (tx.transactionFee) return parseFloat(tx.transactionFee);
    
    // Estimate fee as 0.3% of input amount if not specified
    if (tx.amountIn) {
      return parseFloat(tx.amountIn) * 0.003;
    }
    
    return 0;
  }

  /**
   * Calculate initial balances from first trades
   */
  calculateInitialBalances() {
    console.log('💰 Calculating initial balances...');
    
    // Group trades by token to find initial positions
    const tokenFirstTrades = new Map();
    
    for (const trade of this.trades) {
      // Track first occurrence of each token
      if (trade.tokenIn && !tokenFirstTrades.has(trade.tokenIn)) {
        tokenFirstTrades.set(trade.tokenIn, {
          token: trade.tokenIn,
          firstAmount: trade.amountIn,
          firstDate: trade.date
        });
      }
    }
    
    // Estimate initial balances
    let initialValue = 0;
    for (const [token, info] of tokenFirstTrades) {
      const price = this.tokenPrices.get(token) || 0;
      const value = info.firstAmount * price;
      initialValue += value;
      
      console.log(`  ${token}: ${info.firstAmount} ($${value.toFixed(2)})`);
    }
    
    return initialValue;
  }

  /**
   * Fetch current balances from GalaChain
   */
  async fetchCurrentBalances() {
    console.log('📊 Fetching current balances...');
    
    try {
      const response = await fetch(
        `https://dex-backend-prod1.defi.gala.com/user/assets?address=${this.galaChainAddress}&page=1&limit=20`
      );
      
      if (response.ok) {
        const data = await response.json();
        
        let tokens = [];
        if (data.data?.token) {
          tokens = Array.isArray(data.data.token) ? data.data.token : [data.data.token];
        } else if (data.data?.tokens) {
          tokens = Array.isArray(data.data.tokens) ? data.data.tokens : [data.data.tokens];
        } else if (data.tokens) {
          tokens = Array.isArray(data.tokens) ? data.tokens : [data.tokens];
        }
        
        let currentValue = 0;
        for (const token of tokens) {
          const balance = parseFloat(token.quantity || token.balance || '0');
          const price = this.tokenPrices.get(token.symbol) || 0;
          const value = balance * price;
          currentValue += value;
          
          this.tokenBalances.set(token.symbol, balance);
          console.log(`  ${token.symbol}: ${balance} ($${value.toFixed(2)})`);
        }
        
        return currentValue;
      }
    } catch (error) {
      console.error('  ❌ Could not fetch current balances:', error.message);
    }
    
    return 0;
  }

  /**
   * Calculate aggregate statistics
   */
  calculateStatistics(initialValue, currentValue) {
    console.log('\n📈 TRADING STATISTICS');
    console.log('═'.repeat(50));
    
    const stats = {
      walletAddress: this.walletAddress,
      startDate: this.startDate.toISOString().split('T')[0],
      initialBalance: initialValue,
      currentBalance: currentValue,
      profitLoss: currentValue - initialValue,
      profitLossPercent: ((currentValue - initialValue) / initialValue * 100),
      totalTrades: this.trades.length,
      successfulTrades: 0,
      failedTrades: 0,
      totalVolume: 0,
      totalFees: 0,
      winningTrades: 0,
      losingTrades: 0,
      avgTradeSize: 0,
      largestWin: 0,
      largestLoss: 0
    };
    
    // Calculate per-trade statistics
    for (const trade of this.trades) {
      if (trade.status === 'failed') {
        stats.failedTrades++;
        continue;
      }
      
      stats.successfulTrades++;
      
      // Calculate volumes and fees
      const tradeVolume = trade.valueIn || 0;
      stats.totalVolume += tradeVolume;
      stats.totalFees += trade.fee || 0;
      
      // Calculate P&L for this trade
      const tradePnL = (trade.valueOut || 0) - (trade.valueIn || 0) - (trade.fee || 0);
      
      if (tradePnL > 0) {
        stats.winningTrades++;
        stats.largestWin = Math.max(stats.largestWin, tradePnL);
      } else if (tradePnL < 0) {
        stats.losingTrades++;
        stats.largestLoss = Math.min(stats.largestLoss, tradePnL);
      }
    }
    
    // Calculate derived statistics
    stats.winRate = stats.totalTrades > 0 
      ? (stats.winningTrades / stats.successfulTrades * 100) 
      : 0;
    
    stats.avgTradeSize = stats.totalTrades > 0 
      ? stats.totalVolume / stats.totalTrades 
      : 0;
    
    // Print results
    console.log(`Wallet: ${stats.walletAddress}`);
    console.log(`Period: ${stats.startDate} to ${new Date().toISOString().split('T')[0]}`);
    console.log('');
    console.log('💰 BALANCES');
    console.log(`  Initial: $${stats.initialBalance.toFixed(2)}`);
    console.log(`  Current: $${stats.currentBalance.toFixed(2)}`);
    console.log(`  P&L: $${stats.profitLoss.toFixed(2)} (${stats.profitLossPercent.toFixed(2)}%)`);
    console.log('');
    console.log('📊 TRADING ACTIVITY');
    console.log(`  Total Trades: ${stats.totalTrades}`);
    console.log(`  Successful: ${stats.successfulTrades}`);
    console.log(`  Failed: ${stats.failedTrades}`);
    console.log(`  Win Rate: ${stats.winRate.toFixed(1)}%`);
    console.log('');
    console.log('💸 VOLUMES & FEES');
    console.log(`  Total Volume: $${stats.totalVolume.toFixed(2)}`);
    console.log(`  Total Fees: $${stats.totalFees.toFixed(2)}`);
    console.log(`  Avg Trade Size: $${stats.avgTradeSize.toFixed(2)}`);
    console.log('');
    console.log('📈 TRADE OUTCOMES');
    console.log(`  Winning Trades: ${stats.winningTrades}`);
    console.log(`  Losing Trades: ${stats.losingTrades}`);
    console.log(`  Largest Win: $${stats.largestWin.toFixed(2)}`);
    console.log(`  Largest Loss: $${stats.largestLoss.toFixed(2)}`);
    console.log('═'.repeat(50));
    
    return stats;
  }

  /**
   * Main analysis function
   */
  async analyze() {
    try {
      // Fetch token prices
      await this.fetchTokenPrices();
      
      // Fetch transactions
      const transactions = await this.fetchTransactions();
      
      // Parse swap transactions
      this.trades = this.parseSwapTransactions(transactions);
      
      if (this.trades.length === 0) {
        console.log('⚠️ No swap transactions found for the specified period');
        console.log('Note: GalaScan API access may be limited. Try:');
        console.log('  1. Checking if the wallet address is correct');
        console.log('  2. Verifying the wallet has trading activity');
        console.log('  3. Visiting https://galascan.gala.com/address/' + this.walletAddress);
        return;
      }
      
      // Sort trades by date
      this.trades.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      // Calculate initial balances
      const initialValue = this.calculateInitialBalances();
      
      // Fetch current balances
      const currentValue = await this.fetchCurrentBalances();
      
      // Calculate and display statistics
      const stats = this.calculateStatistics(initialValue, currentValue);
      
      // Export to JSON
      const output = {
        statistics: stats,
        trades: this.trades,
        currentBalances: Object.fromEntries(this.tokenBalances),
        tokenPrices: Object.fromEntries(this.tokenPrices)
      };
      
      const filename = `wallet-analysis-${this.walletAddress.slice(0, 8)}-${Date.now()}.json`;
      const fs = await import('fs/promises');
      await fs.writeFile(filename, JSON.stringify(output, null, 2));
      console.log(`\n💾 Full analysis saved to: ${filename}`);
      
    } catch (error) {
      console.error('❌ Analysis failed:', error);
      console.error(error.stack);
    }
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: node analyze-wallet-trades.js <wallet-address> <start-date>');
    console.log('');
    console.log('Examples:');
    console.log('  node analyze-wallet-trades.js 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb 2024-01-01');
    console.log('  node analyze-wallet-trades.js eth|742d35cc6634c0532925a3b844bc9e7595f0beb 2024-06-01');
    console.log('');
    console.log('Note: Date should be in YYYY-MM-DD format');
    process.exit(1);
  }
  
  const walletAddress = args[0];
  const startDate = args[1];
  
  // Validate date
  const date = new Date(startDate);
  if (isNaN(date.getTime())) {
    console.error('❌ Invalid date format. Use YYYY-MM-DD');
    process.exit(1);
  }
  
  return { walletAddress, startDate };
}

// Main execution
async function main() {
  console.log('🚀 GalaScan Wallet Analyzer');
  console.log('═'.repeat(50));
  
  const { walletAddress, startDate } = parseArgs();
  
  const analyzer = new WalletAnalyzer(walletAddress, startDate);
  await analyzer.analyze();
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});