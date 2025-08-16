// (function () {
//   const previousMutationObserver = window.MutationObserver;
//   window.MutationObserver = class extends previousMutationObserver {
//     constructor(callback, options) {
//       if (callback.toString().toLowerCase().includes("visibility") || callback.toString().toLowerCase().includes("decoy") || callback.toString().toLowerCase().includes("width") || callback.toString().toLowerCase().includes("eea7ed")) {
//         callback = () => { };
//       }
//       super(callback, options);
//     }
//   };

//   const previousWebSocket = window.WebSocket;
//   let wsAddListener = previousWebSocket.prototype.addEventListener;
//   wsAddListener = wsAddListener.call.bind(wsAddListener);
//   window.WebSocket = function WebSocket(url, protocols) {
//     if (!(this instanceof WebSocket)) {
//       return new WebSocket(url, protocols);
//     }

//     let ws;
//     if (arguments.length === 1) {
//       ws = new previousWebSocket(url);
//     } else if (arguments.length >= 2) {
//       ws = new previousWebSocket(url, protocols);
//     } else {
//       ws = new previousWebSocket();
//     }

//     wsAddListener(ws, 'message', function (event) {
//       if (event.data.toLowerCase().includes('update_pulse')) {
//         let previousPulse = localStorage.getItem('axiom.pulse');
//         if (!previousPulse) previousPulse = { content: [] };
//         else previousPulse = JSON.parse(previousPulse);
//         const newPulseData = JSON.parse(event.data);
//         const mergedContents = [...previousPulse.content.filter((t) => !newPulseData.content.some((nt) => nt.tokenAddress === t.tokenAddress)).filter((t) => new Date(t.lastSeen) > new Date(new Date().getTime() - 300e3)), ...newPulseData.content.map((c) => ({ ...c, lastSeen: new Date() }))]
//         localStorage.setItem('axiom.pulse', JSON.stringify({ content: mergedContents }));
//       }
//     });
//     return ws;
//   }
//   window.WebSocket.prototype = previousWebSocket.prototype;
//   window.WebSocket.prototype.constructor = window.WebSocket;
// })();
