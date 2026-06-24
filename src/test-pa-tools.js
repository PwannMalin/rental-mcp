import "dotenv/config";

import { createRegistry } from "./logic/toolBootstrap.js";

const registry = createRegistry({});

const headerResult = await registry.execute("requestHeader.execute", {
    Command: "CREATE",
    rowInfo: {
        RequestSource: "MCP Test",
        CustomerName: "ABC Construction",
        Status: "Testing"
    }
});

console.log("HEADER RESULT");
console.log(JSON.stringify(headerResult, null, 2));

const lineResult = await registry.execute("requestLine.execute", {
    Command: "CREATE",
    lines: [
        {
            EquipmentType: "Forklift",
            Quantity: 2,
            DurationDays: 30
        },
        {
            EquipmentType: "Pallet Jack",
            Quantity: 1,
            DurationDays: 30
        }
    ]
});

console.log("LINE RESULT");
console.log(JSON.stringify(lineResult, null, 2));