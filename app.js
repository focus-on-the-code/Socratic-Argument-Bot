// GitHub Pages note: this app is fully static (index.html, styles.css, app.js) and can be hosted directly.

const PROXY_URL = "https://gemini-key-socratic-argument-bot-1.tonyholtjr.workers.dev";
const THROTTLE_MS = 10000;

const positionSelect = document.getElementById("position");
const generateBtn = document.getElementById("generateBtn");
const nextBtn = document.getElementById("nextBtn");
const loadingEl = document.getElementById("loading");

const stepOutput = document.getElementById("stepOutput");
const turnCardTemplate = document.getElementById("turnCardTemplate");

let steps = [];
let currentStepIndex = 0;
let lastGenerateAt = 0;

const resolutionMap = {
  "net-good": "Social media is net-good for democracy.",
  "net-bad": "Social media is net-bad for democracy.",
  mixed: "Social media has mixed benefits for democracy.",
  "no-impact": "Social media has no impact on democracy."
};

generateBtn.addEventListener("click", onGenerateDialogue);
nextBtn.addEventListener("click", onNextStep);

function setLoadingState(isLoading) {
  positionSelect.disabled = isLoading;
  generateBtn.disabled = isLoading;
  loadingEl.hidden = !isLoading;
}

function clearOutputs() {
  stepOutput.innerHTML = "";
}

function resetState({ keepSelection = false } = {}) {
  steps = [];
  currentStepIndex = 0;
  nextBtn.hidden = true;
  nextBtn.disabled = true;
  clearOutputs();
  setLoadingState(false);
  if (!keepSelection) {
    positionSelect.selectedIndex = 0;
  }
}

function createFullCard(title, contentElement) {
  const card = document.createElement("article");
  card.className = "full-card card";
  const h3 = document.createElement("h3");
  h3.textContent = title;
  card.appendChild(h3);
  card.appendChild(contentElement);
  return card;
}

function appendFullStepRow(card) {
  const row = document.createElement("section");
  row.className = "step-row full-row";
  row.appendChild(card);
  stepOutput.appendChild(row);
}

function addErrorCard(message, rawText = "") {
  const wrap = document.createElement("div");
  const p = document.createElement("p");
  p.textContent = message;
  wrap.appendChild(p);

  if (rawText) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Debug details";
    const pre = document.createElement("pre");
    pre.textContent = rawText;
    details.append(summary, pre);
    wrap.appendChild(details);
  }

  appendFullStepRow(createFullCard("Something went wrong", wrap));
}

function renderTurn(turn) {
  const node = turnCardTemplate.content.firstElementChild.cloneNode(true);
  const botLabel = turn.speaker === "A" ? "Bot A" : "Bot B";
  node.querySelector(".turn-title").textContent = `Turn ${turn.turn} — ${botLabel}`;
  node.querySelector(".claim").textContent = turn.claim;
  node.querySelector(".reason").textContent = turn.reason;
  node.querySelector(".question").textContent = turn.question;
  return node;
}

function createTurnPairRow(turns) {
  const row = document.createElement("section");
  row.className = "step-row turn-pair-row";

  const leftTurn = turns.find((turn) => turn.speaker === "A");
  const rightTurn = turns.find((turn) => turn.speaker === "B");

  if (leftTurn) {
    row.appendChild(renderTurn(leftTurn));
  }

  if (rightTurn) {
    row.appendChild(renderTurn(rightTurn));
  }

  stepOutput.appendChild(row);
}

function renderStep(step) {
  if (step.type === "turnPair") {
    createTurnPairRow(step.turns);
    return;
  }

  if (step.type === "checkin") {
    const content = document.createElement("div");
    content.innerHTML = `
      <p><strong>Agree:</strong> ${step.data.agree}</p>
      <p><strong>Core disagreement:</strong> ${step.data.core_disagreement}</p>
      <p><strong>Terms to define:</strong></p>
    `;
    const ul = document.createElement("ul");
    step.data.terms_to_define.forEach((term) => {
      const li = document.createElement("li");
      li.textContent = term;
      ul.appendChild(li);
    });
    content.appendChild(ul);
    const assumptions = document.createElement("p");
    assumptions.innerHTML = `<strong>Assumptions:</strong> A: ${step.data.assumptions.A} | B: ${step.data.assumptions.B}`;
    content.appendChild(assumptions);
    appendFullStepRow(createFullCard("Check-in #1", content));
    return;
  }

  if (step.type === "final_synthesis") {
    const content = document.createElement("div");
    const agree = document.createElement("ul");
    step.data.agree.forEach((x) => {
      const li = document.createElement("li");
      li.textContent = x;
      agree.appendChild(li);
    });
    const disagree = document.createElement("ul");
    step.data.disagree.forEach((x) => {
      const li = document.createElement("li");
      li.textContent = x;
      disagree.appendChild(li);
    });

    content.innerHTML = "<p><strong>Agreements:</strong></p>";
    content.appendChild(agree);
    content.innerHTML += "<p><strong>Disagreements:</strong></p>";
    content.appendChild(disagree);
    const q = document.createElement("p");
    q.innerHTML = `<strong>Remaining question:</strong> ${step.data.remaining_question}`;
    content.appendChild(q);

    appendFullStepRow(createFullCard("Final Synthesis", content));
    return;
  }

  if (step.type === "assessment") {
    const content = document.createElement("div");
    const grid = document.createElement("div");
    grid.className = "assessment-grid";
    ["analysis", "evaluation", "reasoning", "explanation", "reflection"].forEach((key) => {
      const item = document.createElement("section");
      item.className = "assessment-item";
      item.innerHTML = `
        <h4>${capitalize(key)}</h4>
        <p><strong>Strength:</strong> ${step.data[key].strength}</p>
        <p><strong>Improvement:</strong> ${step.data[key].improvement}</p>
      `;
      grid.appendChild(item);
    });
    content.appendChild(grid);
    appendFullStepRow(createFullCard("Assessment", content));
    return;
  }

  if (step.type === "tightened") {
    const content = document.createElement("div");
    const ol = document.createElement("ol");
    step.data.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      ol.appendChild(li);
    });
    content.appendChild(ol);
    appendFullStepRow(createFullCard("Tighten the Resolution", content));
    return;
  }

  if (step.type === "done") {
    const content = document.createElement("div");
    const msg = document.createElement("p");
    msg.textContent = step.data.message;
    content.appendChild(msg);

    if (Array.isArray(step.data.optional_next_steps) && step.data.optional_next_steps.length > 0) {
      const ul = document.createElement("ul");
      step.data.optional_next_steps.forEach((s) => {
        const li = document.createElement("li");
        li.textContent = s;
        ul.appendChild(li);
      });
      content.appendChild(ul);
    }

    const restart = document.createElement("button");
    restart.className = "restart-btn";
    restart.type = "button";
    restart.textContent = "Start Over";
    restart.addEventListener("click", () => resetState());
    content.appendChild(restart);

    const card = createFullCard("Done", content);
    card.classList.add("done-card");
    appendFullStepRow(card);
  }
}

function onNextStep() {
  if (currentStepIndex >= steps.length) {
    nextBtn.hidden = true;
    nextBtn.disabled = true;
    return;
  }

  renderStep(steps[currentStepIndex]);
  currentStepIndex += 1;

  if (currentStepIndex >= steps.length) {
    nextBtn.hidden = true;
    nextBtn.disabled = true;
  }
}

function sanitizeModelText(rawText) {
  let text = (rawText || "").trim();
  if (!text) return text;

  text = text.replace(/```json/gi, "```");
  if (text.startsWith("```")) {
    text = text.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }
  if (text.includes("```")) {
    text = text.replace(/```/g, "");
  }

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    text = text.slice(first, last + 1);
  }

  return text.trim();
}

function validateDialogueJson(data) {
  const requiredTop = [
    "resolution",
    "turns",
    "checkin",
    "final_synthesis",
    "assessment",
    "tightened_resolutions",
    "done"
  ];

  for (const key of requiredTop) {
    if (!(key in data)) {
      throw new Error(`Missing key: ${key}`);
    }
  }

  if (!Array.isArray(data.turns) || data.turns.length !== 8) {
    throw new Error("Expected 8 turns.");
  }
}

function buildSteps(data) {
  return [
    { type: "turnPair", turns: [data.turns[0], data.turns[1]] },
    { type: "turnPair", turns: [data.turns[2], data.turns[3]] },
    { type: "checkin", data: data.checkin },
    { type: "turnPair", turns: [data.turns[4], data.turns[5]] },
    { type: "turnPair", turns: [data.turns[6], data.turns[7]] },
    { type: "final_synthesis", data: data.final_synthesis },
    { type: "assessment", data: data.assessment },
    { type: "tightened", data: data.tightened_resolutions },
    { type: "done", data: data.done }
  ];
}

function buildPrompt(resolution) {
  return `You are generating content for a student web app. Output MUST be ONLY valid JSON.
NO markdown. NO code fences. NO commentary. NO trailing text.

TOPIC: Social media and democracy.
RESOLUTION: "${resolution}"

Create a Bot-vs-Bot “model dialogue” that helps students SEE disciplined disagreement. Not about winning. Truth-seeking disputatio.

ROLES
- Speaker A: Defends the resolution.
- Speaker B: Challenges it with the strongest possible counter-position (steelman).

CORE RULES
1) Charity first: at least ONCE, each speaker must fairly restate the other side’s point before critiquing it.
2) No lecturing: concise turns only.
3) No citation flexing: don’t rely on “studies say” without reasoning.
4) Aim for clarity: define terms, surface assumptions, trace causal chains, weigh tradeoffs, and name what would change minds.
5) Plain language.

TURN FORMAT
Total turns: 8 (A speaks 4 times, B speaks 4 times), alternating A then B.
Turn 1 (A) and Turn 2 (B) must define key terms from each side’s perspective.
Every turn must include:
- claim (one sentence)
- reason (1–2 sentences)
- question (one why/how question for the other speaker)

CHECK-IN
After Turn 4, include a check-in with:
- agree (string)
- core_disagreement (string)
- terms_to_define (array of strings)
- assumptions (object with keys "A" and "B")

FINAL SYNTHESIS (after Turn 8)
- agree: array of 2 bullets (strings)
- disagree: array of 2 bullets (strings)
- remaining_question: string

ASSESSMENT
Use critical-thinking tools. For each category, provide:
- strength (string)
- improvement (string)
Categories:
analysis, evaluation, reasoning, explanation, reflection

TIGHTEN THE RESOLUTION
Provide 3 tightened versions of the resolution (each one sentence). Each must include at least TWO of:
clarify terms, narrow scope, name mechanism, add condition, add evidence threshold.

DONE MESSAGE
Provide a done message, and ask "would you like to try again?"

OUTPUT JSON SCHEMA (must match exactly)
{
  "resolution": string,
  "turns": [
    { "turn": 1, "speaker": "A", "claim": string, "reason": string, "question": string },
    { "turn": 2, "speaker": "B", "claim": string, "reason": string, "question": string },
    { "turn": 3, "speaker": "A", "claim": string, "reason": string, "question": string },
    { "turn": 4, "speaker": "B", "claim": string, "reason": string, "question": string },
    { "turn": 5, "speaker": "A", "claim": string, "reason": string, "question": string },
    { "turn": 6, "speaker": "B", "claim": string, "reason": string, "question": string },
    { "turn": 7, "speaker": "A", "claim": string, "reason": string, "question": string },
    { "turn": 8, "speaker": "B", "claim": string, "reason": string, "question": string }
  ],
  "checkin": {
    "agree": string,
    "core_disagreement": string,
    "terms_to_define": [string, string],
    "assumptions": { "A": string, "B": string }
  },
  "final_synthesis": {
    "agree": [string, string],
    "disagree": [string, string],
    "remaining_question": string
  },
  "assessment": {
    "analysis": { "strength": string, "improvement": string },
    "evaluation": { "strength": string, "improvement": string },
    "reasoning": { "strength": string, "improvement": string },
    "explanation": { "strength": string, "improvement": string },
    "reflection": { "strength": string, "improvement": string }
  },
  "tightened_resolutions": [string, string, string],
  "done": {
    "message": string,
    "optional_next_steps": [string, string, string]
  }
}

Remember: Output ONLY valid JSON.`;
}

async function onGenerateDialogue() {
  const now = Date.now();
  if (now - lastGenerateAt < THROTTLE_MS) {
    clearOutputs();
    addErrorCard("Please wait a moment before generating again.");
    return;
  }

  const selected = positionSelect.value;
  if (!selected || !resolutionMap[selected]) {
    clearOutputs();
    addErrorCard("Please choose a position before generating.");
    return;
  }

  resetState({ keepSelection: true });
  setLoadingState(true);

  const resolution = resolutionMap[selected];
  const prompt = buildPrompt(resolution);
  let rawModelText = "";

  try {
    const response = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.7
          }
        })
      }
    );

    const data = await response.json();
    rawModelText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!response.ok || !rawModelText) {
      throw new Error("Model call failed.");
    }

    const cleaned = sanitizeModelText(rawModelText);
    const parsed = JSON.parse(cleaned);
    validateDialogueJson(parsed);

    steps = buildSteps(parsed);
    currentStepIndex = 0;
    nextBtn.hidden = false;
    nextBtn.disabled = false;
    onNextStep();

    lastGenerateAt = now;
  } catch (error) {
    addErrorCard(
      "We couldn’t generate the dialogue this time. Please try again.",
      rawModelText || String(error)
    );
  } finally {
    setLoadingState(false);
  }
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
