function getMessage(url) {
  const parsedUrl = new URL(url);
  if (parsedUrl.hostname.includes("photon-sol.tinyastro.io")) {
    if (parsedUrl.pathname.includes("/memescope")) return "photon-memescope";
    if (parsedUrl.pathname.includes("/lp/")) return "photon-token";
    if (parsedUrl.pathname.includes("/discover")) return "photon-discover";
    if (parsedUrl.pathname.includes("/trending")) return "photon-trending";
  } else if (parsedUrl.hostname.includes("axiom.trade")) {
    if (parsedUrl.pathname.includes("/discover")) return "axiom-discover";
    if (parsedUrl.pathname.includes("/pulse")) return "axiom-pulse";
    if (parsedUrl.pathname.includes("/meme")) return "axiom-token";
    if (parsedUrl.pathname.includes("/tracker")) return "axiom-tracker";
    return "axiom";
  }
  return;
}

const tabMap = {};

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return;
  const tab = await chrome.tabs.get(tabId);
  const tabStatus = tabMap[tabId] || {};
  if (tabStatus.url === tab.url && tabStatus.status === changeInfo.status) return;
  tabMap[tabId] = { url: tab.url, status: changeInfo.status };
  const message = getMessage(tab.url);
  if (message) {
    chrome.tabs.sendMessage(tabId, {
      message,
      event: "onUpdated",
      url: tab.url,
    });
  } else {
    delete tabMap[tabId];
  }
});

chrome.tabs.onActivated.addListener(async (details) => {
  const { tabId } = details;
  const tab = await chrome.tabs.get(tabId);
  const { url } = tab;
  const message = getMessage(url);
  if (message) {
    chrome.tabs.sendMessage(tabId, {
      message,
      event: "onActivated",
      url,
    });
  } else {
    delete tabMap[tabId];
  }
});

chrome.webNavigation.onCompleted.addListener(async (details) => {
  let changeUrl = details.url;
  if (!changeUrl) {
    const tab = await chrome.tabs.get(details.tabId);
    changeUrl = tab.url;
  }
  const tabStatus = tabMap[details.tabId] || {};
  if (tabStatus.url === changeUrl && tabStatus.status === 'complete') return delete tabMap[details.tabId];
  tabMap[details.tabId] = { url: changeUrl, status: 'complete' };
  const message = getMessage(changeUrl);
  if (message) {
    chrome.tabs.sendMessage(details.tabId, {
      message,
      event: "onCompleted",
      url: changeUrl,
    });
  } else {
    delete tabMap[details.tabId];
  }
});


chrome.runtime.onMessage.addListener(async function (request, _sender, sendResponse) {
  if (request.message === "openTab") {
    chrome.tabs.create({
      url: request.url,
    });
    return true;
  } else if (request.message === "reset") {
    const platforms = ["axiom", "photon"];
    platforms.forEach(async (platform) => {
      await chrome.storage.local.remove(`Soliz.positionBeforeHide.${platform}`);
      await chrome.storage.local.remove(`Soliz.scaleFactor.${platform}`);
    });
    chrome.tabs.query({}, function (tabs) {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, { message: "reset" });
      });
    });
  }
});

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const locationHeader = details.responseHeaders?.find(
      (header) => header.name.toLowerCase() === 'location'
    );
    const poolId = new URL(details.url).searchParams.get('id');

    if (locationHeader && poolId) {
      chrome.tabs.sendMessage(details.tabId, {
        type: 'LOCATION_CAPTURED',
        location: locationHeader.value,
        poolId,
      });
    }
  },
  {
    urls: ['https://photon-sol.tinyastro.io/*'],
    types: ['xmlhttprequest']
  },
  ['responseHeaders']
);
