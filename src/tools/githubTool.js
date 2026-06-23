export function githubTool(context = {}) {
    return {
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
    };
}