#!/usr/bin/env node

import { GSwap, PrivateKeySigner, FEE_TIER } from '@gala-chain/gswap-sdk';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Helper function to format token for GSwap
function formatTokenForGSwap(symbol) {
  if (symbol === 'ETH' || symbol === 'WETH' || symbol === 'GWETH') {
    return 'GWETH|Unit|none|none';
  }
  if (symbol === 'GALA') {
    return 'GALA|Unit|none|none';
  }
  if (symbol === 'USDC' || symbol === 'GUSDC') {
    return 'GUSDC|Unit|none|none';
  }
  return `${symbol}|Unit|none|none`;
}

async function executeTrade() {
  try {
    console.log('🚀 Initializing GSwap trade...');

    // Get private key from environment
    const privateKey = process.env.VITE_WALLET_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('VITE_WALLET_PRIVATE_KEY not found in .env file');
    }

    // Initialize signer with private key
    console.log('📝 Creating signer...');
    const signer = new PrivateKeySigner(privateKey);

    // Derive address from private key
    const wallet = new ethers.Wallet(privateKey);
    const walletAddress = wallet.address;
    console.log('✅ Wallet address:', walletAddress);

    // Initialize GSwap client
    console.log('🔗 Connecting to GSwap...');
    const galaChainAddress = `eth|${walletAddress.slice(2)}`;
    const gswap = new GSwap({
      signer,
      walletAddress: galaChainAddress,
      // Use default GalaChain mainnet URL
    });

    // Define tokens - Now selling GALA for GUSDC
    const tokenGALA = formatTokenForGSwap('GALA');
    const tokenGUSDC = formatTokenForGSwap('GUSDC');
    
    // Calculate amount of GALA for $10 worth (assuming GALA is ~$0.02)
    const galaPrice = 0.02; // Approximate GALA price in USD
    const usdValue = 10; // $10 worth
    const amountIn = Math.floor(usdValue / galaPrice); // ~500 GALA for $10

    console.log('📊 Trade configuration:');
    console.log('  - Token In:', tokenGALA);
    console.log('  - Token Out:', tokenGUSDC);
    console.log('  - Amount In:', amountIn, 'GALA (~$' + (amountIn * galaPrice).toFixed(2) + ')');

    // Check balances before trade
    console.log('💰 Checking balances before trade...');
    try {
      const assets = await gswap.assets.getUserAssets(galaChainAddress, 1, 20);
      const galaAsset = assets.tokens.find(t => t.symbol === 'GALA');
      const gusdcAsset = assets.tokens.find(t => t.symbol === 'GUSDC');
      const galaBalance = galaAsset ? parseFloat(galaAsset.quantity) : 0;
      const gusdcBalance = gusdcAsset ? parseFloat(gusdcAsset.quantity) : 0;
      
      console.log('  - GALA balance:', galaBalance);
      console.log('  - GUSDC balance:', gusdcBalance);

      if (galaBalance < amountIn) {
        throw new Error(`Insufficient GALA balance. Required: ${amountIn}, Available: ${galaBalance}`);
      }
    } catch (balanceError) {
      console.warn('⚠️  Could not check balance, proceeding with trade attempt:', balanceError.message);
    }

    // Get quote for the swap
    console.log('💱 Getting quote for GALA → GUSDC swap...');
    const quote = await gswap.quoting.quoteExactInput(
      tokenGALA,
      tokenGUSDC,
      amountIn
    );

    console.log('📈 Quote received:');
    console.log('  - Output amount:', quote.outTokenAmount.toNumber(), 'GUSDC');
    console.log('  - Current price:', quote.currentPrice);
    console.log('  - Price impact:', quote.priceImpact + '%');
    console.log('  - Fee tier:', quote.feeTier);

    // Calculate minimum output with 1% slippage
    const slippage = 0.01;
    const minAmountOut = quote.outTokenAmount.toNumber() * (1 - slippage);

    console.log('🔄 Executing GALA → GUSDC swap...');
    console.log('  - Min amount out:', minAmountOut, 'GUSDC');
    console.log('  - Slippage tolerance:', (slippage * 100) + '%');
    console.log('  - Using fee tier:', quote.feeTier || 10000); // Default to 1% if not provided

    // Execute swap using the correct signature
    // swap(tokenIn, tokenOut, fee, amount, walletAddress)
    const swapResult = await gswap.swaps.swap(
      tokenGALA,           // tokenIn
      tokenGUSDC,          // tokenOut  
      quote.feeTier || 10000, // fee (use quote or default to 1%)
      {                    // amount object
        exactIn: amountIn,
        amountOutMinimum: minAmountOut,
        deadline: Math.floor(Date.now() / 1000) + 300
      },
      galaChainAddress     // walletAddress (optional, but let's be explicit)
    );

    console.log('✅ Trade submitted successfully!');
    console.log('📋 Pending transaction:', swapResult);
    console.log('📝 Transaction ID:', swapResult.transactionId);

    // Wait for transaction confirmation
    console.log('⏳ Waiting for transaction confirmation...');
    let txHash;
    try {
      const confirmedTx = await swapResult.waitDelegate();
      console.log('✅ Transaction confirmed!');
      console.log('📋 Confirmed transaction:', confirmedTx);

      // The confirmed transaction should have the blockchain hash
      txHash = confirmedTx.transactionHash || confirmedTx.hash || confirmedTx.txHash;
      if (txHash) {
        console.log('🔗 View on GalaScan: https://galascan.gala.com/transaction/' + txHash);
      }
    } catch (waitError) {
      console.warn('⚠️ Could not wait for confirmation:', waitError.message);
      // Use transaction ID as fallback
      txHash = swapResult.transactionId;
    }

    // Check balances after trade
    console.log('\n💰 Checking balances after trade...');
    try {
      // Wait a bit for blockchain to update
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const assetsAfter = await gswap.assets.getUserAssets(galaChainAddress, 1, 20);
      const galaAssetAfter = assetsAfter.tokens.find(t => t.symbol === 'GALA');
      const gusdcAssetAfter = assetsAfter.tokens.find(t => t.symbol === 'GUSDC');
      const galaBalanceAfter = galaAssetAfter ? parseFloat(galaAssetAfter.quantity) : 0;
      const gusdcBalanceAfter = gusdcAssetAfter ? parseFloat(gusdcAssetAfter.quantity) : 0;
      
      console.log('  - GALA balance:', galaBalanceAfter);
      console.log('  - GUSDC balance:', gusdcBalanceAfter);
      console.log('\n📊 Trade Summary:');
      console.log('  - GALA spent:', amountIn);
      console.log('  - GUSDC received:', gusdcBalanceAfter > 0 ? '~' + minAmountOut.toFixed(2) : 'pending');
    } catch (balanceError) {
      console.warn('⚠️ Could not check final balances:', balanceError.message);
    }

    return txHash;

  } catch (error) {
    console.error('❌ Error executing trade:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Execute the trade
executeTrade()
  .then(txHash => {
    console.log('\n🎉 Trade completed!');
    console.log('Transaction hash:', txHash);
    process.exit(0);
  })
  .catch(error => {
    console.error('Failed to execute trade:', error);
    process.exit(1);
  });