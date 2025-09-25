#!/usr/bin/env node

/**
 * Fetch wallet transaction history from various sources
 * Attempts multiple endpoints and methods to get real transaction data
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';

class TransactionFetcher {
  constructor(walletAddress) {
    this.walletAddress = walletAddress;
    this.transactions = [];
  }

  async fetchFromDEXAPI() {
    console.log('\n1. Trying GalaChain DEX API...');
    
    // URL encode the wallet address (replace | with %7C)
    const encodedAddress = this.walletAddress.replace('|', '%7C');
    
    // Try user transactions endpoint
    const endpoints = [
      `https://dex-backend-prod1.defi.gala.com/user/transactions?address=${encodedAddress}&page=1&limit=20`,
      `https://dex-backend-prod1.defi.gala.com/transactions/user/${encodedAddress}?page=1&limit=20`,
      `https://dex-backend-prod1.defi.gala.com/swaps?address=${encodedAddress}&page=1&limit=20`
    ];
    
    for (const url of endpoints) {
      try {
        console.log(`   Testing: ${url.split('?')[0]}...`);
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log(`   Status: ${response.status} - Checking for data...`);
          
          // Try various response structures
          const txList = data.transactions || data.data?.transactions || 
                        data.swaps || data.data?.swaps || 
                        data.items || data.data?.items || 
                        data.results || [];
          
          if (Array.isArray(txList) && txList.length > 0) {
            console.log(`   ✅ Found ${txList.length} transactions`);
            return txList;
          } else {
            console.log(`   No transactions in response`);
          }
        } else {
          console.log(`   Status: ${response.status}`);
        }
      } catch (error) {
        console.log(`   Error: ${error.message}`);
      }
    }
    
    return [];
  }

  async fetchFromGalaChainAPI() {
    console.log('\n2. Trying GalaChain API...');
    
    // URL encode the wallet address (replace | with %7C)
    const encodedAddress = this.walletAddress.replace('|', '%7C');
    const endpoints = [
      `https://api-galachain-prod.gala.com/user/${encodedAddress}/transactions`,
      `https://api.galachain.com/v1/wallet/${encodedAddress}/transactions`,
      `https://api.gala.com/chain/transactions?wallet=${encodedAddress}`
    ];
    
    for (const url of endpoints) {
      try {
        console.log(`   Testing: ${url.split('?')[0]}...`);
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0'
          },
          timeout: 5000
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log(`   Status: ${response.status} - Checking for data...`);
          
          const txList = data.transactions || data.data || data.items || [];
          if (Array.isArray(txList) && txList.length > 0) {
            console.log(`   ✅ Found ${txList.length} transactions`);
            return txList;
          }
        } else {
          console.log(`   Status: ${response.status}`);
        }
      } catch (error) {
        console.log(`   Error: ${error.message}`);
      }
    }
    
    return [];
  }

  async fetchFromGalaScan() {
    console.log('\n3. Trying GalaScan API...');
    
    const encodedAddress = this.walletAddress.replace('|', '%7C');
    const endpoints = [
      `https://galascan.gala.com/api/wallet/${encodedAddress}/transactions`,
      `https://galascan.gala.com/api/v1/wallet/${encodedAddress}/transactions`,
      `https://api.galascan.com/wallet/${encodedAddress}/transactions`
    ];
    
    for (const url of endpoints) {
      try {
        console.log(`   Testing: ${url.split('/api')[1]}...`);
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0',
            'Referer': 'https://galascan.gala.com/'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log(`   Status: ${response.status} - Checking for data...`);
          
          const txList = data.transactions || data.data || data.items || [];
          if (Array.isArray(txList) && txList.length > 0) {
            console.log(`   ✅ Found ${txList.length} transactions`);
            return txList;
          }
        } else {
          console.log(`   Status: ${response.status}`);
        }
      } catch (error) {
        console.log(`   Error: ${error.message}`);
      }
    }
    
    return [];
  }

  async fetchRecentSwaps() {
    console.log('\n4. Trying recent swaps endpoint...');
    
    // Try to get recent swaps from the DEX
    const url = 'https://dex-backend-prod1.defi.gala.com/swaps/recent?limit=100';
    
    try {
      console.log(`   Fetching recent swaps...`);
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const swaps = data.swaps || data.data?.swaps || data.items || [];
        
        // Filter for our wallet address
        const ourSwaps = swaps.filter(swap => 
          swap.address === this.walletAddress || 
          swap.wallet === this.walletAddress ||
          swap.from === this.walletAddress ||
          swap.user === this.walletAddress
        );
        
        if (ourSwaps.length > 0) {
          console.log(`   ✅ Found ${ourSwaps.length} swaps for this wallet`);
          return ourSwaps;
        } else {
          console.log(`   No swaps found for this wallet in recent data`);
        }
      } else {
        console.log(`   Status: ${response.status}`);
      }
    } catch (error) {
      console.log(`   Error: ${error.message}`);
    }
    
    return [];
  }

  async fetchPoolEvents() {
    console.log('\n5. Checking pool events...');
    
    // Try to get pool events that might include our wallet
    const url = `https://dex-backend-prod1.defi.gala.com/pools/events?limit=100`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const events = data.events || data.data || [];
        
        // Filter for our wallet
        const ourEvents = events.filter(event => 
          event.address === this.walletAddress ||
          event.wallet === this.walletAddress ||
          event.user === this.walletAddress
        );
        
        if (ourEvents.length > 0) {
          console.log(`   ✅ Found ${ourEvents.length} pool events for this wallet`);
          return ourEvents;
        } else {
          console.log(`   No pool events for this wallet`);
        }
      } else {
        console.log(`   Status: ${response.status}`);
      }
    } catch (error) {
      console.log(`   Error: ${error.message}`);
    }
    
    return [];
  }

  analyzeTransactions(transactions) {
    console.log('\n📊 TRANSACTION ANALYSIS');
    console.log('═'.repeat(70));
    
    if (transactions.length === 0) {
      console.log('No transactions found to analyze');
      return;
    }
    
    console.log(`Total Transactions: ${transactions.length}`);
    console.log('\nSample Transactions (first 5):');
    console.log('─'.repeat(70));
    
    for (const tx of transactions.slice(0, 5)) {
      console.log('\nTransaction:');
      
      // Display key fields if they exist
      if (tx.transactionId || tx.id || tx.hash) {
        console.log(`  ID: ${tx.transactionId || tx.id || tx.hash}`);
      }
      if (tx.timestamp || tx.date || tx.time) {
        console.log(`  Time: ${tx.timestamp || tx.date || tx.time}`);
      }
      if (tx.type || tx.method) {
        console.log(`  Type: ${tx.type || tx.method}`);
      }
      if (tx.tokenIn && tx.tokenOut) {
        console.log(`  Swap: ${tx.amountIn || '?'} ${tx.tokenIn} → ${tx.amountOut || '?'} ${tx.tokenOut}`);
      }
      if (tx.status) {
        console.log(`  Status: ${tx.status}`);
      }
      
      // Show raw data for debugging
      console.log(`  Raw: ${JSON.stringify(tx).slice(0, 150)}...`);
    }
    
    // Calculate statistics
    const swapCount = transactions.filter(tx => 
      tx.type === 'swap' || tx.method === 'swap' || tx.tokenIn
    ).length;
    
    console.log('\n📈 STATISTICS');
    console.log('─'.repeat(70));
    console.log(`Total Transactions: ${transactions.length}`);
    console.log(`Swap Transactions: ${swapCount}`);
    
    // Token volumes if available
    const tokenVolumes = {};
    for (const tx of transactions) {
      if (tx.tokenIn && tx.amountIn) {
        tokenVolumes[tx.tokenIn] = (tokenVolumes[tx.tokenIn] || 0) + parseFloat(tx.amountIn);
      }
      if (tx.tokenOut && tx.amountOut) {
        tokenVolumes[tx.tokenOut] = (tokenVolumes[tx.tokenOut] || 0) + parseFloat(tx.amountOut);
      }
    }
    
    if (Object.keys(tokenVolumes).length > 0) {
      console.log('\nToken Volumes:');
      for (const [token, volume] of Object.entries(tokenVolumes)) {
        console.log(`  ${token}: ${volume}`);
      }
    }
  }

  async saveResults(transactions) {
    const output = {
      wallet: this.walletAddress,
      fetchDate: new Date().toISOString(),
      transactionCount: transactions.length,
      transactions: transactions.slice(0, 100), // Save first 100
      sources: {
        dexAPI: false,
        galaChainAPI: false,
        galaScanAPI: false,
        recentSwaps: false,
        poolEvents: false
      }
    };
    
    const filename = `wallet-transactions-${this.walletAddress.slice(0, 10)}-${Date.now()}.json`;
    await fs.writeFile(filename, JSON.stringify(output, null, 2));
    console.log(`\n💾 Results saved to: ${filename}`);
  }

  async run() {
    console.log('🚀 TRANSACTION FETCHER');
    console.log('═'.repeat(70));
    console.log(`Wallet: ${this.walletAddress}`);
    console.log('Attempting to fetch transaction history from all available sources...');
    
    let allTransactions = [];
    
    // Try all sources
    const dexTxs = await this.fetchFromDEXAPI();
    if (dexTxs.length > 0) allTransactions.push(...dexTxs);
    
    const galaTxs = await this.fetchFromGalaChainAPI();
    if (galaTxs.length > 0) allTransactions.push(...galaTxs);
    
    const scanTxs = await this.fetchFromGalaScan();
    if (scanTxs.length > 0) allTransactions.push(...scanTxs);
    
    const swaps = await this.fetchRecentSwaps();
    if (swaps.length > 0) allTransactions.push(...swaps);
    
    const events = await this.fetchPoolEvents();
    if (events.length > 0) allTransactions.push(...events);
    
    // Analyze results
    if (allTransactions.length > 0) {
      this.analyzeTransactions(allTransactions);
      await this.saveResults(allTransactions);
      console.log('\n✅ Transaction fetch complete');
    } else {
      console.log('\n❌ No transactions found from any public API');
      console.log('\nPossible reasons:');
      console.log('  1. Wallet has no transaction history');
      console.log('  2. APIs require authentication (API key)');
      console.log('  3. Transaction data is only available through GalaScan Pro');
      console.log('  4. Need to use blockchain RPC directly');
      console.log('\nAlternatives:');
      console.log(`  - View on GalaScan: https://galascan.gala.com/wallet/${this.walletAddress.replace('|', '%7C')}`);
      console.log('  - Use authenticated API if you have credentials');
      console.log('  - Query blockchain directly via RPC');
    }
  }
}

// Parse arguments
const args = process.argv.slice(2);
if (args.length < 1) {
  console.log('Usage: node fetch-wallet-transactions.js <wallet-address>');
  console.log('Example: node fetch-wallet-transactions.js "eth|Ce74B68cd1e9786F4BD3b9f7152D6151695A0bA5"');
  process.exit(1);
}

const fetcher = new TransactionFetcher(args[0]);
fetcher.run().catch(console.error);