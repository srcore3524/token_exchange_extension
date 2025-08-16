const activeObservers = {};
const platform = "photon";

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const signal = controller.signal;

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, { ...options, signal });
  } finally {
    clearTimeout(timeout);
  }
}

function waitForRedirect(poolId) {
  return new Promise((resolve) => {
    const handleMessage = (message) => {
      if (message?.type === 'LOCATION_CAPTURED') {
        const { location, poolId: receivedPoolId } = message;
        if (receivedPoolId === poolId) {
          chrome.runtime.onMessage.removeListener(handleMessage);
          resolve(location);
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
  });
}

async function fetchRedirectFinalUrl(url) {
  const poolId = new URL(url).searchParams.get('id');
  const locationPromise = waitForRedirect(poolId);

  try {
    await fetch(url, { method: 'GET', redirect: 'error' });
  } catch (e) {
    return await locationPromise;
  }
}

async function getBloomToken() {
  const data = await chrome.storage.local.get("bloom.token");
  return data["bloom.token"] || "";
}

// LISTENER

let currentPage, quickBuyAmount, memescopeButtonsEnabled;
chrome.runtime.onMessage.addListener(async function (request) {
  if (request.shouldWarnAboutUpdate) {
    showToast("A new version of the Bloom Extension is available! Check out how to install it <a href='https://docs.bloombot.app/extension/setup/download-chrome/.zip-file' target='_blank' style='text-decoration: underline; color: #EEA7ED;'>here</a>", "top-center");
  }
  const sitePreferences = (await chrome.storage.local.get(`bloom.sitePreferences`))?.[`bloom.sitePreferences`] || {};
  removeBloomQuickPanels();
  if (sitePreferences[platform] === false) return;
  quickBuyAmount = (await chrome.storage.local.get("bloom.quickBuyAmount"))?.[
    "bloom.quickBuyAmount"
  ];
  if (request.event !== "onActivated") {
    if (activeObservers["search"]) {
      activeObservers["search"].forEach((observer) => observer.disconnect());
    }
    handleSearch();
  }
  if (request.message === "photon-memescope") {
    memescopeButtonsEnabled = (await chrome.storage.local.get("bloom.memescopeButtons"))?.["bloom.memescopeButtons"] ?? true;
    const token = await getBloomToken();
    if (!token && request.event === "onCompleted") {
      showToast(
        "Log in to the Bloom extension to enhance your experience!",
        "top-center"
      );
    }
    const observers = activeObservers["memescope"] || [];
    observers.forEach((observer) => observer.disconnect());
    currentPage = request.message;
    handleMemescope();
  } else if (request.message === "photon-token") {
    const token = await getBloomToken();
    if (!token && request.event === "onCompleted") {
      showToast(
        "Log in to the Bloom extension to enhance your experience!",
        "top-center"
      );
    }
    const observers = activeObservers["token"] || [];
    observers.forEach((observer) => observer.disconnect());
    currentPage = request.message;
    handleToken();
    addBloomQuickPanel();
  } else if (
    request.message === "photon-discover" ||
    request.message === "photon-trending"
  ) {
    const token = await getBloomToken();
    if (!token && request.event === "onCompleted") {
      showToast(
        "Log in to the Bloom extension to enhance your experience!",
        "top-center"
      );
    }
    const observers = activeObservers["discover-trending"] || [];
    observers.forEach((observer) => observer.disconnect());
    currentPage = request.message;
    handleDiscoverTrending();
  } else if (request.message === "quickBuyAmount") {
    if (
      currentPage === "photon-trending" ||
      currentPage === "photon-discover"
    ) {
      const container = await findTokenContainer();
      const cards = Array.from(container.querySelectorAll("a[href*='/lp/']"));
      cards.forEach((card) =>
        addDiscoverTrendingBuyButton(card)
      );
    } else if (currentPage === "photon-memescope") {
      const cards = Array.from(document.querySelectorAll("a[href*='/lp/']"));
      cards.forEach((card) => {
        if (memescopeButtonsEnabled) {
          addMemescopeButtons(card.parentElement, true);
        }
      });
    }
  } else if (request.message === "reset" && currentPage === "photon-token") {
    addBloomQuickPanel();
  }
});

// UTILS

function insertAfter(referenceNode, newNode) {
  referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}

function insertBefore(referenceNode, newNode) {
  referenceNode.parentNode.insertBefore(newNode, referenceNode);
}

// ORDERS

async function interactWithBloom(selectedRegion, address, type, authToken, amount, side, additionalPayload) {
  try {
    const payload = (type === 'snipe' || type === "pnl")
      ? {
        addr: address,
        auth: authToken,
      }
      : {
        addr: address,
        isPool: true,
        amt: amount === "ini" ? amount : parseFloat(amount).toString(),
        auth: authToken,
        side,
      }
    if (additionalPayload && type === "swap") {
      payload.fee = (side === 'buy' ? additionalPayload.values['buy-fee'] : additionalPayload.values['sell-fee']).toString();
      payload.tip = (side === 'buy' ? additionalPayload.values['buy-tip'] : additionalPayload.values['sell-tip']).toString();
      payload.slippage = (side === 'buy' ? additionalPayload.values['buy-slippage'] : additionalPayload.values['sell-slippage']).toString();
      if (side === 'buy') {
        if (typeof additionalPayload.values['buy-anti-mev'] === 'undefined') {
          payload.antimev = additionalPayload.values['anti-mev'];
        } else {
          payload.antimev = additionalPayload.values['buy-anti-mev'];
        }
      } else {
        if (typeof additionalPayload.values['sell-anti-mev'] === 'undefined') {
          payload.antimev = additionalPayload.values['anti-mev'];
        } else {
          payload.antimev = additionalPayload.values['sell-anti-mev'];
        }
      }
      payload.autotip = additionalPayload.values['auto-tip'];
    } else if (additionalPayload && type === "limit") {
      payload.bundletip = additionalPayload.values['limit-tip'].toString();
      payload.slippage = additionalPayload.values['limit-slippage'].toString();
      payload.targettype = additionalPayload.values['target-type'];
      payload.targetvalue = additionalPayload.values['target-value'].toString();
      payload.expiry = additionalPayload.values['expiry'].toString();
    }

    if (type === 'swap' && side === 'buy') {
      const devSellSettings = (await chrome.storage.local.get("bloom.devSellSettings"))?.["bloom.devSellSettings"] || {};
      if (devSellSettings.enabled) {
        if (devSellSettings.sellAmount && devSellSettings.sellSlippage && devSellSettings.sellBundleTip) {
          payload.devsell = {
            slippage: devSellSettings.sellSlippage.toString(),
            tip: devSellSettings.sellBundleTip.toString(),
            amt: devSellSettings.sellAmount.toString(),
          }
        }
      }
    }

    const res = await fetchWithTimeout(
      `https://extension.bloombot.app/${type}?region=${selectedRegion}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const data = await res.json();
    return data;
  } catch (error) {
    if (error.toString().includes("signal is aborted")) {
      return { status: "timeout" };
    }
    console.error("Failed to create order:", error);
    return null;
  }
}

// TOAST

function showToast(message, position = "bottom-right") {
  const previousToasts = document.querySelectorAll(".bloom-toast");
  previousToasts.forEach((toast) => toast.remove());

  const toast = document.createElement("div");
  toast.style.position = "fixed";
  if (position === "bottom-right") {
    toast.style.bottom = "20px";
    toast.style.right = "20px";
  } else if (position === "top-center") {
    toast.style.top = "20px";
    toast.style.left = "50%";
    toast.style.transform = "translateX(-50%)";
  }

  toast.style.backgroundColor = "rgba(255, 255, 255, 0)";
  toast.style.backdropFilter = "blur(6px)";

  toast.style.color = "#EEA7ED";
  toast.style.padding = "12px 24px";
  toast.style.borderRadius = "5px";
  toast.style.zIndex = 10000;
  toast.style.fontSize = "14px";
  toast.style.fontWeight = "600";
  toast.style.border = "1px solid #EEA7ED";
  toast.innerHTML = message;
  toast.classList.add("bloom-toast");

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = "opacity 0.5s ease-out";
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 500);
  }, position === "top-center" ? 10000 : 3000);
}

// FINDERS

async function findTokenContainer(isMemescope = false, timeout = 5000) {
  for (let i = 0; i < timeout / 500; i++) {
    const lpLinks = Array.from(document.querySelectorAll('a[href*="/lp/"]'));
    if (lpLinks.length > 0) {
      if (isMemescope) {
        const containers = Array.from(
          new Set(lpLinks.map((n) => n.parentElement.parentElement))
        ).filter((n) => !n.classList.contains("js-watching-list"));
        if (containers.length) return containers;
      } else {
        const containers = Array.from(
          new Set(lpLinks.map((n) => n.parentElement.parentElement))
        ).filter((n) => !n.classList.contains("js-watching-list"));
        if (containers.length) return containers[0].firstChild;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

async function findTopBar(timeout = 5000) {
  for (let i = 0; i < timeout / 500; i++) {
    const topBar = document.querySelector(".p-show__bar__row");
    if (topBar) {
      const lastDiv = topBar.querySelector(".l-col-md-auto:last-of-type");
      if (lastDiv) return lastDiv;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

async function findBuySellContainer(timeout = 5000) {
  for (let i = 0; i < timeout / 500; i++) {
    const container = document.querySelector("div.js-show__trade-tabs");
    if (container) return container;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

async function findSearchContainers(timeout = 5000) {
  for (let i = 0; i < timeout / 500; i++) {
    const containers = Array.from(document.querySelectorAll("div.c-autocomplete_wrapper"));
    if (containers.length) return containers;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

// HANDLERS

async function handleDiscoverTrending() {
  const container = await findTokenContainer();
  quickBuyAmount =
    (await chrome.storage.local.get("bloom.quickBuyAmount"))?.[
    "bloom.quickBuyAmount"
    ];
  if (container) {
    const cards = Array.from(container.querySelectorAll("a[href*='/lp/']"));
    cards.forEach((card) => addDiscoverTrendingBuyButton(card));
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (
            node.nodeName &&
            node.nodeName.toLowerCase() === "a" &&
            node.href.includes("/lp/")
          ) {
            addDiscoverTrendingBuyButton(node);
          } else if (node.nodeName && node.nodeName.toLowerCase() === "div" && node.classList.contains('c-grid-table__td')) {
            const card = node.closest('a[href*="/lp/"]');
            if (card) {
              addDiscoverTrendingBuyButton(card);
            }
          }
        });
      });
    });

    observer.observe(container, { childList: true, subtree: true });
    activeObservers["discover-trending"]
      ? activeObservers["discover-trending"].push(observer)
      : (activeObservers["discover-trending"] = [observer]);

    const containerParent = container.parentElement;
    if (containerParent) {
      const parentObserver = new MutationObserver(() => {
        observer.disconnect();
        parentObserver.disconnect();
        return handleDiscoverTrending();
      });
      parentObserver.observe(containerParent, { childList: true });
      activeObservers["discover-trending"]
        ? activeObservers["discover-trending"].push(parentObserver)
        : (activeObservers["discover-trending"] = [parentObserver]);
    }
  }
}

async function handleMemescopeContainer(container, idx) {
  quickBuyAmount =
    (await chrome.storage.local.get("bloom.quickBuyAmount"))?.[
    "bloom.quickBuyAmount"
    ];
  const cards = Array.from(container.querySelectorAll("a[href*='/lp/']")).map(
    (n) => n.parentElement
  );
  cards.forEach((card) => {
    if (memescopeButtonsEnabled) {
      addMemescopeButtons(card);
    }
  });
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeName && node.nodeName.toLowerCase() === "div") {
          const lpLink = node.querySelector("a[href*='/lp/']");
          if (lpLink) {
            if (memescopeButtonsEnabled) {
              addMemescopeButtons(node);
            }
          }
        }

        if (node.nodeName && node.nodeName.toLowerCase() === "span") {
          const isMigrating = node.textContent === "Migrating...";
          if (isMigrating) {
            const card = mutation.target?.offsetParent?.offsetParent;
            if (card) {
              if (memescopeButtonsEnabled) {
                addMemescopeButtons(card, true);
              }
            }
          }
        }
      });
    });
  });

  observer.observe(container, { childList: true, subtree: true });
  activeObservers["memescope"]
    ? activeObservers["memescope"].push(observer)
    : (activeObservers["memescope"] = [observer]);

  const containerParent = container.parentElement;
  if (containerParent) {
    const parentObserver = new MutationObserver(() => {
      observer.disconnect();
      parentObserver.disconnect();
      return handleMemescope(idx);
    });

    parentObserver.observe(containerParent, { childList: true });
    activeObservers["memescope"]
      ? activeObservers["memescope"].push(parentObserver)
      : (activeObservers["memescope"] = [parentObserver]);
  }
}

async function handleMemescope(idx) {
  const containers = await findTokenContainer(true);
  if (idx && containers[idx]) {
    handleMemescopeContainer(containers[idx], idx);
  } else {
    containers.forEach((container, idx) =>
      handleMemescopeContainer(container, idx)
    );
  }
  handleMemescopeToggle();
}

async function handleMemescopeToggle() {
  const existingBloomToggle = document.querySelector('.bloom-toggle-memescope-container');
  if (existingBloomToggle) return;
  const walletDropdown = document.querySelector('div.c-dropdown.c-wdd')
  if (!walletDropdown) return;
  const parent = walletDropdown.parentElement
  if (!parent) return;
  const bloomToggle = parent.cloneNode(false)
  bloomToggle.classList.add('bloom-toggle-memescope-container')
  const toggleButton = document.createElement('button')
  toggleButton.innerHTML = `${memescopeButtonsEnabled ? 'Disable' : 'Enable'} Memescope Buttons`
  toggleButton.style.border = '1px solid #EEA7ED'
  toggleButton.style.borderRadius = '5px'
  toggleButton.style.backgroundColor = 'transparent'
  toggleButton.style.color = '#EEA7ED'
  toggleButton.style.padding = '0 10px'
  toggleButton.style.height = '32px'
  toggleButton.style.cursor = 'pointer'
  toggleButton.classList.add('bloom-toggle-memescope-btn')
  toggleButton.onclick = () => {
    memescopeButtonsEnabled = !memescopeButtonsEnabled;
    chrome.storage.local.set({ 'bloom.memescopeButtons': memescopeButtonsEnabled })
    toggleButton.innerHTML = `${memescopeButtonsEnabled ? 'Disable' : 'Enable'} Memescope Buttons`
    if (memescopeButtonsEnabled) {
      const cards = Array.from(document.querySelectorAll("a[href*='/lp/']"));
      cards.forEach((card) => addMemescopeButtons(card.parentElement, true));
    } else {
      const memescopeButtons = document.querySelectorAll('button.bloom-buy-qt-btn, button.bloom-snipe-qt-btn');
      memescopeButtons.forEach((button) => button.remove());
    }
  }
  bloomToggle.appendChild(toggleButton)
  parent.insertAdjacentElement('afterend', bloomToggle)
}

async function handleSearch() {
  const containers = await findSearchContainers();
  if (!containers) return;
  containers.forEach((container) => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeName && node.nodeName.toLowerCase() === "div") {
            addSearchTokenButton(node);
          }
        });
      });
    });

    observer.observe(container, { childList: true, subtree: true });
    activeObservers["search"]
      ? activeObservers["search"].push(observer)
      : (activeObservers["search"] = [observer]);
  });
}

async function handleToken() {
  try {
    const topBar = await findTopBar();
    const buySellContainer = await findBuySellContainer();
    if (!topBar || !buySellContainer) return;
    let currentMigrating = document.querySelector("div.p-show__migration");
    addTokenButtons(currentMigrating);
    if (buySellContainer) {
      const observer = new MutationObserver((mutations) => {
        if (
          mutations.every(
            (m) =>
              m.target.nodeName && m.target.nodeName.toLowerCase() === "span"
          )
        )
          return;
        const migrating = document.querySelector("div.p-show__migration");
        if (Boolean(migrating) !== Boolean(currentMigrating)) {
          currentMigrating = migrating;
          addTokenButtons(currentMigrating);
        }
      });

      observer.observe(buySellContainer, { childList: true, subtree: true });
      activeObservers["token"]
        ? activeObservers["token"].push(observer)
        : (activeObservers["token"] = [observer]);
    }
  } catch (error) {
    console.error("Failed to add Token buttons:", error);
  }
}

// INJECTORS

function addSearchTokenButton(card) {
  const previousBuyButton = document.querySelector(".bloom-buy-qt-btn");
  if (previousBuyButton) previousBuyButton.remove();

  const bloomButton = document.createElement("button");
  bloomButton.innerHTML = `🌸 ${quickBuyAmount || 'Set Amount'}`;
  bloomButton.classList.add("bloom-search-qt-btn", "c-btn", "c-btn--lt");
  bloomButton.style.height = "32px";
  bloomButton.style.padding = "0 10px";
  bloomButton.style.marginLeft = "12px";

  bloomButton.onclick = async function (event) {
    event.preventDefault();
    event.stopPropagation();

    const poolAnchor = card.querySelector("a");
    if (!poolAnchor) return showToast("Token not found");

    const finalUrl = await fetchRedirectFinalUrl(poolAnchor.href);
    if (!finalUrl) {
      return showToast("Could not resolve the pool link");
    }

    let poolId = "";
    const urlParts = finalUrl.split("/lp/");
    if (urlParts.length > 1) {
      poolId = urlParts[1].split("?")[0];
    }
    if (!poolId) {
      return showToast("Pool ID not found in redirect URL");
    }

    const token = await getBloomToken();
    if (!token) {
      return chrome.runtime.sendMessage({
        message: "openTab",
        url: `https://t.me/BloomSolana_bot?start=ref_QT_ca_${poolId}`,
      });
    }

    let submitted = false;
    let availableRegions = ["EU1", "EU2", "US1"];
    let chosenRegion = (await chrome.storage.local.get("bloom.activeRegion"))?.["bloom.activeRegion"] || "EU1";
    if (!quickBuyAmount) {
      showToast("Please set a quick buy amount in the extension settings!");
      return;
    }
    while (!submitted && availableRegions.length) {
      const order = await interactWithBloom(chosenRegion, poolId, "swap", token, quickBuyAmount, "buy");
      if (order?.status === "success") {
        showToast("Order placed successfully!");
        submitted = true;
      } else if (order?.status === "timeout") {
        showToast("Error sending order, switched region to next available!");
        availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
        chosenRegion = availableRegions[0];
        await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
        break;
      } else if (order?.error === "maintenance") {
        showToast("Region is undergoing maintenance, automatically retrying on next available region!");
        availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
        chosenRegion = availableRegions[0];
        await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
      } else {
        showToast("Failed placing order!");
        break;
      }
    }
  }

  card?.firstElementChild?.firstElementChild?.firstElementChild?.appendChild(bloomButton);
}

function addTokenButtons(migrationContainer) {
  const previousSnipingButton = document.querySelector(".bloom-snipe-qt-btn");
  const previousBuyButton = document.querySelector(".bloom-buy-qt-btn");

  if (previousSnipingButton) {
    previousSnipingButton.remove();
  }
  if (previousBuyButton) {
    previousBuyButton.remove();
  }

  if (migrationContainer) {
    addTokenSnipeButton(migrationContainer);
  }

  addTokenTopBarButton();
  addTokenBuyButton();
  addTokenSellButton();
  addTokenLimitBuyButton();
  addTokenLimitSellButton();
}

function addTokenSnipeButton(migrationContainer) {
  const previousSnipeButton = document.querySelector(".bloom-snipe-qt-btn");
  if (previousSnipeButton) previousSnipeButton.remove();

  const migrationText = migrationContainer.querySelector("h2");
  if (!migrationText) return;

  const tokenMint = document
    .querySelector(".js-copy-to-clipboard:not(.p-show__bar__copy)")
    ?.getAttribute("data-address");
  if (!tokenMint) return;

  const bloomButton = document.createElement("button");
  bloomButton.innerHTML = "🌸 Snipe with Bloom";
  bloomButton.type = "button";
  bloomButton.classList.add("bloom-snipe-qt-btn", "c-btn", "c-btn--lt");
  bloomButton.style.height = "32px";
  bloomButton.style.padding = "0 10px";
  bloomButton.style.marginBottom = "12px";

  bloomButton.onclick = async function () {
    const token = await getBloomToken();
    if (!token) {
      return chrome.runtime.sendMessage({
        message: "openTab",
        url: `https://t.me/BloomSolana_bot?start=ref_QT_sniper_${tokenMint}`,
      });
    }

    let submitted = false;
    let availableRegions = ["EU1", "EU2", "US1"];
    let chosenRegion = (await chrome.storage.local.get("bloom.activeRegion"))?.["bloom.activeRegion"] || "EU1";
    while (!submitted && availableRegions.length) {
      const order = await interactWithBloom(chosenRegion, tokenMint, "snipe", token);
      if (order?.status === "success") {
        showToast("Successfully created sniping task!");
        submitted = true;
      } else if (order?.status === "timeout") {
        showToast("Error sending request, switched region to next available!");
        availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
        chosenRegion = availableRegions[0];
        await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
        break;
      } else if (order?.error === "maintenance") {
        showToast("Region is undergoing maintenance, automatically retrying on next available region!");
        availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
        chosenRegion = availableRegions[0];
        await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
      } else {
        showToast("Failed to create sniping task!");
        break;
      }
    }
  };

  insertBefore(migrationText, bloomButton);
}

function addTokenTopBarButton() {
  const previousTopBarButton = document.querySelector(".bloom-top-qt-btn");
  if (previousTopBarButton) return;

  const topBar = document.querySelector(".p-show__bar__row");
  if (!topBar) return;
  const lastDiv = topBar.querySelector(".l-col-md-auto:last-of-type");
  if (!lastDiv) return;

  const bloomButton = document.createElement("button");
  bloomButton.innerHTML = "🌸 Trade on Bloom";
  bloomButton.type = "button";
  bloomButton.classList.add("bloom-top-qt-btn", "c-btn", "c-btn--lt");
  bloomButton.style.height = "32px";
  bloomButton.style.padding = "0 10px";

  bloomButton.onclick = function () {
    const urlParts = window.location.href.split("/lp/");
    let poolId = "";
    if (urlParts.length > 1) {
      poolId = urlParts[1].split("?")[0];
    }

    chrome.runtime.sendMessage({
      message: "openTab",
      url: "https://t.me/BloomSolana_bot?start=ref_QT_ca_" + poolId,
    });
  };

  insertAfter(lastDiv, bloomButton);
}

function addTokenBuyButton() {
  const previousBuyButton = document.querySelector(".bloom-buy-qt-btn");
  if (previousBuyButton) previousBuyButton.remove();

  const photonBuyButtons = document.querySelectorAll(
    "button.js-buy-btn.js-show__trade-form__submit"
  );
  if (photonBuyButtons.length === 0) return;

  photonBuyButtons.forEach((photonBuyButton) => {
    const bloomButton = photonBuyButton.cloneNode(true);
    const firstDiv = bloomButton.querySelector("div");
    if (!firstDiv) return;
    firstDiv.textContent = "🌸";
    firstDiv.classList.remove("c-icon--flash");
    firstDiv.style.paddingTop = "2px";
    firstDiv.style.backgroundColor = "transparent";
    bloomButton.innerHTML = bloomButton.innerHTML.replace(
      "Quick Buy",
      "Bloom Buy"
    );
    bloomButton.classList.add("bloom-buy-qt-btn", "c-btn", "c-btn--lt");
    bloomButton.onclick = async function (event) {
      event.preventDefault();
      event.stopPropagation();

      const urlParts = window.location.href.split("/lp/");
      let poolId = "";
      if (urlParts.length > 1) {
        poolId = urlParts[1].split("?")[0];
      }
      if (!poolId) return showToast("Failed to get pool ID!");

      const token = await getBloomToken();
      if (!token) {
        return chrome.runtime.sendMessage({
          message: "openTab",
          url: `https://t.me/BloomSolana_bot?start=ref_QT_ca_${poolId}`,
        });
      }

      const amount = bloomButton.querySelector(
        ".js-buy-btn__amount"
      )?.textContent;
      if (!amount) {
        return showToast("Please enter a valid amount!");
      }

      let submitted = false;
      let availableRegions = ["EU1", "EU2", "US1"];
      let chosenRegion = (await chrome.storage.local.get("bloom.activeRegion"))?.["bloom.activeRegion"] || "EU1";
      while (!submitted && availableRegions.length) {
        const order = await interactWithBloom(chosenRegion, poolId, "swap", token, amount, "buy");
        if (order?.status === "success") {
          showToast("Order placed successfully!");
          submitted = true;
        } else if (order?.status === "timeout") {
          showToast("Error sending order, switched region to next available!");
          availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
          chosenRegion = availableRegions[0];
          await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
          break;
        } else if (order?.error === "maintenance") {
          showToast("Region is undergoing maintenance, automatically retrying on next available region!");
          availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
          chosenRegion = availableRegions[0];
          await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
        } else {
          showToast("Failed placing order!");
          break;
        }
      }
    };
    insertAfter(photonBuyButton, bloomButton);
  });
}

function addTokenLimitBuyButton() {
  const previousLimitBuyButton = document.querySelector(".bloom-limit-buy-qt-btn");
  if (previousLimitBuyButton) previousLimitBuyButton.remove();

  const photonLimitBuyButtons = document.querySelectorAll(
    "button.js-show__buy-order__submit"
  );
  if (photonLimitBuyButtons.length === 0) return;

  photonLimitBuyButtons.forEach((photonLimitBuyButton) => {
    const bloomButton = photonLimitBuyButton.cloneNode(true);
    bloomButton.textContent = "🌸 Create Order";
    bloomButton.classList.add("bloom-limit-buy-qt-btn", "c-btn", "c-btn--lt");
    bloomButton.onclick = async function (event) {
      event.preventDefault();
      event.stopPropagation();

      const tokenMint = document
        .querySelector(".js-copy-to-clipboard:not(.p-show__bar__copy)")
        ?.getAttribute("data-address");
      if (!tokenMint) return showToast("Failed to get token mint!");

      const limitSettings = (await chrome.storage.local.get("bloom.limitSettings"))?.["bloom.limitSettings"] || {};
      if (!Object.keys(limitSettings).length) {
        return showToast("Please set up limit settings first!");
      }

      const token = await getBloomToken();
      if (!token) {
        return chrome.runtime.sendMessage({
          message: "openTab",
          url: `https://t.me/BloomSolana_bot?start=ref_QT_ca_${poolId}`,
        });
      }

      let solAmount = null;
      const formField = document.querySelector('.c-w-form__amount__field.is-selected')
      if (!formField) {
        const selectedAmtBtn = document.querySelector('.js-price-form__btn.is-selected')
        if (!selectedAmtBtn) return showToast("Please enter a valid SOL amount!");
        solAmount = selectedAmtBtn.getAttribute('data-value');
      } else {
        const input = formField.querySelector('input');
        if (!input) return showToast("Please enter a valid SOL amount!");
        solAmount = input.value;
      }
      if (!solAmount || isNaN(parseFloat(solAmount))) return showToast("Please enter a valid SOL amount!");

      const currentMcap = document.querySelector('.p-show__widget__td__value[data-cable-val="mktCapVal"]')?.getAttribute('data-value');
      if (!currentMcap) return showToast("Failed to get current market cap!");

      const targetType = 'MarketCap';
      let targetValue = null;
      const dropdown = document.querySelector('div[data-tab-id="dip"][data-tabs-group="buy_widget"] div[data-select-id]')
      if (!dropdown) return showToast("Failed to get target type!");
      const dropdownId = dropdown.getAttribute('data-select-id');
      if (dropdownId === 'perc') {
        const percentageInput = document.querySelector('input.js-show__buy-order__input[data-line-id="dip"][name="percentage"]')
        if (!percentageInput) return showToast("Failed to get target value!");
        const percentage = percentageInput.value;
        if (!percentage || isNaN(parseFloat(percentage))) return showToast("Please enter a valid percentage!");
        targetValue = currentMcap * (1 - parseFloat(percentage) / 100);
      } else if (dropdownId === 'usd') {
        const targetValueInput = document.querySelector('input.js-w-form__price-trigger__field[data-line-id="dip"][name="usd"]')
        if (!targetValueInput) return showToast("Failed to get target value!");
        targetValue = targetValueInput.value;
        if (!targetValue || isNaN(parseFloat(targetValue))) return showToast("Please enter a valid target value!");
      } else {
        return showToast("Unsupported target type!");
      }

      const expirationInput = document.querySelector('input.js-w-form__experation[name="expiration_time"]')
      if (!expirationInput) return showToast("Failed to get expiration time!");
      const expirationTime = expirationInput.value;
      if (!expirationTime || isNaN(parseInt(expirationTime))) return showToast("Please enter a valid expiration time!");

      const additionalPayload = {
        values: {
          'limit-tip': limitSettings.limitBuyTip,
          'limit-slippage': limitSettings.limitBuySlippage,
          'target-type': targetType,
          'target-value': targetValue,
          'expiry': expirationTime,
        }
      };

      let submitted = false;
      let availableRegions = ["EU1", "EU2", "US1"];
      let chosenRegion = (await chrome.storage.local.get("bloom.activeRegion"))?.["bloom.activeRegion"] || "EU1";
      while (!submitted && availableRegions.length) {
        const order = await interactWithBloom(chosenRegion, tokenMint, "limit", token, solAmount, "buy", additionalPayload);
        if (order?.status === "success") {
          showToast("Order placed successfully!");
          submitted = true;
        } else if (order?.status === "timeout") {
          showToast("Error sending order, switched region to next available!");
          availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
          chosenRegion = availableRegions[0];
          await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
          break;
        } else if (order?.error === "maintenance") {
          showToast("Region is undergoing maintenance, automatically retrying on next available region!");
          availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
          chosenRegion = availableRegions[0];
          await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
        } else {
          showToast("Failed placing order!");
          break;
        }
      }

    };
    insertAfter(photonLimitBuyButton, bloomButton);
  });
}

function addTokenLimitSellButton() {
  const previousLimitSellButton = document.querySelector(".bloom-limit-sell-qt-btn");
  if (previousLimitSellButton) previousLimitSellButton.remove();

  const photonLimitSellButtons = document.querySelectorAll(
    "button.js-show__sell-order__submit"
  );
  if (photonLimitSellButtons.length === 0) return;

  photonLimitSellButtons.forEach((photonLimitSellButton) => {
    const bloomButton = photonLimitSellButton.cloneNode(true);
    bloomButton.textContent = "🌸 Create Order";
    bloomButton.classList.add("bloom-limit-sell-qt-btn", "c-btn", "c-btn--lt");
    bloomButton.onclick = async function (event) {
      event.preventDefault();
      event.stopPropagation();

      const tokenMint = document
        .querySelector(".js-copy-to-clipboard:not(.p-show__bar__copy)")
        ?.getAttribute("data-address");
      if (!tokenMint) return showToast("Failed to get token mint!");

      const limitSettings = (await chrome.storage.local.get("bloom.limitSettings"))?.["bloom.limitSettings"] || {};
      if (!Object.keys(limitSettings).length) {
        return showToast("Please set up limit settings first!");
      }

      const token = await getBloomToken();
      if (!token) {
        return chrome.runtime.sendMessage({
          message: "openTab",
          url: `https://t.me/BloomSolana_bot?start=ref_QT_ca_${poolId}`,
        });
      }

      const selectedTab = document.querySelector('div.js-w-form__price-trigger.is-selected[data-tabs-group="sell_order"]')
      if (!selectedTab) return showToast("Failed to get selected tab!");

      const amountInput = selectedTab.querySelector('input.js-show__sell-order__input[name="amount"]')
      if (!amountInput) return showToast("Failed to get amount input!");
      const amount = amountInput.value;
      if (!amount || isNaN(parseFloat(amount))) return showToast("Please enter a valid amount!");

      const currentMcap = document.querySelector('.p-show__widget__td__value[data-cable-val="mktCapVal"]')?.getAttribute('data-value');
      if (!currentMcap) return showToast("Failed to get current market cap!");

      const targetType = 'MarketCap';
      let targetValue = null;
      const dropdown = selectedTab.querySelector('div[data-select-id]')
      if (!dropdown) return showToast("Failed to get target type!");
      const dropdownId = dropdown.getAttribute('data-select-id');
      const orderType = selectedTab.getAttribute('data-tab-id')
      if (dropdownId === 'perc') {
        const percentageInput = selectedTab.querySelector(`input.js-w-form__price-trigger__field[data-line-id=${orderType}][name="percentage"]`)
        if (!percentageInput) return showToast("Failed to get target value!");
        const percentage = percentageInput.value;
        if (!percentage || isNaN(parseFloat(percentage))) return showToast("Please enter a valid percentage!");
        if (orderType === "stop_loss") {
          targetValue = currentMcap * (1 - parseFloat(percentage) / 100);
          if (parseInt(targetValue) > parseInt(currentMcap)) {
            return showToast("Stop loss target cannot be greater than current market cap!");
          }
        } else {
          targetValue = currentMcap * (1 + parseFloat(percentage) / 100);
          if (parseInt(targetValue) < parseInt(currentMcap)) {
            return showToast("Take profit target cannot be less than current market cap!");
          }
        }
      } else if (dropdownId === 'usd') {
        const targetValueInput = selectedTab.querySelector(`input.js-w-form__price-trigger__field[data-line-id=${orderType}][name="usd"]`)
        if (!targetValueInput) return showToast("Failed to get target value!");
        targetValue = targetValueInput.value;
        if (!targetValue || isNaN(parseFloat(targetValue))) return showToast("Please enter a valid target value!");
        if (orderType === "stop_loss") {
          if (parseInt(targetValue) > parseInt(currentMcap)) {
            return showToast("Stop loss target cannot be greater than current market cap!");
          }
        } else {
          if (parseInt(targetValue) < parseInt(currentMcap)) {
            return showToast("Take profit target cannot be less than current market cap!");
          }
        }
      }

      const expirationInput = selectedTab.parentElement.querySelector('input.js-w-form__experation[name="expiration_time"]')
      if (!expirationInput) return showToast("Failed to get expiration time!");
      const expirationTime = expirationInput.value;
      if (!expirationTime || isNaN(parseInt(expirationTime))) return showToast("Please enter a valid expiration time!");

      const additionalPayload = {
        values: {
          'limit-tip': limitSettings.limitSellTip,
          'limit-slippage': limitSettings.limitSellSlippage,
          'target-type': targetType,
          'target-value': targetValue,
          'expiry': expirationTime,
        }
      };

      let submitted = false;
      let availableRegions = ["EU1", "EU2", "US1"];
      let chosenRegion = (await chrome.storage.local.get("bloom.activeRegion"))?.["bloom.activeRegion"] || "EU1";
      while (!submitted && availableRegions.length) {
        const order = await interactWithBloom(chosenRegion, tokenMint, "limit", token, amount, "sell", additionalPayload);
        if (order?.status === "success") {
          showToast("Order placed successfully!");
          submitted = true;
        } else if (order?.status === "timeout") {
          showToast("Error sending order, switched region to next available!");
          availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
          chosenRegion = availableRegions[0];
          await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
          break;
        } else if (order?.error === "maintenance") {
          showToast("Region is undergoing maintenance, automatically retrying on next available region!");
          availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
          chosenRegion = availableRegions[0];
          await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
        } else {
          showToast("Failed placing order!");
          break;
        }
      }
    };
    insertAfter(photonLimitSellButton, bloomButton);
  });
}

function addTokenSellButton() {
  const previousSellButton = document.querySelector(".bloom-sell-qt-btn");
  if (previousSellButton) return;

  const photonSellButtons = document.querySelectorAll(
    "button.js-sell-btn.js-show__trade-form__submit"
  );
  if (photonSellButtons.length === 0) return;

  photonSellButtons.forEach((photonSellButton) => {
    const container = photonSellButton.closest(".js-show__trade-form");
    if (!container) return;

    const pctButtons = container.querySelectorAll(".js-price-form__btn");
    if (pctButtons.length === 0) return;
    const pctInput = container.querySelector(".js-price-form__input");
    if (!pctInput) return;

    const bloomButton = photonSellButton.cloneNode(true);
    bloomButton.textContent = "🌸 Bloom Sell";
    bloomButton.classList.add("bloom-sell-qt-btn", "c-btn", "c-btn--lt");
    bloomButton.onclick = async function (event) {
      event.preventDefault();
      event.stopPropagation();

      const urlParts = window.location.href.split("/lp/");
      let poolId = "";
      if (urlParts.length > 1) {
        poolId = urlParts[1].split("?")[0];
      }
      if (!poolId) return showToast("Failed to get pool ID!");

      const token = await getBloomToken();
      if (!token) {
        return chrome.runtime.sendMessage({
          message: "openTab",
          url: `https://t.me/BloomSolana_bot?start=ref_QT_ca_${poolId}`,
        });
      }

      let selectedPct = container
        .querySelector(".js-price-form__btn.is-selected")
        ?.getAttribute("data-value");
      if (!selectedPct) {
        selectedPct = Array.from(
          container.querySelectorAll(
            '.js-price-form__input[data-type="percent"]'
          )
        ).find((n) => n.value)?.value;
        if (!selectedPct || isNaN(parseFloat(selectedPct))) {
          return showToast("Please select a valid percentage!");
        }
      }

      let submitted = false;
      let availableRegions = ["EU1", "EU2", "US1"];
      let chosenRegion = (await chrome.storage.local.get("bloom.activeRegion"))?.["bloom.activeRegion"] || "EU1";
      while (!submitted && availableRegions.length) {
        const order = await interactWithBloom(chosenRegion, poolId, "swap", token, selectedPct, "sell");
        if (order?.status === "success") {
          showToast("Order placed successfully!");
          submitted = true;
        } else if (order?.status === "timeout") {
          showToast("Error sending order, switched region to next available!");
          availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
          chosenRegion = availableRegions[0];
          await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
          break;
        } else if (order?.error === "maintenance") {
          showToast("Region is undergoing maintenance, automatically retrying on next available region!");
          availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
          chosenRegion = availableRegions[0];
          await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
        } else {
          showToast("Failed placing order!");
          break;
        }
      }
    };

    pctButtons.forEach((pctButton) => {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.target?.classList?.contains("is-selected")) {
            const selectedPct = mutation.target?.getAttribute("data-value");
            if (selectedPct) {
              bloomButton.textContent = `🌸 Bloom Sell ${selectedPct}%`;
            }
          }
        });
      });
      observer.observe(pctButton, { attributes: true });
    });

    pctInput.addEventListener("input", () => {
      if (!pctInput.value) {
        bloomButton.textContent = "🌸 Bloom Sell";
      } else {
        bloomButton.textContent = `🌸 Bloom Sell ${pctInput.value}%`;
      }
    });

    insertAfter(photonSellButton, bloomButton);
  });
}

function addMemescopeButtons(card, reload = false) {
  try {
    const isMigrating = Array.from(card.querySelectorAll("span")).some(
      (span) => span.textContent === "Migrating..."
    );
    const existingBuyButton = card.querySelector(".bloom-buy-qt-btn");
    const existingSnipeButton = card.querySelector(".bloom-snipe-qt-btn");

    if (existingBuyButton || existingSnipeButton) {
      if (reload && existingBuyButton) {
        existingBuyButton.remove();
      } else if (reload && existingSnipeButton) {
        existingSnipeButton.remove();
      } else if (isMigrating && existingBuyButton) {
        existingBuyButton.remove();
      } else if (!isMigrating && existingSnipeButton) {
        existingSnipeButton.remove();
      } else {
        return;
      }
    }

    const tokenMint = card
      .querySelector(".js-copy-to-clipboard")
      ?.getAttribute("data-address");
    if (!tokenMint) return;

    const poolUrl = card.querySelector("a[href*='/lp/']")?.href;
    if (!poolUrl) return;
    const poolId = poolUrl.split("lp/")[1].split("?")[0];
    if (!poolId) return;

    let actionArea = card.querySelector("button:not([aria-haspopup])");
    if (isMigrating) {
      actionArea = Array.from(card.querySelectorAll("span")).find(
        (span) => span.textContent === "Migrating..."
      );
    }
    if (!actionArea) return;

    if (isMigrating) {
      addMemescopeSnipingButton(actionArea, tokenMint);
    } else {
      addMemescopeBuyButton(actionArea, poolId, quickBuyAmount);
    }
  } catch (error) {
    console.error("Failed to add Bloom button:", error);
  }
}

function addMemescopeSnipingButton(actionArea, tokenMint) {
  const buttonText = "🌸 Snipe";

  const bloomButton = document.createElement("button");
  bloomButton.innerHTML = buttonText;
  bloomButton.type = "button";
  bloomButton.classList.add(
    "bloom-snipe-qt-btn",
    "c-btn",
    "c-btn--lt",
    "u-px-xs"
  );
  bloomButton.style.bottom = "3px";
  bloomButton.style.right = "6px";
  bloomButton.style.position = "relative";
  bloomButton.style.zIndex = 998;
  bloomButton.onclick = async function (event) {
    event.preventDefault();
    event.stopPropagation();

    const token = await getBloomToken();
    if (!token) {
      return chrome.runtime.sendMessage({
        message: "openTab",
        url: `https://t.me/BloomSolana_bot?start=ref_QT_sniper_${tokenMint}`,
      });
    }

    let submitted = false;
    let availableRegions = ["EU1", "EU2", "US1"];
    let chosenRegion = (await chrome.storage.local.get("bloom.activeRegion"))?.["bloom.activeRegion"] || "EU1";
    while (!submitted && availableRegions.length) {
      const order = await interactWithBloom(chosenRegion, tokenMint, "snipe", token);
      if (order?.status === "success") {
        showToast("Order placed successfully!");
        submitted = true;
      } else if (order?.status === "timeout") {
        showToast("Error sending order, switched region to next available!");
        availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
        chosenRegion = availableRegions[0];
        await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
        break;
      } else if (order?.error === "maintenance") {
        showToast("Region is undergoing maintenance, automatically retrying on next available region!");
        availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
        chosenRegion = availableRegions[0];
        await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
      } else {
        showToast("Failed placing order!");
        break;
      }
    }
  };
  insertBefore(actionArea, bloomButton);
}

function addMemescopeBuyButton(actionArea, poolId, quickBuyAmount) {
  const bloomButton = actionArea.cloneNode(true);
  bloomButton.style.bottom = "3px";
  bloomButton.style.right = "6px";
  bloomButton.style.position = "relative";
  bloomButton.style.zIndex = 998;
  bloomButton.classList.add("bloom-buy-qt-btn");

  const firstSpan = bloomButton.querySelector("span");
  if (!firstSpan) return;
  firstSpan.textContent = "🌸";
  firstSpan.classList.remove("c-icon--flash");
  firstSpan.style.backgroundColor = "transparent";
  firstSpan.style.marginRight = "4px";

  const allTextEllipsis = Array.from(
    bloomButton.querySelectorAll("div.text-ellipsis")
  );
  let lastSpan = allTextEllipsis[allTextEllipsis.length - 1];
  if (!lastSpan) {
    lastSpan = document.createElement("span");
    lastSpan.classList.add("text-ellipsis");
    bloomButton.appendChild(lastSpan);
  }

  lastSpan.textContent = `${quickBuyAmount || 'Set Amount'}`;

  bloomButton.onclick = async function (event) {
    event.preventDefault();
    event.stopPropagation();

    const token = await getBloomToken();
    if (!token) {
      return chrome.runtime.sendMessage({
        message: "openTab",
        url: `https://t.me/BloomSolana_bot?start=ref_QT_ca_${poolId}`,
      });
    }

    if (!quickBuyAmount) {
      showToast("Please set a quick buy amount in the extension settings!");
      return;
    }
          if (!quickBuyAmount) {
        showToast("Please set a quick buy amount in the extension settings!");
        return;
      }
      let submitted = false;
      let availableRegions = ["EU1", "EU2", "US1"];
      let chosenRegion = (await chrome.storage.local.get("bloom.activeRegion"))?.["bloom.activeRegion"] || "EU1";
      while (!submitted && availableRegions.length) {
        const order = await interactWithBloom(chosenRegion, poolId, "swap", token, quickBuyAmount, "buy");
      if (order?.status === "success") {
        showToast("Order placed successfully!");
        submitted = true;
      } else if (order?.status === "timeout") {
        showToast("Error sending order, switched region to next available!");
        availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
        chosenRegion = availableRegions[0];
        await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
        break;
      } else if (order?.error === "maintenance") {
        showToast("Region is undergoing maintenance, automatically retrying on next available region!");
        availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
        chosenRegion = availableRegions[0];
        await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
      } else {
        showToast("Failed placing order!");
        break;
      }
    }
  };

  insertBefore(actionArea, bloomButton);
}

async function addDiscoverTrendingBuyButton(card) {
  try {
    const existingBuyButton = card.querySelector(".bloom-buy-qt-btn");

    if (existingBuyButton) {
      existingBuyButton.remove();
    }

    const actionArea = card.querySelector("button");
    if (!actionArea) return;

    const poolId = card.href.split("lp/")[1].split("?")[0];
    if (!poolId) return;

    const buttonClass = "bloom-buy-qt-btn";

    const bloomButton = actionArea.cloneNode(true);
    const firstSpan = bloomButton.querySelector("span");
    if (!firstSpan) return;

    firstSpan.textContent = "🌸";
    firstSpan.classList.remove("c-icon--flash");
    firstSpan.style.backgroundColor = "transparent";

    const allTextEllipsis = Array.from(
      bloomButton.querySelectorAll("div.text-ellipsis")
    );
    const lastSpan = allTextEllipsis[allTextEllipsis.length - 1];
    if (!lastSpan) return;

    lastSpan.textContent = `${quickBuyAmount || 'Set Amount'}`;

    bloomButton.type = "button";
    bloomButton.classList.add(buttonClass);
    bloomButton.style.margin = "4px 0px";
    bloomButton.style.zIndex = 1000;
    actionArea.style.marginTop = "-6px";

    bloomButton.onclick = async function (event) {
      event.preventDefault();
      event.stopPropagation();

      const token = await getBloomToken();
      if (!token) {
        return chrome.runtime.sendMessage({
          message: "openTab",
          url: `https://t.me/BloomSolana_bot?start=ref_QT_ca_${poolId}`,
        });
      }

      if (!quickBuyAmount) {
        showToast("Please set a quick buy amount in the extension settings!");
        return;
      }

      let submitted = false;
      let availableRegions = ["EU1", "EU2", "US1"];
      let chosenRegion = (await chrome.storage.local.get("bloom.activeRegion"))?.["bloom.activeRegion"] || "EU1";
      while (!submitted && availableRegions.length) {
        const order = await interactWithBloom(chosenRegion, poolId, "swap", token, quickBuyAmount, "buy");
        if (order?.status === "success") {
          showToast("Order placed successfully!");
          submitted = true;
        } else if (order?.status === "timeout") {
          showToast("Error sending order, switched region to next available!");
          availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
          chosenRegion = availableRegions[0];
          await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
          break;
        } else if (order?.error === "maintenance") {
          showToast("Region is undergoing maintenance, automatically retrying on next available region!");
          availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
          chosenRegion = availableRegions[0];
          await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
        } else {
          showToast("Failed placing order!");
          break;
        }
      }
    };

    insertAfter(actionArea, bloomButton);
  } catch (error) {
    console.error("Failed to add Bloom button:", error);
  }
}

let isQuickPanelHidden = false;
let chosenRegion = "EU1";

async function addBloomQuickPanel() {
  try {
    const {
      'bloom.presets': bloomPresets,
      'bloom.activePreset': activeBloomPreset,
      [`bloom.hiddenState.${platform}`]: hiddenState,
      'bloom.activeRegion': activeRegion
    } = await chrome.storage.local.get([
      "bloom.presets",
      "bloom.activePreset",
      `bloom.hiddenState.${platform}`,
      "bloom.activeRegion"
    ]);

    let chosenPreset = null;
    if (Array.isArray(bloomPresets) && bloomPresets.length > 0) {
      if (activeBloomPreset) {
        chosenPreset =
          bloomPresets.find((p) => p.label === activeBloomPreset) ||
          bloomPresets[0];
      } else {
        chosenPreset = bloomPresets[0];
      }
    }

    if (activeRegion) chosenRegion = activeRegion;

    const container = document.createElement("div");
    container.classList.add("bloomModalContainer");
    container.style.pointerEvents = "none";
    container.style.visibility = "hidden";
    await styleContainer(container);

    const header = document.createElement("div");
    Object.assign(header.style, {
      cursor: hiddenState ? "default" : "move",
      fontWeight: "500",
      color: "#f0b3f0",
      fontSize: "16px",
      textShadow: "2px 2px 4px rgba(0, 0, 0, 0.3)",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "8px",
      paddingBottom: "8px",
      paddingTop: "8px",
      borderBottom: "1px solid #5e5e68",
    });

    const headerLeft = document.createElement("div");
    Object.assign(headerLeft.style, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      flex: "1",
    });

    if (!Array.isArray(bloomPresets) || bloomPresets.length === 0) {
      const headerLeftText = document.createElement("span");
      headerLeftText.textContent = "No Bloom Presets";
      styleLabelText(headerLeftText);
      headerLeft.appendChild(headerLeftText);
    } else {
      let presetSelector = document.createElement("select");
      styleDropdown(presetSelector);

      bloomPresets.forEach((pst) => {
        const option = document.createElement("option");
        option.value = pst.label;
        option.textContent = pst.label;
        presetSelector.appendChild(option);
      });

      if (chosenPreset) {
        presetSelector.value = chosenPreset.label;
      }

      presetSelector.addEventListener("mousedown", (evt) => {
        evt.stopPropagation();
      });
      presetSelector.addEventListener("change", async (e) => {
        const newLabel = e.target.value;
        const newPreset = bloomPresets.find((p) => p.label === newLabel);
        if (!newPreset) return;
        await chrome.storage.local.set({ 'bloom.activePreset': newLabel });
        chosenPreset = newPreset;
        updateBloomModalUI(newPreset, bodyWrapper, regionSelect);
      });

      headerLeft.appendChild(presetSelector);
    }

    const regionSelect = document.createElement("select");
    styleDropdown(regionSelect);

    ["EU1", "EU2", "US1", "SG1"].forEach((region) => {
      const opt = document.createElement("option");
      opt.value = region;
      opt.textContent = region;
      regionSelect.appendChild(opt);
    });
    regionSelect.value = chosenRegion;

    regionSelect.addEventListener("mousedown", (evt) => {
      evt.stopPropagation();
    });

    regionSelect.addEventListener("change", async (e) => {
      chosenRegion = e.target.value;
      await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
    });

    headerLeft.appendChild(regionSelect);

    header.appendChild(headerLeft);

    const settingsBtn = document.createElement("button");
    settingsBtn.textContent = "⚙️";
    Object.assign(settingsBtn.style, {
      background: "transparent",
      border: "none",
      cursor: "pointer",
      fontSize: "16px",
      color: "#e5ace5",
      padding: "0 4px",
      lineHeight: "1.15"
    });
    settingsBtn.addEventListener("mousedown", (evt) => {
      evt.stopPropagation();
    });
    settingsBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({
        message: "openTab",
        url: chrome.runtime.getURL("src/public/bloom_settings.html"),
      });
    });
    header.appendChild(settingsBtn);

    const bodyWrapper = document.createElement("div");
    Object.assign(bodyWrapper.style, {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      padding: "0 4px",
    });

    container.appendChild(header);
    container.appendChild(bodyWrapper);

    removeBloomQuickPanels();
    document.body.appendChild(container);

    await updateBloomModalUI(chosenPreset, bodyWrapper, regionSelect);

    await new Promise((resolve) => requestAnimationFrame(resolve));

    const containerHeight = container.offsetHeight;

    if (hiddenState) {
      container.style.transition = 'none';
      const originalTransition = 'bottom 0.3s ease, right 0.3s ease';
      const showMargin = 48;
      const bottomPos = -(containerHeight - showMargin);

      container.style.inset = '';
      container.style.top = 'auto';
      container.style.left = 'auto';
      container.style.bottom = bottomPos + 'px';
      container.style.right = '20px';

      container.style.transition = originalTransition;
      container.style.visibility = "visible";
    } else {
      restoreBloomPanelPosition(container, `bloom.positionBeforeHide.${platform}`);
    }

    addHideUnhideBehavior(container, hiddenState, containerHeight);
    initializePanelResize(container, `bloom.scaleFactor.${platform}`);
    restoreBloomPanelScale(container, `bloom.scaleFactor.${platform}`);

    container.style.pointerEvents = "auto";
  } catch (error) {
    console.error("Failed to add Bloom popup:", error);
  }
}

function addHideUnhideBehavior(container, initialHiddenState, containerHeight) {
  const originalTransition = "bottom 0.3s ease, right 0.3s ease";
  const showMargin = 48;
  const hoverMargin = 72;

  isQuickPanelHidden = Boolean(initialHiddenState);

  container.style.transition = originalTransition;

  const minimizeBtn = document.createElement("button");
  minimizeBtn.textContent = isQuickPanelHidden ? "⛶" : "–";
  Object.assign(minimizeBtn.style, {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: "20px",
    color: "#e5ace5",
    marginRight: "4px",
    marginLeft: "8px",
    padding: "0 4px"
  });

  const header = container.firstChild;
  header.appendChild(minimizeBtn);

  if (!isQuickPanelHidden) {
    initializePanelDrag(container, `bloom.positionBeforeHide.${platform}`);
    header.style.cursor = "move";
  } else {
    container.style.transform = "scale(1)";
    header.style.cursor = "default";
  }

  minimizeBtn.addEventListener("mousedown", (evt) => {
    evt.stopPropagation();
  });
  minimizeBtn.addEventListener("click", async (evt) => {
    evt.stopPropagation();
    evt.preventDefault();
    if (!isQuickPanelHidden) {
      hideContainer();
    } else {
      unhideContainer();
    }
  });

  document.addEventListener("keydown", (evt) => {
    if ((evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === "b") {
      evt.preventDefault();
      if (isQuickPanelHidden) {
        unhideContainer();
      } else {
        hideContainer();
      }
    }
  });

  container.addEventListener("mouseenter", () => {
    if (isQuickPanelHidden) {
      const bottomPos = -(containerHeight - hoverMargin);
      container.style.bottom = bottomPos + "px";
    }
  });

  container.addEventListener("mouseleave", () => {
    if (isQuickPanelHidden) {
      const bottomPos = -(containerHeight - showMargin);
      container.style.bottom = bottomPos + "px";
    }
  });

  function hideContainer() {
    isQuickPanelHidden = true;
    chrome.storage.local.set({ [`bloom.hiddenState.${platform}`]: true });

    let { left, top } = container.style;
    if (!left || left === "auto") {
      left = container.getBoundingClientRect().left + "px";
    }
    if (!top || top === "auto") {
      top = container.getBoundingClientRect().top + "px";
    }
    chrome.storage.local.set({
      [`bloom.positionBeforeHide.${platform}`]: { left, top },
    });

    container.style.height = container.offsetHeight + 'px';
    container.style.transition = "opacity 0.2s ease";
    container.style.opacity = "0";

    setTimeout(() => {
      minimizeBtn.textContent = "⛶";
      header.style.cursor = "default";

      container.style.transition = "none";
      container.style.height = '';
      container.style.inset = '';
      container.style.top = "auto";
      container.style.left = "auto";
      container.style.bottom = "auto";
      container.style.right = "20px";
      const bottomPos = -(containerHeight - showMargin);
      container.style.bottom = bottomPos + "px";

      setTimeout(() => {
        container.style.transition = "opacity 0.2s ease";
        container.style.opacity = "1";
        container.style.transform = `scale(1)`;

        setTimeout(() => {
          container.style.transition = originalTransition;
        }, 200);
      }, 0);
    }, 200);
  }

  function unhideContainer() {
    isQuickPanelHidden = false;
    chrome.storage.local.set({ [`bloom.hiddenState.${platform}`]: false });

    container.style.height = container.offsetHeight + 'px';
    container.style.transition = "opacity 0.2s ease";
    container.style.opacity = "0";

    setTimeout(() => {
      minimizeBtn.textContent = "–";
      header.style.cursor = "move";

      container.style.transition = "none";
      container.style.height = '';
      container.style.inset = '';
      container.style.right = "auto";
      container.style.bottom = "auto";
      container.style.top = "";
      container.style.left = "";
      restoreBloomPanelPosition(container, `bloom.positionBeforeHide.${platform}`);

      setTimeout(() => {
        container.style.transition = "opacity 0.2s ease";
        container.style.opacity = "1";

        initializePanelDrag(container, `bloom.positionBeforeHide.${platform}`);
        restoreBloomPanelScale(container, `bloom.scaleFactor.${platform}`);

        setTimeout(() => {
          container.style.transition = originalTransition;
        }, 200);
      }, 0);
    }, 200);
  }
}

async function updateBloomModalUI(preset, bodyWrapper, regionSelect) {
  bodyWrapper.innerHTML = "";

  const buySide = document.createElement("div");
  styleSideDiv(buySide);
  const buyTitle = document.createElement("div");
  buyTitle.textContent = "Quick Buy";
  styleTitle(buyTitle);
  buySide.appendChild(buyTitle);

  const buyButtonContainer = document.createElement("div");
  Object.assign(buyButtonContainer.style, {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: "6px",
    width: "100%",
  });

  const devSellSettings = (await chrome.storage.local.get("bloom.devSellSettings"))?.["bloom.devSellSettings"] || {};

  const buyAmounts = preset?.values?.["buy-amounts"] || (devSellSettings.btnEnabled ? [0.5, 1, 2, 5] : [0.5, 1, 2, 5, 10]);
  buyAmounts.forEach((amt) => {
    const btn = document.createElement("button");
    styleButton(btn, "buy", true);
    const text = `${amt}`;
    btn.textContent = text;
    btn.addEventListener("click", async () => {
      showButtonClickFeedback(btn, text, "buy", "pending", true);

      const token = await getBloomToken();
      if (!token) {
        showToast("Log in to the Bloom extension first!");
        showButtonClickFeedback(btn, text, "buy", "error", true);
        return;
      }

      const urlParts = window.location.href.split("/lp/");
      let poolId = "";
      if (urlParts.length > 1) {
        poolId = urlParts[1].split("?")[0];
      }
      if (!poolId) {
        showToast("Token not found!");
        showButtonClickFeedback(btn, text, "buy", "error", true);
        return;
      }

      let submitted = false;
      let availableRegions = ["EU1", "EU2", "US1"];
      while (!submitted && availableRegions.length) {
        const buyOrder = await interactWithBloom(chosenRegion, poolId, "swap", token, amt, "buy", preset);
        if (buyOrder?.status === "success") {
          showToast("Buy order sent!");
          showButtonClickFeedback(btn, text, "buy", "success", true);
          submitted = true;
        } else if (buyOrder?.status === "timeout") {
          showToast("Error sending order, switched region to next available!");
          availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
          chosenRegion = availableRegions[0];
          regionSelect.value = chosenRegion;
          await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
          showButtonClickFeedback(btn, text, "buy", "error", true);
          break;
        } else if (buyOrder?.error === "maintenance") {
          showToast("Region is undergoing maintenance, automatically retrying on next available region!");
          availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
          chosenRegion = availableRegions[0];
          regionSelect.value = chosenRegion;
          await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
          showButtonClickFeedback(btn, text, "buy", "error", true);
        } else {
          showToast("Failed to send buy order!");
          showButtonClickFeedback(btn, text, "buy", "error", true);
          break;
        }
      }
    });
    buyButtonContainer.appendChild(btn);
  });

  const manualBuyWrapper = document.createElement("div");
  Object.assign(manualBuyWrapper.style, {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: "6px",
    marginTop: "4px",
  });
  const manualBuyInput = document.createElement("input");
  styleInput(manualBuyInput);
  manualBuyInput.placeholder = "Enter SOL amount";

  const manualBuyBtn = document.createElement("button");
  styleButton(manualBuyBtn, "buy");
  const buyText = "Buy";
  manualBuyBtn.textContent = buyText;
  manualBuyBtn.addEventListener("click", async () => {
    showButtonClickFeedback(manualBuyBtn, buyText, "buy", "pending", true);

    const val = manualBuyInput.value.trim();
    if (!val || isNaN(val) || val <= 0) {
      showToast("Please enter a valid SOL amount!");
      showButtonClickFeedback(manualBuyBtn, buyText, "buy", "error", true);
      return;
    }
    const token = await getBloomToken();
    if (!token) {
      showToast("Log in to the Bloom extension first!");
      showButtonClickFeedback(manualBuyBtn, buyText, "buy", "error", true);
      return;
    }

    const urlParts = window.location.href.split("/lp/");
    let poolId = "";
    if (urlParts.length > 1) {
      poolId = urlParts[1].split("?")[0];
    }
    if (!poolId) {
      showToast("Token not found!");
      showButtonClickFeedback(manualBuyBtn, buyText, "buy", "error", true);
      return;
    }

    let submitted = false;
    let availableRegions = ["EU1", "EU2", "US1"];
    while (!submitted && availableRegions.length) {
      const buyOrder = await interactWithBloom(chosenRegion, poolId, "swap", token, val, "buy", preset);
      if (buyOrder?.status === "success") {
        showToast("Buy order sent!");
        showButtonClickFeedback(manualBuyBtn, buyText, "buy", "success", true);
        submitted = true;
      } else if (buyOrder?.status === "timeout") {
        showToast("Error sending order, switched region to next available!");
        availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
        chosenRegion = availableRegions[0];
        regionSelect.value = chosenRegion;
        await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
        showButtonClickFeedback(manualBuyBtn, buyText, "buy", "error", true);
        break;
      } else if (buyOrder?.error === "maintenance") {
        showToast("Region is undergoing maintenance, automatically retrying on next available region!");
        availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
        chosenRegion = availableRegions[0];
        regionSelect.value = chosenRegion;
        await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
        showButtonClickFeedback(manualBuyBtn, buyText, "buy", "error", true);
      } else {
        showToast("Failed to send buy order!");
        showButtonClickFeedback(manualBuyBtn, buyText, "buy", "error", true);
        break;
      }
    }
  });

  manualBuyWrapper.appendChild(manualBuyInput);
  manualBuyWrapper.appendChild(manualBuyBtn);

  buySide.appendChild(buyButtonContainer);
  buySide.appendChild(manualBuyWrapper);

  const sellSide = document.createElement("div");
  styleSideDiv(sellSide);
  const sellTitle = document.createElement("div");
  sellTitle.textContent = "Quick Sell";
  styleTitle(sellTitle);
  sellSide.appendChild(sellTitle);

  const sellButtonContainer = document.createElement("div");
  Object.assign(sellButtonContainer.style, {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: "6px",
    width: "100%",
    boxSizing: "border-box"
  });

  const sellPercs = preset?.values?.["sell-percents"] || (devSellSettings.btnEnabled ? [20, 50, 100] : [10, 20, 50, 100]);
  sellPercs.forEach((pct) => {
    const btn = document.createElement("button");
    styleButton(btn, "sell", true);
    const text = `${pct}%`;
    btn.textContent = text;
    btn.addEventListener("click", async () => {
      showButtonClickFeedback(btn, text, "sell", "pending", true);

      const token = await getBloomToken();
      if (!token) {
        showToast("Log in to the Bloom extension first!");
        showButtonClickFeedback(btn, text, "sell", "error", true);
        return;
      }

      const urlParts = window.location.href.split("/lp/");
      let poolId = "";
      if (urlParts.length > 1) {
        poolId = urlParts[1].split("?")[0];
      }
      if (!poolId) {
        showToast("Token not found!");
        showButtonClickFeedback(btn, text, "sell", "error", true);
        return;
      }

      let submitted = false;
      let availableRegions = ["EU1", "EU2", "US1"];
      while (!submitted && availableRegions.length) {
        const sellOrder = await interactWithBloom(chosenRegion, poolId, "swap", token, pct, "sell", preset);
        if (sellOrder?.status === "success") {
          showToast("Sell order sent!");
          showButtonClickFeedback(btn, text, "sell", "success", true);
          submitted = true;
        } else if (sellOrder?.status === "timeout") {
          showToast("Error sending order, switched region to next available!");
          availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
          chosenRegion = availableRegions[0];
          regionSelect.value = chosenRegion;
          await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
          showButtonClickFeedback(btn, text, "sell", "error", true);
          break;
        } else if (sellOrder?.error === "maintenance") {
          showToast("Region is undergoing maintenance, automatically retrying on next available region!");
          availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
          chosenRegion = availableRegions[0];
          regionSelect.value = chosenRegion;
          await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
          showButtonClickFeedback(btn, text, "sell", "error", true);
        } else {
          showToast("Failed to send sell order!");
          showButtonClickFeedback(btn, text, "sell", "error", true);
          break;
        }
      }
    });
    sellButtonContainer.appendChild(btn);
  });

  const manualSellRow = document.createElement("div");
  Object.assign(manualSellRow.style, {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: "8px",
    width: "100%",
    boxSizing: "border-box",
    marginTop: "8px"
  });

  const manualSellWrapperPercent = document.createElement("div");
  Object.assign(manualSellWrapperPercent.style, {
    display: "flex",
    alignItems: "center",
    gap: "6px"
  });

  const manualSellInputPercent = document.createElement("input");
  styleInput(manualSellInputPercent);
  manualSellInputPercent.placeholder = "Sell %";

  const manualSellBtnPercent = document.createElement("button");
  styleButton(manualSellBtnPercent, "sell");
  const sellText = "Sell";
  manualSellBtnPercent.textContent = sellText;
  manualSellBtnPercent.addEventListener("click", async () => {
    showButtonClickFeedback(manualSellBtnPercent, sellText, "sell", "pending", true);

    const val = manualSellInputPercent.value.trim();
    if (!val || isNaN(val) || val <= 0 || val > 100) {
      showToast("Please enter a valid percentage (1 - 100)!");
      showButtonClickFeedback(manualSellBtnPercent, sellText, "sell", "error", true);
      return;
    }
    const token = await getBloomToken();
    if (!token) {
      showToast("Log in to the Bloom extension first!");
      showButtonClickFeedback(manualSellBtnPercent, sellText, "sell", "error", true);
      return;
    }

    const urlParts = window.location.href.split("/lp/");
    let poolId = "";
    if (urlParts.length > 1) {
      poolId = urlParts[1].split("?")[0];
    }
    if (!poolId) {
      showToast("Token not found!");
      showButtonClickFeedback(manualSellBtnPercent, sellText, "sell", "error", true);
      return;
    }

    let submitted = false;
    let availableRegions = ["EU1", "EU2", "US1"];
    while (!submitted && availableRegions.length) {
      const sellOrder = await interactWithBloom(chosenRegion, poolId, "swap", token, val, "sell", preset);
      if (sellOrder?.status === "success") {
        showToast("Sell order sent!");
        showButtonClickFeedback(manualSellBtnPercent, sellText, "sell", "success", true);
        submitted = true;
      } else if (sellOrder?.status === "timeout") {
        showToast("Error sending order, switched region to next available!");
        availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
        chosenRegion = availableRegions[0];
        regionSelect.value = chosenRegion;
        await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
        showButtonClickFeedback(manualSellBtnPercent, sellText, "sell", "error", true);
        break;
      } else if (sellOrder?.error === "maintenance") {
        showToast("Region is undergoing maintenance, automatically retrying on next available region!");
        availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
        chosenRegion = availableRegions[0];
        regionSelect.value = chosenRegion;
        await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
        showButtonClickFeedback(manualSellBtnPercent, sellText, "sell", "error", true);
      } else {
        showToast("Failed to send sell order!");
        showButtonClickFeedback(manualSellBtnPercent, sellText, "sell", "error", true);
        break;
      }
    }
  });

  manualSellWrapperPercent.appendChild(manualSellInputPercent);
  manualSellWrapperPercent.appendChild(manualSellBtnPercent);

  const manualSellWrapperSol = document.createElement("div");
  Object.assign(manualSellWrapperSol.style, {
    display: "flex",
    alignItems: "center",
    gap: "6px"
  });

  const manualSellInputSol = document.createElement("input");
  styleInput(manualSellInputSol);
  manualSellInputSol.placeholder = "Sell SOL";

  const manualSellBtnSol = document.createElement("button");
  styleButton(manualSellBtnSol, "sell");
  manualSellBtnSol.textContent = sellText;
  manualSellBtnSol.addEventListener("click", async () => {
    showButtonClickFeedback(manualSellBtnSol, sellText, "sell", "pending", true);

    const val = manualSellInputSol.value.trim();
    if (!val || isNaN(val) || val <= 0) {
      showToast("Please enter a valid SOL amount!");
      showButtonClickFeedback(manualSellBtnSol, sellText, "sell", "error", true);
      return;
    }

    const token = await getBloomToken();
    if (!token) {
      showToast("Log in to the Bloom extension first!");
      showButtonClickFeedback(manualSellBtnSol, sellText, "sell", "error", true);
      return;
    }

    const urlParts = window.location.href.split("/lp/");
    let poolId = "";
    if (urlParts.length > 1) {
      poolId = urlParts[1].split("?")[0];
    }
    if (!poolId) {
      showToast("Token not found!");
      showButtonClickFeedback(manualSellBtnSol, sellText, "sell", "error", true);
      return;
    }

    let submitted = false;
    let availableRegions = ["EU1", "EU2", "US1"];
    while (!submitted && availableRegions.length) {
      const sellOrder = await interactWithBloom(chosenRegion, poolId, "swap", token, val, "sellamt", preset);
      if (sellOrder?.status === "success") {
        showToast("Sell order sent!");
        showButtonClickFeedback(manualSellBtnSol, sellText, "sell", "success", true);
        submitted = true;
      } else if (sellOrder?.status === "timeout") {
        showToast("Error sending order, switched region to next available!");
        availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
        chosenRegion = availableRegions[0];
        regionSelect.value = chosenRegion;
        await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
        showButtonClickFeedback(manualSellBtnSol, sellText, "sell", "error", true);
        break;
      } else if (sellOrder?.error === "maintenance") {
        showToast("Region is undergoing maintenance, automatically retrying on next available region!");
        availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
        chosenRegion = availableRegions[0];
        regionSelect.value = chosenRegion;
        await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
        showButtonClickFeedback(manualSellBtnSol, sellText, "sell", "error", true);
      } else {
        showToast("Failed to send sell order!");
        showButtonClickFeedback(manualSellBtnSol, sellText, "sell", "error", true);
        break;
      }
    }
  });

  const initialsBtn = document.createElement("button");
  styleButton(initialsBtn, "sell", true);
  const initialsText = "Init";
  initialsBtn.textContent = initialsText;
  initialsBtn.addEventListener("click", async () => {
    showButtonClickFeedback(initialsBtn, initialsText, "sell", "pending", true);

    const token = await getBloomToken();
    if (!token) {
      showToast("Log in to the Bloom extension first!");
      showButtonClickFeedback(initialsBtn, initialsText, "sell", "error", true);
      return;
    }

    const urlParts = window.location.href.split("/lp/");
    let poolId = "";
    if (urlParts.length > 1) {
      poolId = urlParts[1].split("?")[0];
    }
    if (!poolId) {
      showToast("Token not found!");
      showButtonClickFeedback(initialsBtn, initialsText, "sell", "error", true);
      return;
    }

    let submitted = false;
    let availableRegions = ["EU1", "EU2", "US1"];
    while (!submitted && availableRegions.length) {
      const sellOrder = await interactWithBloom(chosenRegion, poolId, "swap", token, "ini", "sell", preset);
      if (sellOrder?.status === "success") {
        showToast("Sell order sent!");
        showButtonClickFeedback(initialsBtn, initialsText, "sell", "success", true);
        submitted = true;
      } else if (sellOrder?.status === "timeout") {
        showToast("Error sending order, switched region to next available!");
        availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
        chosenRegion = availableRegions[0];
        regionSelect.value = chosenRegion;
        await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
        showButtonClickFeedback(initialsBtn, initialsText, "sell", "error", true);
        break;
      } else if (sellOrder?.error === "maintenance") {
        showToast("Region is undergoing maintenance, automatically retrying on next available region!");
        availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
        chosenRegion = availableRegions[0];
        regionSelect.value = chosenRegion;
        await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
        showButtonClickFeedback(initialsBtn, initialsText, "sell", "error", true);
      } else {
        showToast("Failed to send sell order!");
        showButtonClickFeedback(initialsBtn, initialsText, "sell", "error", true);
        break;
      }
    }
  });
  sellButtonContainer.appendChild(initialsBtn);

  if (devSellSettings?.btnEnabled) {
    const devSellBtn = document.createElement("button");
    devSellBtn.dataset.side = "sell";
    const devBuyBtn = document.createElement("button");
    devBuyBtn.dataset.side = "buy";
    for (const btn of [devSellBtn, devBuyBtn]) {
      styleButton(btn, btn.dataset.side, true);
      const text = "Dev";
      btn.textContent = text;
      btn.addEventListener("click", async () => {
        const token = await getBloomToken();
        if (!token) {
          showToast("Log in to the Bloom extension first!");
          showButtonClickFeedback(btn, text, btn.dataset.side, "error", true);
          return;
        }

        const tokenMint = document
          .querySelector(".js-copy-to-clipboard:not(.p-show__bar__copy)")
          ?.getAttribute("data-address");
        if (!tokenMint) {
          showToast("Token not found!");
          showButtonClickFeedback(btn, text, btn.dataset.side, "error", true);
          return;
        }

        const tip = btn.dataset.side === "buy" ? devSellSettings.buyBundleTip : devSellSettings.sellBundleTip;
        const slippage = btn.dataset.side === "buy" ? devSellSettings.buySlippage : devSellSettings.sellSlippage;

        if (!tip || !slippage || isNaN(tip) || isNaN(slippage)) {
          showToast("Please set the dev sell tip and slippage in Bloom settings!");
          showButtonClickFeedback(btn, text, btn.dataset.side, "error", true);
          return;
        }

        const payload = {
          values: {
            'limit-tip': tip.toString(),
            'limit-slippage': slippage.toString(),
            'target-type': 'DevSell',
            'target-value': '0',
            'expiry': 24
          }
        }

        const amount = btn.dataset.side === "buy" ? devSellSettings.buyAmount : devSellSettings.sellAmount;

        let submitted = false;
        let availableRegions = ["EU1", "EU2", "US1"];
        while (!submitted && availableRegions.length) {
          const sellOrder = await interactWithBloom(chosenRegion, tokenMint, "limit", token, amount, btn.dataset.side, payload);
          if (sellOrder?.status === "success") {
            showToast("Dev sell order sent!");
            showButtonClickFeedback(btn, text, btn.dataset.side, "success", true);
            submitted = true;
          } else if (sellOrder?.status === "timeout") {
            showToast("Error sending order, switched region to next available!");
            availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
            chosenRegion = availableRegions[0];
            regionSelect.value = chosenRegion;
            await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
            showButtonClickFeedback(btn, text, btn.dataset.side, "error", true);
            break;
          } else if (sellOrder?.error === "maintenance") {
            showToast("Region is undergoing maintenance, automatically retrying on next available region!");
            availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
            chosenRegion = availableRegions[0];
            regionSelect.value = chosenRegion;
            await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
            showButtonClickFeedback(btn, text, btn.dataset.side, "error", true);
          } else {
            showToast("Failed to send dev sell order!");
            showButtonClickFeedback(btn, text, btn.dataset.side, "error", true);
            break;
          }
        }
      });
    }
    buyButtonContainer.appendChild(devBuyBtn);
    sellButtonContainer.appendChild(devSellBtn);
  }

  manualSellWrapperSol.appendChild(manualSellInputSol);
  manualSellWrapperSol.appendChild(manualSellBtnSol);

  manualSellRow.appendChild(manualSellWrapperPercent);
  manualSellRow.appendChild(manualSellWrapperSol);

  sellSide.appendChild(sellButtonContainer);
  sellSide.appendChild(manualSellRow);

  bodyWrapper.appendChild(buySide);
  bodyWrapper.appendChild(sellSide);

  const utilityContainer = document.createElement("div");
  Object.assign(utilityContainer.style, {
    display: "flex",
    gap: "8px",
    width: "90%",
    marginLeft: "auto",
    marginRight: "auto",
    marginTop: "4px",
  });

  const sniperButton = document.createElement("button");
  styleUtilityButton(sniperButton);
  sniperButton.textContent = "Create Sniper Task";
  sniperButton.addEventListener("click", async () => {
    const token = await getBloomToken();
    if (!token) return showToast("Log in to the Bloom extension first!");

    const tokenMint = document
      .querySelector(".js-copy-to-clipboard:not(.p-show__bar__copy)")
      ?.getAttribute("data-address");
    if (!tokenMint) return showToast("Failed to get token mint!");

    let submitted = false;
    let availableRegions = ["EU1", "EU2", "US1"];
    while (!submitted && availableRegions.length) {
      const snipeOrder = await interactWithBloom(chosenRegion, tokenMint, "snipe", token);
      if (snipeOrder?.status === "success") {
        showToast("Successfully created sniping task!");
        submitted = true;
      } else if (snipeOrder?.status === "timeout") {
        showToast("Error sending request, switched region to next available!");
        availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
        chosenRegion = availableRegions[0];
        regionSelect.value = chosenRegion;
        await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
        showButtonClickFeedback(sniperButton, "Create Sniper Task", "snipe", "error", true);
        break;
      } else if (snipeOrder?.error === "maintenance") {
        showToast("Region is undergoing maintenance, automatically retrying on next available region!");
        availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
        chosenRegion = availableRegions[0];
        regionSelect.value = chosenRegion;
        await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
        showButtonClickFeedback(sniperButton, "Create Sniper Task", "snipe", "error", true);
      } else {
        showToast("Failed to create sniping task!");
        showButtonClickFeedback(sniperButton, "Create Sniper Task", "snipe", "error", true);
        break;
      }
    }
  });

  const pnlButton = document.createElement("button");
  styleUtilityButton(pnlButton);
  pnlButton.textContent = "Share P&L";
  pnlButton.addEventListener("click", async () => {
    const token = await getBloomToken();
    if (!token) return showToast("Log in to the Bloom extension first!");

    const tokenMint = document
      .querySelector(".js-copy-to-clipboard:not(.p-show__bar__copy)")
      ?.getAttribute("data-address");
    if (!tokenMint) return showToast("Failed to get token mint!");

    let submitted = false;
    let availableRegions = ["EU1", "EU2", "US1"];
    while (!submitted && availableRegions.length) {
      const pnl = await interactWithBloom(chosenRegion, tokenMint, "pnl", token);
      if (pnl?.status === "success") {
        showToast("Successfully shared P&L!");
        submitted = true;
      } else if (pnl?.status === "timeout") {
        showToast("Error sending request, switched region to next available!");
        availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
        chosenRegion = availableRegions[0];
        regionSelect.value = chosenRegion;
        await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
        showButtonClickFeedback(pnlButton, "Share P&L", "pnl", "error", true);
        break;
      } else if (pnl?.error === "maintenance") {
        showToast("Region is undergoing maintenance, automatically retrying on next available region!");
        availableRegions.splice(availableRegions.indexOf(chosenRegion), 1);
        chosenRegion = availableRegions[0];
        regionSelect.value = chosenRegion;
        await chrome.storage.local.set({ "bloom.activeRegion": chosenRegion });
        showButtonClickFeedback(pnlButton, "Share P&L", "pnl", "error", true);
      } else {
        showToast("Failed to share P&L!");
        showButtonClickFeedback(pnlButton, "Share P&L", "pnl", "error", true);
        break;
      }
    }
  });

  utilityContainer.appendChild(sniperButton);
  utilityContainer.appendChild(pnlButton);
  bodyWrapper.appendChild(utilityContainer);
}

async function styleContainer(el) {
  const defaultBgUrl = chrome.runtime.getURL("src/public/assets/images/bg-dark.png");

  return new Promise(async (resolve) => {
    const result = await chrome.storage.local.get(["bloom.backgroundImage", "bloom.gifBackgroundUrl", "bloom.backgroundOpacity"]);
    let invertedOpacity = 0;
    if (result["bloom.backgroundOpacity"] !== undefined) {
      invertedOpacity = 1 - result["bloom.backgroundOpacity"];
    } else {
      invertedOpacity = 0.5;
    }

    let backgroundStyle;
    if (result["bloom.gifBackgroundUrl"]) {
      backgroundStyle = "rgb(0, 0, 0)";
    } else {
      backgroundStyle = (result["bloom.backgroundImage"])
        ? `linear-gradient(rgba(0,0,0,${invertedOpacity}), rgba(0,0,0,${invertedOpacity})), url(${result["bloom.backgroundImage"]})`
        : `url(${defaultBgUrl})`;
    }

    Object.assign(el.style, {
      position: "fixed",
      width: "280px",
      minHeight: "220px",
      display: "flex",
      flexDirection: "column",
      background: backgroundStyle,
      backgroundSize: "cover",
      backgroundPosition: "center",
      borderRadius: "10px",
      padding: "0 8px 8px 8px",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
      zIndex: 1000,
      fontFamily: "Suisse Intl Medium, sans-serif",
      color: "#ffffff",
      border: "1px solid #5e5e68",
      lineHeight: "normal",
    });

    el.classList.remove('has-gif-background');
    const existingOverlay = el.querySelector('.gif-background-overlay');
    if (existingOverlay) {
      el.removeChild(existingOverlay);
    }

    if (result["bloom.gifBackgroundUrl"]) {
      el.classList.add('has-gif-background');

      let styleEl = document.getElementById('bloom-gif-style');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'bloom-gif-style';
        document.head.appendChild(styleEl);
      }

      const opacity = result["bloom.backgroundOpacity"] !== undefined ?
        result["bloom.backgroundOpacity"] : 0.5;

      styleEl.textContent = `
        .has-gif-background::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-image: url(${result["bloom.gifBackgroundUrl"]});
          background-size: cover;
          background-position: center;
          border-radius: 9px;
          opacity: ${opacity};
          pointer-events: none;
          z-index: -1;
        }
      `;
    }

    resolve();
  });
}

function styleSideDiv(el) {
  Object.assign(el.style, {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    width: "100%",
    background: "rgba(0, 0, 0, 0.3)",
    borderRadius: "8px",
    padding: "12px",
    border: "1px solid #5e5e68",
  });
}

function styleTitle(el) {
  Object.assign(el.style, {
    fontSize: "14px",
    color: "#ffffff",
    fontWeight: "bold",
    padding: "2px 0",
    borderRadius: "4px",
    textAlign: "left",
  });
}

function styleLabelText(el) {
  Object.assign(el.style, {
    fontSize: "12px",
    fontWeight: "600",
    color: "#ffffff",
    background: "transparent",
    borderRadius: "4px",
    padding: "2px 6px",
    margin: "0",
    display: "inline-block",
  });
}

function styleDropdown(select) {
  Object.assign(select.style, {
    background: "rgba(0, 0, 0, 0.3)",
    color: "#FFFFFF",
    border: "1px solid #5e5e68",
    borderRadius: "5px",
    padding: "6px 28px 6px 10px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "500",
    outline: "none",
    WebkitAppearance: "none",
    appearance: "none",
    backgroundImage: `url('data:image/svg+xml;utf8,<svg fill="%23EEA7ED" height="14" viewBox="0 0 24 24" width="14" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5z"/></svg>')`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 8px center",
    backgroundSize: "12px",
    transition: "all 0.2s ease",
    minWidth: "80px",
    maxWidth: "120px",
  });

  select.addEventListener("mouseenter", () => {
    select.style.borderColor = "#EEA7ED";
  });
  select.addEventListener("mouseleave", () => {
    if (document.activeElement !== select) {
      select.style.borderColor = "#5e5e68";
    }
  });
  select.addEventListener("focus", () => {
    select.style.borderColor = "#EEA7ED";
  });
  select.addEventListener("blur", () => {
    select.style.borderColor = "#5e5e68";
  });
}

function styleButton(btn, side, isAmt) {
  const color =
    side === "buy" ? "#00ffc1" : side === "sell" ? "#f93d3d" : "#EEA7ED";
  const padding = isAmt ? "4px 6px" : "6px";

  Object.assign(btn.style, {
    border: `1px solid ${color}`,
    background: "transparent",
    color,
    borderRadius: "5px",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "12px",
    transition: "all 0.2s ease",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding,
    minWidth: "40px",
    textAlign: "center",
    whiteSpace: "nowrap",
    maxWidth: "80px",
  });

  btn.addEventListener("mouseenter", () => {
    btn.style.background = color;
    btn.style.color = "#1d2040";
    btn.style.transform = "translateY(-1px)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.background = "transparent";
    btn.style.color = color;
    btn.style.transform = "translateY(0)";
  });
}

function styleInput(input) {
  Object.assign(input.style, {
    background: "none",
    border: "1px solid #5e5e68",
    borderRadius: "5px",
    color: "#fff",
    fontSize: "12px",
    outline: "none",
    transition: "all 0.2s",
    padding: "6px",
    margin: "0",
    boxSizing: "border-box",
    width: "100%"
  });

  input.addEventListener("focus", () => {
    input.style.border = "1px solid #EEA7ED";
  });
  input.addEventListener("blur", () => {
    input.style.border = "1px solid #5e5e68";
  });
}

function styleUtilityButton(btn) {
  Object.assign(btn.style, {
    flex: "1",
    border: "1px solid #EEA7ED",
    background: "transparent",
    color: "#EEA7ED",
    borderRadius: "5px",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "12px",
    transition: "all 0.2s ease",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px",
    textAlign: "center",
    whiteSpace: "nowrap",
    maxWidth: "120px",
  });

  btn.addEventListener("mouseenter", () => {
    btn.style.opacity = "0.8";
    btn.style.transform = "translateY(-1px)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.opacity = "1";
    btn.style.transform = "translateY(0)";
  });
}

function initializePanelDrag(panelRoot, storageKey) {
  let panelDragOffsetX = 0;
  let panelDragOffsetY = 0;
  let panelDragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;

  let panelDragAnimationId;
  let dragOverlay = null;

  const handleMousedown = (evt) => {
    const headerEl = panelRoot.firstChild;
    if (evt.target === headerEl || headerEl.contains(evt.target)) {
      if (isQuickPanelHidden) return;

      panelDragging = true;
      panelDragOffsetX = evt.clientX - panelRoot.getBoundingClientRect().left;
      panelDragOffsetY = evt.clientY - panelRoot.getBoundingClientRect().top;
      lastMouseX = evt.clientX;
      lastMouseY = evt.clientY;
      panelRoot.style.userSelect = "none";

      createDragOverlay();
      initiatePanelDragAnimation();

      document.addEventListener("mousemove", handleMousemove);
      document.addEventListener("mouseup", handleMouseup);
    }
  };

  const handleMousemove = (evt) => {
    if (!panelDragging) return;
    lastMouseX = evt.clientX;
    lastMouseY = evt.clientY;
  };

  const initiatePanelDragAnimation = () => {
    const updatePosition = () => {
      if (!panelDragging) return;

      const { x: scaleX = 1, y: scaleY = 1 } = JSON.parse(panelRoot.dataset.scaleFactors || '{"x":1,"y":1}');

      let left = lastMouseX - panelDragOffsetX;
      let top = lastMouseY - panelDragOffsetY;

      const scaledWidth = panelRoot.offsetWidth * scaleX;
      const scaledHeight = panelRoot.offsetHeight * scaleY;

      const maxLeft = window.innerWidth - scaledWidth;
      const maxTop = window.innerHeight - scaledHeight;

      left = Math.min(Math.max(left, 0), maxLeft);
      top = Math.min(Math.max(top, 0), maxTop);

      panelRoot.style.left = `${left}px`;
      panelRoot.style.top = `${top}px`;

      panelDragAnimationId = requestAnimationFrame(updatePosition);
    };

    stopPanelDragAnimation();
    panelDragAnimationId = requestAnimationFrame(updatePosition);
  };

  const stopPanelDragAnimation = () => {
    if (panelDragAnimationId) {
      cancelAnimationFrame(panelDragAnimationId);
      panelDragAnimationId = null;
    }
  };

  const handleMouseup = async () => {
    panelDragging = false;
    panelRoot.style.userSelect = "";

    document.removeEventListener("mousemove", handleMousemove);
    document.removeEventListener("mouseup", handleMouseup);

    stopPanelDragAnimation();
    removeDragOverlay();

    let { left, top } = panelRoot.style;
    if (!left || left === "auto") {
      left = panelRoot.getBoundingClientRect().left + "px";
    }
    if (!top || top === "auto") {
      top = panelRoot.getBoundingClientRect().top + "px";
    }

    await chrome.storage.local.set({ [storageKey]: { left, top } });
  };

  function createDragOverlay() {
    dragOverlay = document.createElement("div");
    Object.assign(dragOverlay.style, {
      position: "fixed",
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      zIndex: 999999,
      cursor: "move",
      background: "transparent"
    });
    document.body.appendChild(dragOverlay);
  }

  function removeDragOverlay() {
    if (dragOverlay && dragOverlay.parentNode) {
      dragOverlay.parentNode.removeChild(dragOverlay);
      dragOverlay = null;
    }
  }

  panelRoot.bloomDragHandler = handleMousedown;
  panelRoot.addEventListener("mousedown", panelRoot.bloomDragHandler);
}

async function restoreBloomPanelPosition(el, storageKey) {
  const { [storageKey]: savedPos } = await chrome.storage.local.get(storageKey);
  if (savedPos) {
    el.style.left = savedPos.left;
    el.style.top = savedPos.top;
  } else {
    el.style.left = "100px";
    el.style.top = "100px";
  }
  el.style.visibility = "visible";
}

function removeBloomQuickPanels() {
  const previousQuickPanels = document.querySelectorAll(".bloomModalContainer");
  previousQuickPanels.forEach((panel) => {
    panel.remove();
  });
}

async function initializePanelResize(panelRoot, storageKey) {
  let { [storageKey]: savedScale } = await chrome.storage.local.get(storageKey);
  let initialScale = 1.0;
  if (savedScale && typeof savedScale.x === "number") {
    initialScale = parseFloat(savedScale.x) || 1.0;
  }

  const resizeHandle = document.createElement("div");
  Object.assign(resizeHandle.style, {
    position: "absolute",
    width: "32px",
    height: "32px",
    right: "-8px",
    bottom: "-12px",
    cursor: "nwse-resize",
    zIndex: 10000,
    background: `url("${chrome.runtime.getURL("src/public/assets/images/resize.svg")}") no-repeat center center`,
    backgroundSize: "24px",
    overflow: "hidden",
    boxSizing: "border-box",
    borderRadius: "6px",
  });

  const resizeWrapper = document.createElement("div");
  Object.assign(resizeWrapper.style, {
    position: "absolute",
    width: "16px",
    height: "16px",
    right: "0px",
    bottom: "0px",
    overflow: "hidden",
    zIndex: 10000,
  });
  resizeWrapper.appendChild(resizeHandle);
  panelRoot.appendChild(resizeWrapper);

  let isResizing = false;
  let startRect = null;
  let startScale = 1.0;

  function onMouseDown(evt) {
    evt.preventDefault();
    evt.stopPropagation();
    isResizing = true;

    startRect = panelRoot.getBoundingClientRect();
    const { x } = JSON.parse(panelRoot.dataset.scaleFactors);

    startScale = x;

    createResizeOverlay();
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function onMouseMove(evt) {
    if (!isResizing) return;

    const currentX = evt.clientX;
    const currentY = evt.clientY;

    const rawScaleX =
      (currentX - startRect.left) / (startRect.width / startScale);
    const rawScaleY =
      (currentY - startRect.top) / (startRect.height / startScale);

    const newScale = Math.min(rawScaleX, rawScaleY);

    const minScale = 0.7;
    if (newScale < minScale) {
      return;
    }
    const maxScale = 2.0;
    if (newScale > maxScale) {
      return;
    }

    panelRoot.dataset.scaleFactors = JSON.stringify({
      x: newScale,
      y: newScale,
    });
    panelRoot.style.transform = `scale(${newScale}, ${newScale})`;
  }

  async function onMouseUp() {
    isResizing = false;
    removeResizeOverlay();
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);

    const { x, y } = JSON.parse(panelRoot.dataset.scaleFactors);
    await chrome.storage.local.set({ [storageKey]: { x, y } });
  }

  let resizeOverlay = null;
  function createResizeOverlay() {
    resizeOverlay = document.createElement("div");
    Object.assign(resizeOverlay.style, {
      position: "fixed",
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      zIndex: 999999,
      cursor: "nwse-resize",
      background: "transparent",
    });
    document.body.appendChild(resizeOverlay);
  }

  function removeResizeOverlay() {
    if (resizeOverlay && resizeOverlay.parentNode) {
      resizeOverlay.parentNode.removeChild(resizeOverlay);
      resizeOverlay = null;
    }
  }

  resizeHandle.addEventListener("mousedown", onMouseDown);
}

async function restoreBloomPanelScale(el, storageKey) {
  const { [storageKey]: savedScale } = await chrome.storage.local.get(storageKey);
  let { x, y } = { x: 1, y: 1 };
  if (savedScale) {
    x = savedScale.x;
    y = savedScale.y;
  }
  el.dataset.scaleFactors = JSON.stringify({ x, y });
  if (!isQuickPanelHidden) {
    el.style.transform = `scale(${x}, ${y})`;
    el.style.transformOrigin = "top left";
  }
}

function showButtonClickFeedback(btn, text, side, status, isAmt = false) {
  let newText;
  switch (status) {
    case "pending":
      newText = "...";
      break;
    case "success":
      newText = "✔";
      break;
    case "error":
      newText = "✘";
      break;
  }
  btn.textContent = newText;

  const highlightColor = (side === "buy") ? "#00ffc1" : "#f93d3d";

  btn.style.backgroundColor = highlightColor;
  btn.style.color = "#1d2040";

  setTimeout(() => {
    btn.textContent = text;
    styleButton(btn, side, isAmt);
  }, 1500);
}
