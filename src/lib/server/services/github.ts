import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { readFileSync } from "fs";
import { resolve } from "path";
import dotenv from "dotenv";

dotenv.config();

function getPrivateKey(): string {
    const keyPath = process.env.GITHUB_PRIVATE_KEY_PATH;
    if (keyPath) {
        return readFileSync(resolve(keyPath), "utf-8");
    }
    throw new Error("GITHUB_PRIVATE_KEY_PATH manquant dans .env");
}

function getOctokit() {
    const appId = process.env.GITHUB_APP_ID;
    const installationId = Number(process.env.GITHUB_INSTALLATION_ID);
    const privateKey = getPrivateKey();

    if (!appId || !installationId) {
        throw new Error(
            `Variables manquantes : GITHUB_APP_ID=${appId}, GITHUB_INSTALLATION_ID=${installationId}`
        );
    }

    return new Octokit({
        authStrategy: createAppAuth,
        auth: { appId, privateKey, installationId }
    });
}

export async function getIssue(owner: string, repo: string, number: number) {
    const octokit = getOctokit();
    const { data } = await octokit.issues.get({
        owner,
        repo,
        issue_number: number
    });
    return data;
}

export async function getIssues(owner: string, repo: string) {
    const octokit = getOctokit();
    const { data } = await octokit.issues.listForRepo({ owner, repo, state: "open" });
    return data;
}

export async function getIssuesWithBodies(owner: string, repo: string): Promise<Array<{
    number: number;
    title: string;
    body: string | null;
    labels: string[];
    updatedAt: string;
}>> {
    const octokit = getOctokit();
    const { data } = await octokit.issues.listForRepo({
        owner, repo, state: "open", per_page: 100
    });
    return data.map(i => ({
        number:    i.number,
        title:     i.title,
        body:      i.body ?? null,
        labels:    i.labels.map(l => typeof l === "string" ? l : (l.name ?? "")),
        updatedAt: i.updated_at,
    }));
}

export async function getRepoFile(owner: string, repo: string, path: string): Promise<string> {
    const octokit = getOctokit();
    const { data } = await octokit.repos.getContent({ owner, repo, path });
    if (Array.isArray(data) || data.type !== "file") throw new Error("Not a file");
    return Buffer.from(data.content, "base64").toString("utf-8");
}

export async function createIssue(owner: string, repo: string, title: string, body: string) {
    const octokit = getOctokit();
    const { data } = await octokit.issues.create({ owner, repo, title, body });
    return data;
}

export async function getSubIssues(owner: string, repo: string, number: number) {
    const octokit = getOctokit();
    const { data } = await octokit.request(
        "GET /repos/{owner}/{repo}/issues/{issue_number}/sub_issues",
        {
            owner,
            repo,
            issue_number: number,
            headers: { "X-GitHub-Api-Version": "2022-11-28" }
        }
    );
    return data as Array<{ number: number; title: string; state: string }>;
}

export async function listAccessibleRepos() {
    const octokit = getOctokit();
    const { data } = await octokit.apps.listReposAccessibleToInstallation({ per_page: 100 });
    return data.repositories.map(r => ({
        name:     r.name,
        fullName: r.full_name,
        owner:    r.owner.login,
        private:  r.private,
    }));
}

export async function findOpenPullRequest(owner: string, repo: string, head: string, base: string) {
    const octokit = getOctokit();
    const { data } = await octokit.pulls.list({ owner, repo, state: "open", head: `${owner}:${head}`, base });
    return data[0] ?? null;
}

export async function createPullRequest(
    owner: string, repo: string,
    title: string, body: string,
    head: string, base: string
) {
    const octokit = getOctokit();
    const { data } = await octokit.pulls.create({ owner, repo, title, body, head, base });
    return data;
}

export async function mergePullRequest(owner: string, repo: string, pullNumber: number) {
    const octokit = getOctokit();
    const { data } = await octokit.pulls.merge({ owner, repo, pull_number: pullNumber, merge_method: "squash" });
    return data;
}

export async function closeIssue(owner: string, repo: string, issueNumber: number): Promise<void> {
    const octokit = getOctokit();
    await octokit.issues.update({ owner, repo, issue_number: issueNumber, state: "closed" });
}

export async function createIssueComment(issueNumber: number, body: string) {
    const { getCurrentProject } = await import("./projects");
    const project = getCurrentProject();
    const owner = project?.owner ?? process.env.TARGET_OWNER!;
    const repo  = project?.repo  ?? process.env.TARGET_REPO!;
    const octokit = getOctokit();
    const { data } = await octokit.issues.createComment({
        owner, repo, issue_number: issueNumber, body
    });
    return data;
}
