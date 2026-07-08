const parameters = new URLSearchParams(window.location.search);
const slot = parameters.get("slot");
const name = parameters.get("name");
const slotLabel = document.querySelector("#slot-label");
const pageTitle = document.querySelector("#page-title");

if (slot && /^\d{2}$/.test(slot)) {
    slotLabel.textContent = `Slot ${slot}`;
}

if (name) {
    pageTitle.textContent = name;
    document.title = `${name} – Work in Progress | Lachsbach Arcade`;
}
