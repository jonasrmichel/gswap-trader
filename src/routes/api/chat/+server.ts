import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { messages, message } = await request.json();

        // Build conversation history for Claude
        const conversationHistory = messages
            ?.filter((m: any) => !m.isTyping)
            .map((m: any) => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content
            })) || [];

        // Add the new message
        if (message) {
            conversationHistory.push({
                role: 'user',
                content: message
            });
        }

        // System prompt for GSwap Trader context
        const systemPrompt = `You are a helpful cryptocurrency trading expert and assistant specializing in GSwap DEX on GalaChain.

You have deep expertise in:
- GSwap DEX, GalaChain ecosystem, and decentralized trading
- Cryptocurrency trading strategies including trend following, mean reversion, range trading, arbitrage, and market making
- Technical indicators (RSI, MACD, Bollinger Bands, SMA/EMA crossovers, Volume analysis)
- Risk management, position sizing, and portfolio optimization
- FreqTrade algorithmic trading strategies, their implementation details, and tradeoffs
- Market microstructure, liquidity dynamics, and order book analysis
- DeFi protocols, liquidity pools, impermanent loss, and yield farming strategies

You can help users with:
- Analyzing market trends and providing trading signals for GALA, GWETH, GUSDC pairs
- Recommending optimal trading strategies based on current market conditions
- Advising on risk management and position sizing based on user's risk tolerance
- Optimizing GSwap Trader configuration for maximum profitability
- Understanding and interpreting trading metrics, statistics, and performance indicators
- Explaining complex DeFi concepts in simple terms
- Troubleshooting trading issues and suggesting improvements

Provide trading advice based on current crypto market trends and historical performance data. Take the user's risk tolerance and goals into mind. Always think deeply about your responses and provide thoughtful, well-reasoned analysis.

When discussing risk, emphasize capital preservation and the importance of proper position sizing. Be practical and actionable in your advice. If asked about specific commands, refer to the slash commands available in the chat interface (/help shows all commands).`;

        if (!ANTHROPIC_API_KEY) {
            // Return a helpful mock response if no API key is configured
            return json({
                content: generateMockResponse(message || conversationHistory[conversationHistory.length - 1]?.content)
            });
        }

        // Call Anthropic API
        const response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-opus-20240229',
                max_tokens: 1024,
                temperature: 0.7,
                system: systemPrompt,
                messages: conversationHistory
            })
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('Anthropic API error:', error);
            throw new Error('Failed to get response from Claude');
        }

        const data = await response.json();

        // Extract the content from Claude's response
        const content = data.content?.[0]?.text || 'Sorry, I couldn\'t generate a response.';

        return json({ content });

    } catch (error) {
        console.error('Chat API error:', error);

        // Return a helpful fallback response
        return json({
            content: generateMockResponse('')
        });
    }
};

function generateMockResponse(input: string): string {
    const lower = input?.toLowerCase() || '';

    if (lower.includes('gala') || lower.includes('market')) {
        return `📊 **GALA Market Analysis**

GALA is showing interesting price action on GSwap:
• Current trend: Consolidating after recent gains
• Volume: Increasing, indicating growing interest
• Support level: Around previous resistance zone
• Resistance: Testing upper range boundaries

**Trading Recommendation:**
Consider a balanced approach with 30% position sizing. The GALA/GWETH pair offers good liquidity for entries and exits. Watch for breakout above resistance for trend continuation.`;
    }

    if (lower.includes('strategy') || lower.includes('strategies')) {
        return `📈 **Trading Strategies for GSwap**

Here are the three main strategies available:

1. **Trend Following** 📉
   - Best for: Strong directional markets
   - Uses: SMA crossovers and momentum indicators
   - Risk: Moderate

2. **Mean Reversion** 🔄
   - Best for: Range-bound markets
   - Uses: Bollinger Bands and RSI
   - Risk: Lower in stable conditions

3. **Range Trading** 📊
   - Best for: Sideways markets with clear bounds
   - Uses: Support/resistance levels
   - Risk: Lowest, but limited profit potential

Current market suggests **Trend Following** might be optimal given recent momentum.`;
    }

    if (lower.includes('risk') || lower.includes('position')) {
        return `⚖️ **Risk Management Guidelines**

Protecting capital is paramount. Here's my recommended approach:

**Risk Levels:**
• **Safe Mode** (Conservative)
  - Position size: 15% of capital
  - Stop loss: 3%
  - Best for: New traders or volatile markets

• **Balanced Mode** (Recommended)
  - Position size: 30% of capital
  - Stop loss: 5%
  - Best for: Most market conditions

• **Aggressive Mode** (Experienced only)
  - Position size: 60% of capital
  - Stop loss: 15%
  - Best for: High conviction trades

Remember: Never risk more than you can afford to lose. Start with paper trading to test strategies.`;
    }

    if (lower.includes('help') || lower.includes('command')) {
        return `🤖 **GSwap Trader Help**

I can assist you with trading on GSwap DEX. Here are some things you can ask me:

**Market Analysis:**
• "Analyze GALA/GWETH market"
• "What's the current market trend?"
• "Should I buy or sell?"

**Strategy Help:**
• "Explain trading strategies"
• "Which strategy for current market?"
• "How to optimize my configuration?"

**Commands:**
• \`/start\` - Start trading
• \`/stop\` - Stop trading
• \`/stats\` - View statistics
• \`/risk <level>\` - Set risk level
• \`/help\` - Show all commands

What would you like to know?`;
    }

    // Default response
    return `I'm here to help you optimize your GSwap trading strategy. You can:

• Ask about market conditions
• Get trading strategy advice
• Learn about risk management
• Configure your trading bot

Try asking: "What's the best strategy for current market conditions?" or use \`/help\` to see available commands.`;
}