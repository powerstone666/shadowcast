type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

type Meta = Record<string, unknown>;

export class Logger {
  private readonly context: string;
  private readonly minLevel: LogLevel;

  constructor(context = "app", minLevel: LogLevel = Logger.readLogLevel()) {
    this.context = context;
    this.minLevel = minLevel;
  }

  debug(message: string, meta?: Meta): void {
    this.write("debug", message, meta);
  }

  info(message: string, meta?: Meta): void {
    this.write("info", message, meta);
  }

  warn(message: string, meta?: Meta): void {
    this.write("warn", message, meta);
  }

  error(message: string, meta?: Meta): void {
    this.write("error", message, meta);
  }

  child(context: string): Logger {
    return new Logger(`${this.context}:${context}`, this.minLevel);
  }

  private write(level: LogLevel, message: string, meta?: Meta): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) {
      return;
    }

    const payload = {
      time: new Date().toISOString(),
      level,
      context: this.context,
      message,
      ...(meta ? { meta } : {}),
    };

    const line = JSON.stringify(payload);

    if (level === "error") {
      console.error(line);
      return;
    }

    if (level === "warn") {
      console.warn(line);
      return;
    }

    console.log(line);
  }

  private static readLogLevel(): LogLevel {
    const raw = process.env.LOG_LEVEL?.toLowerCase();
    if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
      return raw;
    }
    return "info";
  }
}
