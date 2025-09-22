import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { messages, message } = await request.json();

        // Build conversation history for OpenAI
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

        if (!OPENAI_API_KEY) {
            // No API key configured
            return json({
                content: '⚠️ OpenAI API is not configured. Please add your OpenAI API key to the .env file (VITE_OPENAI_API_KEY) to enable AI chat functionality.'
            });
        }

        // Add system prompt to messages for OpenAI
        const messagesWithSystem = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory
        ];

        // Call OpenAI API
        const response = await fetch(OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4-turbo-preview',
                messages: messagesWithSystem,
                max_tokens: 1024,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenAI API error:', errorText);

            // Parse error to provide better feedback
            try {
                const errorData = JSON.parse(errorText);
                if (errorData.error?.message?.includes('quota') || errorData.error?.message?.includes('limit')) {
                    return json({
                        content: '❌ Your OpenAI API quota has been exceeded. Please check your usage at https://platform.openai.com/usage'
                    });
                } else if (errorData.error?.type === 'invalid_request_error' && errorData.error?.code === 'invalid_api_key') {
                    return json({
                        content: '❌ Invalid OpenAI API key. Please check your API key in the .env file.'
                    });
                }
            } catch (e) {
                // Failed to parse error, continue with generic error
            }

            return json({
                content: '❌ Failed to connect to OpenAI API. Please check your API configuration and try again.'
            });
        }

        const data = await response.json();

        // Extract the content from OpenAI's response
        const content = data.choices?.[0]?.message?.content || 'Sorry, I couldn\'t generate a response.';

        return json({ content });

    } catch (error) {
        console.error('Chat API error:', error);

        // Return error message
        return json({
            content: '❌ An error occurred while processing your message. Please check the console for details.'
        });
    }
};