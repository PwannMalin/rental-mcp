export function formatCopilotResponse(result) {
    if (!result) {
        return {
            success: false,
            message: "No result was returned from the MCP server."
        };
    }

    if (!result.success) {
        return {
            success: false,
            message: `The workflow failed${result.failedStep ? ` at step ${result.failedStep}` : ""}.`,
            error: result.error || "Unknown error",
            trace: result.trace || []
        };
    }

    if (result.workflow === "rentalQuoteWorkflow") {
        const completedSteps = (result.trace || [])
            .filter(step => step.success)
            .map(step => {
                if (step.step === "searchRentalData") {
                    return "Searched rental/customer data";
                }

                if (step.step === "submitQuoteWorkflow") {
                    return "Submitted rental quote workflow";
                }

                return `Completed ${step.step}`;
            });

        return {
            success: true,
            message: "Rental quote workflow completed successfully.",
            summary: completedSteps,
            workflow: result.workflow,
            data: result.data,
            trace: result.trace
        };
    }

    return {
        success: result.success,
        message: result.message || "Tool completed successfully.",
        data: result.data,
        trace: result.trace || []
    };
}