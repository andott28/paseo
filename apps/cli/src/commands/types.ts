export type CommandHandler = (args: string[]) => Promise<void>;
export type CommandRegistry = Record<string, CommandHandler>;
