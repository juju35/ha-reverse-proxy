// Entry point: the card's modules in their original order. scripts/bundle.mjs concatenates them in this order into the
// single classic script the card ships as.
import "./card-picker.js";
import "./helpers.js";
import "./illustration-banner.js";
import "./i18n/rp-i18n.js";
import "./dom-patching.js";
import "./reverse-proxy-card-2.js";
import "./reverse-proxy-mini.js";
import "./editors.js";
