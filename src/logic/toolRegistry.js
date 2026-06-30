import { wrapTool } from "./mcpResponse.js";

/**
 * MCP Tool Registry
 * Centralized tool discovery + scored execution layer
 */
export class ToolRegistry {
    constructor() {
        this.tools = new Map();
    }

    register({
        name,
        description = "",
        tags = [],
        aliases = [],
        examples = [],
        handler,
        schema = null,
        confidence = 1
    }) {
        if (!name || !handler) {
            throw new Error("Tool must have name and handler");
        }

        this.tools.set(name, {
            name,
            description,
            tags,
            aliases,
            examples,
            handler,
            schema,
            confidence
        });
    }

    get(name) {
        return this.tools.get(name);
    }

    list() {
        return Array.from(this.tools.values()).map(t => ({
            name: t.name,
            description: t.description,
            tags: t.tags,
            aliases: t.aliases,
            examples: t.examples
        }));
    }

    normalize(value = "") {
        return String(value)
            .toLowerCase()
            .replace(/[^\w\s.-]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    tokenize(value = "") {
        return this.normalize(value)
            .split(" ")
            .filter(Boolean)
            .filter(word => word.length > 2);
    }

    scoreTool(tool, query) {
        const normalizedQuery = this.normalize(query);
        const queryTokens = this.tokenize(query);

        const name = this.normalize(tool.name);
        const description = this.normalize(tool.description);
        const tags = (tool.tags || []).map(t => this.normalize(t));
        const aliases = (tool.aliases || []).map(a => this.normalize(a));
        const examples = (tool.examples || []).map(e => this.normalize(e));

        let score = 0;
        const reasons = [];

        if (normalizedQuery.includes(name)) {
            score += 100;
            reasons.push("query contains tool name");
        }

        for (const alias of aliases) {
            if (alias && normalizedQuery.includes(alias)) {
                score += 80;
                reasons.push(`matched alias: ${alias}`);
            }
        }

        for (const tag of tags) {
            if (tag && normalizedQuery.includes(tag)) {
                score += 50;
                reasons.push(`matched tag: ${tag}`);
            }
        }

        for (const token of queryTokens) {
            if (name.includes(token)) {
                score += 20;
            }

            if (description.includes(token)) {
                score += 10;
            }

            if (tags.some(tag => tag.includes(token))) {
                score += 15;
            }

            if (aliases.some(alias => alias.includes(token))) {
                score += 20;
            }

            if (examples.some(example => example.includes(token))) {
                score += 15;
            }
        }

        if (
            normalizedQuery.includes("create") ||
            normalizedQuery.includes("generate") ||
            normalizedQuery.includes("make") ||
            normalizedQuery.includes("build")
        ) {
            if (
                tags.includes("quote") ||
                tags.includes("workflow") ||
                tags.includes("rental quote") ||
                aliases.some(a => a.includes("create") || a.includes("generate"))
            ) {
                score += 35;
                reasons.push("create/generate intent boost");
            }
        }

        if (
            normalizedQuery.includes("list") ||
            normalizedQuery.includes("show") ||
            normalizedQuery.includes("all")
        ) {
            if (
                tags.includes("records") ||
                tags.includes("search") ||
                aliases.some(a => a.includes("list") || a.includes("show"))
            ) {
                score += 35;
                reasons.push("list/show intent boost");
            }
        }

        if (
            normalizedQuery.includes("flow") ||
            normalizedQuery.includes("power automate") ||
            normalizedQuery.includes("approval") ||
            normalizedQuery.includes("laserfiche") ||
            normalizedQuery.includes("workflow")
        ) {
            if (
                tags.includes("power automate") ||
                tags.includes("flow") ||
                tags.includes("workflow") ||
                tags.includes("laserfiche")
            ) {
                score += 45;
                reasons.push("workflow/Power Automate intent boost");
            }
        }

        return {
            tool,
            score,
            confidence: Math.min(score / 100, 1),
            reasons
        };
    }

    search(query, minimumScore = 20) {
        return Array.from(this.tools.values())
            .map(tool => this.scoreTool(tool, query))
            .filter(match => match.score >= minimumScore)
            .sort((a, b) => b.score - a.score);
    }

    async execute(name, input = {}, context = {}) {
    console.log("🛠️ ToolRegistry.execute:", name);
    console.log("📥 Tool input:", JSON.stringify(input));

    const tool = this.tools.get(name);

    if (!tool) {
        console.error("❌ Tool not found:", name);

        return wrapTool(async () => {
            throw new Error(`Tool not found: ${name}`);
        }, "toolRegistry");
    }

    console.log("✅ Executing:", tool.name);

    return wrapTool(async () => {
        return await tool.handler(input, context);
    }, name);
}

    async route(query, context = {}) {
        const matches = this.search(query);

        if (matches.length === 0) {
            return wrapTool(async () => {
                throw new Error(`No matching tool found for query: ${query}`);
            }, "toolRegistry");
        }

        const best = matches[0];

        const result = await this.execute(
            best.tool.name,
            {
                query,
                routedTool: best.tool.name,
                routerScore: best.score,
                routerConfidence: best.confidence,
                routerReasons: best.reasons
            },
            context
        );

        return {
            ...result,
            routing: {
                selectedTool: best.tool.name,
                score: best.score,
                confidence: best.confidence,
                reasons: best.reasons,
                candidates: matches.slice(0, 5).map(m => ({
                    name: m.tool.name,
                    score: m.score,
                    confidence: m.confidence,
                    reasons: m.reasons
                }))
            }
        };
    }
}