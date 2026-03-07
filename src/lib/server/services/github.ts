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
    const { data } = await octokit.issues.listForRepo({ owner, repo });
    return data;
}

export async function getRepoFile(owner: string, repo: string, path: string): Promise<string> {
    const octokit = getOctokit();
    const { data } = await octokit.repos.getContent({ owner, repo, path });
    if (Array.isArray(data) || data.type !== "file") throw new Error("Not a file");
    return Buffer.from(data.content, "base64").toString("utf-8");
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
