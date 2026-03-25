/** Processus — registre taskId → ChildProcess actif (stdin/stdout) */
import { spawn } from "child_process";
import { EventEmitter } from "events";
import type { ChildProcess } from "child_process";

// Ancrer dans globalThis pour survivre aux HMR reloads en mode dev
const g = globalThis as any;
if (!g.__claudicatorProcs)   g.__claudicatorProcs   = new Map<string, ChildProcess>();
if (!g.__claudicatorLogBus)  g.__claudicatorLogBus  = new Map<string, EventEmitter>();

/** Map taskId → process en cours d'exécution */
const active: Map<string, ChildProcess>  = g.__claudicatorProcs;
const logBus: Map<string, EventEmitter>  = g.__claudicatorLogBus;

/** Enregistre un processus actif */
export function register(taskId: string, proc: ChildProcess) {
    active.set(taskId, proc);
}

/** Supprime un processus de la map */
export function unregister(taskId: string) {
    active.delete(taskId);
}

/** Retourne le processus associé */
export function getProcess(taskId: string): ChildProcess | undefined {
    return active.get(taskId);
}

/** Vérifie si un processus est actif */
export function isRunning(taskId: string): boolean {
    return active.has(taskId);
}

/** Envoie du texte au stdin du process (pour répondre à Claude). */
export function writeInput(taskId: string, input: string): boolean {
    const proc = active.get(taskId);
    if (!proc?.stdin) return false;
    proc.stdin.write(input + "\n");
    return true;
}

/** Retourne (ou crée) l'EventEmitter de fan-out des logs pour une task. */
export function getLogBus(taskId: string): EventEmitter {
    if (!logBus.has(taskId)) logBus.set(taskId, new EventEmitter());
    return logBus.get(taskId)!;
}

/** Supprime l'EventEmitter de fan-out (fin de run). */
export function clearLogBus(taskId: string): void {
    const bus = logBus.get(taskId);
    if (bus) { bus.removeAllListeners(); logBus.delete(taskId); }
}

/**
 * Termine le process et ses enfants.
 * Sur Windows, `proc.kill()` seul ne tue pas l'arbre — on utilise taskkill.
 */
export function killProcess(taskId: string): boolean {
    const proc = active.get(taskId);
    if (!proc) return false;
    if (process.platform === "win32" && proc.pid) {
        spawn("taskkill", ["/F", "/T", "/PID", String(proc.pid)], { shell: false });
    } else {
        proc.kill("SIGTERM");
    }
    active.delete(taskId);
    return true;
}
