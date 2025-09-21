# GSwap Trader

> An intelligent automated trading agent for GSwap DEX with configurable strategies, risk management, and real-time monitoring.

## Features

- **Automated Trading**: Autonomous trading based on configurable heuristics
- **Multiple Strategies**: Trend following, mean reversion, and range trading
- **Risk Management**: Configurable risk levels (safe, balanced, aggressive)
- **Paper Trading**: Test strategies with simulated funds before going live
- **Live Trading**: Execute real trades using connected wallet
- **Wallet Integration**: Support for private key, MetaMask, and demo wallets
- **Real-time Monitoring**: Live activity logs and performance statistics
- **Configurable Parameters**:
  - Risk level (position size, stop loss)
  - Strategy type (trend, revert, range)
  - Trading speed (1m, 5m, 15m intervals)
  - Signal confidence thresholds
  - Market bias (bullish, neutral, bearish)

## Installation

```bash
# Clone the repository
git clone https://github.com/jonasrmichel/gswap-trader.git
cd gswap-trader

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Start development server
npm run dev
```

## Configuration

### Trading Configuration

The agent supports multiple configuration options:

- **Risk Levels**:
  - Safe: 10% position size, 2% stop loss
  - Balanced: 25% position size, 5% stop loss
  - Aggressive: 50% position size, 10% stop loss

- **Strategies**:
  - Trend Following: Follows market momentum
  - Mean Reversion: Trades against extreme movements
  - Range Trading: Trades within established ranges

- **Trading Speed**:
  - Fast: 1-minute intervals
  - Normal: 5-minute intervals
  - Slow: 15-minute intervals

- **Signal Confidence**:
  - Precise: >80% confidence required
  - Normal: >60% confidence required
  - Active: >40% confidence required

### Wallet Setup

1. **Demo Mode** (Default): Start with simulated funds for testing
2. **Private Key**: Import wallet using private key (never commit to git!)
3. **MetaMask**: Connect browser wallet for live trading

## Usage

1. **Connect Wallet**: Click "Connect Wallet" and choose your connection method
2. **Configure Strategy**: Adjust risk, strategy, speed, signals, and bias settings
3. **Toggle Trading Mode**: Switch between paper trading and live trading
4. **Start Trading**: Click "Start Trading" to begin automated trading
5. **Monitor Activity**: View real-time logs, signals, and performance statistics

## Trading Strategies

### Trend Following
- Uses moving averages (SMA5, SMA10, SMA20)
- Identifies strong trends and momentum
- Best for trending markets

### Mean Reversion
- Calculates Z-scores to identify oversold/overbought conditions
- Trades against extreme price movements
- Best for ranging markets with clear boundaries

### Range Trading
- Identifies support and resistance levels
- Trades bounces within established ranges
- Watches for breakouts

## Safety Features

- **Paper Trading Mode**: Test strategies without risking real funds
- **Position Sizing**: Automatic position sizing based on risk level
- **Stop Loss**: Configurable stop loss for risk management
- **Slippage Protection**: Monitors price impact before executing trades
- **Activity Logging**: Complete audit trail of all trading decisions

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type checking
npm run check
```

## Architecture

- **Frontend**: SvelteKit with TypeScript
- **Styling**: Tailwind CSS with crypto-trader theme
- **Blockchain**: ethers.js for Web3 interactions
- **State Management**: Svelte stores
- **Trading Engine**: Custom heuristic-based strategies

## Security Considerations

- **Never commit private keys**: Always use environment variables for sensitive data
- **Test with paper trading**: Always test strategies with simulated funds first
- **Monitor actively**: Keep an eye on the agent's activity, especially in live mode
- **Use appropriate risk settings**: Start with conservative settings until comfortable
- **Network considerations**: Ensure stable internet connection for live trading

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

Copyright 2025 Jonas Michel

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

## Disclaimer

This software is for educational purposes only. Cryptocurrency trading carries significant risk. Always do your own research and never invest more than you can afford to lose. The authors are not responsible for any financial losses incurred through the use of this software.

## Acknowledgments

- Built with [SvelteKit](https://kit.svelte.dev/)
- Styled with [Tailwind CSS](https://tailwindcss.com/)
- Web3 integration via [ethers.js](https://docs.ethers.io/)
- Inspired by the crypto-trader project architecture