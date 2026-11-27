const castButton = document.querySelector("#cast-button");
const meterMarker = document.querySelector("#meter-marker");
const distanceValue = document.querySelector("#distance-value");
const catchArea = document.querySelector("#catch-area");
const catchForm = document.querySelector("#catch-form");
const catchGuess = document.querySelector("#catch-guess");
const notice = document.querySelector("#notice");

let items = [];
let player = null;
let meterPosition = 0;
let meterDirection = 1;
let animationFrame = null;
let casting = false;
let pendingItem = null;
let lastFrame = 0;

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Something went wrong. Please try again.");
  return result;
}

function showNotice(message, isError = false) {
  notice.textContent = message;
  notice.classList.toggle("notice-error", isError);
  notice.hidden = !message;
}

function updateWallet() {
  document.querySelector("#points").textContent = player.points;
  document.querySelector("#coins").textContent = player.coins;
}

function renderUpgrades() {
  const container = document.querySelector("#upgrades");
  container.replaceChildren();
  for (const upgrade of player.upgrade_options) {
    const card = document.createElement("article");
    card.className = "upgrade-card";

    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = upgrade.name;
    const description = document.createElement("p");
    description.textContent = `${upgrade.description} Level ${upgrade.level}.`;
    copy.append(title, description);

    const button = document.createElement("button");
    button.className = "button button-small";
    button.type = "button";
    button.textContent = `Buy · ${upgrade.cost} coins`;
    button.disabled = player.coins < upgrade.cost;
    button.addEventListener("click", () => buyUpgrade(upgrade.id));
    card.append(copy, button);
    container.append(card);
  }
}

function renderCollection() {
  const container = document.querySelector("#collection");
  container.replaceChildren();
  const owned = items.filter((item) => (player.inventory[item.id] || 0) > 0);
  const total = Object.values(player.inventory).reduce((sum, count) => sum + count, 0);
  document.querySelector("#collection-count").textContent = `${total} ${total === 1 ? "catch" : "catches"}`;

  if (owned.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Your collection is waiting for its first catch.";
    container.append(empty);
    return;
  }

  for (const item of owned) {
    const count = player.inventory[item.id];
    const card = document.createElement("article");
    card.className = "collection-card";
    const details = document.createElement("div");
    const rarity = document.createElement("span");
    rarity.className = `rarity rarity-${item.rarity.toLowerCase()}`;
    rarity.textContent = item.rarity;
    const name = document.createElement("strong");
    name.textContent = item.name;
    const stats = document.createElement("p");
    stats.textContent = `${count} owned · ${item.points} pts · ${item.sell_value} coins each`;
    details.append(rarity, name, stats);

    const sell = document.createElement("button");
    sell.className = "button button-small button-outline";
    sell.type = "button";
    sell.textContent = "Sell 1";
    sell.addEventListener("click", () => sellItem(item.id));
    card.append(details, sell);
    container.append(card);
  }
}

function renderPlayer() {
  updateWallet();
  renderUpgrades();
  renderCollection();
}

function animateMeter(timestamp) {
  if (!casting) return;
  if (lastFrame) {
    const elapsed = Math.min(timestamp - lastFrame, 50);
    meterPosition += meterDirection * elapsed * 0.075;
    if (meterPosition >= 100 || meterPosition <= 0) {
      meterPosition = Math.max(0, Math.min(100, meterPosition));
      meterDirection *= -1;
    }
  }
  lastFrame = timestamp;
  meterMarker.style.left = `${meterPosition}%`;
  distanceValue.textContent = Math.round(meterPosition);
  animationFrame = requestAnimationFrame(animateMeter);
}

async function cast() {
  if (!casting) {
    casting = true;
    castButton.textContent = "Stop & cast";
    castButton.classList.add("button-casting");
    lastFrame = 0;
    animationFrame = requestAnimationFrame(animateMeter);
    showNotice("");
    return;
  }

  casting = false;
  cancelAnimationFrame(animationFrame);
  castButton.disabled = true;
  castButton.textContent = "Casting…";
  const distance = Math.round(meterPosition);
  try {
    const result = await requestJson("/api/cast", {
      method: "POST",
      body: JSON.stringify({ distance }),
    });
    pendingItem = result.item;
    document.querySelector("#catch-name").textContent = pendingItem.name;
    const rarity = document.querySelector("#catch-rarity");
    rarity.textContent = pendingItem.rarity;
    rarity.className = `rarity rarity-${pendingItem.rarity.toLowerCase()}`;
    catchArea.hidden = false;
    catchGuess.value = "";
    catchGuess.focus();
    showNotice(`Your cast reached ${distance}m. Type the catch’s name to reel it in.`);
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    castButton.disabled = false;
    castButton.classList.remove("button-casting");
    castButton.textContent = "Start casting";
  }
}

async function reelIn(event) {
  event.preventDefault();
  if (!pendingItem) return;
  const submitButton = catchForm.querySelector("button");
  submitButton.disabled = true;
  try {
    const result = await requestJson("/api/catch", {
      method: "POST",
      body: JSON.stringify({ item_id: pendingItem.id, guess: catchGuess.value }),
    });
    player = result.player;
    showNotice(`${result.caught.name} added to your collection · +${result.caught.points} points.`);
    catchArea.hidden = true;
    pendingItem = null;
    renderPlayer();
  } catch (error) {
    showNotice(error.message, true);
    catchArea.hidden = true;
    pendingItem = null;
  } finally {
    submitButton.disabled = false;
  }
}

async function sellItem(itemId) {
  try {
    const result = await requestJson("/api/sell", {
      method: "POST",
      body: JSON.stringify({ item_id: itemId, quantity: 1 }),
    });
    player = result.player;
    showNotice("Catch sold. Coins added to your wallet.");
    renderPlayer();
  } catch (error) {
    showNotice(error.message, true);
  }
}

async function buyUpgrade(upgradeId) {
  try {
    const result = await requestJson("/api/upgrades", {
      method: "POST",
      body: JSON.stringify({ upgrade_id: upgradeId }),
    });
    player = result.player;
    showNotice("Upgrade purchased. Good luck out there!");
    renderPlayer();
  } catch (error) {
    showNotice(error.message, true);
  }
}

async function startGame() {
  try {
    const [itemResult, stateResult] = await Promise.all([
      requestJson("/api/items"),
      requestJson("/api/state"),
    ]);
    items = itemResult.items;
    player = stateResult.player;
    renderPlayer();
  } catch (error) {
    showNotice(`${error.message} Check that the app and database are running.`, true);
    castButton.disabled = true;
  }
}

castButton.addEventListener("click", cast);
catchForm.addEventListener("submit", reelIn);
startGame();
