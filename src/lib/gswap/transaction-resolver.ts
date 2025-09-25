/**
 * Transaction Resolver for GalaChain
 * Monitors transaction status and confirmations
 * Note: GalaScan uses transaction IDs directly, not separate blockchain hashes
 */

import { EventSocketClient } from '@gala-chain/gswap-sdk';

export interface TransactionStatus {
  transactionId: string;
  blockchainHash?: string;
  status: 'pending' | 'confirmed' | 'failed';
  timestamp: Date;
  confirmations?: number;
  error?: string;
}

export class TransactionResolver {
  private socketClient: EventSocketClient | null = null;
  private bundlerUrl = 'https://bundle-backend-prod1.defi.gala.com';
  private pendingTransactions = new Map<string, TransactionStatus>();

  /**
   * Connect to the GalaChain bundler for transaction tracking
   */
  async connect(): Promise<void> {
    try {
      if (this.socketClient?.isConnected()) {
        console.log('[TransactionResolver] Already connected');
        return;
      }

      this.socketClient = new EventSocketClient(this.bundlerUrl);
      await this.socketClient.connect();
      console.log('[TransactionResolver] Connected to bundler');

      // Listen for transaction updates
      this.setupEventListeners();
    } catch (error) {
      console.error('[TransactionResolver] Failed to connect:', error);
      throw error;
    }
  }

  /**
   * Disconnect from the bundler
   */
  async disconnect(): Promise<void> {
    if (this.socketClient) {
      await this.socketClient.disconnect();
      this.socketClient = null;
      console.log('[TransactionResolver] Disconnected');
    }
  }

  /**
   * Setup event listeners for transaction updates
   */
  private setupEventListeners(): void {
    if (!this.socketClient) return;

    // Listen for transaction confirmation events
    this.socketClient.on('transactionConfirmed', (data: any) => {
      console.log('[TransactionResolver] Transaction confirmed:', data);
      
      const txId = data.transactionId || data.id;
      const blockchainHash = data.transactionHash || data.hash || data.blockchainHash;
      
      if (txId && this.pendingTransactions.has(txId)) {
        const status = this.pendingTransactions.get(txId)!;
        status.blockchainHash = blockchainHash;
        status.status = 'confirmed';
        status.confirmations = data.confirmations || 1;
        this.pendingTransactions.set(txId, status);
      }
    });

    // Listen for transaction failure events
    this.socketClient.on('transactionFailed', (data: any) => {
      console.log('[TransactionResolver] Transaction failed:', data);
      
      const txId = data.transactionId || data.id;
      
      if (txId && this.pendingTransactions.has(txId)) {
        const status = this.pendingTransactions.get(txId)!;
        status.status = 'failed';
        status.error = data.error || 'Transaction failed';
        this.pendingTransactions.set(txId, status);
      }
    });
  }

  /**
   * Track a transaction and wait for its blockchain hash
   * @param transactionId The GalaChain transaction ID
   * @param timeout Maximum time to wait in milliseconds (default: 30 seconds)
   * @returns The blockchain hash when available
   */
  async waitForBlockchainHash(
    transactionId: string,
    timeout: number = 30000
  ): Promise<string | null> {
    console.log(`[TransactionResolver] Waiting for blockchain hash for ${transactionId}`);

    // Add to pending transactions
    this.pendingTransactions.set(transactionId, {
      transactionId,
      status: 'pending',
      timestamp: new Date()
    });

    // Ensure we're connected
    if (!this.socketClient?.isConnected()) {
      await this.connect();
    }

    return new Promise((resolve) => {
      const startTime = Date.now();
      let pollCount = 0;
      
      const checkInterval = setInterval(async () => {
        pollCount++;
        
        // First check local status from socket events
        const status = this.pendingTransactions.get(transactionId);
        
        // Check if we have a blockchain hash from socket
        if (status?.blockchainHash && status.blockchainHash !== transactionId) {
          clearInterval(checkInterval);
          console.log(`[TransactionResolver] Got blockchain hash from socket: ${status.blockchainHash}`);
          resolve(status.blockchainHash);
          return;
        }
        
        // Every 5 seconds, also poll the API
        if (pollCount % 5 === 0) {
          console.log(`[TransactionResolver] Polling API for blockchain hash (attempt ${pollCount / 5})...`);
          const apiStatus = await this.queryTransactionStatus(transactionId);
          if (apiStatus?.blockchainHash && apiStatus.blockchainHash !== transactionId) {
            clearInterval(checkInterval);
            console.log(`[TransactionResolver] Got blockchain hash from API: ${apiStatus.blockchainHash}`);
            resolve(apiStatus.blockchainHash);
            return;
          }
        }
        
        // Check if transaction failed
        if (status?.status === 'failed') {
          clearInterval(checkInterval);
          console.error(`[TransactionResolver] Transaction failed: ${status.error}`);
          resolve(null);
          return;
        }
        
        // Check timeout
        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          console.log('[TransactionResolver] Timeout waiting for blockchain hash');
          resolve(null);
          return;
        }
      }, 1000); // Check every second
    });
  }

  /**
   * Query transaction status via API (alternative method)
   * @param transactionId The GalaChain transaction ID
   * @returns Transaction status including blockchain hash if available
   */
  async queryTransactionStatus(transactionId: string): Promise<TransactionStatus | null> {
    try {
      // Try the GalaChain API endpoint
      const response = await fetch(
        `https://api-galachain-prod.gala.com/transaction/${transactionId}`,
        {
          headers: {
            'Accept': 'application/json',
          }
        }
      );

      if (!response.ok) {
        console.warn(`[TransactionResolver] API query failed for ${transactionId}`);
        return null;
      }

      const data = await response.json();
      
      return {
        transactionId,
        blockchainHash: data.blockchainHash || data.hash || data.transactionHash,
        status: data.status === 'confirmed' ? 'confirmed' : 'pending',
        timestamp: new Date(data.timestamp || Date.now()),
        confirmations: data.confirmations || 0
      };
    } catch (error) {
      console.error('[TransactionResolver] API query error:', error);
      return null;
    }
  }

  /**
   * Resolve a transaction ID to blockchain hash using multiple methods
   * @param transactionId The GalaChain transaction ID
   * @param options Resolution options
   * @returns The blockchain hash if found (different from transaction ID)
   */
  async resolveToBlockchainHash(
    transactionId: string,
    options: {
      useSocket?: boolean;
      useApi?: boolean;
      timeout?: number;
    } = {}
  ): Promise<string | null> {
    const { 
      useSocket = true, 
      useApi = true, 
      timeout = 30000 
    } = options;

    console.log(`[TransactionResolver] Resolving ${transactionId} to blockchain hash (timeout: ${timeout}ms)`);

    // Use the improved waitForBlockchainHash which polls both socket and API
    if (useSocket || useApi) {
      const hash = await this.waitForBlockchainHash(transactionId, timeout);
      if (hash && hash !== transactionId) {
        console.log(`[TransactionResolver] Successfully resolved to blockchain hash: ${hash}`);
        return hash;
      }
    }

    // Final attempt with alternative endpoints if all else fails
    console.log(`[TransactionResolver] Making final attempts with alternative endpoints...`);
    const alternativeEndpoints = [
      `https://dex-backend-prod1.defi.gala.com/transaction/${transactionId}`,
      `https://galascan.gala.com/api/transaction/${transactionId}`,
      `https://bundle-backend-prod1.defi.gala.com/transaction/${transactionId}`
    ];

    for (const endpoint of alternativeEndpoints) {
      try {
        const response = await fetch(endpoint);
        if (response.ok) {
          const data = await response.json();
          // Check all possible fields for blockchain hash
          const hash = data.blockchainHash || 
                      data.hash || 
                      data.transactionHash || 
                      data.txHash ||
                      data.onChainHash;
          if (hash && hash !== transactionId) {
            console.log(`[TransactionResolver] Found blockchain hash via ${endpoint}: ${hash}`);
            return hash;
          }
        }
      } catch (error) {
        // Silent fail, try next endpoint
      }
    }

    console.log(`[TransactionResolver] Could not resolve to a different blockchain hash for ${transactionId} after ${timeout}ms`);
    // Return null if no different blockchain hash is found
    return null;
  }

  /**
   * Get GalaScan URL for a transaction
   * @param hashOrId Blockchain hash (preferred) or transaction ID
   * @returns GalaScan URL
   */
  getGalaScanUrl(hashOrId: string): string {
    // GalaScan can use either blockchain hash or transaction ID
    return `https://galascan.gala.com/transaction/${hashOrId}`;
  }

  /**
   * Check if we're connected to the bundler
   */
  isConnected(): boolean {
    return this.socketClient?.isConnected() || false;
  }
}

// Export singleton instance
export const transactionResolver = new TransactionResolver();