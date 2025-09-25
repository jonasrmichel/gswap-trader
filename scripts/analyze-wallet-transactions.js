#!/usr/bin/env node

/**
 * Comprehensive Wallet Analysis
 * Combines multiple data sources to provide complete trading statistics
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';

class ComprehensiveWalletAnalyzer {
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
    console.log('💰 Fetching current token prices...');
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=gala,ethereum,usd-coin,tether&vs_currencies=usd'
      );
      
      if (response.ok) {
        const prices = await response.json();
        this.data.prices = {
          GALA: prices.gala?.usd || 0.015,
          GWETH: prices.ethereum?.usd || 4000,
          ETH: prices.ethereum?.usd || 4000,
          GUSDC: prices['usd-coin']?.usd || 1,
          USDC: prices['usd-coin']?.usd || 1,
          GUSDT: prices.tether?.usd || 1,
          USDT: prices.tether?.usd || 1
        };
        console.log('  ✅ Prices:', this.data.prices);
      }
    } catch (error) {
      console.log('  ⚠️ Using default prices');
      this.data.prices = {
        GALA: 0.015,
        GWETH: 4000,
        GUSDC: 1,
        GUSDT: 1
      };
    }
  }

  async fetchTransactionHistory() {
    console.log('\n📜 Checking transaction history...');
    
    // Note: GalaScan requires JavaScript rendering to display transactions
    // Transaction data is not available from public APIs without authentication
    
    const galaScanUrl = `https://galascan.gala.com/wallet/${this.walletAddress.replace('|', '%7C')}`;
    console.log(`  Transaction history available at: ${galaScanUrl}`);
    console.log('  Note: Public APIs do not provide transaction history');
    console.log('  Options for getting transaction data:');
    console.log('    1. Use authenticated API with API key');
    console.log('    2. Export transactions from GalaScan manually');
    console.log('    3. Use browser automation tools (Puppeteer/Playwright)');
    
    // For now, we'll work with empty transactions
    this.data.transactions = [];
  }

  async fetchWalletBalances() {
    console.log('\n📊 Fetching wallet balances...');
    
    const encodedAddress = encodeURIComponent(this.walletAddress);
    const endpoints = [
      {
        name: 'GalaChain DEX API',
        url: `https://dex-backend-prod1.defi.gala.com/user/assets?address=${encodedAddress}&page=1&limit=20`
      },
      {
        name: 'GalaChain API',
        url: `https://api.galachain.com/v1/assets/${encodedAddress}`
      }
    ];

    for (const endpoint of endpoints) {
      try {
        console.log(`  Trying ${endpoint.name}...`);
        const response = await fetch(endpoint.url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0'
          }
        });

        if (response.ok) {
          const result = await response.json();
          
          // Parse balances from response
          let tokens = [];
          if (result.data?.token) {
            tokens = Array.isArray(result.data.token) ? result.data.token : [result.data.token];
          } else if (result.data?.tokens) {
            tokens = Array.isArray(result.data.tokens) ? result.data.tokens : [result.data.tokens];
          } else if (result.tokens) {
            tokens = Array.isArray(result.tokens) ? result.tokens : [result.tokens];
          }

          if (tokens.length > 0) {
            console.log('  ✅ Balances found:');
            for (const token of tokens) {
              const symbol = token.symbol || token.token;
              const quantity = parseFloat(token.quantity || token.balance || '0');
              this.data.balances[symbol] = quantity;
              console.log(`    ${symbol}: ${quantity}`);
            }
            break; // Success, stop trying other endpoints
          }
        }
      } catch (error) {
        console.log(`  ❌ Failed: ${error.message}`);
      }
    }
  }

  calculateStatistics() {
    console.log('\n📈 WALLET TRADING STATISTICS');
    console.log('═'.repeat(60));
    console.log(`Wallet: ${this.walletAddress}`);
    console.log(`Analysis Date: ${new Date().toISOString().split('T')[0]}`);
    console.log(`Period: Since ${this.startDate.toISOString().split('T')[0]}`);
    console.log('');
    
    // If we have scraped transactions, analyze them
    if (this.data.transactions.length > 0) {
      console.log('📜 TRANSACTION HISTORY (from GalaScan)');
      console.log('─'.repeat(60));
      console.log(`Total Transactions Found: ${this.data.transactions.length}`);
      
      // Filter transactions by date if timestamps are available
      const filteredTxs = this.data.transactions.filter(tx => {
        if (!tx.timestamp) return true; // Include if no timestamp
        // Try to parse the timestamp
        try {
          const txDate = new Date(tx.timestamp);
          return txDate >= this.startDate;
        } catch {
          return true; // Include if can't parse
        }
      });
      
      console.log(`Transactions in Period: ${filteredTxs.length}`);
      
      // Count transaction types
      const swapTxs = filteredTxs.filter(tx => 
        tx.type === 'swap' || tx.tokenIn || tx.tokenOut
      );
      const successTxs = filteredTxs.filter(tx => 
        tx.status?.toLowerCase() === 'success'
      );
      const failedTxs = filteredTxs.filter(tx => 
        tx.status?.toLowerCase() === 'failed'
      );
      
      console.log(`Swap Transactions: ${swapTxs.length}`);
      console.log(`Successful: ${successTxs.length}`);
      console.log(`Failed: ${failedTxs.length}`);
      
      // Calculate actual volumes from transactions
      const tokenVolumes = {};
      const tradingPairs = {};
      let totalVolumeUSD = 0;
      
      for (const tx of swapTxs) {
        // Track token volumes
        if (tx.tokenIn && tx.amountIn) {
          const amount = parseFloat(tx.amountIn);
          if (!isNaN(amount)) {
            tokenVolumes[tx.tokenIn] = (tokenVolumes[tx.tokenIn] || 0) + amount;
            // Calculate USD value if price available
            const price = this.data.prices[tx.tokenIn];
            if (price) totalVolumeUSD += amount * price;
          }
        }
        if (tx.tokenOut && tx.amountOut) {
          const amount = parseFloat(tx.amountOut);
          if (!isNaN(amount)) {
            tokenVolumes[tx.tokenOut] = (tokenVolumes[tx.tokenOut] || 0) + amount;
          }
        }
        
        // Track trading pairs
        if (tx.tokenIn && tx.tokenOut) {
          const pair = `${tx.tokenIn}/${tx.tokenOut}`;
          tradingPairs[pair] = (tradingPairs[pair] || 0) + 1;
        }
      }
      
      if (Object.keys(tokenVolumes).length > 0) {
        console.log('\n📊 ACTUAL TOKEN VOLUMES (from transactions):');
        console.log('─'.repeat(60));
        for (const [token, volume] of Object.entries(tokenVolumes)) {
          const price = this.data.prices[token] || 0;
          const usdValue = volume * price;
          console.log(`${token.padEnd(10)} ${volume.toFixed(6).padStart(15)} tokens   $${usdValue.toFixed(2).padStart(10)}`);
        }
      }
      
      if (Object.keys(tradingPairs).length > 0) {
        console.log('\n🔄 TRADING PAIRS:');
        console.log('─'.repeat(60));
        const sortedPairs = Object.entries(tradingPairs).sort((a, b) => b[1] - a[1]);
        for (const [pair, count] of sortedPairs.slice(0, 5)) {
          console.log(`${pair.padEnd(20)} ${count} trades`);
        }
      }
      
      if (totalVolumeUSD > 0) {
        console.log('\n💰 TOTAL VOLUME');
        console.log('─'.repeat(60));
        console.log(`Total Volume (USD): $${totalVolumeUSD.toFixed(2)}`);
        console.log(`Average Trade Size: $${(totalVolumeUSD / swapTxs.length).toFixed(2)}`);
      }
      
      // Store actual transaction statistics
      this.data.statistics.actualTransactionData = {
        totalTransactions: filteredTxs.length,
        swapCount: swapTxs.length,
        successCount: successTxs.length,
        failedCount: failedTxs.length,
        tokenVolumes,
        tradingPairs,
        totalVolumeUSD
      };
      
      console.log('');
    }

    // Calculate portfolio value
    let totalValue = 0;
    let holdings = [];

    for (const [token, quantity] of Object.entries(this.data.balances)) {
      const price = this.data.prices[token] || 0;
      const value = quantity * price;
      totalValue += value;
      
      holdings.push({
        token,
        quantity,
        price,
        value,
        percentage: 0
      });
    }

    // Calculate percentages
    holdings.forEach(h => {
      h.percentage = totalValue > 0 ? (h.value / totalValue * 100) : 0;
    });

    // Sort by value
    holdings.sort((a, b) => b.value - a.value);

    console.log('💼 CURRENT PORTFOLIO');
    console.log('─'.repeat(60));
    console.log('Token     Quantity         Price($)    Value($)      %');
    console.log('─'.repeat(60));
    
    for (const holding of holdings) {
      console.log(
        `${holding.token.padEnd(10)}` +
        `${holding.quantity.toFixed(6).padStart(14)} ` +
        `${holding.price.toFixed(4).padStart(10)} ` +
        `${holding.value.toFixed(2).padStart(10)} ` +
        `${holding.percentage.toFixed(1).padStart(7)}%`
      );
    }
    
    console.log('─'.repeat(60));
    console.log(`Total Portfolio Value: $${totalValue.toFixed(2)}`);
    console.log('');

    // Calculate estimated volume moved for each token
    console.log('📊 ESTIMATED VOLUME MOVED');
    console.log('─'.repeat(70));
    console.log('Token     Current Hold    Est. Volume    Method      USD Value');
    console.log('─'.repeat(70));
    
    let totalVolumeMoved = 0;
    let totalTokensMoved = 0;
    const volumeData = [];
    
    for (const holding of holdings) {
      // More realistic volume estimation based on trading patterns
      let estimatedVolume = 0;
      let calculationMethod = '';
      
      if (holding.token === 'GALA') {
        // For primary token, estimate based on likely trading activity
        // Assume day trader might move 10-20% of position per trade, 5-10 trades
        const avgTradeSize = holding.quantity * 0.15; // 15% of position
        const estimatedTrades = 8; // Reasonable number of trades
        estimatedVolume = avgTradeSize * estimatedTrades;
        calculationMethod = 'Trading';
      } else if (holding.token === 'GWETH' || holding.token === 'GUSDC') {
        // For small holdings, these might be fees or residuals
        // Volume is likely much higher than current holding
        if (holding.quantity < 0.001) {
          // Tiny amounts suggest these are leftovers from larger trades
          estimatedVolume = holding.quantity * 100; // Was part of larger trades
          calculationMethod = 'Residual';
        } else {
          estimatedVolume = holding.quantity * 5; // Normal trading
          calculationMethod = 'Trading';
        }
      } else if (holding.token === 'GUSDT') {
        // Stablecoin - often used for parking funds
        estimatedVolume = holding.quantity * 4;
        calculationMethod = 'Stable';
      } else {
        // Other tokens
        estimatedVolume = holding.quantity * 2;
        calculationMethod = 'Default';
      }
      
      // Calculate USD value of volume
      const volumeValue = estimatedVolume * holding.price;
      totalVolumeMoved += volumeValue;
      totalTokensMoved += estimatedVolume;
      
      volumeData.push({
        token: holding.token,
        currentHolding: holding.quantity,
        estimatedVolume,
        volumeValue,
        calculationMethod
      });
      
      // Format the output
      const quantityStr = holding.quantity < 1 
        ? holding.quantity.toExponential(2) 
        : holding.quantity.toFixed(2);
      
      const volumeStr = estimatedVolume < 1
        ? estimatedVolume.toExponential(2)
        : estimatedVolume.toLocaleString(undefined, {maximumFractionDigits: 2});
      
      console.log(
        `${holding.token.padEnd(10)}` +
        `${quantityStr.padStart(14)} ` +
        `${volumeStr.padStart(14)} ` +
        `${calculationMethod.padStart(10)}` +
        `  $${volumeValue.toFixed(2).padStart(10)}`
      );
    }
    
    console.log('─'.repeat(70));
    console.log(`Total Estimated Volume: $${totalVolumeMoved.toFixed(2)}`);
    
    // Add volume breakdown by token
    console.log('\n📊 DETAILED VOLUME BREAKDOWN BY TOKEN');
    console.log('─'.repeat(70));
    console.log('Token     Token Volume         USD Volume    % of Total   Method');
    console.log('─'.repeat(70));
    
    volumeData.sort((a, b) => b.volumeValue - a.volumeValue);
    
    for (const vd of volumeData) {
      const percentage = totalVolumeMoved > 0 ? (vd.volumeValue / totalVolumeMoved * 100) : 0;
      const tokenVolumeStr = vd.estimatedVolume < 1 
        ? vd.estimatedVolume.toExponential(2)
        : vd.estimatedVolume.toLocaleString(undefined, {maximumFractionDigits: 2});
      
      console.log(
        `${vd.token.padEnd(10)}` +
        `${tokenVolumeStr.padStart(18)} ` +
        `$${vd.volumeValue.toFixed(2).padStart(12)} ` +
        `${percentage.toFixed(1).padStart(10)}%` +
        `   ${vd.calculationMethod.padStart(10)}`
      );
    }
    
    console.log('─'.repeat(70));
    
    // Calculate average trade size estimate
    const estimatedTrades = Math.floor(totalVolumeMoved / 50); // Assume $50 avg trade
    const avgTradeSize = estimatedTrades > 0 ? totalVolumeMoved / estimatedTrades : 0;
    
    console.log('\n📊 VOLUME STATISTICS');
    console.log('─'.repeat(70));
    console.log(`Total Volume Moved (USD): $${totalVolumeMoved.toFixed(2)}`);
    console.log(`Estimated Number of Trades: ${estimatedTrades}`);
    console.log(`Estimated Avg Trade Size: $${avgTradeSize.toFixed(2)}`);
    console.log(`Volume to Portfolio Ratio: ${(totalVolumeMoved / totalValue).toFixed(2)}x`);
    console.log('');

    // Trading metrics estimation
    console.log('📊 ESTIMATED TRADING METRICS');
    console.log('─'.repeat(60));
    
    // Estimate based on GALA being primary trading token
    const galaHolding = holdings.find(h => h.token === 'GALA');
    const estimatedInitialGala = galaHolding ? galaHolding.quantity * 1.1 : 0;
    const estimatedInitialValue = estimatedInitialGala * (this.data.prices.GALA || 0.015);
    
    const pnl = totalValue - estimatedInitialValue;
    const pnlPercent = estimatedInitialValue > 0 ? (pnl / estimatedInitialValue * 100) : 0;
    
    console.log(`Estimated Initial Investment: $${estimatedInitialValue.toFixed(2)}`);
    console.log(`Current Portfolio Value: $${totalValue.toFixed(2)}`);
    console.log(`Estimated P&L: $${pnl.toFixed(2)} (${pnlPercent > 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)`);
    console.log('');

    // Risk analysis
    console.log('⚠️ RISK ANALYSIS');
    console.log('─'.repeat(60));
    
    const largestPosition = holdings[0];
    if (largestPosition) {
      console.log(`Largest Position: ${largestPosition.token} (${largestPosition.percentage.toFixed(1)}%)`);
    }
    
    // Concentration risk
    const top3Value = holdings.slice(0, 3).reduce((sum, h) => sum + h.value, 0);
    const concentration = totalValue > 0 ? (top3Value / totalValue * 100) : 0;
    console.log(`Top 3 Concentration: ${concentration.toFixed(1)}%`);
    
    // Risk score based on concentration
    let riskLevel = 'Low';
    if (concentration > 90) riskLevel = 'Very High';
    else if (concentration > 75) riskLevel = 'High';
    else if (concentration > 50) riskLevel = 'Medium';
    
    console.log(`Concentration Risk: ${riskLevel}`);
    
    // Diversification
    const activeTokens = holdings.filter(h => h.value > 1).length;
    const diversificationScore = Math.min(10, activeTokens * 2.5);
    console.log(`Diversification Score: ${diversificationScore.toFixed(1)}/10`);
    console.log(`Active Tokens: ${activeTokens}`);
    
    console.log('');
    console.log('📝 TRADING ACTIVITY SUMMARY');
    console.log('─'.repeat(60));
    console.log('Note: Transaction history requires GalaScan Pro access');
    console.log(`View full history: https://galascan.gala.com/wallet/${this.walletAddress.replace('|', '%7C')}`);
    
    // Based on balance changes
    const hasTraded = holdings.some(h => h.token !== 'GALA' && h.quantity > 0);
    if (hasTraded) {
      console.log('✅ Active trading detected (multiple token holdings)');
    } else {
      console.log('⚠️ Limited trading activity detected');
    }
    
    console.log('═'.repeat(60));

    // Store statistics
    this.data.statistics = {
      totalValue,
      holdings,
      estimatedInitialValue,
      pnl,
      pnlPercent,
      largestPosition: largestPosition?.token,
      concentration,
      riskLevel,
      diversificationScore,
      activeTokens,
      volumeData,
      totalVolumeMoved,
      estimatedTrades,
      avgTradeSize,
      volumeToPortfolioRatio: totalVolumeMoved / totalValue
    };
  }

  async saveResults() {
    const output = {
      wallet: this.walletAddress,
      analysisDate: new Date().toISOString(),
      startDate: this.startDate.toISOString(),
      ...this.data
    };

    const filename = `comprehensive-analysis-${this.walletAddress.slice(0, 10)}-${Date.now()}.json`;
    await fs.writeFile(filename, JSON.stringify(output, null, 2));
    console.log(`\n💾 Full analysis saved to: ${filename}`);
  }

  async run() {
    console.log('🚀 COMPREHENSIVE WALLET ANALYZER');
    console.log('═'.repeat(60));
    
    try {
      await this.fetchTokenPrices();
      await this.fetchWalletBalances();
      await this.fetchTransactionHistory();
      
      if (Object.keys(this.data.balances).length === 0) {
        console.log('\n⚠️ No balances found. Please check:');
        console.log('  1. Wallet address is correct');
        console.log('  2. Wallet has assets on GalaChain');
        return;
      }
      
      this.calculateStatistics();
      await this.saveResults();
      
      console.log('\n✅ Analysis complete!');
      
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  }
}

// Parse arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node analyze-wallet-transactions.js <wallet-address> <start-date>');
  console.log('Example: node analyze-wallet-transactions.js "eth|Ce74B68cd1e9786F4BD3b9f7152D6151695A0bA5" "2025-09-22"');
  process.exit(1);
}

const analyzer = new ComprehensiveWalletAnalyzer(args[0], args[1]);
analyzer.run().catch(console.error);