import { ethers } from 'ethers';
import type { GalaChainSigner } from '@gala-chain/gswap-sdk';

/**
 * MetaMask signer implementation for GSwap SDK.
 * Bridges MetaMask wallet signing to GalaChain format.
 */
export class MetaMaskSigner implements GalaChainSigner {
  constructor(private signer: ethers.Signer) {}

  async signObject<TObjectType extends Record<string, unknown>>(
    methodName: string,
    object: TObjectType
  ): Promise<TObjectType & { signature: string }> {
    // Create a deterministic message from the object
    const message = JSON.stringify({
      method: methodName,
      ...object,
      timestamp: Date.now()
    });

    // Sign the message using MetaMask
    const signature = await this.signer.signMessage(message);

    return {
      ...object,
      signature
    };
  }

  /**
   * Get the wallet address from the signer
   */
  async getAddress(): Promise<string> {
    return await this.signer.getAddress();
  }
}