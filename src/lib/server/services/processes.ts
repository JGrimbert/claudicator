import { spawn } from "child_process";
import type { ChildProcess } from "child_process";

/** Map taskId → process en cours d'exécution */
const active = new Map<string, ChildProcess>();

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
