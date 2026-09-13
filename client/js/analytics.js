// Google Analytics 4. Paste your Measurement ID (analytics.google.com -> Admin ->
// Data streams -> your web stream) here. Until it's set, tracking is a no-op.
const GA_MEASUREMENT_ID = "G-KYBC1F34N4";

const gaEnabled = /^G-[A-Z0-9]+$/.test(GA_MEASUREMENT_ID) && !GA_MEASUREMENT_ID.includes("XXXX");

window.dataLayer = window.dataLayer || [];
function gtag() {
  dataLayer.push(arguments);
}
window.gtag = gtag;

// Fire a custom event. Safe to call whether or not GA is configured/loaded.
window.track = function (name, params) {
  if (!gaEnabled) return;
  gtag("event", name, params || {});
};

if (gaEnabled) {
  gtag("js", new Date());
  gtag("config", GA_MEASUREMENT_ID);

  const tag = document.createElement("script");
  tag.async = true;
  tag.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_MEASUREMENT_ID;
  document.head.appendChild(tag);
}
