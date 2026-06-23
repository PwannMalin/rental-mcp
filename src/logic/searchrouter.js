/**
 * searchRouter.js
 * MCP-style unified search orchestration layer
 */

import { v4 as uuidv4 } from "uuid";

/**
 * Standard response envelope for all search operations
 */
function createResponse({ success, data = null, error = null, meta = {} }) {
    return {
        success,
        data,
        error,
        meta: {
            requestId: uuidv4(),
            timestamp: new Date().toISOString(),
            ...meta
        }
    };
}

/**
 * Normalize raw tool responses into consistent format
 */
function normalizeResult(source, payload) {
    return {
        source,
        payload,
        confidence: payload?.confidence ?? 1,
        timestamp: new Date().toISOString()
    };
}

/**
 * Safe execution wrapper
 */
async function safeExecute(fn, context = "unknown") {
    try {
        return await fn();
    } catch (err) {
        return {
            source: context,
            error: err.message || "Unknown error",
            stack: err.stack
        };
    }
}

/**
 * Core search router
 * Routes requests to correct MCP tools / APIs / handlers
 */
export async function searchRouter(query, context = {}) {
    if (!query || typeof query !== "string") {
        return createResponse({
            success: false,
            error: "Invalid query provided",
            meta: { context }
        });
    }

    const normalizedQuery = query.trim().toLowerCase();

    const results = [];

    // ---------------------------
    // 1. Power Automate route
    // ---------------------------
    if (normalizedQuery.includes("flow") || normalizedQuery.includes("power automate")) {
        const result = await safeExecute(async () => {
            return await context.powerAutomate?.runFlow(query, context);
        }, "powerAutomate");

        results.push(normalizeResult("powerAutomate", result));
    }

    // ---------------------------
    // 2. GitHub route
    // ---------------------------
    if (
        normalizedQuery.includes("repo") ||
        normalizedQuery.includes("github") ||
        normalizedQuery.includes("git")
    ) {
        const result = await safeExecute(async () => {
            return await context.github?.searchRepo(query, context);
        }, "github");

        results.push(normalizeResult("github", result));
    }

    // ---------------------------
    // 3. MCP tool registry route
    // ---------------------------
    if (
        normalizedQuery.includes("tool") ||
        normalizedQuery.includes("mcp") ||
        context.forceMCP
    ) {
        const result = await safeExecute(async () => {
            return await context.mcp?.searchTools(query, context);
        }, "mcp");

        results.push(normalizeResult("mcp", result));
    }

    // ---------------------------
    // 4. Database fallback route
    // ---------------------------
    if (results.length === 0) {
        const result = await safeExecute(async () => {
            return await context.db?.search(query, context);
        }, "database");

        results.push(normalizeResult("database", result));
    }

    // ---------------------------
    // Rank + sort results
    // ---------------------------
    const ranked = results
        .filter(r => !r.error)
        .sort((a, b) => b.confidence - a.confidence);

    // ---------------------------
    // Build final response
    // ---------------------------
    return createResponse({
        success: ranked.length > 0,
        data: {
            query: query,
            results: ranked,
            topResult: ranked[0] || null
        },
        meta: {
            routeCount: results.length,
            sourcesUsed: results.map(r => r.source)
        }
    });
}

/**
 * Optional: exportable debug helper
 */
export function debugRouterInput(query, context) {
    return {
        query,
        contextKeys: Object.keys(context || {}),
        normalized: query?.trim()?.toLowerCase?.()
    };
}