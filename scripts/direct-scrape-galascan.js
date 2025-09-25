#!/usr/bin/env node

/**
 * Direct GalaScan Website Scraper
 * Uses curl and HTML parsing to extract transaction data
 */

import fetch from 'node-fetch';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class DirectGalaScanScraper {
  constructor(walletAddress, startDate) {
    this.walletAddress = walletAddress;
    this.startDate = new Date(startDate);
    this.transactions = [];
    this.balances = new Map();
    this.prices = new Map();
  }

  /**
   * Fetch page using curl with proper headers
   */
  async fetchWithCurl(url) {
    console.log(`📡 Fetching: ${url}`);
    
    const curlCommand = `curl -s -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
      -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8" \
      -H "Accept-Language: en-US,en;q=0.9" \
      -H "Cache-Control: no-cache" \
      -H "Pragma: no-cache" \
      -H "Sec-Ch-Ua: \\"Chromium\\";v=\\"120\\", \\"Google Chrome\\";v=\\"120\\"" \
      -H "Sec-Ch-Ua-Mobile: ?0" \
      -H "Sec-Ch-Ua-Platform: \\"macOS\\"" \
      -H "Sec-Fetch-Dest: document" \
      -H "Sec-Fetch-Mode: navigate" \
      -H "Sec-Fetch-Site: none" \
      -H "Sec-Fetch-User: ?1" \
      -H "Upgrade-Insecure-Requests: 1" \
      "${url}"`;
    
    try {
      const { stdout, stderr } = await execAsync(curlCommand);
      if (stderr) {
        console.error('Curl error:', stderr);
      }
      return stdout;
    } catch (error) {
      console.error('Failed to fetch with curl:', error.message);
      throw error;
    }
  }

  /**
   * Extract data from HTML
   */
  extractDataFromHtml(html) {
    console.log('🔍 Extracting data from HTML...');
    console.log(`  HTML length: ${html.length} bytes`);
    
    const data = {
      transactions: [],
      balances: {},
      metadata: {}
    };
    
    // Look for NUXT data
    const nuxtMatch = html.match(/window\.__NUXT__=(\{[\s\S]*?\});?\s*<\/script>/);
    if (nuxtMatch) {
      console.log('  ✅ Found NUXT data');
      try {
        // Clean and parse the NUXT data
        let nuxtString = nuxtMatch[1];
        // Replace undefined with null for valid JSON
        nuxtString = nuxtString.replace(/undefined/g, 'null');
        // Try to evaluate as JavaScript
        const nuxtData = eval(`(${nuxtString})`);
        
        if (nuxtData) {
          console.log('  📦 NUXT data structure:');
          this.exploreObject(nuxtData, '', 2);
          
          // Extract relevant data
          if (nuxtData.state) {
            data.metadata.state = nuxtData.state;
          }
          if (nuxtData.data) {
            data.metadata.data = nuxtData.data;
          }
        }
      } catch (e) {
        console.log('  ⚠️ Could not parse NUXT data:', e.message);
      }
    }
    
    // Look for transaction data in various formats
    const patterns = [
      // Transaction hashes
      /0x[a-fA-F0-9]{64}/g,
      // Token amounts (e.g., "1,234.56 GALA")
      /([\d,]+\.?\d*)\s*(GALA|GUSDC|GWETH|GUSDT)/gi,
      // Swap indicators
      /swap|trade|exchange/gi,
      // Date patterns
      /\d{4}-\d{2}-\d{2}|\d+\s*(hours?|days?|minutes?)\s*ago/gi
    ];
    
    console.log('  🔎 Searching for patterns...');
    
    // Extract transaction hashes
    const txHashes = html.match(patterns[0]) || [];
    console.log(`  Found ${txHashes.length} transaction hashes`);
    
    // Extract token amounts
    const tokenAmounts = html.match(patterns[1]) || [];
    console.log(`  Found ${tokenAmounts.length} token amount references`);
    
    // Extract swap references
    const swapRefs = html.match(patterns[2]) || [];
    console.log(`  Found ${swapRefs.length} swap/trade references`);
    
    // Try to find transaction table or list
    const tablePatterns = [
      /<table[^>]*>[\s\S]*?<\/table>/gi,
      /<tbody[^>]*>[\s\S]*?<\/tbody>/gi,
      /<div[^>]*class="[^"]*transaction[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
      /<tr[^>]*>[\s\S]*?<\/tr>/gi
    ];
    
    for (const pattern of tablePatterns) {
      const matches = html.match(pattern);
      if (matches && matches.length > 0) {
        console.log(`  Found ${matches.length} potential transaction elements`);
        
        // Parse each match
        for (const match of matches.slice(0, 10)) { // Limit to first 10
          const tx = this.parseTransactionElement(match);
          if (tx) {
            data.transactions.push(tx);
          }
        }
      }
    }
    
    // Look for JSON-LD or structured data
    const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
    if (jsonLdMatch) {
      try {
        const jsonLd = JSON.parse(jsonLdMatch[1]);
        console.log('  Found JSON-LD data:', jsonLd);
        data.metadata.jsonLd = jsonLd;
      } catch (e) {
        // Invalid JSON-LD
      }
    }
    
    return data;
  }

  /**
   * Parse a transaction element
   */
  parseTransactionElement(html) {
    // Remove HTML tags for text analysis
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Look for transaction patterns
    const hashMatch = text.match(/0x[a-fA-F0-9]{64}/);
    const dateMatch = text.match(/\d{4}-\d{2}-\d{2}|\d+\s*(hours?|days?|minutes?)\s*ago/);
    const tokenMatches = text.match(/([\d,]+\.?\d*)\s*(GALA|GUSDC|GWETH|GUSDT)/gi);
    
    if (hashMatch || (tokenMatches && tokenMatches.length >= 2)) {
      const tx = {
        hash: hashMatch ? hashMatch[0] : null,
        date: dateMatch ? dateMatch[0] : null,
        tokens: []
      };
      
      if (tokenMatches) {
        for (const match of tokenMatches) {
          const [, amount, token] = match.match(/([\d,]+\.?\d*)\s*(\w+)/);
          tx.tokens.push({
            amount: parseFloat(amount.replace(/,/g, '')),
            symbol: token.toUpperCase()
          });
        }
      }
      
      return tx;
    }
    
    return null;
  }

  /**
   * Explore object structure for debugging
   */
  exploreObject(obj, prefix = '', maxDepth = 3, currentDepth = 0) {
    if (currentDepth >= maxDepth) return;
    
    if (obj && typeof obj === 'object') {
      const keys = Object.keys(obj).slice(0, 10); // Limit keys
      for (const key of keys) {
        const value = obj[key];
        const type = Array.isArray(value) ? 'array' : typeof value;
        
        if (type === 'object' || type === 'array') {
          console.log(`    ${prefix}${key}: ${type}[${Array.isArray(value) ? value.length : Object.keys(value).length}]`);
          
          // Look for interesting keys
          if (key.toLowerCase().includes('transaction') || 
              key.toLowerCase().includes('swap') ||
              key.toLowerCase().includes('trade') ||
              key.toLowerCase().includes('balance') ||
              key.toLowerCase().includes('wallet')) {
            this.exploreObject(value, prefix + '  ', maxDepth, currentDepth + 1);
          }
        } else if (type !== 'function') {
          const valueStr = String(value).slice(0, 50);
          console.log(`    ${prefix}${key}: ${type} = ${valueStr}${String(value).length > 50 ? '...' : ''}`);
        }
      }
    }
  }

  /**
   * Try API endpoints
   */
  async tryApiEndpoints() {
    console.log('\n📡 Trying API endpoints...');
    
    const encodedAddress = encodeURIComponent(this.walletAddress);
    
    // Try transaction API
    const txUrl = `https://api.gala.com/v1/chain/transactions?address=${encodedAddress}&limit=100`;
    console.log(`  Trying: ${txUrl}`);
    
    try {
      const response = await fetch(txUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('  ✅ Got transaction data:', data);
        return data;
      } else {
        console.log(`  ❌ Status: ${response.status}`);
      }
    } catch (e) {
      console.log(`  ❌ Error: ${e.message}`);
    }
    
    return null;
  }

  /**
   * Fetch token prices
   */
  async fetchPrices() {
    console.log('\n💰 Fetching token prices...');
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=gala,ethereum,usd-coin,tether&vs_currencies=usd'
      );
      
      if (response.ok) {
        const data = await response.json();
        this.prices.set('GALA', data.gala?.usd || 0.02);
        this.prices.set('GWETH', data.ethereum?.usd || 4000);
        this.prices.set('GUSDC', data['usd-coin']?.usd || 1);
        this.prices.set('GUSDT', data.tether?.usd || 1);
        console.log('  Prices:', Object.fromEntries(this.prices));
      }
    } catch (e) {
      console.log('  Using default prices');
      this.prices.set('GALA', 0.02);
      this.prices.set('GWETH', 4000);
      this.prices.set('GUSDC', 1);
      this.prices.set('GUSDT', 1);
    }
  }

  /**
   * Main execution
   */
  async run() {
    console.log('🚀 Direct GalaScan Scraper');
    console.log('═'.repeat(50));
    console.log(`Wallet: ${this.walletAddress}`);
    console.log(`Start Date: ${this.startDate.toISOString().split('T')[0]}`);
    console.log('');
    
    try {
      // Fetch prices first
      await this.fetchPrices();
      
      // URL encode the wallet address
      const encodedAddress = this.walletAddress.replace('|', '%7C');
      const walletUrl = `https://galascan.gala.com/wallet/${encodedAddress}`;
      
      console.log('\n📄 Fetching wallet page...');
      console.log(`  URL: ${walletUrl}`);
      
      // Fetch the page
      const html = await this.fetchWithCurl(walletUrl);
      
      // Save HTML for debugging
      const fs = await import('fs/promises');
      const debugFile = `galascan-debug-${Date.now()}.html`;
      await fs.writeFile(debugFile, html);
      console.log(`  💾 HTML saved to: ${debugFile}`);
      
      // Extract data
      const extractedData = this.extractDataFromHtml(html);
      
      // Try API as fallback
      const apiData = await this.tryApiEndpoints();
      
      // Combine results
      console.log('\n📊 RESULTS');
      console.log('═'.repeat(50));
      console.log(`Transactions found: ${extractedData.transactions.length}`);
      
      if (extractedData.transactions.length > 0) {
        console.log('\nSample transactions:');
        for (const tx of extractedData.transactions.slice(0, 5)) {
          console.log('  -', JSON.stringify(tx));
        }
      }
      
      // Save results
      const output = {
        wallet: this.walletAddress,
        scraped: new Date().toISOString(),
        transactions: extractedData.transactions,
        metadata: extractedData.metadata,
        apiData: apiData,
        prices: Object.fromEntries(this.prices)
      };
      
      const outputFile = `galascan-scrape-${this.walletAddress.slice(0, 10)}-${Date.now()}.json`;
      await fs.writeFile(outputFile, JSON.stringify(output, null, 2));
      console.log(`\n💾 Results saved to: ${outputFile}`);
      
      console.log('\nℹ️ Note: GalaScan uses dynamic JavaScript rendering.');
      console.log('For complete data, visit the page directly or use Puppeteer.');
      console.log(`Direct link: ${walletUrl}`);
      
    } catch (error) {
      console.error('❌ Error:', error.message);
      console.error(error.stack);
    }
  }
}

// Parse arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node direct-scrape-galascan.js <wallet-address> <start-date>');
  console.log('Example: node direct-scrape-galascan.js "eth|Ce74B68cd1e9786F4BD3b9f7152D6151695A0bA5" "2025-09-22"');
  process.exit(1);
}

const scraper = new DirectGalaScanScraper(args[0], args[1]);
scraper.run().catch(console.error);