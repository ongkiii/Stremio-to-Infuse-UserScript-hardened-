// ==UserScript==
// @name         Stremio to Infuse (iOS Safari hardened)
// @namespace    yumeko.stremio.infuse.bridge
// @version      1.1.0
// @description  Open Stremio Web player links in Infuse on iOS. No DMM redirect.
// @author       Kyospia & Yumeko (patched)
// @match        *://web.stremio.com/*
// @run-at       document-start
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  const INFUSE_URL_SCHEME_PREFIX = "infuse://x-callback-url/play?url=";

  function base64UrlDecodeToUtf8(str) {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    try {
      const byteString = atob(base64);
      const bytes = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    } catch (e) {
      console.error("Decode fail:", e);
      return null;
    }
  }

  function extractPlayerPayloadFromRoute() {
    // Works for "#/player/<payload>/..." and "/player/<payload>/..."
    const hash = location.hash || "";
    const path = location.pathname || "";
    let segment = null;

    if (hash.startsWith("#/player/")) {
      segment = hash.substring("#/player/".length).split("/")[0];
    } else if (path.startsWith("/player/")) {
      // Some builds use path routing
      segment = path.substring("/player/".length).split("/")[0];
    }
    return segment ? decodeURIComponent(segment) : null;
  }

  function tryOpenInfuseFromCurrentRoute() {
    const payload = extractPlayerPayloadFromRoute();
    if (!payload) return false;

    const decoded = base64UrlDecodeToUtf8(payload);
    if (!decoded) return false;

    // Find the first JSON object, tolerate leading noise
    const start = decoded.indexOf('{"url":') !== -1 ? decoded.indexOf('{"url":') : decoded.indexOf("{");
    if (start === -1) return false;
    const cleaned = decoded.slice(start, decoded.lastIndexOf("}") + 1);
    try {
      const obj = JSON.parse(cleaned);
      if (obj && obj.url) {
        const infuseUrl = INFUSE_URL_SCHEME_PREFIX + encodeURIComponent(obj.url);
        // Must be in response to a gesture when possible
        location.href = infuseUrl;
        return true;
      }
    } catch (e) {
      console.error("JSON parse fail:", e);
    }
    return false;
  }

  // Intercept clicks that would go to the player; ignore DMM
  document.addEventListener("click", function (event) {
    const a = event.target.closest('a');
    if (!a) return;

    const href = a.getAttribute("href") || "";
    if (href.startsWith("https://debridmediamanager.com") || href.startsWith("https://x.debridmediamanager.com")) {
      // Let DMM links pass through
      return;
    }

    const isPlayerLink = href.startsWith("#/player/") || href.startsWith("/player/");
    if (!isPlayerLink) return;

    // Prevent SPA from hijacking and immediately try to open Infuse
    event.preventDefault();
    event.stopPropagation();

    // Simulate the navigation Stremio would have done so our route parser sees it
    if (href.startsWith("#/player/")) {
      location.hash = href;
    } else {
      history.pushState({}, "", href);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }

    // Must run in this gesture tick on iOS for custom scheme
    tryOpenInfuseFromCurrentRoute();
  }, true); // capture phase

  // Also handle SPA navigations that don’t come from an <a> click
  window.addEventListener("hashchange", tryOpenInfuseFromCurrentRoute, false);
  window.addEventListener("popstate", tryOpenInfuseFromCurrentRoute, false);

  // If user reloads while already on a player route, handle it
  document.addEventListener("DOMContentLoaded", tryOpenInfuseFromCurrentRoute, { once: true });
})();
