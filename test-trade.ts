#!/usr/bin/env tsx

import { GSwapSDKClient } from './src/lib/gswap/gswap-sdk-client';
import type { LiquidityPool } from './src/lib/gswap/types';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function executeTrade(): Promise<string> {
  try {
    console.log('🚀 Initializing GSwap trade...');

    // Get private key from environment
    const privateKey = process.env.VITE_WALLET_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('VITE_WALLET_PRIVATE_KEY not found in .env file');
    }

    // Initialize GSwap client
    console.log('📝 Creating GSwap client and connecting...');
    const client = new GSwapSDKClient();

    // Connect with private key
    const walletAddress = await client.connect(privateKey);
    console.log('✅ Wallet connected:', walletAddress);

    // Get available pools
    console.log('🔍 Fetching available pools...');
    const pools = await client.getPools();

    // Find GALA/GWETH pool
    const pool = pools.find((p: LiquidityPool) => p.id === 'GALA-GWETH');

    if (!pool) {
      throw new Error('GALA/GWETH pool not found');
    }

    console.log('📊 Pool found:');
    console.log('  - Pool ID:', pool.id);
    console.log('  - Token A:', pool.tokenA.symbol);
    console.log('  - Token B:', pool.tokenB.symbol);
    console.log('  - Reserve A (GALA):', pool.reserveA);
    console.log('  - Reserve B (GWETH):', pool.reserveB);
    console.log('  - Fee:', (pool.fee * 100).toFixed(2) + '%');
    console.log('  - TVL: $' + pool.tvl.toFixed(2));

    // Calculate expected output for 1 GALA
    const amountIn = '1'; // 1 GALA
    const expectedAmountOut = client.calculateAmountOut(
      amountIn,
      pool.reserveA,
      pool.reserveB,
      pool.fee
    );

    // Calculate price impact
    const priceImpact = client.calculatePriceImpact(
      amountIn,
      pool.reserveA,
      pool.reserveB
    );

    console.log('💱 Trade calculation:');
    console.log('  - Selling:', amountIn, 'GALA');
    console.log('  - Expected to receive:', expectedAmountOut, 'GWETH');
    console.log('  - Price impact:', priceImpact.toFixed(4) + '%');

    // Check user balance
    console.log('💰 Checking GALA balance...');
    const galaBalance = await client.getBalance('GALA|Unit|none|none', walletAddress);
    console.log('  - GALA balance:', galaBalance);

    if (parseFloat(galaBalance) < parseFloat(amountIn)) {
      throw new Error(`Insufficient GALA balance. Required: ${amountIn}, Available: ${galaBalance}`);
    }

    // Confirm trade execution
    console.log('🔄 Executing swap...');
    console.log('  - Pool ID:', pool.id);
    console.log('  - Selling:', amountIn, 'GALA');
    console.log('  - For:', expectedAmountOut, 'GWETH (estimated)');
    console.log('  - Slippage tolerance: 1%');

    // Execute the swap
    const txHash = await client.executeSwap({
      poolId: pool.id,
      tokenIn: 'GALA',
      tokenOut: 'GWETH',
      amountIn: amountIn,
      minAmountOut: (parseFloat(expectedAmountOut) * 0.99).toString(), // 1% slippage
      slippage: 0.01
    });

    console.log('✅ Trade executed successfully!');
    console.log('📋 Transaction Hash:', txHash);
    console.log('🔗 View on GalaScan: https://galascan.gala.com/transaction/' + txHash);

    // Return the transaction hash
    return txHash;

  } catch (error: any) {
    console.error('❌ Error executing trade:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    throw error;
  }
}

// Execute the trade
if (import.meta.url === `file://${process.argv[1]}`) {
  executeTrade()
    .then((txHash: string) => {
      console.log('\n🎉 Trade completed!');
      console.log('Transaction hash:', txHash);
      process.exit(0);
    })
    .catch((error: Error) => {
      console.error('Failed to execute trade:', error);
      process.exit(1);
    });
}

export { executeTrade };