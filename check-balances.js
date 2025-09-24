#!/usr/bin/env node

import { GSwap } from '@gala-chain/gswap-sdk';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function checkBalances() {
  try {
    // Get private key from environment
    const privateKey = process.env.VITE_WALLET_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('VITE_WALLET_PRIVATE_KEY not found in .env file');
    }

    // Derive address from private key
    const wallet = new ethers.Wallet(privateKey);
    const walletAddress = wallet.address;
    const galaChainAddress = `eth|${walletAddress.slice(2)}`;
    
    console.log('🔍 Checking balances for:', walletAddress);
    console.log('   GalaChain format:', galaChainAddress);

    // Create minimal GSwap instance (no signer needed for read-only)
    const gswap = new GSwap({
      walletAddress: galaChainAddress
    });

    // Get balances
    const assets = await gswap.assets.getUserAssets(galaChainAddress, 1, 20);
    
    console.log('\n💰 Current Balances:');
    console.log('═'.repeat(40));
    
    if (assets.tokens && assets.tokens.length > 0) {
      for (const token of assets.tokens) {
        const balance = parseFloat(token.quantity);
        if (balance > 0) {
          console.log(`  ${token.symbol}: ${balance.toFixed(6)}`);
        }
      }
    } else {
      console.log('  No tokens found');
    }
    
    console.log('═'.repeat(40));
    console.log('Timestamp:', new Date().toISOString());

  } catch (error) {
    console.error('❌ Error checking balances:', error.message);
    process.exit(1);
  }
}

// Check balances
checkBalances()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Failed:', error);
    process.exit(1);
  });