#!/usr/bin/env node

/**
 * Wallet Analysis Using Only Real Data
 * No estimates or mocked data - only actual fetched information
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';

class RealDataWalletAnalyzer {
  constructor(walletAddress, startDate) {
    this.walletAddress = walletAddress;
    this.startDate = new Date(startDate);
    this.data = {
      balances: {},
      prices: {},
      transactions: [],
      statistics: {}
    };
  }

  async fetchTokenPrices() {
    console.log('💰 Fetching current token prices from CoinGecko...');
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
        console.log('  ✅ Real prices fetched:', this.data.prices);
      } else {
        console.log('  ❌ Could not fetch prices');
      }
    } catch (error) {
      console.log('  ❌ Price fetch error:', error.message);
    }
  }

  async fetchWalletBalances() {
    console.log('\n📊 Fetching actual wallet balances...');
    
    // Don't double-encode the address - it's already properly formatted
    const address = this.walletAddress;
    const url = `https://dex-backend-prod1.defi.gala.com/user/assets?address=${address}&page=1&limit=20`;
    
    try {
      console.log(`  API: ${url}`);
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
        } else if (result.data?.tokens) {
          tokens = Array.isArray(result.data.tokens) ? result.data.tokens : [result.data.tokens];
        }

        if (tokens.length > 0) {
          console.log('  ✅ Actual balances found:');
          for (const token of tokens) {
            const symbol = token.symbol || token.token;
            const quantity = parseFloat(token.quantity || token.balance || '0');
            const decimals = parseInt(token.decimals || '8');
            
            this.data.balances[symbol] = {
              quantity,
              decimals,
              raw: token.quantity || token.balance
            };
            console.log(`    ${symbol}: ${quantity} (decimals: ${decimals})`);
          }
        } else {
          console.log('  ⚠️ No balances returned from API');
        }
      } else {
        console.log(`  ❌ API returned status: ${response.status}`);
      }
    } catch (error) {
      console.log(`  ❌ Failed to fetch balances: ${error.message}`);
    }
  }

  async fetchTransactions() {
    console.log('\n📜 Attempting to fetch transaction history...');
    
    const encodedAddress = encodeURIComponent(this.walletAddress);
    
    // Try multiple transaction endpoints
    const endpoints = [
      `https://dex-backend-prod1.defi.gala.com/transactions?address=${encodedAddress}&limit=100`,
      `https://api.galachain.com/v1/transactions/${encodedAddress}`,
      `https://galascan.gala.com/api/transactions?wallet=${encodedAddress}`
    ];
    
    for (const endpoint of endpoints) {
      try {
        console.log(`  Trying: ${endpoint.split('?')[0]}...`);
        const response = await fetch(endpoint, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0'
          },
          timeout: 5000
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log(`  Response received, checking for transactions...`);
          
          // Try to extract transactions from various response formats
          let txList = data.transactions || data.data?.transactions || data.items || data.results || [];
          
          if (Array.isArray(txList) && txList.length > 0) {
            console.log(`  ✅ Found ${txList.length} transactions`);
            this.data.transactions = txList;
            break;
          } else {
            console.log(`  No transactions in response`);
          }
        } else {
          console.log(`  Status: ${response.status}`);
        }
      } catch (error) {
        console.log(`  Error: ${error.message}`);
      }
    }
    
    if (this.data.transactions.length === 0) {
      console.log('  ⚠️ No transaction history available from public APIs');
      console.log('  Note: Transaction data may require authentication or GalaScan Pro access');
    }
  }

  calculateStatistics() {
    console.log('\n📈 WALLET STATISTICS (REAL DATA ONLY)');
    console.log('═'.repeat(70));
    console.log(`Wallet: ${this.walletAddress}`);
    console.log(`Analysis Date: ${new Date().toISOString()}`);
    console.log(`Data Since: ${this.startDate.toISOString().split('T')[0]}`);
    console.log('');

    // Calculate actual portfolio value from real balances
    console.log('💼 CURRENT HOLDINGS (FROM API)');
    console.log('─'.repeat(70));
    
    if (Object.keys(this.data.balances).length === 0) {
      console.log('No balances fetched - wallet may be empty or API unavailable');
      return;
    }
    
    console.log('Token     Actual Balance    Price($)    Value($)     Data Source');
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
        value,
        raw: data.raw
      });
    }
    
    // Sort by value if prices are available
    holdings.sort((a, b) => (b.value || 0) - (a.value || 0));
    
    for (const holding of holdings) {
      const priceStr = holding.price !== null ? holding.price.toFixed(4) : 'N/A';
      const valueStr = holding.value !== null ? `$${holding.value.toFixed(2)}` : 'N/A';
      
      console.log(
        `${holding.token.padEnd(10)}` +
        `${holding.quantity.toFixed(6).padStart(16)} ` +
        `${priceStr.padStart(10)} ` +
        `${valueStr.padStart(10)} ` +
        `    API`
      );
    }
    
    console.log('─'.repeat(70));
    
    if (totalValue > 0) {
      console.log(`Total Portfolio Value: $${totalValue.toFixed(2)}`);
    } else {
      console.log('Total Portfolio Value: Unable to calculate (missing price data)');
    }
    
    console.log('');
    
    // Transaction statistics (if available)
    if (this.data.transactions.length > 0) {
      console.log('📊 TRANSACTION HISTORY');
      console.log('─'.repeat(70));
      console.log(`Total Transactions Found: ${this.data.transactions.length}`);
      
      // Analyze actual transactions
      let swapCount = 0;
      let totalVolume = 0;
      const tokenVolumes = {};
      
      for (const tx of this.data.transactions) {
        // Count swaps
        if (tx.type === 'swap' || tx.method?.includes('swap')) {
          swapCount++;
        }
        
        // Track volumes if data is available
        if (tx.value) {
          totalVolume += parseFloat(tx.value);
        }
        
        // Track per-token volumes if available
        if (tx.tokenIn && tx.amountIn) {
          const token = tx.tokenIn;
          const amount = parseFloat(tx.amountIn);
          tokenVolumes[token] = (tokenVolumes[token] || 0) + amount;
        }
        if (tx.tokenOut && tx.amountOut) {
          const token = tx.tokenOut;
          const amount = parseFloat(tx.amountOut);
          tokenVolumes[token] = (tokenVolumes[token] || 0) + amount;
        }
      }
      
      console.log(`Swap Transactions: ${swapCount}`);
      
      if (Object.keys(tokenVolumes).length > 0) {
        console.log('\nActual Token Volumes Traded:');
        for (const [token, volume] of Object.entries(tokenVolumes)) {
          console.log(`  ${token}: ${volume}`);
        }
      }
      
      if (totalVolume > 0) {
        console.log(`\nTotal Volume (USD): $${totalVolume.toFixed(2)}`);
      }
      
      // Show sample transactions
      console.log('\nSample Transactions (first 3):');
      for (const tx of this.data.transactions.slice(0, 3)) {
        console.log(`  - ${JSON.stringify(tx).slice(0, 100)}...`);
      }
    } else {
      console.log('📊 TRANSACTION HISTORY');
      console.log('─'.repeat(70));
      console.log('No transaction history available');
      console.log('Transaction data requires authenticated API access or direct blockchain query');
    }
    
    console.log('');
    console.log('📌 DATA SOURCES');
    console.log('─'.repeat(70));
    console.log('Balance Data: GalaChain DEX API (real-time)');
    console.log('Price Data: CoinGecko API (real-time)');
    console.log('Transaction Data: ' + 
      (this.data.transactions.length > 0 ? 'API (historical)' : 'Not available'));
    
    console.log('═'.repeat(70));
    
    // Store only real statistics
    this.data.statistics = {
      totalValue: totalValue || null,
      holdings,
      transactionCount: this.data.transactions.length,
      hasTransactionData: this.data.transactions.length > 0,
      dataTimestamp: new Date().toISOString()
    };
  }

  async saveResults() {
    const output = {
      wallet: this.walletAddress,
      analysisDate: new Date().toISOString(),
      startDate: this.startDate.toISOString(),
      realData: this.data,
      metadata: {
        note: 'This analysis contains only real fetched data, no estimates or calculations',
        balanceSource: 'GalaChain DEX API',
        priceSource: 'CoinGecko API',
        transactionSource: this.data.transactions.length > 0 ? 'API' : 'unavailable'
      }
    };

    const filename = `real-data-analysis-${this.walletAddress.slice(0, 10)}-${Date.now()}.json`;
    await fs.writeFile(filename, JSON.stringify(output, null, 2));
    console.log(`\n💾 Real data analysis saved to: ${filename}`);
  }

  async run() {
    console.log('🚀 WALLET ANALYZER - REAL DATA ONLY');
    console.log('═'.repeat(70));
    console.log('This analysis uses only actual fetched data.');
    console.log('No estimates, projections, or calculated volumes.');
    console.log('');
    
    try {
      await this.fetchTokenPrices();
      await this.fetchWalletBalances();
      await this.fetchTransactions();
      
      this.calculateStatistics();
      await this.saveResults();
      
      console.log('\n✅ Analysis complete with real data only');
      
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  }
}

// Parse arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node analyze-wallet-real-data.js <wallet-address> <start-date>');
  console.log('Example: node analyze-wallet-real-data.js "eth|Ce74B68cd1e9786F4BD3b9f7152D6151695A0bA5" "2025-09-23"');
  process.exit(1);
}

const analyzer = new RealDataWalletAnalyzer(args[0], args[1]);
analyzer.run().catch(console.error);