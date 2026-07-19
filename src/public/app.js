const chat =
    document.getElementById("chat");

document
    .getElementById("send")
    .addEventListener("click", sendMessage);

async function sendMessage() {

    const input =
        document.getElementById("message");

    const text =
        input.value;

    if (!text) return;

    addMessage("user", text);

    input.value = "";

    const response =
        await fetch("/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: text
            })
        });

    const result =
        await response.json();

    addMessage(
        "assistant",
        result.answer || "No response"
    );
}

function addMessage(role, text) {

    const div =
        document.createElement("div");

    div.className =
        `message ${role}`;

    div.textContent =
        text;

    chat.appendChild(div);

    chat.scrollTop =
        chat.scrollHeight;
}