#!/usr/bin/env node

/**
 * Calculate wallet trading statistics from current balances
 */

import fetch from 'node-fetch';

class WalletStatsCalculator {
  constructor(walletAddress, startDate) {
    this.walletAddress = walletAddress;
    this.startDate = new Date(startDate);
    this.balances = new Map();
    this.prices = new Map();
  }

  async fetchPrices() {
    console.log('📊 Fetching current token prices...');
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=gala,ethereum,usd-coin&vs_currencies=usd'
      );
      
      if (response.ok) {
        const data = await response.json();
        this.prices.set('GALA', data.gala?.usd || 0.015);
        this.prices.set('GWETH', data.ethereum?.usd || 4000);
        this.prices.set('GUSDC', data['usd-coin']?.usd || 1);
        this.prices.set('ETH', data.ethereum?.usd || 4000);
        this.prices.set('USDC', 1);
        
        console.log('Prices:', Object.fromEntries(this.prices));
      }
    } catch (error) {
      console.log('Using default prices');
      this.prices.set('GALA', 0.015);
      this.prices.set('GWETH', 4000);
      this.prices.set('GUSDC', 1);
    }
  }

  async fetchBalances() {
    console.log('💰 Fetching wallet balances...');
    
    const encodedAddress = encodeURIComponent(this.walletAddress);
    const url = `https://dex-backend-prod1.defi.gala.com/user/assets?address=${encodedAddress}&page=1&limit=20`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; StatsCalculator/1.0)'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.data?.token) {
          const tokens = Array.isArray(data.data.token) ? data.data.token : [data.data.token];
          
          for (const token of tokens) {
            const quantity = parseFloat(token.quantity || '0');
            this.balances.set(token.symbol, {
              quantity,
              decimals: parseInt(token.decimals || '8'),
              name: token.name
            });
            
            console.log(`  ${token.symbol}: ${quantity}`);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch balances:', error.message);
    }
  }

  calculateStats() {
    console.log('\n📈 WALLET STATISTICS');
    console.log('═'.repeat(50));
    console.log(`Wallet: ${this.walletAddress}`);
    console.log(`Analysis Date: ${new Date().toISOString().split('T')[0]}`);
    console.log('');
    
    // Calculate total value
    let totalValue = 0;
    const holdings = [];
    
    for (const [token, data] of this.balances) {
      const price = this.prices.get(token) || 0;
      const value = data.quantity * price;
      totalValue += value;
      
      holdings.push({
        token,
        quantity: data.quantity,
        price,
        value,
        percentage: 0 // Will calculate after total
      });
    }
    
    // Calculate percentages
    for (const holding of holdings) {
      holding.percentage = totalValue > 0 ? (holding.value / totalValue * 100) : 0;
    }
    
    // Sort by value
    holdings.sort((a, b) => b.value - a.value);
    
    console.log('💼 PORTFOLIO COMPOSITION');
    console.log('Token      Quantity          Price($)   Value($)     %');
    console.log('─'.repeat(55));
    
    for (const holding of holdings) {
      const token = holding.token.padEnd(10);
      const quantity = holding.quantity.toFixed(6).padStart(16);
      const price = holding.price.toFixed(4).padStart(10);
      const value = holding.value.toFixed(2).padStart(10);
      const percentage = holding.percentage.toFixed(1).padStart(6);
      
      console.log(`${token} ${quantity} ${price} ${value}  ${percentage}%`);
    }
    
    console.log('─'.repeat(55));
    console.log(`Total Portfolio Value: $${totalValue.toFixed(2)}`);
    console.log('');
    
    // Trading metrics (estimated based on current holdings)
    console.log('📊 ESTIMATED METRICS');
    
    // Estimate initial investment (assuming GALA was primary trading token)
    const galaBalance = this.balances.get('GALA')?.quantity || 0;
    const galaPrice = this.prices.get('GALA') || 0.015;
    const estimatedInitial = galaBalance * galaPrice * 1.1; // Assume 10% profit
    
    const pnl = totalValue - estimatedInitial;
    const pnlPercent = estimatedInitial > 0 ? (pnl / estimatedInitial * 100) : 0;
    
    console.log(`Estimated Initial: $${estimatedInitial.toFixed(2)}`);
    console.log(`Current Value: $${totalValue.toFixed(2)}`);
    console.log(`Estimated P&L: $${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
    console.log('');
    
    // Token concentration
    console.log('🎯 RISK METRICS');
    const largestHolding = holdings[0];
    console.log(`Largest Position: ${largestHolding.token} (${largestHolding.percentage.toFixed(1)}%)`);
    
    // Calculate concentration risk
    const top3Value = holdings.slice(0, 3).reduce((sum, h) => sum + h.value, 0);
    const concentration = totalValue > 0 ? (top3Value / totalValue * 100) : 0;
    console.log(`Top 3 Concentration: ${concentration.toFixed(1)}%`);
    
    // Diversification score (1-10, higher is better)
    const activeTokens = holdings.filter(h => h.value > 1).length;
    const diversificationScore = Math.min(10, activeTokens * 2.5);
    console.log(`Diversification Score: ${diversificationScore.toFixed(1)}/10`);
    
    console.log('═'.repeat(50));
    
    // Save to file
    const output = {
      wallet: this.walletAddress,
      date: new Date().toISOString(),
      totalValue,
      holdings,
      metrics: {
        estimatedInitial,
        currentValue: totalValue,
        pnl,
        pnlPercent,
        largestPosition: largestHolding.token,
        largestPositionPercent: largestHolding.percentage,
        top3Concentration: concentration,
        diversificationScore,
        activeTokens
      },
      prices: Object.fromEntries(this.prices),
      balances: Object.fromEntries(this.balances)
    };
    
    return output;
  }

  async saveResults(data) {
    const filename = `wallet-stats-${this.walletAddress.slice(0, 10)}-${Date.now()}.json`;
    
    try {
      const fs = await import('fs/promises');
      await fs.writeFile(filename, JSON.stringify(data, null, 2));
      console.log(`\n💾 Results saved to: ${filename}`);
    } catch (error) {
      console.error('Could not save file:', error.message);
    }
  }

  async run() {
    try {
      await this.fetchPrices();
      await this.fetchBalances();
      
      if (this.balances.size === 0) {
        console.log('⚠️ No balances found for wallet');
        return;
      }
      
      const stats = this.calculateStats();
      await this.saveResults(stats);
      
    } catch (error) {
      console.error('Error:', error);
    }
  }
}

// Parse arguments
const args = process.argv.slice(2);
if (args.length < 1) {
  console.log('Usage: node calculate-wallet-stats.js <wallet-address> [start-date]');
  console.log('Example: node calculate-wallet-stats.js "eth|Ce74B68cd1e9786F4BD3b9f7152D6151695A0bA5"');
  process.exit(1);
}

const calculator = new WalletStatsCalculator(args[0], args[1] || new Date().toISOString());
calculator.run().catch(console.error);