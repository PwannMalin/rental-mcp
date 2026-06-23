import { v4 as uuidv4 } from "uuid";

/**
 * Create a standard MCP response envelope
 */
export function mcpResponse({
    success = true,
    data = null,
    error = null,
    source = "unknown",
    confidence = 1
}) {
    return {
        success,
        data,
        error,
        meta: {
            source,
            confidence,
            requestId: uuidv4(),
            timestamp: new Date().toISOString()
        }
    };
}

/**
 * Wrap async tool execution safely
 */
export async function wrapTool(fn, source = "unknown") {
    try {
        const result = await fn();

        return mcpResponse({
            success: true,
            data: result,
            error: null,
            source,
            confidence: result?.confidence ?? 1
        });

    } catch (err) {
        return mcpResponse({
            success: false,
            data: null,
            error: err.message || "Unknown error",
            source,
            confidence: 0
        });
    }
}