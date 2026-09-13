// Measurement ID: analytics.google.com -> Admin -> Data streams -> your web stream.
const GA_MEASUREMENT_ID = "G-KYBC1F34N4";

window.dataLayer = window.dataLayer || [];
function gtag() {
  dataLayer.push(arguments);
}
window.gtag = gtag;

// Named gaEvent, not track: client.js already has a `track` const (the leaderboard
// slider element) that would shadow a global of that name.
window.gaEvent = function (name, params) {
  gtag("event", name, params || {});
};

gtag("js", new Date());
gtag("config", GA_MEASUREMENT_ID);

const gaTag = document.createElement("script");
gaTag.async = true;
gaTag.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_MEASUREMENT_ID;
document.head.appendChild(gaTag);
