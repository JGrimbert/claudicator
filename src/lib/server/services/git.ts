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
