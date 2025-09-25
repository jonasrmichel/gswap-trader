#!/usr/bin/env node

/**
 * Scrape transaction history from GalaScan wallet page
 * Uses Puppeteer to handle JavaScript-rendered content
 */

import puppeteer from 'puppeteer';
import fs from 'fs/promises';

class GalaScanScraper {
  constructor(walletAddress, startDate) {
    this.walletAddress = walletAddress;
    this.startDate = new Date(startDate);
    this.transactions = [];
  }

  async scrapeTransactions() {
    console.log('🌐 Launching browser to scrape GalaScan...');
    
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      const page = await browser.newPage();
      
      // Set viewport and user agent
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
      
      // Navigate to wallet page
      const url = `https://galascan.gala.com/wallet/${this.walletAddress.replace('|', '%7C')}`;
      console.log(`📍 Navigating to: ${url}`);
      
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      
      // Wait for transactions to load
      console.log('⏳ Waiting for transactions to load...');
      
      // Try multiple selectors for transaction containers
      const selectors = [
        '.transaction-row',
        '.transaction-item',
        '.tx-row',
        'tbody tr',
        '[data-testid="transaction"]',
        '.MuiTableRow-root',
        '.ant-table-row'
      ];
      
      let transactionElements = [];
      for (const selector of selectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          transactionElements = await page.$$(selector);
          if (transactionElements.length > 0) {
            console.log(`✅ Found ${transactionElements.length} transactions using selector: ${selector}`);
            break;
          }
        } catch (e) {
          // Try next selector
        }
      }
      
      if (transactionElements.length === 0) {
        console.log('⚠️ No transaction elements found, trying to extract raw data...');
        
        // Try to extract data from page
        const pageContent = await page.content();
        await fs.writeFile('galascan-page-content.html', pageContent);
        console.log('💾 Page content saved to galascan-page-content.html for debugging');
        
        // Try to extract JSON data from scripts
        const scriptData = await page.evaluate(() => {
          const scripts = Array.from(document.querySelectorAll('script'));
          const dataScript = scripts.find(s => s.textContent.includes('transactions') || s.textContent.includes('wallet'));
          return dataScript ? dataScript.textContent : null;
        });
        
        if (scriptData) {
          console.log('Found script data, attempting to parse...');
          // Try to extract transaction data from script
          const txMatch = scriptData.match(/transactions["\s]*:["\s]*(\[.*?\])/s);
          if (txMatch) {
            try {
              this.transactions = JSON.parse(txMatch[1]);
              console.log(`✅ Extracted ${this.transactions.length} transactions from script data`);
            } catch (e) {
              console.log('Failed to parse transaction data from script');
            }
          }
        }
      } else {
        // Extract transaction data from elements
        console.log('📊 Extracting transaction data...');
        
        for (const element of transactionElements) {
          try {
            const txData = await page.evaluate(el => {
              // Try to extract transaction details from the element
              const getText = (selector) => {
                const elem = el.querySelector(selector);
                return elem ? elem.textContent.trim() : null;
              };
              
              return {
                hash: getText('.hash, .tx-hash, [data-field="hash"]') || 
                      el.querySelector('a[href*="/transaction/"]')?.href?.split('/').pop(),
                timestamp: getText('.timestamp, .time, .date, [data-field="timestamp"]'),
                type: getText('.type, .method, [data-field="type"]'),
                status: getText('.status, [data-field="status"]'),
                from: getText('.from, [data-field="from"]'),
                to: getText('.to, [data-field="to"]'),
                value: getText('.value, .amount, [data-field="value"]'),
                tokenIn: getText('.token-in, [data-field="tokenIn"]'),
                tokenOut: getText('.token-out, [data-field="tokenOut"]'),
                amountIn: getText('.amount-in, [data-field="amountIn"]'),
                amountOut: getText('.amount-out, [data-field="amountOut"]'),
                fee: getText('.fee, .gas, [data-field="fee"]'),
                raw: el.textContent.slice(0, 200)
              };
            }, element);
            
            if (txData.hash || txData.timestamp) {
              this.transactions.push(txData);
            }
          } catch (e) {
            console.log('Error extracting transaction:', e.message);
          }
        }
        
        console.log(`✅ Extracted ${this.transactions.length} transactions`);
      }
      
      // Try to load more transactions if pagination exists
      const hasMore = await page.$('.load-more, .pagination-next, [data-testid="load-more"]');
      if (hasMore) {
        console.log('📄 Found pagination, attempting to load more...');
        await page.click('.load-more, .pagination-next, [data-testid="load-more"]');
        await page.waitForTimeout(2000);
        
        // Re-extract after loading more
        const newElements = await page.$$('.transaction-row, .transaction-item, tbody tr');
        console.log(`Loaded ${newElements.length} total elements after pagination`);
      }
      
      // Take screenshot for debugging
      await page.screenshot({ path: 'galascan-wallet-page.png', fullPage: true });
      console.log('📸 Screenshot saved to galascan-wallet-page.png');
      
    } catch (error) {
      console.error('❌ Scraping error:', error.message);
    } finally {
      await browser.close();
    }
    
    return this.transactions;
  }

  analyzeTransactions() {
    console.log('\n📈 TRANSACTION ANALYSIS');
    console.log('═'.repeat(70));
    
    if (this.transactions.length === 0) {
      console.log('No transactions found');
      return {};
    }
    
    console.log(`Total Transactions: ${this.transactions.length}`);
    
    // Filter transactions by date
    const filteredTxs = this.transactions.filter(tx => {
      if (!tx.timestamp) return true; // Include if no timestamp
      const txDate = new Date(tx.timestamp);
      return txDate >= this.startDate;
    });
    
    console.log(`Transactions since ${this.startDate.toISOString().split('T')[0]}: ${filteredTxs.length}`);
    
    // Calculate statistics
    let swapCount = 0;
    let successCount = 0;
    let failedCount = 0;
    const tokenVolumes = {};
    const pairs = {};
    
    for (const tx of filteredTxs) {
      // Count transaction types
      if (tx.type?.toLowerCase().includes('swap') || tx.tokenIn || tx.tokenOut) {
        swapCount++;
        
        // Track token volumes
        if (tx.tokenIn && tx.amountIn) {
          const amount = parseFloat(tx.amountIn.replace(/[^0-9.-]/g, ''));
          if (!isNaN(amount)) {
            tokenVolumes[tx.tokenIn] = (tokenVolumes[tx.tokenIn] || 0) + amount;
          }
        }
        if (tx.tokenOut && tx.amountOut) {
          const amount = parseFloat(tx.amountOut.replace(/[^0-9.-]/g, ''));
          if (!isNaN(amount)) {
            tokenVolumes[tx.tokenOut] = (tokenVolumes[tx.tokenOut] || 0) + amount;
          }
        }
        
        // Track trading pairs
        if (tx.tokenIn && tx.tokenOut) {
          const pair = `${tx.tokenIn}-${tx.tokenOut}`;
          pairs[pair] = (pairs[pair] || 0) + 1;
        }
      }
      
      // Count status
      if (tx.status?.toLowerCase().includes('success')) {
        successCount++;
      } else if (tx.status?.toLowerCase().includes('fail')) {
        failedCount++;
      }
    }
    
    // Display sample transactions
    console.log('\n📜 Sample Transactions (first 5):');
    console.log('─'.repeat(70));
    
    for (const tx of filteredTxs.slice(0, 5)) {
      console.log(`\nTransaction ${tx.hash?.slice(0, 10) || 'Unknown'}:`);
      if (tx.timestamp) console.log(`  Time: ${tx.timestamp}`);
      if (tx.type) console.log(`  Type: ${tx.type}`);
      if (tx.tokenIn && tx.tokenOut) {
        console.log(`  Swap: ${tx.amountIn || '?'} ${tx.tokenIn} → ${tx.amountOut || '?'} ${tx.tokenOut}`);
      }
      if (tx.status) console.log(`  Status: ${tx.status}`);
      if (tx.fee) console.log(`  Fee: ${tx.fee}`);
    }
    
    // Display statistics
    console.log('\n📊 STATISTICS');
    console.log('─'.repeat(70));
    console.log(`Total Transactions: ${filteredTxs.length}`);
    console.log(`Swap Transactions: ${swapCount}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${failedCount}`);
    
    if (Object.keys(tokenVolumes).length > 0) {
      console.log('\n💰 Token Volumes:');
      for (const [token, volume] of Object.entries(tokenVolumes)) {
        console.log(`  ${token}: ${volume.toFixed(6)}`);
      }
    }
    
    if (Object.keys(pairs).length > 0) {
      console.log('\n🔄 Trading Pairs:');
      const sortedPairs = Object.entries(pairs).sort((a, b) => b[1] - a[1]);
      for (const [pair, count] of sortedPairs.slice(0, 5)) {
        console.log(`  ${pair}: ${count} trades`);
      }
    }
    
    return {
      totalTransactions: filteredTxs.length,
      swapCount,
      successCount,
      failedCount,
      tokenVolumes,
      pairs,
      transactions: filteredTxs
    };
  }

  async saveResults(stats) {
    const output = {
      wallet: this.walletAddress,
      analysisDate: new Date().toISOString(),
      startDate: this.startDate.toISOString(),
      statistics: stats,
      transactionSample: stats.transactions?.slice(0, 10) || []
    };
    
    const filename = `galascan-scrape-${this.walletAddress.slice(0, 10)}-${Date.now()}.json`;
    await fs.writeFile(filename, JSON.stringify(output, null, 2));
    console.log(`\n💾 Results saved to: ${filename}`);
  }

  async run() {
    console.log('🚀 GALASCAN TRANSACTION SCRAPER');
    console.log('═'.repeat(70));
    console.log(`Wallet: ${this.walletAddress}`);
    console.log(`Start Date: ${this.startDate.toISOString().split('T')[0]}`);
    console.log('');
    
    try {
      await this.scrapeTransactions();
      const stats = this.analyzeTransactions();
      await this.saveResults(stats);
      
      console.log('\n✅ Scraping complete!');
      return stats;
    } catch (error) {
      console.error('❌ Error:', error.message);
      return null;
    }
  }
}

// Parse arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node scrape-galascan-transactions.js <wallet-address> <start-date>');
  console.log('Example: node scrape-galascan-transactions.js "eth|Ce74B68cd1e9786F4BD3b9f7152D6151695A0bA5" "2025-09-23"');
  process.exit(1);
}

const scraper = new GalaScanScraper(args[0], args[1]);
scraper.run().catch(console.error);