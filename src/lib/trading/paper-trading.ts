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

  constructor(initialBalance = 10000) {
    this.wallet = {
      balances: new Map([
        ['USDC', initialBalance * 0.5],
        ['BNB', initialBalance * 0.25 / 300], // Assuming BNB = $300
        ['GALA', initialBalance * 0.25 / 0.05], // Assuming GALA = $0.05
      ]),
      initialBalance,
      currentValue: initialBalance,
      trades: [],
    };

    // Set initial prices
    this.prices.set('USDC', 1);
    this.prices.set('BNB', 300);
    this.prices.set('GALA', 0.05);
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
    this.wallet.balances.clear();
    this.wallet.balances.set('USDC', this.wallet.initialBalance * 0.5);
    this.wallet.balances.set('BNB', this.wallet.initialBalance * 0.25 / 300);
    this.wallet.balances.set('GALA', this.wallet.initialBalance * 0.25 / 0.05);
    this.wallet.currentValue = this.wallet.initialBalance;
    this.wallet.trades = [];
  }

  getTrades(): Trade[] {
    return this.wallet.trades;
  }
}