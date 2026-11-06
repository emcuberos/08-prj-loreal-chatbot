/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");
const latestQuestion = document.getElementById("latestQuestion");
let latestUserMessage = null;

// Set this to the Cloudflare Worker URL from your project setup.
const WORKER_URL = "https://loreal-chatbot.ecube004.workers.dev";

// Keep the full conversation so each request has its earlier context.
const messages = [
  {
    role: "system",
    content:
      "You are a helpful assistant for L’Oréal. You only answer questions about L’Oréal products, beauty routines, product recommendations, and related beauty topics such as makeup, skincare, haircare, and fragrance. If a user asks about anything outside of those topics, politely decline and redirect them to beauty and L’Oréal-related questions. Remember details the user shares about themselves, such as their name, skin type, or hair type, and use them to personalize your recommendations throughout the conversation. Keep responses concise and friendly.",
  },
];

function formatAssistantMessage(content) {
  const escapedContent = content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const boldContent = escapedContent.replace(
    /\*\*(.*?)\*\*/g,
    "<strong>$1</strong>",
  );
  const blocks = [];
  let listType = "";
  let listItems = [];
  const lines = boldContent.split("\n");

  function closeList() {
    if (listType) {
      blocks.push(`<${listType}>${listItems.join("")}</${listType}>`);
      listType = "";
      listItems = [];
    }
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];

    if (!line.trim() && listType) {
      const nextLine = lines
        .slice(index + 1)
        .find((candidate) => candidate.trim());
      const continuesList =
        listType === "ol"
          ? /^\d+\. /.test(nextLine || "")
          : /^[-*] /.test(nextLine || "");

      if (continuesList) {
        continue;
      }
    }

    const bulletItem = line.match(/^[-*] (.*)$/);
    const numberedItem = line.match(/^\d+\. (.*)$/);
    const nextListType = bulletItem ? "ul" : numberedItem ? "ol" : "";

    if (nextListType) {
      if (listType !== nextListType) {
        closeList();
        listType = nextListType;
      }
      const itemContent = bulletItem ? bulletItem[1] : numberedItem[1];
      listItems.push(`<li>${itemContent}</li>`);
      continue;
    }

    closeList();
    const heading = line.match(/^#{2,3} (.*)$/);
    blocks.push(heading ? `<h3>${heading[1]}</h3>` : line);
  }

  closeList();
  return blocks.join("<br>");
}

function resizeUserInput() {
  const maxHeight = 120;
  userInput.style.height = "auto";
  userInput.style.height = `${Math.min(userInput.scrollHeight, maxHeight)}px`;
  userInput.style.overflowY =
    userInput.scrollHeight > maxHeight ? "auto" : "hidden";
}

userInput.addEventListener("input", resizeUserInput);
userInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

// Add a message to the chat and keep the newest one in view.
function addMessage(role, content, extraClass = "") {
  const messageElement = document.createElement("div");
  messageElement.classList.add("msg", role);

  if (extraClass) {
    messageElement.classList.add(extraClass);
  }

  if (role === "assistant") {
    messageElement.innerHTML = formatAssistantMessage(content);
  } else {
    messageElement.textContent = content;
  }
  chatWindow.appendChild(messageElement);
  if (role === "assistant") {
    if (latestUserMessage) {
      const userMessageBottom =
        latestUserMessage.getBoundingClientRect().bottom -
        chatWindow.getBoundingClientRect().top +
        chatWindow.scrollTop;
      chatWindow.scrollTo({ top: userMessageBottom, behavior: "smooth" });
    } else {
      messageElement.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } else {
    latestUserMessage = messageElement;
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }
  return messageElement;
}

// Keep the welcome message visible when the page first loads.
addMessage("assistant", "👋 Hello! How can I help you today?");

// Send each new question with the conversation history to the Worker.
chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const question = userInput.value.trim();
  if (!question) {
    return;
  }

  userInput.value = "";
  userInput.style.height = "auto";
  userInput.style.overflowY = "hidden";
  latestQuestion.textContent = question;
  latestQuestion.hidden = false;
  messages.push({ role: "user", content: question });
  addMessage("user", question);

  const loadingMessage = addMessage("assistant", "Thinking...", "loading");

  if (!WORKER_URL) {
    loadingMessage.remove();
    addMessage(
      "assistant",
      "The chatbot isn't connected yet. Add your deployed Cloudflare Worker URL to WORKER_URL in script.js.",
      "error",
    );
    return;
  }

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: messages }),
    });

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok) {
      throw new Error("The chat service could not complete the request.");
    }
    if (!contentType.includes("json")) {
      throw new Error("The chat service returned an unexpected response.");
    }

    const data = await response.json();
    const reply = data.choices[0].message.content;
    if (typeof reply !== "string" || !reply.trim()) {
      throw new Error("The chat service returned an empty reply.");
    }

    loadingMessage.remove();
    messages.push({ role: "assistant", content: reply });
    addMessage("assistant", reply);
  } catch (error) {
    loadingMessage.remove();
    addMessage(
      "assistant",
      "Sorry, I couldn't get a reply right now. Please try again.",
      "error",
    );
  }
});
