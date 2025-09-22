import { writable, derived, get } from 'svelte/store';

export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    isTyping?: boolean;
    command?: string; // For slash commands
}

export interface QuickAction {
    label: string;
    prompt: string;
    icon: string;
}

// Chat messages store
export const messages = writable<Message[]>([]);

// Loading state
export const isLoading = writable(false);

// Quick actions for common trading queries
export const quickActions: QuickAction[] = [
    { label: 'Start Trading', prompt: '/start', icon: '🚀' },
    { label: 'Stop Trading', prompt: '/stop', icon: '🛑' },
    { label: 'Show Stats', prompt: '/stats', icon: '📊' },
    { label: 'Set Risk', prompt: '/risk balanced', icon: '⚖️' },
    { label: 'Paper Mode', prompt: '/paper on', icon: '📝' },
    { label: 'Live Mode', prompt: '/paper off', icon: '💰' },
    { label: 'Market Analysis', prompt: 'Analyze the current GALA/GWETH market conditions', icon: '🔍' },
    { label: 'Strategy Help', prompt: 'Explain the available trading strategies', icon: '💡' }
];

// Slash commands
export const slashCommands = {
    '/help': 'Show available commands',
    '/start': 'Start trading with current configuration',
    '/stop': 'Stop trading',
    '/stats': 'Show trading statistics',
    '/balance': 'Show wallet balance',
    '/config': 'Show current trading configuration',
    '/risk <level>': 'Set risk level (safe, balanced, aggressive)',
    '/strategy <type>': 'Set trading strategy (trend, mean-reversion, range)',
    '/speed <speed>': 'Set trading speed (fast, normal, slow)',
    '/paper <on/off>': 'Toggle paper trading mode',
    '/pool <id>': 'Select a liquidity pool',
    '/refresh': 'Refresh wallet balances and pools',
    '/clear': 'Clear chat history'
};

// Add a message to the chat
export function addMessage(message: Omit<Message, 'id' | 'timestamp'>) {
    const newMessage: Message = {
        ...message,
        id: crypto.randomUUID(),
        timestamp: new Date()
    };
    messages.update(msgs => [...msgs, newMessage]);
    return newMessage;
}

// Add typing indicator
export function addTypingIndicator() {
    const typingMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isTyping: true
    };
    messages.update(msgs => [...msgs, typingMessage]);
    return typingMessage.id;
}

// Remove typing indicator
export function removeTypingIndicator() {
    messages.update(msgs => msgs.filter(m => !m.isTyping));
}

// Clear all messages
export function clearMessages() {
    messages.set([]);
}

// Add welcome message
export function addWelcomeMessage() {
    addMessage({
        role: 'assistant',
        content: `Welcome to GSwap Trader AI Assistant! 🤖

I'm powered by Claude Opus and can help you with:
• Trading configuration and strategy
• Market analysis and insights
• Managing your trading bot
• Understanding GSwap DEX features

Try these quick commands:
• \`/help\` - Show all available commands
• \`/start\` - Start trading
• \`/stats\` - View trading statistics

Or ask me anything about GSwap trading!`
    });
}

// Parse slash command from message
export function parseCommand(message: string): { command: string; args: string[] } | null {
    if (!message.startsWith('/')) return null;

    const parts = message.split(' ');
    const command = parts[0];
    const args = parts.slice(1);

    return { command, args };
}

// Check if message is a valid command
export function isValidCommand(command: string): boolean {
    return Object.keys(slashCommands).some(cmd =>
        cmd === command || cmd.startsWith(command.split(' ')[0])
    );
}