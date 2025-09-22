import type { Trade, Token } from '../gswap/types';

export interface PaperWallet {
  balances: Map<string, number>;
  initialBalance: number;
  currentValue: number;
  trades: Trade[];
}

export class PaperTradingManager {
  private wallet: PaperWallet;
  private prices: Map<string, number> = new Map();
  public balance: number; // Public property for balance updates

  constructor(initialBalance = 500) {
    this.balance = initialBalance;

    // Use current market prices
    const galaPrice = 0.01751;
    const bnbPrice = 600;
    const ethPrice = 2600;
    const usdcPrice = 1;

    this.wallet = {
      balances: new Map([
        ['USDC', initialBalance * 0.4],        // 40% in USDC
        ['ETH', initialBalance * 0.2 / ethPrice],  // 20% in ETH
        ['GALA', initialBalance * 0.2 / galaPrice], // 20% in GALA
        ['BNB', initialBalance * 0.1 / bnbPrice],   // 10% in BNB
        ['USDT', initialBalance * 0.1],         // 10% in USDT
      ]),
      initialBalance,
      currentValue: initialBalance,
      trades: [],
    };

    // Set initial prices with current values
    this.prices.set('USDC', usdcPrice);
    this.prices.set('USDT', 1);
    this.prices.set('BNB', bnbPrice);
    this.prices.set('GALA', galaPrice);
    this.prices.set('ETH', ethPrice);
  }

  getBalance(token: string): number {
    return this.wallet.balances.get(token) || 0;
  }

  getBalances(): Array<{ token: string; balance: string; value: number }> {
    const balances = [];
    for (const [token, amount] of this.wallet.balances.entries()) {
      const price = this.prices.get(token) || 0;
      balances.push({
        token,
        balance: amount.toFixed(6),
        value: amount * price,
      });
    }
    return balances;
  }

  updatePrice(token: string, price: number) {
    this.prices.set(token, price);
    this.updatePortfolioValue();
  }

  executeTrade(
    tokenIn: string,
    tokenOut: string,
    amountIn: number,
    amountOut: number
  ): Trade {
    const balanceIn = this.getBalance(tokenIn);

    if (balanceIn < amountIn) {
      throw new Error(`Insufficient ${tokenIn} balance: ${balanceIn} < ${amountIn}`);
    }

    // Update balances
    this.wallet.balances.set(tokenIn, balanceIn - amountIn);
    this.wallet.balances.set(tokenOut, this.getBalance(tokenOut) + amountOut);

    // Generate a realistic-looking transaction hash for paper trades
    const generatePaperTxHash = () => {
      const timestamp = Date.now().toString(16);
      const random = Math.random().toString(16).substring(2, 10);
      return `0xpaper${timestamp}${random}`.padEnd(66, '0');
    };

    // Create trade record
    const trade: Trade = {
      id: 'paper_' + Date.now().toString(36),
      timestamp: new Date(),
      poolId: `${tokenIn}-${tokenOut}`,
      tokenIn,
      tokenOut,
      amountIn: amountIn.toString(),
      amountOut: amountOut.toString(),
      status: 'success',
      txHash: generatePaperTxHash(),
      profit: this.calculateProfit(tokenIn, tokenOut, amountIn, amountOut),
    };

    this.wallet.trades.push(trade);
    this.updatePortfolioValue();

    return trade;
  }

  private calculateProfit(
    tokenIn: string,
    tokenOut: string,
    amountIn: number,
    amountOut: number
  ): number {
    const valueIn = amountIn * (this.prices.get(tokenIn) || 0);
    const valueOut = amountOut * (this.prices.get(tokenOut) || 0);
    return ((valueOut - valueIn) / valueIn) * 100;
  }

  private updatePortfolioValue() {
    let totalValue = 0;
    for (const [token, amount] of this.wallet.balances.entries()) {
      totalValue += amount * (this.prices.get(token) || 0);
    }
    this.wallet.currentValue = totalValue;
  }

  getStats() {
    const profitLoss = this.wallet.currentValue - this.wallet.initialBalance;
    const profitLossPercent = (profitLoss / this.wallet.initialBalance) * 100;

    const winningTrades = this.wallet.trades.filter(t => (t.profit || 0) > 0);
    const losingTrades = this.wallet.trades.filter(t => (t.profit || 0) <= 0);

    return {
      initialBalance: this.wallet.initialBalance,
      currentValue: this.wallet.currentValue,
      profitLoss,
      profitLossPercent,
      totalTrades: this.wallet.trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: this.wallet.trades.length > 0
        ? (winningTrades.length / this.wallet.trades.length) * 100
        : 0,
      avgProfit: winningTrades.length > 0
        ? winningTrades.reduce((sum, t) => sum + (t.profit || 0), 0) / winningTrades.length
        : 0,
      avgLoss: losingTrades.length > 0
        ? losingTrades.reduce((sum, t) => sum + (t.profit || 0), 0) / losingTrades.length
        : 0,
    };
  }

  reset() {
    const galaPrice = this.prices.get('GALA') || 0.01751;
    const bnbPrice = this.prices.get('BNB') || 600;

    this.wallet.balances.clear();
    this.wallet.balances.set('USDC', this.wallet.initialBalance * 0.5);
    this.wallet.balances.set('BNB', this.wallet.initialBalance * 0.25 / bnbPrice);
    this.wallet.balances.set('GALA', this.wallet.initialBalance * 0.25 / galaPrice);
    this.wallet.currentValue = this.wallet.initialBalance;
    this.wallet.trades = [];
  }

  updateInitialBalance(newBalance: number) {
    // Only reset if the balance actually changes
    if (this.wallet.initialBalance !== newBalance) {
      this.wallet.initialBalance = newBalance;
      this.balance = newBalance;
      this.reset();
    }
  }

  getTrades(): Trade[] {
    return this.wallet.trades;
  }
}