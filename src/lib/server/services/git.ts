/** Git — opérations sur le dépôt cible (branches, commits, diff, push) */
import simpleGit from "simple-git";

const git = simpleGit();

/** Crée et bascule sur une nouvelle branche locale. */
export async function createBranch(name: string) {
    await git.checkoutLocalBranch(name);
}

/** Stague les fichiers donnés et crée un commit. */
export async function commit(files: string[], message: string) {
    await git.add(files);
    await git.commit(message);
}

/** Extrait owner et repo depuis l'URL remote origin (SSH ou HTTPS). */
export async function getRemoteRepo() {
    const remote = (await git.remote(["get-url", "origin"]) || "").trim().replace(/\.git$/, "");
    // SSH: git@github.com:owner/repo
    const ssh = remote.match(/:([^/]+)\/(.+)$/);
    if (ssh) return { owner: ssh[1], repo: ssh[2] };
    // HTTPS: https://github.com/owner/repo
    const parts = remote.split("/");
    return {
        owner: parts[parts.length - 2],
        repo: parts[parts.length - 1]
    };
}

/** Retourne le diff staged et unstaged d'un dépôt. */
export async function getDiff(root: string): Promise<string> {
    const g = simpleGit(root);
    const staged   = await g.diff(["--cached"]);
    const unstaged = await g.diff();
    return (staged + unstaged).trim();
}

/** Stague tous les fichiers et crée un commit. */
export async function commitAll(root: string, message: string): Promise<void> {
    const g = simpleGit(root);
    await g.add(["-A"]);
    await g.commit(message);
}

/** Annule toutes les modifications et fichiers non commités. */
export async function revertAll(root: string): Promise<void> {
    const g = simpleGit(root);
    await g.raw(["checkout", "."]);
    await g.raw(["clean", "-fd"]);
}

/** Pousse une branche vers origin avec suivi automatique. */
export async function pushBranch(root: string, branch: string): Promise<void> {
    const g = simpleGit(root);
    await g.push("origin", branch, ["--set-upstream"]);
}

/** Vérifie si une branche est pushée et/ou mergée sur main. */
export async function getBranchState(root: string, branch: string): Promise<{ pushed: boolean; merged: boolean }> {
    const g = simpleGit(root);
    const remote = await g.branch(["-r"]);
    const pushed = remote.all.some(b => b.trim() === `origin/${branch}`);
    const main = await getMainBranch(root);
    const mergedResult = await g.branch(["--merged", main]);
    const merged = mergedResult.all.map(b => b.trim()).includes(branch);
    return { pushed, merged };
}

/** Retourne "main" ou "master" selon la branche existante. */
export async function getMainBranch(root: string): Promise<string> {
    const g = simpleGit(root);
    const branches = await g.branchLocal();
    return branches.all.includes("main") ? "main" : "master";
}

/** Merge une branche dans main/master */
export async function mergeBranch(root: string, branch: string): Promise<void> {
    const g = simpleGit(root);
    const branches = await g.branchLocal();
    const mainBranch = branches.all.includes("main") ? "main" : "master";
    await g.checkout(mainBranch);
    await g.merge(["--no-ff", branch]);
}

/** Bascule sur la branche principale et la met à jour */
export async function checkoutMain(root: string): Promise<void> {
    const g = simpleGit(root);
    const main = await getMainBranch(root);
    await g.checkout(main);
    await g.pull("origin", main);
}

/** Retourne le SHA du commit HEAD d'un dépôt. */
export async function getHeadCommit(root: string): Promise<string> {
    const g = simpleGit(root);
    const log = await g.log({ "--max-count": "1" } as any);
    return log.latest?.hash ?? "";
}

/** Retourne les N derniers commits d'un dépôt. */
export async function getCommitLog(
    root:  string,
    limit: number = 200
): Promise<{ sha: string; message: string; date: string; author: string }[]> {
    const g = simpleGit(root);
    const log = await g.log({ "--max-count": String(limit) } as any);
    return log.all.map(c => ({
        sha:     c.hash,
        message: c.message,
        date:    c.date,
        author:  c.author_name,
    }));
}

/** Retourne la liste des fichiers modifiés par un commit. */
export async function getCommitFiles(root: string, sha: string): Promise<string[]> {
    const g = simpleGit(root);
    const out = await g.raw(["diff-tree", "--no-commit-id", "-r", "--name-only", sha]);
    return out.trim().split("\n").filter(Boolean);
}
