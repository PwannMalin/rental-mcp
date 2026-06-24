export async function mcpSafe(
  action
) {
  try {

    return await action();

  } catch (error) {

    console.error(error);

    return {
      content: [
        {
          type: "text",
          text:
            `Error: ${error.message}`
        }
      ]
    };
  }
}