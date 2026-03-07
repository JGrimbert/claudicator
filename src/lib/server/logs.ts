import { EventEmitter } from "events";

export type Log = {
    ts: string;
    level: "INFO" | "SUCCESS" | "ERROR";
    message: string;
};

export const logEmitter = new EventEmitter();
logEmitter.setMaxListeners(50);

export function emitLog(level: Log["level"], message: string) {
    const log: Log = {
        ts: new Date().toLocaleTimeString("fr-FR"),
        level,
        message
    };
    logEmitter.emit("log", log);
}
