/**
 * Chain Engine
 * Executes multi-step MCP workflows using registered tools.
 */
export class ChainEngine {
    constructor(registry) {
        this.registry = registry;
        this.workflows = new Map();
    }

    registerWorkflow(name, steps = []) {
        if (!name || !Array.isArray(steps)) {
            throw new Error("Workflow must have a name and steps array.");
        }

        this.workflows.set(name, steps);

        console.log(
            "REGISTERED WORKFLOWS:",
            Array.from(this.workflows.keys())
        );
    }

    getWorkflow(name) {
        return this.workflows.get(name);
    }

    listWorkflows() {
        return Array.from(this.workflows.keys());
    }

    async run(name, initialInput = {}, context = {}) {
        const steps = this.getWorkflow(name);

        if (!steps) {
            return {
                success: false,
                error: `Workflow not found: ${name}`,
                workflow: name,
                trace: []
            };
        }

        const trace = [];
        let currentInput = { ...initialInput };
        let lastResult = null;

        for (const step of steps) {
            const stepName = step.name;
            const toolName = step.tool;

            const startedAt = new Date().toISOString();

            const toolInput =
                typeof step.mapInput === "function"
                    ? step.mapInput(currentInput, lastResult, context)
                    : {
                          ...currentInput,
                          previousResult: lastResult
                      };

            const result = await this.registry.execute(
                toolName,
                toolInput,
                context
            );

            const finishedAt = new Date().toISOString();

            trace.push({
                step: stepName,
                tool: toolName,
                success: result.success,
                startedAt,
                finishedAt,
                error: result.error || null
            });

            if (!result.success) {
                return {
                    success: false,
                    workflow: name,
                    error: result.error,
                    failedStep: stepName,
                    trace,
                    data: lastResult
                };
            }

            lastResult = result;

            currentInput = {
                ...currentInput,
                previousResult: lastResult,
                [`${stepName}Result`]: lastResult
            };
        }

        return {
            success: true,
            workflow: name,
            data: lastResult,
            trace,
            message: `Workflow ${name} completed successfully.`
        };
    }
}

// No changes needed here for schema-aware filtering as it is handled in searchTool.js
