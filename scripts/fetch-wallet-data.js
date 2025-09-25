#!/usr/bin/env node

/**
 * Simple wallet data fetcher using direct HTTP requests
 */

import fetch from 'node-fetch';

async function fetchWalletData(walletAddress, startDate) {
  console.log('🔍 Fetching wallet data from GalaScan...');
  console.log(`Wallet: ${walletAddress}`);
  console.log(`Start Date: ${startDate}\n`);

  // URL encode the wallet address
  const encodedAddress = walletAddress.replace('|', '%7C');
  
  // Try different endpoints
  const endpoints = [
    {
      name: 'GalaScan Wallet Page',
      url: `https://galascan.gala.com/wallet/${encodedAddress}`,
      type: 'html'
    },
    {
      name: 'GalaChain DEX API',
      url: `https://dex-backend-prod1.defi.gala.com/user/assets?address=${encodeURIComponent(walletAddress)}&page=1&limit=20`,
      type: 'json'
    },
    {
      name: 'GalaChain API Assets',
      url: `https://api-galachain-prod.gala.com/assets/${encodeURIComponent(walletAddress)}`,
      type: 'json'
    }
  ];

  for (const endpoint of endpoints) {
    console.log(`\nTrying: ${endpoint.name}`);
    console.log(`URL: ${endpoint.url}`);
    
    try {
      const response = await fetch(endpoint.url, {
        headers: {
          'Accept': endpoint.type === 'json' ? 'application/json' : 'text/html',
          'User-Agent': 'Mozilla/5.0 (compatible; WalletFetcher/1.0)',
        }
      });
      
      console.log(`Status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        if (endpoint.type === 'json') {
          const data = await response.json();
          console.log('Response:', JSON.stringify(data, null, 2));
          
          // Parse balances if available
          if (data.data?.token || data.data?.tokens || data.tokens) {
            console.log('\n💰 WALLET BALANCES:');
            const tokens = data.data?.token || data.data?.tokens || data.tokens || [];
            const tokenList = Array.isArray(tokens) ? tokens : [tokens];
            
            for (const token of tokenList) {
              if (token.symbol && token.quantity) {
                console.log(`  ${token.symbol}: ${token.quantity}`);
              }
            }
          }
        } else {
          const html = await response.text();
          console.log(`HTML received: ${html.length} bytes`);
          
          // Try to extract data from HTML
          const dataMatch = html.match(/<script[^>]*>window\.__NUXT__=(.*?)<\/script>/s);
          if (dataMatch) {
            try {
              const nuxtData = eval(`(${dataMatch[1]})`);
              console.log('Found NUXT data in page');
              
              // Look for wallet/transaction data
              if (nuxtData.state) {
                console.log('State keys:', Object.keys(nuxtData.state));
              }
            } catch (e) {
              console.log('Could not parse NUXT data');
            }
          }
          
          // Look for transaction table
          const txMatches = html.match(/<tr[^>]*class="[^"]*transaction[^"]*"[^>]*>.*?<\/tr>/gs);
          if (txMatches) {
            console.log(`Found ${txMatches.length} transaction rows in HTML`);
          }
        }
      } else {
        console.log(`Failed: ${response.status}`);
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════');
  console.log('Note: GalaScan may require authentication or have rate limits.');
  console.log('Visit the wallet page directly for full details:');
  console.log(`https://galascan.gala.com/wallet/${encodedAddress}`);
}

// Parse arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node fetch-wallet-data.js <wallet-address> <start-date>');
  console.log('Example: node fetch-wallet-data.js "eth|Ce74B68cd1e9786F4BD3b9f7152D6151695A0bA5" "2025-09-22"');
  process.exit(1);
}

fetchWalletData(args[0], args[1]).catch(console.error);