const tiles = [
    {
        title: "Sliding Tiles",
        slot: "Slot 01",
        meta: "Jigsaw",
        description: "Ein verschiebbares Bildpuzzle mit dynamischer Rastergroesse.",
        href: "./sliding-tiles/index.html",
        art: "art-jigsaw"
    },
    {
        title: "Freies Puzzle",
        slot: "Slot 02",
        meta: "Puzzle",
        description: "Ein freies Puzzle mit 9 bis 100 Teilen, die sich zu Gruppen verbinden.",
        href: "./jigsaw/index.html",
        art: "art-puzzle"
    },
    {
        title: "Coming Soon",
        slot: "Slot 03",
        meta: "WiP",
        description: "Dieser Bereich befindet sich noch in Entwicklung.",
        href: "./wip/index.html?slot=03&name=Coming%20Soon",
        art: "art-arena"
    },
    {
        title: "Coming Soon",
        slot: "Slot 04",
        meta: "WiP",
        description: "Dieser Bereich befindet sich noch in Entwicklung.",
        href: "./wip/index.html?slot=04&name=Coming%20Soon",
        art: "art-vault"
    },
    {
        title: "Coming Soon",
        slot: "Slot 05",
        meta: "WiP",
        description: "Dieser Bereich befindet sich noch in Entwicklung.",
        href: "./wip/index.html?slot=05&name=Coming%20Soon",
        art: "art-camp"
    },
    {
        title: "Coming Soon",
        slot: "Slot 06",
        meta: "WiP",
        description: "Dieser Bereich befindet sich noch in Entwicklung.",
        href: "./wip/index.html?slot=06&name=Coming%20Soon",
        art: "art-portal"
    }
];

const grid = document.querySelector("#tile-grid");
const selectedTitle = document.querySelector("#selected-title");
const selectedDescription = document.querySelector("#selected-description");
const launchLink = document.querySelector("#launch-link");
const selectionPanel = document.querySelector(".selection-panel");

let selectedIndex = getInitialIndex();

function getInitialIndex() {
    const savedIndex = Number(localStorage.getItem("lachsbach:selected-tile"));
    return Number.isInteger(savedIndex) && savedIndex >= 0 && savedIndex < tiles.length ? savedIndex : 0;
}

function renderTiles() {
    const fragment = document.createDocumentFragment();

    tiles.forEach((tile, index) => {
        const link = document.createElement("a");
        link.className = `tile ${tile.art}`;
        link.href = tile.href;
        link.dataset.index = String(index);
        link.setAttribute("aria-label", `${tile.title} oeffnen`);

        link.innerHTML = `
            <span class="tile-content">
                <span class="tile-kicker">${tile.slot}</span>
                <span class="tile-title">${tile.title}</span>
                <span class="tile-meta">${tile.meta}</span>
            </span>
        `;

        link.addEventListener("mouseenter", () => selectTile(index, false));
        link.addEventListener("focus", () => selectTile(index, false));
        link.addEventListener("click", () => {
            localStorage.setItem("lachsbach:selected-tile", String(index));
        });

        fragment.append(link);
    });

    grid.append(fragment);
}

function selectTile(index, focusTile = true) {
    selectedIndex = normalizeIndex(index);
    const selectedTile = tiles[selectedIndex];
    const tileElements = getTileElements();

    tileElements.forEach((tileElement, tileIndex) => {
        tileElement.classList.toggle("is-selected", tileIndex === selectedIndex);
        tileElement.setAttribute("aria-current", tileIndex === selectedIndex ? "page" : "false");
    });

    selectedTitle.textContent = selectedTile.title;
    selectedDescription.textContent = selectedTile.description;
    launchLink.href = selectedTile.href;
    selectionPanel.className = `selection-panel ${selectedTile.art}`;
    localStorage.setItem("lachsbach:selected-tile", String(selectedIndex));

    if (focusTile) {
        tileElements[selectedIndex]?.focus();
    }
}

function normalizeIndex(index) {
    if (index < 0) {
        return tiles.length - 1;
    }

    if (index >= tiles.length) {
        return 0;
    }

    return index;
}

function getTileElements() {
    return Array.from(grid.querySelectorAll(".tile"));
}

function getColumnCount() {
    const tileElements = getTileElements();

    if (tileElements.length < 2) {
        return 1;
    }

    const firstTop = tileElements[0].getBoundingClientRect().top;
    const firstRowTiles = tileElements.filter((tile) => tile.getBoundingClientRect().top === firstTop);
    return Math.max(firstRowTiles.length, 1);
}

function handleGridKeyboard(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
    }

    const columns = getColumnCount();
    const keyActions = {
        ArrowRight: selectedIndex + 1,
        ArrowLeft: selectedIndex - 1,
        ArrowDown: selectedIndex + columns,
        ArrowUp: selectedIndex - columns,
        Home: 0,
        End: tiles.length - 1
    };

    if (event.key === "Enter") {
        event.preventDefault();
        window.location.href = tiles[selectedIndex].href;
        return;
    }

    if (!(event.key in keyActions)) {
        return;
    }

    event.preventDefault();
    selectTile(keyActions[event.key]);
}

renderTiles();
selectTile(selectedIndex, false);
document.addEventListener("keydown", handleGridKeyboard);
