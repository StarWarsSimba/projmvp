const castButton = document.querySelector("#cast-button");
const meterMarker = document.querySelector("#meter-marker");
const distanceValue = document.querySelector("#distance-value");
const catchArea = document.querySelector("#catch-area");
const catchReveal = document.querySelector("#catch-reveal");
const catchImage = document.querySelector("#catch-image");
const reelControls = document.querySelector("#catch-form");
const notice = document.querySelector("#notice");
const reelProgress = document.querySelector("#reel-progress");
const reelTarget = document.querySelector("#reel-target");
const reelScore = document.querySelector("#reel-score");
const reelTime = document.querySelector("#reel-time");
const reelKey = document.querySelector("#reel-key");

let items = [];
let player = null;
let meterPosition = 0;
let meterDirection = 1;
let animationFrame = null;
let casting = false;
let pendingItem = null;
let lastFrame = 0;
let reelActive = false;
let reelAnimation = null;
let reelStart = 0;
let reelValue = 0;
let reelLastKey = 0;
let reelThreshold = 40;
let reelFinishing = false;
let reelLastFrame = 0;
const CATCH_REVEAL_DURATION = 2000;

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
    const description = document.createElement("p");
    description.className = "collection-description";
    description.textContent = item.description || "No description available.";
    details.append(rarity, name, description, stats);

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
    showPendingCatch(result.item, `Your cast reached ${distance}m. Reel the catch in before it escapes.`);
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    castButton.disabled = false;
    castButton.classList.remove("button-casting");
    castButton.textContent = "Start casting";
  }
}

function showPendingCatch(item, message) {
  pendingItem = item;
  document.querySelector("#catch-name").textContent = item.name;
  const rarity = document.querySelector("#catch-rarity");
  rarity.textContent = item.rarity;
  rarity.className = `rarity rarity-${item.rarity.toLowerCase()}`;
  catchArea.hidden = false;
  showNotice(message);
  startReel(item.rarity);
}

async function reelIn(success) {
  if (!pendingItem || reelFinishing) return;
  reelFinishing = true;
  reelActive = false;
  cancelAnimationFrame(reelAnimation);
  reelKey.disabled = true;
  const caughtItem = pendingItem;
  const score = success ? reelValue : 0;
  try {
    const result = await requestJson("/api/catch", {
      method: "POST",
      body: JSON.stringify({ item_id: caughtItem.id, reel_score: score }),
    });
    if (success) {
      reelControls.hidden = true;
      catchImage.hidden = !caughtItem.image;
      catchImage.src = caughtItem.image || "";
      catchImage.alt = caughtItem.image ? caughtItem.name : "";
      document.querySelector("#catch-description").textContent =
        caughtItem.description || "No description available.";
      catchReveal.hidden = false;
      castButton.disabled = true;
      showNotice(`${result.caught.name} caught!`);
      await new Promise((resolve) => setTimeout(resolve, CATCH_REVEAL_DURATION));
    }
    player = result.player;
    showNotice(`${result.caught.name} added to your collection · +${result.caught.points} points.`);
    catchArea.hidden = true;
    catchReveal.hidden = true;
    reelControls.hidden = false;
    catchImage.removeAttribute("src");
    pendingItem = null;
    renderPlayer();
  } catch (error) {
    showNotice(error.message, true);
    catchArea.hidden = true;
    catchReveal.hidden = true;
    reelControls.hidden = false;
    catchImage.removeAttribute("src");
    pendingItem = null;
  } finally {
    castButton.disabled = false;
    reelKey.disabled = false;
    reelFinishing = false;
  }
}

function startReel(rarity) {
  reelActive = true;
  reelFinishing = false;
  reelValue = 8;
  reelLastKey = 0;
  reelThreshold = { Common: 40, Rare: 50, Epic: 60, Legendary: 70 }[rarity] || 40;
  reelTarget.style.right = `${100 - reelThreshold}%`;
  reelStart = performance.now();
  reelLastFrame = reelStart;
  reelKey.disabled = false;
  reelKey.classList.remove("is-pressed");
  updateReelDisplay(reelValue, 8);
  reelAnimation = requestAnimationFrame(animateReel);
  reelKey.focus();
}

function updateReelDisplay(value, timeLeft) {
  reelValue = Math.max(0, Math.min(100, value));
  reelProgress.style.width = `${reelValue}%`;
  reelScore.textContent = `${Math.round(reelValue)}%`;
  reelTime.textContent = `${Math.max(0, timeLeft).toFixed(1)}s`;
}

function animateReel(timestamp) {
  if (!reelActive) return;
  const elapsed = (timestamp - reelStart) / 1000;
  const timeLeft = 8 - elapsed;
  const frameElapsed = Math.min(timestamp - reelLastFrame, 100);
  reelLastFrame = timestamp;
  reelValue = Math.max(0, reelValue - frameElapsed * 0.0028);
  updateReelDisplay(reelValue, timeLeft);
  if (timeLeft <= 0) {
    reelIn(false);
    return;
  }
  reelAnimation = requestAnimationFrame(animateReel);
}

function pressReelKey() {
  if (!reelActive || reelFinishing) return;
  const now = performance.now();
  let gain = 2;
  if (reelLastKey) {
    const interval = now - reelLastKey;
    if (interval < 180) gain = 7;
    else if (interval < 350) gain = 5;
    else if (interval < 600) gain = 3;
  } else {
    gain = 5;
  }
  reelLastKey = now;
  reelValue = Math.min(100, reelValue + gain);
  updateReelDisplay(reelValue, 8 - (now - reelStart) / 1000);
  reelKey.classList.add("is-pressed");
  setTimeout(() => reelKey.classList.remove("is-pressed"), 70);
  if (reelValue >= reelThreshold) reelIn(true);
}

function handleReelKey(event) {
  if (!reelActive) return;
  if (event.repeat) return;
  if (event.code === "Space" || event.code === "Enter" || event.code === "ArrowLeft" || event.code === "ArrowRight") {
    event.preventDefault();
    pressReelKey();
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
    if (stateResult.pending_item) {
      showPendingCatch(stateResult.pending_item, "A catch is still on your line. Reel it in before casting again.");
    }
  } catch (error) {
    showNotice(`${error.message} Check that the app and database are running.`, true);
    castButton.disabled = true;
  }
}

castButton.addEventListener("click", cast);
reelKey.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  pressReelKey();
});
window.addEventListener("keydown", handleReelKey);
startGame();
