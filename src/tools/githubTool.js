const DEFAULT_OWNER = "PwannMalin";
const DEFAULT_REPO = "rental-mcp";
const DEFAULT_BASE_BRANCH = "main";

function getGitHubToken() {
    const token = process.env.GITHUB_TOKEN;

    if (!token) {
        throw new Error("GITHUB_TOKEN is not configured.");
    }

    return token;
}

async function githubFetch(path, options = {}) {
    const token = getGitHubToken();

    const response = await fetch(`https://api.github.com${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    const text = await response.text();

    let data;
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { raw: text };
    }

    if (!response.ok) {
        throw new Error(
            `GitHub API error ${response.status}: ${JSON.stringify(data)}`
        );
    }

    return data;
}

function normalizeBranchName(branchName) {
    if (!branchName) {
        throw new Error("branchName is required.");
    }

    return String(branchName)
        .trim()
        .replace(/\s+/g, "-")
        .replace(/^refs\/heads\//, "");
}

const searchRepoTool = context => ({
    name: "github.searchRepo",
    description:
        "Search GitHub repositories, code, issues, pull requests, and documentation.",
    tags: [
        "github",
        "repo",
        "repository",
        "git",
        "code",
        "issue",
        "pull request",
        "documentation"
    ],
    aliases: [
        "search github",
        "search repo",
        "find code",
        "look in github",
        "repo search",
        "find repository",
        "search source code"
    ],
    examples: [
        "search github for database connection code",
        "find repo documentation",
        "look for MCP server code",
        "search source code for runFlow"
    ],

    async handler(input = {}) {
        const query = input.query || "";

        if (!context.githubApi?.searchRepositories) {
            throw new Error("GitHub API search handler is not configured.");
        }

        const res = await context.githubApi.searchRepositories(query);

        return {
            items: res.items || [],
            count: res.total_count || 0,
            query,
            confidence: res.total_count > 0 ? 0.9 : 0.4
        };
    }
});

const listBranchesTool = () => ({
    name: "github.listBranches",
    description: "List branches in the rental-mcp GitHub repository.",
    tags: ["github", "branch", "list"],

    async handler(input = {}) {
        const owner = input.owner || DEFAULT_OWNER;
        const repo = input.repo || DEFAULT_REPO;

        const branches = await githubFetch(
            `/repos/${owner}/${repo}/branches`
        );

        return {
            owner,
            repo,
            count: branches.length,
            branches: branches.map(branch => ({
                name: branch.name,
                sha: branch.commit?.sha
            }))
        };
    }
});

const createBranchTool = () => ({
    name: "github.createBranch",
    description:
        "Create a new GitHub branch from an existing base branch, usually main.",
    tags: ["github", "branch", "create"],

    async handler(input = {}) {
        const owner = input.owner || DEFAULT_OWNER;
        const repo = input.repo || DEFAULT_REPO;
        const baseBranch = input.baseBranch || DEFAULT_BASE_BRANCH;
        const branchName = normalizeBranchName(input.branchName);

        const baseRef = await githubFetch(
            `/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`
        );

        const baseSha = baseRef.object?.sha;

        if (!baseSha) {
            throw new Error(`Could not find SHA for base branch '${baseBranch}'.`);
        }

        const createdRef = await githubFetch(
            `/repos/${owner}/${repo}/git/refs`,
            {
                method: "POST",
                body: JSON.stringify({
                    ref: `refs/heads/${branchName}`,
                    sha: baseSha
                })
            }
        );

        return {
            success: true,
            owner,
            repo,
            baseBranch,
            branchName,
            ref: createdRef.ref,
            sha: createdRef.object?.sha,
            url: createdRef.url
        };
    }
});

const getFileTool = () => ({
    name: "github.getFile",
    description: "Get a file from the rental-mcp GitHub repository.",
    tags: ["github", "file", "read"],

    async handler(input = {}) {
        const owner = input.owner || DEFAULT_OWNER;
        const repo = input.repo || DEFAULT_REPO;
        const branch = input.branch || DEFAULT_BASE_BRANCH;
        const path = input.path;

        if (!path) {
            throw new Error("path is required.");
        }

        const file = await githubFetch(
            `/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replaceAll("%2F", "/")}?ref=${encodeURIComponent(branch)}`
        );

        const content = file.content
            ? Buffer.from(file.content, "base64").toString("utf8")
            : "";

        return {
            owner,
            repo,
            branch,
            path,
            sha: file.sha,
            content
        };
    }
});

const updateFileTool = () => ({
    name: "github.updateFile",
    description:
        "Create or update a file on a GitHub branch. Use this after creating a branch.",
    tags: ["github", "file", "commit", "update"],


    async handler(input = {}) {
        const owner = input.owner || DEFAULT_OWNER;
        const repo = input.repo || DEFAULT_REPO;
        const branch = input.branch;
        const path = input.path;
        const content = input.content;
        const message = input.message || `Update ${path}`;

        if (!branch) {
            throw new Error("branch is required.");
        }

        if (!branch || branch === "main") {
    throw new Error("github.updateFile requires a non-main branch.");
}

        if (!path) {
            throw new Error("path is required.");
        }

        if (content === undefined || content === null) {
            throw new Error("content is required.");
        }

        let existingSha = null;

        try {
            const existingFile = await githubFetch(
                `/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replaceAll("%2F", "/")}?ref=${encodeURIComponent(branch)}`
            );

            existingSha = existingFile.sha;
        } catch (err) {
            if (!String(err.message).includes("404")) {
                throw err;
            }
        }

        const body = {
            message,
            content: Buffer.from(String(content), "utf8").toString("base64"),
            branch
        };

        if (existingSha) {
            body.sha = existingSha;
        }

        const result = await githubFetch(
            `/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replaceAll("%2F", "/")}`,
            {
                method: "PUT",
                body: JSON.stringify(body)
            }
        );

        return {
            success: true,
            owner,
            repo,
            branch,
            path,
            commitSha: result.commit?.sha,
            htmlUrl: result.content?.html_url
        };
    }
});

const createPullRequestTool = () => ({
    name: "github.createPullRequest",
    description:
        "Create a pull request from a branch into main in the rental-mcp GitHub repository.",
    tags: ["github", "pull request", "pr", "create"],

    async handler(input = {}) {
        const owner = input.owner || DEFAULT_OWNER;
        const repo = input.repo || DEFAULT_REPO;
        const head = input.branch || input.head;
        const base = input.base || DEFAULT_BASE_BRANCH;
        const title = input.title;
        const body = input.body || input.description || "";

        if (!head) {
            throw new Error("branch or head is required.");
        }

        if (!title) {
            throw new Error("title is required.");
        }

        const pr = await githubFetch(
            `/repos/${owner}/${repo}/pulls`,
            {
                method: "POST",
                body: JSON.stringify({
                    title,
                    head,
                    base,
                    body
                })
            }
        );

        return {
            success: true,
            owner,
            repo,
            number: pr.number,
            title: pr.title,
            url: pr.html_url,
            head: pr.head?.ref,
            base: pr.base?.ref
        };
    }
});

export function githubTool(context = {}) {
    return [
        searchRepoTool(context),
        listBranchesTool(context),
        createBranchTool(context),
        getFileTool(context),
        updateFileTool(context),
        createPullRequestTool(context)
    ];
}

console.log("✅ GitHub tools loaded");