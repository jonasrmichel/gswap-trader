#!/usr/bin/env node

/**
 * GalaScan Wallet Scraper
 * Scrapes wallet transaction data directly from GalaScan website
 */

import puppeteer from 'puppeteer';
import fetch from 'node-fetch';

class GalaScanScraper {
  constructor(walletAddress, startDate) {
    // Clean up wallet address - remove eth| prefix if present for URL
    this.walletAddress = walletAddress.replace('eth|', '');
    this.galaChainAddress = walletAddress.startsWith('0x') 
      ? `eth|${walletAddress.slice(2).toLowerCase()}`
      : walletAddress.toLowerCase();
    this.startDate = new Date(startDate);
    this.transactions = [];
    this.tokenPrices = new Map();
    this.stats = {
      totalTrades: 0,
      totalVolume: 0,
      totalFees: 0,
      winningTrades: 0,
      losingTrades: 0,
      tokens: new Map()
    };
  }

  /**
   * Fetch token prices from CoinGecko
   */
  async fetchTokenPrices() {
    try {
      console.log('📊 Fetching current token prices...');
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=gala,ethereum,usd-coin,tether&vs_currencies=usd'
      );
      
      if (response.ok) {
        const data = await response.json();
        this.tokenPrices.set('GALA', data.gala?.usd || 0.02);
        this.tokenPrices.set('ETH', data.ethereum?.usd || 3500);
        this.tokenPrices.set('GWETH', data.ethereum?.usd || 3500);
        this.tokenPrices.set('USDC', data['usd-coin']?.usd || 1);
        this.tokenPrices.set('GUSDC', data['usd-coin']?.usd || 1);
        this.tokenPrices.set('USDT', data.tether?.usd || 1);
        this.tokenPrices.set('GUSDT', data.tether?.usd || 1);
        console.log('  ✅ Prices fetched:', Object.fromEntries(this.tokenPrices));
      }
    } catch (error) {
      console.warn('  ⚠️ Using default prices');
      this.tokenPrices.set('GALA', 0.02);
      this.tokenPrices.set('ETH', 3500);
      this.tokenPrices.set('GWETH', 3500);
      this.tokenPrices.set('USDC', 1);
      this.tokenPrices.set('GUSDC', 1);
      this.tokenPrices.set('USDT', 1);
      this.tokenPrices.set('GUSDT', 1);
    }
  }

  /**
   * Scrape wallet page using Puppeteer
   */
  async scrapeWalletPage() {
    console.log(`🌐 Scraping GalaScan wallet page...`);
    console.log(`  URL: https://galascan.gala.com/wallet/${encodeURIComponent(this.galaChainAddress)}`);
    
    let browser;
    try {
      // Launch browser
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      
      // Set user agent to avoid detection
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Navigate to wallet page
      const url = `https://galascan.gala.com/wallet/${encodeURIComponent(this.galaChainAddress)}`;
      console.log('  📍 Navigating to:', url);
      
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      
      // Wait for content to load
      console.log('  ⏳ Waiting for content to load...');
      await page.waitForTimeout(3000);
      
      // Extract wallet balance information
      const balanceInfo = await page.evaluate(() => {
        const balances = {};
        
        // Look for balance cards or token list
        const balanceElements = document.querySelectorAll('[class*="balance"], [class*="token"], [class*="asset"]');
        balanceElements.forEach(el => {
          const text = el.textContent;
          // Extract token and amount using regex
          const match = text.match(/(\w+)\s*[:=]?\s*([\d,]+\.?\d*)/);
          if (match) {
            balances[match[1]] = parseFloat(match[2].replace(/,/g, ''));
          }
        });
        
        return balances;
      });
      
      console.log('  💰 Current balances:', balanceInfo);
      
      // Extract transaction data
      console.log('  📜 Extracting transactions...');
      
      // Click on transactions tab if needed
      try {
        await page.click('[data-tab="transactions"], [href*="transactions"], button:has-text("Transactions")', { timeout: 5000 });
        await page.waitForTimeout(2000);
      } catch (e) {
        // Transactions might already be visible
      }
      
      let allTransactions = [];
      let hasMore = true;
      let pageNum = 1;
      
      while (hasMore && pageNum <= 10) { // Limit to 10 pages
        console.log(`  📄 Scraping page ${pageNum}...`);
        
        // Extract transactions from current page
        const pageTransactions = await page.evaluate(() => {
          const transactions = [];
          
          // Try multiple selectors for transaction rows
          const selectors = [
            'tr[class*="transaction"]',
            '.transaction-row',
            '[data-testid*="transaction"]',
            'tbody tr',
            '.tx-row'
          ];
          
          let rows = [];
          for (const selector of selectors) {
            rows = document.querySelectorAll(selector);
            if (rows.length > 0) break;
          }
          
          rows.forEach(row => {
            try {
              const cells = row.querySelectorAll('td, .cell, [class*="col"]');
              if (cells.length < 3) return;
              
              const tx = {};
              
              // Extract transaction hash
              const hashLink = row.querySelector('a[href*="transaction"], a[href*="tx"]');
              if (hashLink) {
                tx.hash = hashLink.textContent.trim();
                tx.link = hashLink.href;
              }
              
              // Extract method/type
              const methodText = Array.from(cells).find(cell => 
                cell.textContent.toLowerCase().includes('swap') ||
                cell.textContent.toLowerCase().includes('trade')
              );
              if (methodText) {
                tx.method = methodText.textContent.trim();
              }
              
              // Extract tokens and amounts
              const tokenPattern = /([\d,]+\.?\d*)\s*(\w+)/g;
              const fullText = row.textContent;
              let match;
              const tokens = [];
              
              while ((match = tokenPattern.exec(fullText)) !== null) {
                const amount = parseFloat(match[1].replace(/,/g, ''));
                const token = match[2].toUpperCase();
                if (!isNaN(amount) && token.match(/^[A-Z]+$/)) {
                  tokens.push({ amount, token });
                }
              }
              
              if (tokens.length >= 2) {
                tx.tokenIn = tokens[0].token;
                tx.amountIn = tokens[0].amount;
                tx.tokenOut = tokens[1].token;
                tx.amountOut = tokens[1].amount;
              }
              
              // Extract date
              const dateText = Array.from(cells).find(cell => 
                cell.textContent.match(/\d{4}-\d{2}-\d{2}/) ||
                cell.textContent.match(/\d+\s*(hours?|days?|minutes?)\s*ago/)
              );
              if (dateText) {
                tx.date = dateText.textContent.trim();
              }
              
              // Extract status
              const statusEl = row.querySelector('[class*="success"], [class*="fail"], [class*="status"]');
              if (statusEl) {
                tx.status = statusEl.textContent.toLowerCase().includes('fail') ? 'failed' : 'success';
              } else {
                tx.status = 'success';
              }
              
              if (tx.hash) {
                transactions.push(tx);
              }
            } catch (e) {
              // Skip problematic rows
            }
          });
          
          return transactions;
        });
        
        console.log(`    Found ${pageTransactions.length} transactions`);
        allTransactions.push(...pageTransactions);
        
        // Check for next page
        try {
          const hasNextPage = await page.evaluate(() => {
            const nextBtn = document.querySelector(
              'button:has-text("Next")',
              '[aria-label="Next page"]',
              '.pagination-next:not(:disabled)',
              'a[rel="next"]'
            );
            return nextBtn && !nextBtn.disabled && !nextBtn.classList.contains('disabled');
          });
          
          if (hasNextPage) {
            // Click next page
            await page.click('button:has-text("Next"), [aria-label="Next page"], .pagination-next, a[rel="next"]');
            await page.waitForTimeout(2000);
            pageNum++;
          } else {
            hasMore = false;
          }
        } catch (e) {
          hasMore = false;
        }
      }
      
      console.log(`  ✅ Scraped ${allTransactions.length} total transactions`);
      
      // Process transactions
      this.transactions = this.processTransactions(allTransactions);
      
      await browser.close();
      
    } catch (error) {
      console.error('❌ Scraping failed:', error.message);
      if (browser) await browser.close();
      throw error;
    }
  }

  /**
   * Process and filter transactions
   */
  processTransactions(rawTransactions) {
    console.log('🔄 Processing transactions...');
    
    const processed = [];
    
    for (const tx of rawTransactions) {
      // Parse date
      let txDate;
      if (tx.date) {
        if (tx.date.includes('ago')) {
          // Convert relative time to date
          const now = new Date();
          const match = tx.date.match(/(\d+)\s*(minute|hour|day|week|month)s?\s*ago/);
          if (match) {
            const amount = parseInt(match[1]);
            const unit = match[2];
            
            switch(unit) {
              case 'minute':
                txDate = new Date(now - amount * 60 * 1000);
                break;
              case 'hour':
                txDate = new Date(now - amount * 60 * 60 * 1000);
                break;
              case 'day':
                txDate = new Date(now - amount * 24 * 60 * 60 * 1000);
                break;
              case 'week':
                txDate = new Date(now - amount * 7 * 24 * 60 * 60 * 1000);
                break;
              case 'month':
                txDate = new Date(now - amount * 30 * 24 * 60 * 60 * 1000);
                break;
            }
          }
        } else {
          txDate = new Date(tx.date);
        }
      }
      
      // Skip if before start date
      if (txDate && txDate < this.startDate) continue;
      
      // Only process swap transactions
      if (!tx.method || !tx.method.toLowerCase().includes('swap')) continue;
      
      // Calculate USD values
      if (tx.tokenIn && tx.amountIn) {
        tx.valueIn = tx.amountIn * (this.tokenPrices.get(tx.tokenIn) || 0);
      }
      if (tx.tokenOut && tx.amountOut) {
        tx.valueOut = tx.amountOut * (this.tokenPrices.get(tx.tokenOut) || 0);
      }
      
      // Estimate fee
      tx.fee = tx.valueIn ? tx.valueIn * 0.003 : 0;
      
      processed.push({
        ...tx,
        date: txDate ? txDate.toISOString() : new Date().toISOString()
      });
    }
    
    console.log(`  ✅ Processed ${processed.length} swap transactions`);
    return processed;
  }

  /**
   * Calculate statistics from transactions
   */
  calculateStatistics() {
    console.log('\n📈 CALCULATING STATISTICS');
    console.log('═'.repeat(50));
    
    let totalValueIn = 0;
    let totalValueOut = 0;
    let totalFees = 0;
    let winningTrades = 0;
    let losingTrades = 0;
    
    const tokenVolumes = new Map();
    
    for (const tx of this.transactions) {
      if (tx.status === 'failed') continue;
      
      const valueIn = tx.valueIn || 0;
      const valueOut = tx.valueOut || 0;
      const fee = tx.fee || 0;
      
      totalValueIn += valueIn;
      totalValueOut += valueOut;
      totalFees += fee;
      
      // Track token volumes
      if (tx.tokenIn) {
        const current = tokenVolumes.get(tx.tokenIn) || 0;
        tokenVolumes.set(tx.tokenIn, current + valueIn);
      }
      
      // Determine if winning or losing trade
      const pnl = valueOut - valueIn - fee;
      if (pnl > 0) {
        winningTrades++;
      } else if (pnl < 0) {
        losingTrades++;
      }
    }
    
    const totalTrades = this.transactions.filter(tx => tx.status !== 'failed').length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades * 100) : 0;
    const totalPnL = totalValueOut - totalValueIn - totalFees;
    const avgTradeSize = totalTrades > 0 ? totalValueIn / totalTrades : 0;
    
    console.log(`Wallet: ${this.galaChainAddress}`);
    console.log(`Period: ${this.startDate.toISOString().split('T')[0]} to now`);
    console.log('');
    console.log('📊 TRADING ACTIVITY');
    console.log(`  Total Trades: ${totalTrades}`);
    console.log(`  Winning Trades: ${winningTrades}`);
    console.log(`  Losing Trades: ${losingTrades}`);
    console.log(`  Win Rate: ${winRate.toFixed(1)}%`);
    console.log('');
    console.log('💰 FINANCIAL METRICS');
    console.log(`  Total Volume In: $${totalValueIn.toFixed(2)}`);
    console.log(`  Total Volume Out: $${totalValueOut.toFixed(2)}`);
    console.log(`  Total Fees: $${totalFees.toFixed(2)}`);
    console.log(`  Net P&L: $${totalPnL.toFixed(2)}`);
    console.log(`  Avg Trade Size: $${avgTradeSize.toFixed(2)}`);
    console.log('');
    console.log('🪙 TOKEN VOLUMES');
    for (const [token, volume] of tokenVolumes) {
      console.log(`  ${token}: $${volume.toFixed(2)}`);
    }
    console.log('═'.repeat(50));
    
    return {
      wallet: this.galaChainAddress,
      startDate: this.startDate.toISOString(),
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      totalValueIn,
      totalValueOut,
      totalFees,
      totalPnL,
      avgTradeSize,
      tokenVolumes: Object.fromEntries(tokenVolumes)
    };
  }

  /**
   * Save results to file
   */
  async saveResults(stats) {
    const output = {
      statistics: stats,
      transactions: this.transactions,
      tokenPrices: Object.fromEntries(this.tokenPrices),
      scraped: new Date().toISOString()
    };
    
    const filename = `galascan-analysis-${this.walletAddress.slice(0, 8)}-${Date.now()}.json`;
    
    try {
      const fs = await import('fs/promises');
      await fs.writeFile(filename, JSON.stringify(output, null, 2));
      console.log(`\n💾 Analysis saved to: ${filename}`);
    } catch (error) {
      console.error('⚠️ Could not save file:', error.message);
    }
  }

  /**
   * Main execution
   */
  async run() {
    try {
      console.log('🚀 GalaScan Wallet Scraper');
      console.log('═'.repeat(50));
      console.log(`Wallet: ${this.galaChainAddress}`);
      console.log(`Start Date: ${this.startDate.toISOString().split('T')[0]}`);
      console.log('');
      
      // Fetch token prices
      await this.fetchTokenPrices();
      
      // Scrape wallet page
      await this.scrapeWalletPage();
      
      if (this.transactions.length === 0) {
        console.log('⚠️ No transactions found. Please check:');
        console.log('  1. The wallet address is correct');
        console.log('  2. The wallet has trading activity after the start date');
        console.log('  3. GalaScan is accessible');
        return;
      }
      
      // Calculate statistics
      const stats = this.calculateStatistics();
      
      // Save results
      await this.saveResults(stats);
      
    } catch (error) {
      console.error('❌ Fatal error:', error.message);
      process.exit(1);
    }
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: node scrape-galascan-wallet.js <wallet-address> <start-date>');
    console.log('');
    console.log('Examples:');
    console.log('  node scrape-galascan-wallet.js 0xCe74B68cd1e9786F4BD3b9f7152D6151695A0bA5 2024-01-01');
    console.log('  node scrape-galascan-wallet.js "eth|Ce74B68cd1e9786F4BD3b9f7152D6151695A0bA5" 2024-06-01');
    console.log('');
    console.log('Note: Wallet address can be with or without eth| prefix');
    process.exit(1);
  }
  
  return {
    walletAddress: args[0],
    startDate: args[1]
  };
}

// Main
async function main() {
  const { walletAddress, startDate } = parseArgs();
  
  // Validate date
  const date = new Date(startDate);
  if (isNaN(date.getTime())) {
    console.error('❌ Invalid date format. Use YYYY-MM-DD');
    process.exit(1);
  }
  
  const scraper = new GalaScanScraper(walletAddress, startDate);
  await scraper.run();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});