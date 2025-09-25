#!/usr/bin/env node

/**
 * Fetch GalaScan wallet page HTML to analyze structure
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';

async function fetchGalaScanPage(walletAddress) {
  const url = `https://galascan.gala.com/wallet/${walletAddress.replace('|', '%7C')}`;
  console.log(`Fetching: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      }
    });
    
    if (response.ok) {
      const html = await response.text();
      
      // Save HTML for analysis
      await fs.writeFile('galascan-wallet-page.html', html);
      console.log('✅ Page saved to galascan-wallet-page.html');
      
      // Look for data in the HTML
      console.log('\nAnalyzing page structure...');
      
      // Check for Next.js data
      if (html.includes('__NEXT_DATA__')) {
        console.log('✅ Found Next.js data structure');
        const dataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/);
        if (dataMatch) {
          try {
            const data = JSON.parse(dataMatch[1]);
            await fs.writeFile('galascan-nextjs-data.json', JSON.stringify(data, null, 2));
            console.log('💾 Next.js data saved to galascan-nextjs-data.json');
            
            // Look for transaction data in props
            if (data.props?.pageProps) {
              console.log('Found pageProps:', Object.keys(data.props.pageProps));
              
              if (data.props.pageProps.transactions) {
                console.log(`✅ Found ${data.props.pageProps.transactions.length} transactions!`);
                return data.props.pageProps.transactions;
              }
              
              if (data.props.pageProps.data) {
                console.log('Found data in pageProps:', Object.keys(data.props.pageProps.data));
              }
            }
          } catch (e) {
            console.log('Failed to parse Next.js data:', e.message);
          }
        }
      }
      
      // Check for React props
      if (html.includes('window.__INITIAL_STATE__')) {
        console.log('✅ Found React initial state');
      }
      
      // Check for API endpoints in the HTML
      const apiMatches = html.match(/api\.gala[^"'\s]*/gi);
      if (apiMatches) {
        console.log('\nFound API endpoints:');
        [...new Set(apiMatches)].forEach(endpoint => {
          console.log(`  - ${endpoint}`);
        });
      }
      
      // Check for transaction elements
      const hasTransactionElements = 
        html.includes('transaction') || 
        html.includes('swap') ||
        html.includes('tx-row') ||
        html.includes('tbody');
      
      if (hasTransactionElements) {
        console.log('\n✅ Page contains transaction-related elements');
      } else {
        console.log('\n⚠️ No obvious transaction elements found');
      }
      
      // Check page size
      console.log(`\nPage size: ${(html.length / 1024).toFixed(2)} KB`);
      
    } else {
      console.log(`❌ Failed to fetch: ${response.status}`);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

const wallet = process.argv[2] || "eth|Ce74B68cd1e9786F4BD3b9f7152D6151695A0bA5";
fetchGalaScanPage(wallet);