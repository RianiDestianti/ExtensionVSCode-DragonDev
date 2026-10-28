const vscode = require("vscode");

const stateKey = "petDragon.state";
const xpBase = 100;
const maxDragons = 8;
const colorNames = ["night", "emerald", "crimson", "sapphire", "amethyst", "gold"];
const colorBadges = {
  night: "⚫",
  emerald: "🟢",
  crimson: "🔴",
  sapphire: "🔵",
  amethyst: "🟣",
  gold: "🟡",
};
const dragonNames = ["Ember", "Pip", "Mochi", "Scorch", "Biscuit", "Nimbus", "Sprout", "Cinder", "Tofu", "Blaze"];

const webviewStyles = `
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body {
  height: 100%;
  overflow: hidden;
  font-family: var(--vscode-font-family);
  color: #fff;
  background: #62a038;
  user-select: none;
}

#scene {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  image-rendering: pixelated;
}

.label {
  position: absolute;
  transform: translate(-50%, -100%);
  pointer-events: none;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 4px;
  background: rgba(40, 24, 10, 0.78);
  box-shadow: 0 0 0 1px #c89a5a;
}

.label[hidden],
.empty[hidden] {
  display: none;
}

.empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
  pointer-events: none;
}
`;

let dragonView;
let statusBarItem;
let decayTimer;
let extensionContext;

function getConfiguration() {
  return vscode.workspace.getConfiguration("petDragon");
}

function createId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function getDefaultColor() {
  return getConfiguration().get("color", "night");
}

function createDefaultState() {
  return {
    dragons: [{ id: createId(), name: "Ember", color: getDefaultColor() }],
    level: 1,
    xp: 0,
    hunger: 80,
    happiness: 80,
    energy: 90,
    lastTick: Date.now(),
  };
}

function getState() {
  const storedState = extensionContext.globalState.get(stateKey);
  if (!storedState) {
    return createDefaultState();
  }
  const petState = { ...createDefaultState(), ...storedState };
  if (!Array.isArray(storedState.dragons)) {
    petState.dragons = [{ id: createId(), name: storedState.name || "Ember", color: getDefaultColor() }];
  }
  delete petState.name;
  return petState;
}

function saveState(petState) {
  return extensionContext.globalState.update(stateKey, petState);
}

function xpForLevel(level) {
  return Math.round(xpBase * Math.pow(level, 1.35));
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

function applyDecay(petState) {
  const now = Date.now();
  const minutesPassed = (now - petState.lastTick) / 60000;
  if (minutesPassed <= 0) {
    return petState;
  }
  petState.hunger = clampPercent(petState.hunger - minutesPassed * 0.6);
  petState.happiness = clampPercent(petState.happiness - minutesPassed * 0.4);
  petState.energy = clampPercent(petState.energy + minutesPassed * 0.9);
  petState.lastTick = now;
  return petState;
}

function getMood(petState) {
  const average = (petState.hunger + petState.happiness) / 2;
  if (petState.energy < 20) {
    return { label: "sleepy", emoji: "😴" };
  }
  if (average > 75) {
    return { label: "joyful", emoji: "😄" };
  }
  if (petState.hunger < 25) {
    return { label: "hungry", emoji: "🍖" };
  }
  if (petState.happiness < 30) {
    return { label: "lonely", emoji: "🥺" };
  }
  if (average > 45) {
    return { label: "content", emoji: "🙂" };
  }
  return { label: "grumpy", emoji: "😾" };
}

function describeHerd(petState) {
  return petState.dragons.length === 1 ? `${petState.dragons[0].name} is` : "Your dragons are";
}

function addXp(petState, amount) {
  petState.xp += amount;
  let hasLeveledUp = false;
  while (petState.xp >= xpForLevel(petState.level)) {
    petState.xp -= xpForLevel(petState.level);
    petState.level += 1;
    hasLeveledUp = true;
  }
  return hasLeveledUp;
}

function pushState(petState) {
  if (!dragonView) {
    return;
  }
  dragonView.webview.postMessage({
    type: "state",
    state: petState,
    mood: getMood(petState),
    xpNeeded: xpForLevel(petState.level),
  });
}

function updateStatusBar(petState) {
  if (!getConfiguration().get("showInStatusBar", true)) {
    if (statusBarItem) {
      statusBarItem.hide();
    }
    return;
  }
  if (!statusBarItem) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = "petDragon.focus";
    extensionContext.subscriptions.push(statusBarItem);
  }
  const dragonCount = petState.dragons.length;
  if (dragonCount === 0) {
    statusBarItem.text = "🥚 No dragons";
    statusBarItem.tooltip = "Click + in the Pet Dragon view to hatch one.";
    statusBarItem.show();
    return;
  }
  const currentMood = getMood(petState);
  const herdLabel = dragonCount === 1 ? petState.dragons[0].name : `×${dragonCount}`;
  const dragonList = petState.dragons.map((dragon) => dragon.name).join(", ");
  statusBarItem.text = `🐉 ${herdLabel} Lv.${petState.level} ${currentMood.emoji}`;
  statusBarItem.tooltip = new vscode.MarkdownString(
    `**${dragonList}** — level ${petState.level} (${currentMood.label})\n\n` +
      `🍖 Hunger ${Math.round(petState.hunger)}%  \n` +
      `💛 Happiness ${Math.round(petState.happiness)}%  \n` +
      `⚡ Energy ${Math.round(petState.energy)}%`
  );
  statusBarItem.show();
}

function refresh(petState) {
  saveState(petState);
  updateStatusBar(petState);
  pushState(petState);
}

function sendAction(actionName, extraFields) {
  if (dragonView) {
    dragonView.webview.postMessage({ type: "action", action: actionName, ...extraFields });
  }
}

function ensureDragons(petState) {
  if (petState.dragons.length > 0) {
    return true;
  }
  vscode.window.showInformationMessage("No dragons yet — click + in the Pet Dragon view to hatch one.");
  return false;
}

function feedDragons(petState) {
  if (!ensureDragons(petState)) {
    return;
  }
  petState.hunger = clampPercent(petState.hunger + 25);
  petState.happiness = clampPercent(petState.happiness + 5);
  addXp(petState, 3);
  sendAction("eat");
  refresh(petState);
}

function playWithDragons(petState, dragonId) {
  if (!ensureDragons(petState)) {
    return;
  }
  if (petState.energy < 15) {
    vscode.window.setStatusBarMessage(`${describeHerd(petState)} too tired to play.`, 2500);
    refresh(petState);
    return;
  }
  petState.happiness = clampPercent(petState.happiness + 20);
  petState.energy = clampPercent(petState.energy - 12);
  petState.hunger = clampPercent(petState.hunger - 4);
  addXp(petState, 5);
  sendAction("play", { id: dragonId });
  refresh(petState);
}

function breatheFire(petState) {
  if (!ensureDragons(petState)) {
    return;
  }
  if (petState.energy < 20) {
    vscode.window.setStatusBarMessage(`${describeHerd(petState)} out of breath.`, 2500);
    return;
  }
  petState.energy = clampPercent(petState.energy - 8);
  petState.happiness = clampPercent(petState.happiness + 6);
  addXp(petState, 2);
  sendAction("fire");
  refresh(petState);
}

function handleDocumentSave() {
  const petState = applyDecay(getState());
  if (petState.dragons.length === 0) {
    return;
  }
  const hasLeveledUp = addXp(petState, getConfiguration().get("xpPerSave", 8));
  petState.happiness = clampPercent(petState.happiness + 2);
  if (hasLeveledUp) {
    const herdName = petState.dragons.length === 1 ? petState.dragons[0].name : "Your dragons";
    vscode.window.showInformationMessage(`${herdName} reached level ${petState.level}!`);
    sendAction("levelup");
  } else {
    sendAction("xp");
  }
  refresh(petState);
}

function validateName(value) {
  return value && value.trim().length > 0 && value.length <= 20 ? undefined : "1–20 characters.";
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

async function pickDragon(petState, placeHolder, alwaysAsk) {
  if (!ensureDragons(petState)) {
    return undefined;
  }
  if (petState.dragons.length === 1 && !alwaysAsk) {
    return petState.dragons[0];
  }
  const pickedItem = await vscode.window.showQuickPick(
    petState.dragons.map((dragon) => ({
      label: `${colorBadges[dragon.color] || "🐉"} ${dragon.name}`,
      description: dragon.color,
      dragon: dragon,
    })),
    { placeHolder: placeHolder }
  );
  return pickedItem && pickedItem.dragon;
}

async function askCustomColor(currentColor) {
  const hexInput = await vscode.window.showInputBox({
    prompt: "Custom scale color (hex)",
    placeHolder: "#ff69b4",
    value: currentColor && currentColor.startsWith("#") ? currentColor : "",
    validateInput: (value) => (/^#?[0-9a-f]{6}$/i.test(value.trim()) ? undefined : "Use 6-digit hex, e.g. #ff69b4"),
  });
  if (!hexInput) {
    return undefined;
  }
  const hexColor = hexInput.trim().toLowerCase();
  return hexColor.startsWith("#") ? hexColor : "#" + hexColor;
}

async function pickColor(placeHolder, currentColor) {
  const colorItems = colorNames.map((colorName) => ({
    label: `${colorBadges[colorName]} ${capitalize(colorName)}`,
    description: colorName === currentColor ? "current" : undefined,
    color: colorName,
  }));
  colorItems.push({ label: "🖌 Custom color…", description: "any hex, e.g. #ff69b4", color: "custom" });
  colorItems.push({ label: "🎲 Surprise me", color: "random" });
  const pickedItem = await vscode.window.showQuickPick(colorItems, { placeHolder: placeHolder });
  if (!pickedItem) {
    return undefined;
  }
  if (pickedItem.color === "random") {
    return colorNames[Math.floor(Math.random() * colorNames.length)];
  }
  if (pickedItem.color === "custom") {
    return askCustomColor(currentColor);
  }
  return pickedItem.color;
}

async function hatchDragon() {
  if (getState().dragons.length >= maxDragons) {
    vscode.window.showWarningMessage(`The meadow is full — ${maxDragons} dragons max.`);
    return;
  }
  const color = await pickColor("Pick a color for your new dragon");
  if (!color) {
    return;
  }
  const usedNames = new Set(getState().dragons.map((dragon) => dragon.name));
  const name = await vscode.window.showInputBox({
    prompt: "Name your new dragon",
    value: dragonNames.find((dragonName) => !usedNames.has(dragonName)) || "Dragon",
    validateInput: validateName,
  });
  if (!name) {
    return;
  }
  const petState = applyDecay(getState());
  const newDragon = { id: createId(), name: name.trim(), color: color };
  petState.dragons.push(newDragon);
  refresh(petState);
  sendAction("hatch", { id: newDragon.id });
}

async function releaseDragon() {
  const chosenDragon = await pickDragon(getState(), "Which dragon flies off to the wild?", true);
  if (!chosenDragon) {
    return;
  }
  const petState = applyDecay(getState());
  petState.dragons = petState.dragons.filter((dragon) => dragon.id !== chosenDragon.id);
  refresh(petState);
  vscode.window.setStatusBarMessage(`${chosenDragon.name} flew away.`, 2500);
}

async function recolorDragon() {
  const chosenDragon = await pickDragon(getState(), "Which dragon gets new scales?");
  if (!chosenDragon) {
    return;
  }
  const color = await pickColor(`New color for ${chosenDragon.name}`, chosenDragon.color);
  if (!color) {
    return;
  }
  const petState = getState();
  const storedDragon = petState.dragons.find((dragon) => dragon.id === chosenDragon.id);
  if (!storedDragon) {
    return;
  }
  storedDragon.color = color;
  refresh(petState);
  sendAction("hatch", { id: chosenDragon.id });
}

async function renameDragon() {
  const chosenDragon = await pickDragon(getState(), "Which dragon do you want to rename?");
  if (!chosenDragon) {
    return;
  }
  const name = await vscode.window.showInputBox({
    prompt: `Rename ${chosenDragon.name}`,
    value: chosenDragon.name,
    validateInput: validateName,
  });
  if (!name) {
    return;
  }
  const petState = getState();
  const storedDragon = petState.dragons.find((dragon) => dragon.id === chosenDragon.id);
  if (!storedDragon) {
    return;
  }
  storedDragon.name = name.trim();
  refresh(petState);
}

async function resetMeadow() {
  const answer = await vscode.window.showWarningMessage(
    "Reset to a single fresh hatchling? All dragons and levels will be lost.",
    { modal: true },
    "Reset"
  );
  if (answer !== "Reset") {
    return;
  }
  const petState = createDefaultState();
  refresh(petState);
  sendAction("hatch", { id: petState.dragons[0].id });
  vscode.window.showInformationMessage("A new dragon has hatched!");
}

function createNonce() {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let position = 0; position < 32; position++) {
    nonce += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return nonce;
}

class DragonViewProvider {
  constructor(extensionUri) {
    this.extensionUri = extensionUri;
  }

  resolveWebviewView(webviewView) {
    dragonView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
    };
    webviewView.webview.html = this.buildHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((message) => {
      const petState = applyDecay(getState());
      if (message.type === "ready") {
        refresh(petState);
      } else if (message.type === "feed") {
        feedDragons(petState);
      } else if (message.type === "play") {
        playWithDragons(petState, message.id);
      } else if (message.type === "fire") {
        breatheFire(petState);
      }
    });
    webviewView.onDidDispose(() => {
      dragonView = undefined;
    });
  }

  buildHtml(webview) {
    const nonce = createNonce();
    const mediaUri = (fileName) => webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", fileName));
    const contentSecurityPolicy = [
      "default-src 'none'",
      `img-src ${webview.cspSource} data:`,
      "style-src 'unsafe-inline'",
      `script-src 'nonce-${nonce}'`,
    ].join("; ");
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>${webviewStyles}</style>
  </head>
  <body>
    <canvas id="scene"></canvas>
    <div id="label" class="label" hidden></div>
    <div id="empty" class="empty" hidden>No dragons here yet.<br />Click <b>+</b> above to hatch one.</div>
    <script nonce="${nonce}" src="${mediaUri("dragon.js")}"></script>
    <script nonce="${nonce}" src="${mediaUri("grass.js")}"></script>
    <script nonce="${nonce}" src="${mediaUri("scene.js")}"></script>
  </body>
</html>`;
  }
}

function activate(context) {
  extensionContext = context;
  refresh(applyDecay(getState()));

  const registerCommand = (commandId, handler) => vscode.commands.registerCommand(commandId, handler);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("petDragon.view", new DragonViewProvider(context.extensionUri), {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    registerCommand("petDragon.focus", () => vscode.commands.executeCommand("petDragon.view.focus")),
    registerCommand("petDragon.add", hatchDragon),
    registerCommand("petDragon.remove", releaseDragon),
    registerCommand("petDragon.recolor", recolorDragon),
    registerCommand("petDragon.rename", renameDragon),
    registerCommand("petDragon.settings", () =>
      vscode.commands.executeCommand("workbench.action.openSettings", "petDragon")
    ),
    registerCommand("petDragon.feed", () => feedDragons(applyDecay(getState()))),
    registerCommand("petDragon.play", () => playWithDragons(applyDecay(getState()))),
    registerCommand("petDragon.breatheFire", () => breatheFire(applyDecay(getState()))),
    registerCommand("petDragon.reset", resetMeadow),
    vscode.workspace.onDidSaveTextDocument(handleDocumentSave),
    vscode.workspace.onDidChangeConfiguration((changeEvent) => {
      if (changeEvent.affectsConfiguration("petDragon")) {
        refresh(applyDecay(getState()));
      }
    })
  );

  decayTimer = setInterval(() => refresh(applyDecay(getState())), 60000);
}

function deactivate() {
  if (decayTimer) {
    clearInterval(decayTimer);
  }
}

module.exports = { activate, deactivate };
