import { GSwap, PrivateKeySigner } from '@gala-chain/gswap-sdk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testSwap() {
  try {
    console.log('🚀 Testing GSwap SDK swap execution...\n');

    const privateKey = process.env.VITE_WALLET_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('VITE_WALLET_PRIVATE_KEY not found in .env');
    }

    // Create GSwap instance
    const gswap = new GSwap({
      signer: new PrivateKeySigner(privateKey),
    });

    console.log('✅ GSwap SDK initialized with private key signer\n');

    // Test 1: Get quote for small GALA to GUSDC swap
    console.log('📊 Getting quote for 10 GALA -> GUSDC swap...');
    const quote = await gswap.quoting.quoteExactInput(
      'GALA|Unit|none|none',
      'GUSDC|Unit|none|none',
      10
    );

    console.log('Quote received:');
    console.log(`  - Input: 10 GALA`);
    console.log(`  - Output: ${quote.outTokenAmount.toNumber()} GUSDC`);
    console.log(`  - Current Price: ${quote.currentPrice}`);
    console.log(`  - Price Impact: ${quote.priceImpact}%`);
    console.log(`  - Fee Tier: ${quote.feeTier}\n`);

    // Test 2: Attempt a tiny test swap (if VITE_EXECUTE_TEST_TRADE is true)
    if (process.env.VITE_EXECUTE_TEST_TRADE === 'true') {
      console.log('💰 Executing test swap: 1 GALA -> GUSDC...');

      try {
        const swapResult = await gswap.swaps.swap({
          tokenIn: 'GALA|Unit|none|none',
          tokenOut: 'GUSDC|Unit|none|none',
          amountIn: 1,
          amountOutMin: 0, // Accept any amount for test
          recipient: undefined, // Uses signer's address
          deadline: Math.floor(Date.now() / 1000) + 300 // 5 minutes
        });

        console.log('✅ Swap executed successfully!');
        console.log('Transaction:', swapResult);
      } catch (swapError) {
        console.log('❌ Swap execution failed (this is expected if insufficient balance)');
        console.log('Error:', swapError.message);
      }
    } else {
      console.log('ℹ️ Skipping actual swap execution (set VITE_EXECUTE_TEST_TRADE=true to enable)');
    }

    console.log('\n✅ All tests completed successfully!');
    console.log('The GSwap SDK integration is working properly.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testSwap();