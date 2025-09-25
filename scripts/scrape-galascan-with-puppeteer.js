#!/usr/bin/env node

/**
 * Scrape transaction history from GalaScan using Puppeteer
 * Properly handles client-side rendered content
 */

import puppeteer from 'puppeteer';
import fs from 'fs/promises';

class GalaScanScraper {
  constructor(walletAddress, startDate) {
    this.walletAddress = walletAddress;
    this.startDate = new Date(startDate);
    this.endDate = new Date(); // Current time
    this.transactions = [];
  }

  async scrapeTransactions() {
    console.log('🌐 Launching Puppeteer browser...');
    
    const browser = await puppeteer.launch({
      headless: 'new', // Use new headless mode
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // Overcome limited resource problems
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    
    try {
      const page = await browser.newPage();
      
      // Set viewport and user agent to appear as a regular browser
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Enable request interception to log network activity
      await page.setRequestInterception(true);
      let apiCallsCount = 0;
      
      page.on('request', (request) => {
        // Log API calls for debugging
        if (request.url().includes('api') || request.url().includes('transaction')) {
          apiCallsCount++;
          console.log(`  📡 API Call ${apiCallsCount}: ${request.url().slice(0, 80)}...`);
        }
        request.continue();
      });
      
      // Navigate to wallet page
      const url = `https://galascan.gala.com/wallet/${this.walletAddress.replace('|', '%7C')}`;
      console.log(`📍 Navigating to: ${url}`);
      
      // Go to the page and wait for network to be idle
      await page.goto(url, { 
        waitUntil: 'networkidle2', // Wait until network is idle (max 2 connections)
        timeout: 30000 
      });
      
      console.log('⏳ Waiting for transaction data to load...');
      
      // Strategy 1: Wait for common transaction table selectors
      const possibleSelectors = [
        'tbody tr',                    // Standard table rows
        '.transaction-row',            // Custom transaction rows
        '[data-testid="transaction"]', // Test ID based
        '.MuiTableRow-root',          // Material-UI table rows
        '.ant-table-row',             // Ant Design table rows
        '[role="row"]',               // Accessibility role
        '.tx-item',                   // Transaction item class
        '.swap-row'                   // Swap specific rows
      ];
      
      let transactionSelector = null;
      
      // Try each selector with a short timeout
      for (const selector of possibleSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 3000 });
          const elementCount = await page.$$eval(selector, els => els.length);
          if (elementCount > 0) {
            transactionSelector = selector;
            console.log(`  ✅ Found ${elementCount} elements using selector: ${selector}`);
            break;
          }
        } catch (e) {
          // Selector not found, try next
        }
      }
      
      // Strategy 2: If no selectors found, wait a bit more for lazy loading
      if (!transactionSelector) {
        console.log('  ⏳ No transaction elements found, waiting for lazy loading...');
        await page.waitForTimeout(5000);
        
        // Try scrolling to trigger lazy loading
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight / 2);
        });
        await page.waitForTimeout(2000);
      }
      
      // Strategy 3: Extract all data from the page
      console.log('📊 Extracting transaction data...');
      
      const pageData = await page.evaluate(() => {
        const data = {
          transactions: [],
          tableData: [],
          rawText: []
        };
        
        // Method 1: Try to find transaction data in window object
        if (window.__NEXT_DATA__) {
          try {
            const nextData = JSON.parse(window.__NEXT_DATA__.innerHTML || '{}');
            if (nextData.props?.pageProps?.transactions) {
              data.transactions = nextData.props.pageProps.transactions;
            }
          } catch (e) {}
        }
        
        // Method 2: Extract from table rows
        const rows = document.querySelectorAll('tbody tr, [role="row"], .transaction-row');
        rows.forEach((row, index) => {
          if (index === 0 && row.querySelector('th')) return; // Skip header
          
          const cells = Array.from(row.querySelectorAll('td, [role="cell"], .cell'));
          if (cells.length > 0) {
            const rowData = cells.map(cell => {
              // Get text content
              const text = cell.textContent.trim();
              // Check for links (transaction hashes)
              const link = cell.querySelector('a');
              const href = link ? link.href : null;
              return { text, href };
            });
            data.tableData.push(rowData);
          }
        });
        
        // Method 3: Look for swap/transaction text patterns
        const allText = document.body.innerText;
        const transactionPatterns = [
          /0x[a-fA-F0-9]{64}/g,  // Transaction hashes
          /\d+\.?\d*\s*GALA/g,    // GALA amounts
          /\d+\.?\d*\s*GUSDC/g,   // GUSDC amounts
          /\d+\.?\d*\s*GWETH/g,   // GWETH amounts
          /Swap|Transfer|Approve/gi // Transaction types
        ];
        
        transactionPatterns.forEach(pattern => {
          const matches = allText.match(pattern);
          if (matches) {
            data.rawText.push(...matches);
          }
        });
        
        // Method 4: Check for React/Vue component props
        const reactElements = document.querySelectorAll('[data-reactroot], [data-v-]');
        reactElements.forEach(el => {
          const props = el._reactInternalFiber || el.__reactInternalInstance || el.__vueParentComponent;
          if (props && props.memoizedProps?.transactions) {
            data.transactions.push(...props.memoizedProps.transactions);
          }
        });
        
        return data;
      });
      
      console.log(`  📋 Extracted data summary:`);
      console.log(`     - Direct transactions: ${pageData.transactions.length}`);
      console.log(`     - Table rows: ${pageData.tableData.length}`);
      console.log(`     - Text patterns: ${pageData.rawText.length}`);
      
      // Process extracted data
      this.processExtractedData(pageData);
      
      // Strategy 4: Check if there's a "Load More" button and click it
      try {
        const loadMoreButton = await page.evaluate(() => {
          // Find button by text content
          const buttons = Array.from(document.querySelectorAll('button'));
          const loadMore = buttons.find(btn => 
            btn.textContent.toLowerCase().includes('load more') ||
            btn.textContent.toLowerCase().includes('show more')
          );
          return loadMore ? true : false;
        });
        
        if (loadMoreButton) {
          console.log('  📄 Found "Load More" button, clicking...');
          await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const btn = buttons.find(b => 
              b.textContent.toLowerCase().includes('load more') ||
              b.textContent.toLowerCase().includes('show more')
            );
            if (btn) btn.click();
          });
          await page.waitForTimeout(3000);
          
          // Extract again after loading more
          const moreData = await page.evaluate(() => {
            const rows = document.querySelectorAll('tbody tr');
            return rows.length;
          });
          console.log(`  ✅ After loading more: ${moreData} total rows`);
        }
      } catch (e) {
        // No load more button found
      }
      
      // Take a screenshot for debugging
      await page.screenshot({ 
        path: 'galascan-screenshot.png',
        fullPage: true 
      });
      console.log('📸 Screenshot saved to galascan-screenshot.png');
      
      // Save the page HTML for debugging
      const html = await page.content();
      await fs.writeFile('galascan-page-content.html', html);
      console.log('💾 Page HTML saved to galascan-page-content.html');
      
    } catch (error) {
      console.error('❌ Scraping error:', error.message);
      console.error('Stack:', error.stack);
    } finally {
      await browser.close();
    }
    
    return this.transactions;
  }

  processExtractedData(pageData) {
    // Process table data into transaction objects
    if (pageData.tableData && pageData.tableData.length > 0) {
      console.log('\n🔄 Processing table data...');
      
      for (const row of pageData.tableData) {
        const transaction = {
          hash: null,
          timestamp: null,
          type: null,
          tokenIn: null,
          tokenOut: null,
          amountIn: null,
          amountOut: null,
          status: null,
          fee: null
        };
        
        // Analyze each cell
        row.forEach((cell, index) => {
          const text = cell.text;
          
          // Transaction hash (usually starts with 0x)
          if (text.startsWith('0x') && text.length > 60) {
            transaction.hash = text;
          }
          
          // Timestamp patterns
          if (text.includes(':') || text.includes('ago') || text.match(/\d{4}-\d{2}-\d{2}/)) {
            transaction.timestamp = text;
          }
          
          // Transaction type
          if (text.match(/Swap|Transfer|Approve|Mint|Burn/i)) {
            transaction.type = text;
          }
          
          // Status
          if (text.match(/Success|Failed|Pending/i)) {
            transaction.status = text;
          }
          
          // Amounts and tokens (e.g., "100 GALA → 1.5 GUSDC")
          const swapMatch = text.match(/(\d+\.?\d*)\s*(\w+)\s*(?:→|->|to)\s*(\d+\.?\d*)\s*(\w+)/);
          if (swapMatch) {
            transaction.amountIn = parseFloat(swapMatch[1]);
            transaction.tokenIn = swapMatch[2];
            transaction.amountOut = parseFloat(swapMatch[3]);
            transaction.tokenOut = swapMatch[4];
            transaction.type = transaction.type || 'Swap';
          }
          
          // Single amount patterns
          const amountMatch = text.match(/(\d+\.?\d*)\s*(GALA|GUSDC|GWETH|GUSDT)/);
          if (amountMatch && !transaction.amountIn) {
            if (index < row.length / 2) {
              transaction.amountIn = parseFloat(amountMatch[1]);
              transaction.tokenIn = amountMatch[2];
            } else {
              transaction.amountOut = parseFloat(amountMatch[1]);
              transaction.tokenOut = amountMatch[2];
            }
          }
          
          // Fee patterns
          if (text.match(/fee|gas/i) && text.match(/\d+\.?\d*/)) {
            transaction.fee = text;
          }
        });
        
        // Only add if we found meaningful data
        if (transaction.hash || transaction.timestamp || transaction.type || transaction.amountIn) {
          this.transactions.push(transaction);
        }
      }
      
      console.log(`  ✅ Processed ${this.transactions.length} transactions from table data`);
    }
    
    // Process direct transaction data if available
    if (pageData.transactions && pageData.transactions.length > 0) {
      console.log(`  ✅ Found ${pageData.transactions.length} transactions from page data`);
      this.transactions.push(...pageData.transactions);
    }
  }

  filterTransactionsByDate() {
    console.log('\n📅 Filtering transactions by date range...');
    console.log(`  Period: ${this.startDate.toISOString().split('T')[0]} to ${this.endDate.toISOString().split('T')[0]}`);
    
    // For debugging, show all timestamps
    console.log('  Transaction timestamps found:');
    this.transactions.forEach((tx, i) => {
      if (tx.timestamp && i < 5) {
        console.log(`    ${i+1}. ${tx.timestamp}`);
      }
    });
    
    const filtered = this.transactions.filter(tx => {
      if (!tx.timestamp) {
        console.log('    Including transaction with no timestamp');
        return true; // Include if no timestamp
      }
      
      try {
        // Try to parse various date formats
        let txDate;
        
        if (tx.timestamp.includes('ago')) {
          // Handle relative times like "2 hours ago"
          txDate = this.parseRelativeTime(tx.timestamp);
        } else if (tx.timestamp.includes('AM') || tx.timestamp.includes('PM')) {
          // Handle 12-hour format
          txDate = new Date(tx.timestamp);
        } else if (tx.timestamp.match(/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/)) {
          // Handle various date formats
          txDate = new Date(tx.timestamp);
        } else {
          txDate = new Date(tx.timestamp);
        }
        
        const inRange = txDate >= this.startDate && txDate <= this.endDate;
        if (!inRange && i < 5) {
          console.log(`    Transaction date ${txDate.toISOString()} is outside range`);
        }
        return inRange;
      } catch (e) {
        console.log(`    Could not parse timestamp: ${tx.timestamp}`);
        return true; // Include if can't parse
      }
    });
    
    console.log(`  ✅ ${filtered.length} of ${this.transactions.length} transactions in date range`);
    return filtered;
  }

  parseRelativeTime(relativeStr) {
    const now = new Date();
    const match = relativeStr.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i);
    
    if (match) {
      const amount = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      
      switch (unit) {
        case 'second': return new Date(now - amount * 1000);
        case 'minute': return new Date(now - amount * 60 * 1000);
        case 'hour': return new Date(now - amount * 60 * 60 * 1000);
        case 'day': return new Date(now - amount * 24 * 60 * 60 * 1000);
        case 'week': return new Date(now - amount * 7 * 24 * 60 * 60 * 1000);
        case 'month': return new Date(now - amount * 30 * 24 * 60 * 60 * 1000);
        case 'year': return new Date(now - amount * 365 * 24 * 60 * 60 * 1000);
      }
    }
    
    return now; // Default to now if can't parse
  }

  analyzeTransactions(transactions) {
    console.log('\n📈 TRANSACTION ANALYSIS');
    console.log('═'.repeat(70));
    
    if (transactions.length === 0) {
      console.log('No transactions found to analyze');
      return {};
    }
    
    console.log(`Total Transactions: ${transactions.length}`);
    
    // Calculate statistics
    let swapCount = 0;
    let successCount = 0;
    let failedCount = 0;
    const tokenVolumes = {};
    const tradingPairs = {};
    let totalVolumeUSD = 0;
    
    // Get prices for volume calculation
    const prices = {
      GALA: 0.0148,
      GUSDC: 1.0,
      GWETH: 4025,
      GUSDT: 1.0
    };
    
    for (const tx of transactions) {
      // Count transaction types
      if (tx.type?.toLowerCase().includes('swap') || (tx.tokenIn && tx.tokenOut)) {
        swapCount++;
        
        // Track token volumes
        if (tx.tokenIn && tx.amountIn) {
          tokenVolumes[tx.tokenIn] = (tokenVolumes[tx.tokenIn] || 0) + tx.amountIn;
          const price = prices[tx.tokenIn] || 0;
          totalVolumeUSD += tx.amountIn * price;
        }
        if (tx.tokenOut && tx.amountOut) {
          tokenVolumes[tx.tokenOut] = (tokenVolumes[tx.tokenOut] || 0) + tx.amountOut;
        }
        
        // Track trading pairs
        if (tx.tokenIn && tx.tokenOut) {
          const pair = `${tx.tokenIn}/${tx.tokenOut}`;
          tradingPairs[pair] = (tradingPairs[pair] || 0) + 1;
        }
      }
      
      // Count status
      if (tx.status?.toLowerCase().includes('success')) successCount++;
      if (tx.status?.toLowerCase().includes('fail')) failedCount++;
    }
    
    // Display sample transactions
    console.log('\n📜 Sample Transactions (first 5):');
    console.log('─'.repeat(70));
    
    for (const tx of transactions.slice(0, 5)) {
      console.log(`\nTransaction:`);
      if (tx.hash) console.log(`  Hash: ${tx.hash.slice(0, 20)}...`);
      if (tx.timestamp) console.log(`  Time: ${tx.timestamp}`);
      if (tx.type) console.log(`  Type: ${tx.type}`);
      if (tx.tokenIn && tx.tokenOut) {
        console.log(`  Swap: ${tx.amountIn || '?'} ${tx.tokenIn} → ${tx.amountOut || '?'} ${tx.tokenOut}`);
      }
      if (tx.status) console.log(`  Status: ${tx.status}`);
    }
    
    // Display statistics
    console.log('\n📊 STATISTICS');
    console.log('─'.repeat(70));
    console.log(`Total Transactions: ${transactions.length}`);
    console.log(`Swap Transactions: ${swapCount}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${failedCount}`);
    
    if (Object.keys(tokenVolumes).length > 0) {
      console.log('\n💰 Token Volumes:');
      for (const [token, volume] of Object.entries(tokenVolumes)) {
        console.log(`  ${token}: ${volume.toFixed(6)}`);
      }
    }
    
    if (Object.keys(tradingPairs).length > 0) {
      console.log('\n🔄 Trading Pairs:');
      const sortedPairs = Object.entries(tradingPairs).sort((a, b) => b[1] - a[1]);
      for (const [pair, count] of sortedPairs.slice(0, 5)) {
        console.log(`  ${pair}: ${count} trades`);
      }
    }
    
    if (totalVolumeUSD > 0) {
      console.log(`\n💵 Total Volume (USD): $${totalVolumeUSD.toFixed(2)}`);
    }
    
    return {
      totalTransactions: transactions.length,
      swapCount,
      successCount,
      failedCount,
      tokenVolumes,
      tradingPairs,
      totalVolumeUSD
    };
  }

  async saveResults(transactions, stats) {
    const output = {
      wallet: this.walletAddress,
      analysisDate: new Date().toISOString(),
      period: {
        start: this.startDate.toISOString(),
        end: this.endDate.toISOString()
      },
      statistics: stats,
      transactionCount: transactions.length,
      transactions: transactions.slice(0, 100) // Save first 100 transactions
    };
    
    const filename = `galascan-transactions-${this.walletAddress.slice(0, 10)}-${Date.now()}.json`;
    await fs.writeFile(filename, JSON.stringify(output, null, 2));
    console.log(`\n💾 Results saved to: ${filename}`);
  }

  async run() {
    console.log('🚀 GALASCAN TRANSACTION SCRAPER WITH PUPPETEER');
    console.log('═'.repeat(70));
    console.log(`Wallet: ${this.walletAddress}`);
    console.log(`Period: ${this.startDate.toISOString().split('T')[0]} to ${this.endDate.toISOString().split('T')[0]}`);
    console.log('');
    
    try {
      await this.scrapeTransactions();
      
      if (this.transactions.length > 0) {
        const filtered = this.filterTransactionsByDate();
        const stats = this.analyzeTransactions(filtered);
        await this.saveResults(filtered, stats);
        console.log('\n✅ Scraping complete!');
      } else {
        console.log('\n⚠️ No transactions found. Possible reasons:');
        console.log('  1. Wallet has no transactions in this period');
        console.log('  2. Page structure has changed');
        console.log('  3. Anti-scraping measures are in place');
        console.log('\nCheck galascan-screenshot.png and galascan-page-content.html for debugging');
      }
      
      return this.transactions;
    } catch (error) {
      console.error('❌ Fatal error:', error.message);
      return [];
    }
  }
}

// Parse arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node scrape-galascan-with-puppeteer.js <wallet-address> <start-date>');
  console.log('Example: node scrape-galascan-with-puppeteer.js "eth|Ce74B68cd1e9786F4BD3b9f7152D6151695A0bA5" "2025-09-23"');
  process.exit(1);
}

const scraper = new GalaScanScraper(args[0], args[1]);
scraper.run().catch(console.error);