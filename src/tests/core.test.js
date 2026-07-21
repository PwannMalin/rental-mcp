import test from "node:test";
import assert from "node:assert/strict";

import { createRegistry } from "../logic/toolBootstrap.js";
import { dbTool } from "../tools/dbTool.js";
import { requestHeaderTool } from "../tools/requestHeaderTool.js";
import { requestLineTool } from "../tools/requestLineTool.js";

test("createRegistry registers request tools", () => {
    const { registry } = createRegistry({});

    assert.ok(registry.get("requestHeader.execute"), "request header tool should be registered");
    assert.ok(registry.get("requestLine.execute"), "request line tool should be registered");
});

test("dbTool returns a structured result for a search query", async () => {
    const fakeQuery = async (sql, params) => [
        { id: 1, name: "ABC Construction", description: "Rental quote" }
    ];

    const tool = dbTool({ db: { query: fakeQuery } });
    const result = await tool.handler({ query: "ABC Construction" });

    assert.equal(result.count, 1);
    assert.equal(result.query, "ABC Construction");
    assert.ok(Array.isArray(result.rows));
});

test("requestHeaderTool rejects invalid commands", async () => {
    const tool = requestHeaderTool({});

    await assert.rejects(
        () => tool.handler({ Command: "BAD" }),
        /Invalid request header command/
    );
});

test("requestLineTool requires rowID for update commands", async () => {
    const tool = requestLineTool({});

    await assert.rejects(
        () => tool.handler({ Command: "UPDATE" }),
        /requires rowID/
    );
});
