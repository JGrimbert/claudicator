import simpleGit from "simple-git";

const git = simpleGit();

export async function createBranch(name: string) {
    await git.checkoutLocalBranch(name);
}

export async function commit(files: string[], message: string) {
    await git.add(files);
    await git.commit(message);
}

export async function getRemoteRepo() {
    const remote = await git.remote(["get-url", "origin"]);

    const parts = remote.trim().replace(".git", "").split("/");

    return {
        owner: parts[parts.length - 2],
        repo: parts[parts.length - 1]
    };
}

export async function getDiff(root: string): Promise<string> {
    const g = simpleGit(root);
    const staged   = await g.diff(["--cached"]);
    const unstaged = await g.diff();
    return (staged + unstaged).trim();
}

export async function commitAll(root: string, message: string): Promise<void> {
    const g = simpleGit(root);
    await g.add(["-A"]);
    await g.commit(message);
}

export async function revertAll(root: string): Promise<void> {
    const g = simpleGit(root);
    await g.raw(["checkout", "."]);
    await g.raw(["clean", "-fd"]);
}

export async function pushBranch(root: string, branch: string): Promise<void> {
    const g = simpleGit(root);
    await g.push("origin", branch, ["--set-upstream"]);
}

export async function getBranchState(root: string, branch: string): Promise<{ pushed: boolean; merged: boolean }> {
    const g = simpleGit(root);
    const remote = await g.branch(["-r"]);
    const pushed = remote.all.some(b => b.trim() === `origin/${branch}`);
    const main = await getMainBranch(root);
    const mergedResult = await g.branch(["--merged", main]);
    const merged = mergedResult.all.map(b => b.trim()).includes(branch);
    return { pushed, merged };
}

export async function getMainBranch(root: string): Promise<string> {
    const g = simpleGit(root);
    const branches = await g.branchLocal();
    return branches.all.includes("main") ? "main" : "master";
}

export async function mergeBranch(root: string, branch: string): Promise<void> {
    const g = simpleGit(root);
    const branches = await g.branchLocal();
    const mainBranch = branches.all.includes("main") ? "main" : "master";
    await g.checkout(mainBranch);
    await g.merge(["--no-ff", branch]);
}

export async function checkoutMain(root: string): Promise<void> {
    const g = simpleGit(root);
    const main = await getMainBranch(root);
    await g.checkout(main);
    await g.pull("origin", main);
}
