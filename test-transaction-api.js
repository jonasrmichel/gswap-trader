#!/usr/bin/env node

// Test script to check what GalaChain API returns for transactions

async function testTransactionAPI(transactionId) {
  console.log(`Testing transaction ID: ${transactionId}\n`);
  
  // Test different API endpoints
  const endpoints = [
    `https://api-galachain-prod.gala.com/transaction/${transactionId}`,
    `https://dex-backend-prod1.defi.gala.com/transaction/${transactionId}`,
    `https://galascan.gala.com/api/transaction/${transactionId}`
  ];
  
  for (const endpoint of endpoints) {
    console.log(`\nTrying endpoint: ${endpoint}`);
    try {
      const response = await fetch(endpoint, {
        headers: {
          'Accept': 'application/json',
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Success! Response:');
        console.log(JSON.stringify(data, null, 2));
        
        // Check for blockchain hash fields
        console.log('\nHash fields found:');
        console.log('- blockchainHash:', data.blockchainHash || 'not found');
        console.log('- hash:', data.hash || 'not found');
        console.log('- transactionHash:', data.transactionHash || 'not found');
        console.log('- txHash:', data.txHash || 'not found');
        console.log('- id:', data.id || 'not found');
        console.log('- transactionId:', data.transactionId || 'not found');
      } else {
        console.log(`❌ Failed with status: ${response.status}`);
        const text = await response.text();
        if (text) console.log('Response:', text);
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }
}

// Get transaction ID from command line or use a test one
const txId = process.argv[2];

if (!txId) {
  console.log('Usage: node test-transaction-api.js <transaction-id>');
  console.log('Please provide a transaction ID to test');
  process.exit(1);
}

testTransactionAPI(txId);