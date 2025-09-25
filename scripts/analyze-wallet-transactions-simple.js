#!/usr/bin/env node

/**
 * Simplified Wallet Analysis using real API data
 * Calculates statistics from actual fetched data only
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';

class WalletAnalyzer {
  constructor(walletAddress, startDate) {
    this.walletAddress = walletAddress;
    this.startDate = new Date(startDate);
    this.endDate = new Date(); // Current time
    this.data = {
      balances: {},
      prices: {},
      transactions: [],
      statistics: {}
    };
  }

  async fetchTokenPrices() {
    console.log('💰 Fetching current token prices...');
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=gala,ethereum,usd-coin,tether&vs_currencies=usd'
      );
      
      if (response.ok) {
        const prices = await response.json();
        this.data.prices = {
          GALA: prices.gala?.usd || null,
          GWETH: prices.ethereum?.usd || null,
          ETH: prices.ethereum?.usd || null,
          GUSDC: prices['usd-coin']?.usd || null,
          USDC: prices['usd-coin']?.usd || null,
          GUSDT: prices.tether?.usd || null,
          USDT: prices.tether?.usd || null
        };
        console.log('  ✅ Real prices fetched');
      }
    } catch (error) {
      console.log('  ❌ Price fetch failed:', error.message);
    }
  }

  async fetchWalletBalances() {
    console.log('\n📊 Fetching wallet balances...');
    
    const url = `https://dex-backend-prod1.defi.gala.com/user/assets?address=${this.walletAddress}&page=1&limit=20`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });

      if (response.ok) {
        const result = await response.json();
        
        // Parse actual balances from API response
        let tokens = [];
        if (result.data?.token) {
          tokens = Array.isArray(result.data.token) ? result.data.token : [result.data.token];
        }

        if (tokens.length > 0) {
          console.log('  ✅ Balances found:');
          for (const token of tokens) {
            const symbol = token.symbol;
            const quantity = parseFloat(token.quantity || '0');
            const decimals = parseInt(token.decimals || '8');
            
            this.data.balances[symbol] = {
              quantity,
              decimals,
              raw: token.quantity
            };
            console.log(`    ${symbol}: ${quantity}`);
          }
        } else {
          console.log('  ⚠️ No balances found');
        }
      } else {
        console.log(`  ❌ API error: ${response.status}`);
      }
    } catch (error) {
      console.log(`  ❌ Failed to fetch: ${error.message}`);
    }
  }

  async fetchTransactionHistory() {
    console.log('\n📜 Checking for transaction data...');
    
    // Note: Public APIs don't provide transaction history
    // This would need authenticated access or scraping
    console.log('  ℹ️ Transaction history requires authenticated API access');
    console.log(`  View on GalaScan: https://galascan.gala.com/wallet/${this.walletAddress.replace('|', '%7C')}`);
    
    // For now, we can only work with current balances
    this.data.transactions = [];
  }

  calculateStatistics() {
    console.log('\n📈 WALLET STATISTICS');
    console.log('═'.repeat(70));
    console.log(`Wallet: ${this.walletAddress}`);
    console.log(`Period: ${this.startDate.toISOString().split('T')[0]} to ${this.endDate.toISOString().split('T')[0]}`);
    console.log('');

    // Calculate portfolio value
    console.log('💼 CURRENT PORTFOLIO');
    console.log('─'.repeat(70));
    
    if (Object.keys(this.data.balances).length === 0) {
      console.log('No balances found');
      return;
    }
    
    console.log('Token     Balance          Price($)    Value($)      %');
    console.log('─'.repeat(70));
    
    let totalValue = 0;
    const holdings = [];
    
    for (const [token, data] of Object.entries(this.data.balances)) {
      const price = this.data.prices[token];
      let value = null;
      
      if (price !== null && price !== undefined) {
        value = data.quantity * price;
        totalValue += value;
      }
      
      holdings.push({
        token,
        quantity: data.quantity,
        decimals: data.decimals,
        price,
        value
      });
    }
    
    // Calculate percentages and sort by value
    holdings.forEach(h => {
      h.percentage = totalValue > 0 && h.value ? (h.value / totalValue * 100) : 0;
    });
    holdings.sort((a, b) => (b.value || 0) - (a.value || 0));
    
    // Display holdings
    for (const holding of holdings) {
      const priceStr = holding.price !== null ? `$${holding.price.toFixed(4)}` : 'N/A';
      const valueStr = holding.value !== null ? `$${holding.value.toFixed(2)}` : 'N/A';
      const pctStr = holding.percentage > 0 ? `${holding.percentage.toFixed(1)}%` : '-';
      
      console.log(
        `${holding.token.padEnd(10)}` +
        `${holding.quantity.toFixed(6).padStart(15)} ` +
        `${priceStr.padStart(12)} ` +
        `${valueStr.padStart(12)} ` +
        `${pctStr.padStart(7)}`
      );
    }
    
    console.log('─'.repeat(70));
    console.log(`Total Portfolio Value: $${totalValue.toFixed(2)}`);
    console.log('');
    
    // Without transaction history, we can only show current state
    console.log('📊 TRANSACTION ANALYSIS');
    console.log('─'.repeat(70));
    console.log('Transaction history not available from public APIs');
    console.log('To calculate P&L, win rate, and volume statistics:');
    console.log('  1. Use authenticated API access');
    console.log('  2. Export transaction history from GalaScan');
    console.log('  3. Connect directly to blockchain RPC');
    console.log('');
    
    // Risk metrics based on current holdings
    console.log('⚠️ RISK METRICS (Current Holdings)');
    console.log('─'.repeat(70));
    
    const largestPosition = holdings[0];
    if (largestPosition) {
      console.log(`Largest Position: ${largestPosition.token} (${largestPosition.percentage.toFixed(1)}%)`);
    }
    
    // Concentration risk
    const top3Value = holdings.slice(0, 3).reduce((sum, h) => sum + (h.value || 0), 0);
    const concentration = totalValue > 0 ? (top3Value / totalValue * 100) : 0;
    console.log(`Top 3 Concentration: ${concentration.toFixed(1)}%`);
    
    // Diversification
    const activeTokens = holdings.filter(h => h.value && h.value > 1).length;
    console.log(`Active Tokens (>$1): ${activeTokens}`);
    
    console.log('═'.repeat(70));
    
    // Store statistics
    this.data.statistics = {
      totalValue,
      holdings,
      concentration,
      activeTokens,
      startDate: this.startDate.toISOString(),
      endDate: this.endDate.toISOString(),
      dataTimestamp: new Date().toISOString()
    };
  }

  async saveResults() {
    const output = {
      wallet: this.walletAddress,
      analysisDate: new Date().toISOString(),
      period: {
        start: this.startDate.toISOString(),
        end: this.endDate.toISOString()
      },
      data: this.data,
      metadata: {
        note: 'Analysis based on current balances only. Transaction history not available from public APIs.',
        balanceSource: 'GalaChain DEX API',
        priceSource: 'CoinGecko API',
        transactionSource: 'unavailable'
      }
    };

    const filename = `wallet-analysis-${this.walletAddress.slice(0, 10)}-${Date.now()}.json`;
    await fs.writeFile(filename, JSON.stringify(output, null, 2));
    console.log(`\n💾 Analysis saved to: ${filename}`);
  }

  async run() {
    console.log('🚀 WALLET ANALYZER');
    console.log('═'.repeat(70));
    console.log('This analysis uses real data from public APIs');
    console.log('');
    
    try {
      await this.fetchTokenPrices();
      await this.fetchWalletBalances();
      await this.fetchTransactionHistory();
      
      this.calculateStatistics();
      await this.saveResults();
      
      console.log('\n✅ Analysis complete');
      console.log('\n📝 NOTE: For complete transaction history and trading statistics,');
      console.log('please visit GalaScan directly or use authenticated API access.');
      
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  }
}

// Parse arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node analyze-wallet-transactions-simple.js <wallet-address> <start-date>');
  console.log('Example: node analyze-wallet-transactions-simple.js "eth|Ce74B68cd1e9786F4BD3b9f7152D6151695A0bA5" "2025-09-23"');
  process.exit(1);
}

const analyzer = new WalletAnalyzer(args[0], args[1]);
analyzer.run().catch(console.error);