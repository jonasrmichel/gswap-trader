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

    // Define tokens
    const tokenGALA = formatTokenForGSwap('GALA');
    const tokenGWETH = formatTokenForGSwap('GWETH');
    const amountIn = 1; // 1 GALA

    console.log('📊 Trade configuration:');
    console.log('  - Token In:', tokenGALA);
    console.log('  - Token Out:', tokenGWETH);
    console.log('  - Amount In:', amountIn, 'GALA');

    // Check GALA balance first
    console.log('💰 Checking GALA balance...');
    try {
      const assets = await gswap.assets.getUserAssets(galaChainAddress, 1, 20);
      const galaAsset = assets.tokens.find(t => t.symbol === 'GALA');
      const galaBalance = galaAsset ? parseFloat(galaAsset.quantity) : 0;
      console.log('  - GALA balance:', galaBalance);

      if (galaBalance < amountIn) {
        throw new Error(`Insufficient GALA balance. Required: ${amountIn}, Available: ${galaBalance}`);
      }
    } catch (balanceError) {
      console.warn('⚠️  Could not check balance, proceeding with trade attempt:', balanceError.message);
    }

    // Get quote for the swap
    console.log('💱 Getting quote for swap...');
    try {
      const quote = await gswap.quoting.quoteExactInput(
        tokenGALA,
        tokenGWETH,
        amountIn
      );

      console.log('📈 Quote received:');
      console.log('  - Output amount:', quote.outTokenAmount.toNumber(), 'GWETH');
      console.log('  - Current price:', quote.currentPrice);
      console.log('  - Price impact:', quote.priceImpact + '%');
      console.log('  - Fee tier:', quote.feeTier);
      console.log('  - Fee:', quote.fee);

      // Calculate minimum output with 1% slippage
      const slippage = 0.01;
      const minAmountOut = quote.outTokenAmount.toNumber() * (1 - slippage);

      console.log('🔄 Executing swap...');
      console.log('  - Min amount out:', minAmountOut, 'GWETH');
      console.log('  - Slippage tolerance:', (slippage * 100) + '%');
      console.log('  - Using fee tier: PERCENT_01_00 (1%)');

      // Execute the swap with explicit fee tier enum
      const swapResult = await gswap.swaps.swap({
        tokenIn: tokenGALA,
        tokenOut: tokenGWETH,
        amountIn: amountIn,
        amountOutMin: minAmountOut,
        recipient: galaChainAddress,
        deadline: Math.floor(Date.now() / 1000) + 300, // 5 minutes
        fee: FEE_TIER.PERCENT_01_00 // Use enum value
      });

      console.log('✅ Trade executed successfully!');
      console.log('📋 Transaction Hash:', swapResult.transactionHash);
      console.log('🔗 View on GalaScan: https://galascan.gala.com/transaction/' + swapResult.transactionHash);

      return swapResult.transactionHash;

    } catch (quoteError) {
      // If quote fails, try direct swap without quote
      console.warn('⚠️  Could not get quote, attempting direct swap:', quoteError.message);

      // Use estimated minimum output (conservative estimate)
      const estimatedOutput = 0.00001; // Conservative estimate for 1 GALA
      const minAmountOut = estimatedOutput * 0.99; // 1% slippage

      console.log('🔄 Executing swap without quote...');
      console.log('  - Estimated min output:', minAmountOut, 'GWETH');

      const swapResult = await gswap.swaps.swap({
        tokenIn: tokenGALA,
        tokenOut: tokenGWETH,
        amountIn: amountIn,
        amountOutMin: minAmountOut,
        recipient: galaChainAddress,
        deadline: Math.floor(Date.now() / 1000) + 300,
        fee: FEE_TIER.PERCENT_01_00 // Default to 1% fee
      });

      console.log('✅ Trade executed successfully!');
      console.log('📋 Transaction Hash:', swapResult.transactionHash);
      console.log('🔗 View on GalaScan: https://galascan.gala.com/transaction/' + swapResult.transactionHash);

      return swapResult.transactionHash;
    }

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