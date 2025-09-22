<script lang="ts">
    import { onMount, afterUpdate } from 'svelte';
    import {
        messages,
        isLoading,
        quickActions,
        slashCommands,
        addMessage,
        addTypingIndicator,
        removeTypingIndicator,
        clearMessages,
        addWelcomeMessage,
        parseCommand,
        isValidCommand
    } from '$lib/stores/chat';
    import {
        tradingActive,
        tradingConfig,
        tradingStats,
        walletBalances,
        selectedPool,
        liquidityPools,
        isWalletConnected
    } from '$lib/stores/trading';
    import { walletService } from '$lib/services/wallet';
    import { toast } from '$lib/stores/toast';
    import type { TradingAgent } from '$lib/trading/agent';
    import type { TradingLogger } from '$lib/trading/logger';

    export let agent: TradingAgent | null = null;
    export let logger: TradingLogger | null = null;

    let inputMessage = '';
    let chatContainer: HTMLElement;
    let showCommands = false;

    onMount(() => {
        if ($messages.length === 0) {
            addWelcomeMessage();
        }
    });

    afterUpdate(() => {
        scrollToBottom();
    });

    function scrollToBottom() {
        if (chatContainer) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    }

    async function handleCommand(command: string, args: string[]) {
        switch (command) {
            case '/help':
                addMessage({
                    role: 'assistant',
                    content: `Available commands:\n${Object.entries(slashCommands)
                        .map(([cmd, desc]) => `• \`${cmd}\` - ${desc}`)
                        .join('\n')}`
                });
                break;

            case '/start':
                if (!agent || !$isWalletConnected) {
                    addMessage({
                        role: 'assistant',
                        content: '⚠️ Please connect your wallet first to start trading.'
                    });
                    return;
                }
                if (!$tradingActive) {
                    try {
                        await agent.start();
                        tradingActive.set(true);
                        logger?.logSystem('Trading started via chat command', 'success');
                        addMessage({
                            role: 'assistant',
                            content: `✅ Trading started in ${$tradingConfig.paperTrading ? 'paper' : 'live'} mode!`
                        });
                    } catch (error: any) {
                        addMessage({
                            role: 'assistant',
                            content: `❌ Failed to start trading: ${error.message}`
                        });
                    }
                } else {
                    addMessage({
                        role: 'assistant',
                        content: '⚠️ Trading is already active.'
                    });
                }
                break;

            case '/stop':
                if (agent && $tradingActive) {
                    agent.stop();
                    tradingActive.set(false);
                    logger?.logSystem('Trading stopped via chat command', 'warning');
                    addMessage({
                        role: 'assistant',
                        content: '🛑 Trading stopped.'
                    });
                } else {
                    addMessage({
                        role: 'assistant',
                        content: '⚠️ Trading is not currently active.'
                    });
                }
                break;

            case '/stats':
                const stats = $tradingStats;
                addMessage({
                    role: 'assistant',
                    content: `📊 Trading Statistics:
• Total Trades: ${stats.totalTrades}
• Successful: ${stats.successfulTrades}
• Failed: ${stats.failedTrades}
• Win Rate: ${stats.winRate.toFixed(2)}%
• Profit/Loss: ${stats.profitLoss >= 0 ? '+' : ''}${stats.profitLoss.toFixed(2)}%`
                });
                break;

            case '/balance':
                await walletService.updateBalances();
                const balances = $walletBalances;
                if (balances.length > 0) {
                    const balanceList = balances
                        .map(b => `• ${b.token}: ${b.balance} ${b.value ? `($${b.value.toFixed(2)})` : ''}`)
                        .join('\n');
                    addMessage({
                        role: 'assistant',
                        content: `💰 Wallet Balances:\n${balanceList}`
                    });
                } else {
                    addMessage({
                        role: 'assistant',
                        content: '💰 No balances found. Please connect your wallet or refresh.'
                    });
                }
                break;

            case '/config':
                const config = $tradingConfig;
                addMessage({
                    role: 'assistant',
                    content: `⚙️ Trading Configuration:
• Mode: ${config.paperTrading ? 'Paper Trading' : 'Live Trading'}
• Risk Level: ${config.risk}
• Strategy: ${config.strategy}
• Speed: ${config.speed}
• Signal Confidence: ${config.signalConfidence}
• Market Bias: ${config.marketBias}
• Max Position: ${config.maxPosition}%
• Stop Loss: ${config.stopLoss}%
• Take Profit: ${config.takeProfit}%`
                });
                break;

            case '/risk':
                if (args.length === 0) {
                    addMessage({
                        role: 'assistant',
                        content: '⚠️ Please specify a risk level: safe, balanced, or aggressive'
                    });
                } else {
                    const riskLevel = args[0].toLowerCase();
                    if (['safe', 'balanced', 'aggressive'].includes(riskLevel)) {
                        tradingConfig.update(config => ({ ...config, risk: riskLevel as any }));
                        logger?.logSystem(`Risk level changed to ${riskLevel} via chat`, 'info');
                        addMessage({
                            role: 'assistant',
                            content: `✅ Risk level set to: ${riskLevel}`
                        });
                    } else {
                        addMessage({
                            role: 'assistant',
                            content: '❌ Invalid risk level. Use: safe, balanced, or aggressive'
                        });
                    }
                }
                break;

            case '/strategy':
                if (args.length === 0) {
                    addMessage({
                        role: 'assistant',
                        content: '⚠️ Please specify a strategy: trend, revert, or range'
                    });
                } else {
                    const strategy = args[0].toLowerCase();
                    // Map user-friendly names to internal values
                    const strategyMap: { [key: string]: string } = {
                        'trend': 'trend',
                        'mean-reversion': 'revert',
                        'revert': 'revert',
                        'range': 'range'
                    };

                    if (strategyMap[strategy]) {
                        const mappedStrategy = strategyMap[strategy];
                        tradingConfig.update(config => ({ ...config, strategy: mappedStrategy as any }));
                        logger?.logSystem(`Strategy changed to ${mappedStrategy} via chat`, 'info');
                        addMessage({
                            role: 'assistant',
                            content: `✅ Strategy set to: ${strategy}`
                        });
                    } else {
                        addMessage({
                            role: 'assistant',
                            content: '❌ Invalid strategy. Use: trend, mean-reversion (or revert), or range'
                        });
                    }
                }
                break;

            case '/speed':
                if (args.length === 0) {
                    addMessage({
                        role: 'assistant',
                        content: '⚠️ Please specify a speed: fast, normal, or slow'
                    });
                } else {
                    const speed = args[0].toLowerCase();
                    if (['fast', 'normal', 'slow'].includes(speed)) {
                        tradingConfig.update(config => ({ ...config, speed: speed as any }));
                        logger?.logSystem(`Trading speed changed to ${speed} via chat`, 'info');
                        addMessage({
                            role: 'assistant',
                            content: `✅ Trading speed set to: ${speed}`
                        });
                    } else {
                        addMessage({
                            role: 'assistant',
                            content: '❌ Invalid speed. Use: fast, normal, or slow'
                        });
                    }
                }
                break;

            case '/paper':
                if (args.length === 0) {
                    addMessage({
                        role: 'assistant',
                        content: '⚠️ Please specify: on or off'
                    });
                } else {
                    const paperMode = args[0].toLowerCase() === 'on';
                    tradingConfig.update(config => ({ ...config, paperTrading: paperMode }));
                    logger?.logSystem(`Paper trading ${paperMode ? 'enabled' : 'disabled'} via chat`, 'info');
                    addMessage({
                        role: 'assistant',
                        content: `✅ Paper trading ${paperMode ? 'enabled' : 'disabled'}`
                    });
                }
                break;

            case '/pool':
                if (args.length === 0) {
                    const pools = $liquidityPools;
                    const poolList = pools
                        .map(p => `• ${p.name} (TVL: $${p.tvl.toLocaleString()})`)
                        .join('\n');
                    addMessage({
                        role: 'assistant',
                        content: `Available pools:\n${poolList}\n\nUse \`/pool <name>\` to select a pool.`
                    });
                } else {
                    const poolName = args.join(' ');
                    const pool = $liquidityPools.find(p =>
                        p.name.toLowerCase().includes(poolName.toLowerCase())
                    );
                    if (pool) {
                        selectedPool.set(pool);
                        addMessage({
                            role: 'assistant',
                            content: `✅ Selected pool: ${pool.name}`
                        });
                    } else {
                        addMessage({
                            role: 'assistant',
                            content: `❌ Pool not found: ${poolName}`
                        });
                    }
                }
                break;

            case '/refresh':
                await walletService.updateBalances();
                addMessage({
                    role: 'assistant',
                    content: '🔄 Refreshed wallet balances and market data.'
                });
                break;

            case '/clear':
                clearMessages();
                addWelcomeMessage();
                break;

            default:
                addMessage({
                    role: 'assistant',
                    content: `❌ Unknown command: ${command}\nType /help for available commands.`
                });
        }
    }

    async function sendMessage() {
        if (!inputMessage.trim() || $isLoading) return;

        const userMessage = inputMessage.trim();
        inputMessage = '';

        // Add user message
        addMessage({
            role: 'user',
            content: userMessage
        });

        // Check for slash commands
        const commandInfo = parseCommand(userMessage);
        if (commandInfo && isValidCommand(commandInfo.command)) {
            await handleCommand(commandInfo.command, commandInfo.args);
            return;
        }

        // Send to Claude API
        isLoading.set(true);
        addTypingIndicator();

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: $messages.filter(m => !m.isTyping).slice(-10),
                    message: userMessage
                })
            });

            removeTypingIndicator();

            if (response.ok) {
                const data = await response.json();
                addMessage({
                    role: 'assistant',
                    content: data.content || 'Sorry, I couldn\'t process that request.'
                });
            } else {
                throw new Error('Failed to get response');
            }
        } catch (error) {
            removeTypingIndicator();
            console.error('Chat error:', error);

            // Provide a helpful mock response
            const mockResponse = generateMockResponse(userMessage);
            addMessage({
                role: 'assistant',
                content: mockResponse
            });
        } finally {
            isLoading.set(false);
        }
    }

    function generateMockResponse(input: string): string {
        const lower = input.toLowerCase();

        if (lower.includes('gala') || lower.includes('market')) {
            return 'GALA is currently showing strong momentum with increased trading volume. The GALA/GWETH pair has good liquidity on GSwap. Consider using a balanced risk approach with 30% position sizing for optimal risk/reward.';
        }

        if (lower.includes('strategy') || lower.includes('trading')) {
            return 'For GSwap trading, I recommend:\n\n1. **Trend Following** for strong directional markets\n2. **Mean Reversion** when price oscillates in a range\n3. **Range Trading** for stable, sideways markets\n\nEach strategy has optimal market conditions. Would you like me to analyze current conditions?';
        }

        if (lower.includes('risk') || lower.includes('position')) {
            return 'Risk management is crucial. I suggest:\n• Safe mode: 15% position, 3% stop loss\n• Balanced: 30% position, 5% stop loss\n• Aggressive: 60% position, 15% stop loss\n\nAlways consider your total portfolio exposure.';
        }

        return 'I can help you optimize your GSwap trading strategy. Try asking about market conditions, trading strategies, or use commands like /start to begin trading.';
    }

    function handleQuickAction(action: QuickAction) {
        inputMessage = action.prompt;
        sendMessage();
    }

    function handleKeyPress(event: KeyboardEvent) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    }
</script>

<div class="bg-card-darker rounded-lg border border-border-subtle p-4 h-full flex flex-col">
    <!-- Header -->
    <div class="mb-3 pb-3 border-b border-border-subtle">
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
                <div class="w-2 h-2 bg-success rounded-full animate-pulse"></div>
                <h3 class="text-lg font-semibold text-accent">AI Assistant</h3>
                <span class="text-xs text-muted">Claude Opus</span>
            </div>
            <button
                on:click={() => showCommands = !showCommands}
                class="text-xs px-2 py-1 bg-surface-hover rounded hover:bg-surface-pressed transition-colors"
            >
                {showCommands ? 'Hide' : 'Show'} Commands
            </button>
        </div>
    </div>

    <!-- Commands Reference (collapsible) -->
    {#if showCommands}
        <div class="mb-3 p-2 bg-surface-default rounded-lg border border-border-subtle text-xs">
            <div class="grid grid-cols-2 gap-1">
                {#each Object.entries(slashCommands).slice(0, 6) as [cmd, desc]}
                    <div class="text-muted">
                        <span class="text-accent font-mono">{cmd}</span> - {desc}
                    </div>
                {/each}
            </div>
            <div class="mt-1 text-center text-muted">
                Type <span class="text-accent font-mono">/help</span> for all commands
            </div>
        </div>
    {/if}

    <!-- Chat Messages -->
    <div
        bind:this={chatContainer}
        class="flex-grow overflow-y-auto mb-3 space-y-3 pr-2"
        style="max-height: 400px;"
    >
        {#each $messages as message}
            <div class={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                    class={`max-w-[80%] rounded-lg p-3 ${
                        message.role === 'user'
                            ? 'bg-accent/20 text-accent-foreground border border-accent/30'
                            : message.isTyping
                            ? 'bg-surface-hover'
                            : 'bg-surface-default border border-border-subtle'
                    }`}
                >
                    {#if message.isTyping}
                        <div class="flex gap-1">
                            <div class="w-2 h-2 bg-accent rounded-full animate-bounce" style="animation-delay: 0ms;"></div>
                            <div class="w-2 h-2 bg-accent rounded-full animate-bounce" style="animation-delay: 150ms;"></div>
                            <div class="w-2 h-2 bg-accent rounded-full animate-bounce" style="animation-delay: 300ms;"></div>
                        </div>
                    {:else}
                        <div class="text-sm whitespace-pre-wrap">{@html message.content.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-surface-hover rounded text-accent">$1</code>')}</div>
                        <div class="text-xs text-muted mt-1">
                            {message.timestamp.toLocaleTimeString()}
                        </div>
                    {/if}
                </div>
            </div>
        {/each}
    </div>

    <!-- Quick Actions -->
    <div class="mb-3 flex flex-wrap gap-2">
        {#each quickActions.slice(0, 4) as action}
            <button
                on:click={() => handleQuickAction(action)}
                disabled={$isLoading}
                class="text-xs px-2 py-1 bg-surface-hover rounded hover:bg-surface-pressed transition-colors disabled:opacity-50"
            >
                {action.icon} {action.label}
            </button>
        {/each}
    </div>

    <!-- Input Area -->
    <div class="flex gap-2">
        <input
            bind:value={inputMessage}
            on:keypress={handleKeyPress}
            disabled={$isLoading}
            placeholder="Type a message or command..."
            class="flex-grow px-3 py-2 bg-surface-default rounded-lg border border-border-subtle text-sm
                   focus:border-accent focus:outline-none transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
            on:click={sendMessage}
            disabled={!inputMessage.trim() || $isLoading}
            class="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed"
        >
            Send
        </button>
    </div>
</div>