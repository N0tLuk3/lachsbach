const imageManifestUrl = "../img/images.json";
const fallbackPuzzleImages = [
    { src: "../img/1.png", name: "1" },
    { src: "../img/2.png", name: "2" },
    { src: "../img/3.png", name: "3" },
    { src: "../img/4.png", name: "4" },
    { src: "../img/5.png", name: "5" }
];
const emptyTile = -1;
const minimumSize = 3;
const maximumSize = 10;

const board = document.querySelector("#puzzle-board");
const previewImage = document.querySelector("#preview-image");
const settingsForm = document.querySelector("#settings-form");
const sizeInput = document.querySelector("#board-size");
const moveCount = document.querySelector("#move-count");
const gridLabel = document.querySelector("#grid-label");
const gameStatus = document.querySelector("#game-status");
const solveButton = document.querySelector("#solve-button");
const imageButton = document.querySelector("#image-button");
const stepButtons = document.querySelectorAll("[data-step]");
const modal = document.querySelector("#confirm-modal");
const modalKicker = document.querySelector("#modal-kicker");
const modalTitle = document.querySelector("#modal-title");
const modalMessage = document.querySelector("#modal-message");
const modalConfirm = document.querySelector("#modal-confirm");
const modalCancel = document.querySelector("#modal-cancel");

let size = minimumSize;
let cells = [];
let moves = 0;
let selectedIndex = 0;
let hintIndex = null;
let confirmAction = null;
let puzzleImages = [...fallbackPuzzleImages];
let currentImage = puzzleImages[0];

function createSolvedCells(nextSize) {
    const tileCount = nextSize * nextSize;
    const solvedCells = Array.from({ length: tileCount - 1 }, (_, index) => index);
    solvedCells.push(emptyTile);
    return solvedCells;
}

async function loadPuzzleImages() {
    try {
        const response = await fetch(imageManifestUrl, { cache: "no-store" });

        if (!response.ok) {
            throw new Error(`Image manifest returned ${response.status}`);
        }

        const images = await response.json();
        const validImages = images
            .filter((image) => typeof image.src === "string" && image.src.length > 0)
            .map((image) => ({
                src: image.src,
                name: image.name || getImageName(image.src)
            }));

        if (validImages.length > 0) {
            puzzleImages = validImages;
        }
    } catch {
        puzzleImages = [...fallbackPuzzleImages];
    }

    currentImage = puzzleImages[0];
}

function startGame(nextSize = size) {
    size = normalizeSize(nextSize);
    applyCurrentImage();
    sizeInput.value = String(size);
    cells = createSolvedCells(size);
    moves = 0;
    selectedIndex = 0;
    hintIndex = null;
    shuffleBoard();
    updateBoard();
    updateStats("Läuft");
    board.focus();
}

function startGameWithRandomImage(nextSize = size) {
    currentImage = getRandomImage(currentImage);
    startGame(nextSize);
}

function getRandomImage(previousImage) {
    const candidates = puzzleImages.length > 1
        ? puzzleImages.filter((image) => image.src !== previousImage?.src)
        : puzzleImages;

    return candidates[Math.floor(Math.random() * candidates.length)] ?? puzzleImages[0];
}

function getImageName(src) {
    return src.split("/").pop()?.replace(/\.[^.]+$/, "") || "Motiv";
}

function applyCurrentImage() {
    const imageValue = `url("${currentImage.src}")`;
    document.documentElement.style.setProperty("--puzzle-image", imageValue);
    previewImage.src = currentImage.src;
    previewImage.alt = `Komplettes Puzzle-Motiv: ${currentImage.name}`;
}

function normalizeSize(value) {
    const parsed = Math.floor(Number(value));
    return Number.isFinite(parsed) ? Math.min(Math.max(minimumSize, parsed), maximumSize) : minimumSize;
}

function shuffleBoard() {
    let previousEmptyIndex = -1;
    const shuffleMoves = size * size * 28;

    for (let index = 0; index < shuffleMoves; index += 1) {
        const emptyIndex = getEmptyIndex();
        const possibleMoves = getMovableIndexes(emptyIndex).filter((moveIndex) => moveIndex !== previousEmptyIndex);
        const nextIndex = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];

        previousEmptyIndex = emptyIndex;
        swapCells(emptyIndex, nextIndex);
    }

    if (isSolved()) {
        const emptyIndex = getEmptyIndex();
        const nextIndex = getMovableIndexes(emptyIndex)[0];
        swapCells(emptyIndex, nextIndex);
    }
}

function updateBoard() {
    board.style.setProperty("--size", size);
    board.innerHTML = "";
    board.classList.toggle("is-complete", isSolved());

    cells.forEach((tileId, cellIndex) => {
        if (tileId === emptyTile) {
            const emptyCell = document.createElement("div");
            emptyCell.className = `empty-cell${cellIndex === selectedIndex ? " is-selected" : ""}`;
            emptyCell.setAttribute("aria-label", "Freies Feld");
            board.append(emptyCell);
            return;
        }

        const tile = document.createElement("button");
        const originalRow = Math.floor(tileId / size);
        const originalColumn = tileId % size;
        const canMove = canMoveTile(cellIndex);
        const stateClasses = [
            canMove ? "can-move" : "",
            cellIndex === selectedIndex ? "is-selected" : "",
            cellIndex === hintIndex ? "is-hint" : ""
        ].filter(Boolean).join(" ");

        tile.className = `puzzle-tile ${stateClasses}`.trim();
        tile.type = "button";
        tile.dataset.index = String(cellIndex);
        tile.style.setProperty("--tile-x", `${getTilePosition(originalColumn)}%`);
        tile.style.setProperty("--tile-y", `${getTilePosition(originalRow)}%`);
        tile.disabled = isSolved();
        tile.setAttribute("aria-label", `Kachel ${tileId + 1}`);

        tile.addEventListener("click", () => {
            selectCell(cellIndex);
            moveSelectedTile();
        });

        board.append(tile);
    });
}

function getTilePosition(axisIndex) {
    return size === 1 ? 0 : (axisIndex / (size - 1)) * 100;
}

function selectCell(cellIndex) {
    selectedIndex = clampIndex(cellIndex);
    updateBoard();
}

function moveSelection(direction) {
    const row = Math.floor(selectedIndex / size);
    const column = selectedIndex % size;
    const targets = {
        ArrowUp: [row - 1, column],
        ArrowDown: [row + 1, column],
        ArrowLeft: [row, column - 1],
        ArrowRight: [row, column + 1]
    };
    const target = targets[direction];

    if (!target) {
        return false;
    }

    const [targetRow, targetColumn] = target;

    if (targetRow < 0 || targetRow >= size || targetColumn < 0 || targetColumn >= size) {
        return false;
    }

    selectedIndex = targetRow * size + targetColumn;
    updateBoard();
    return true;
}

function moveSelectedTile() {
    return moveTile(selectedIndex);
}

function moveTile(cellIndex) {
    if (!canMoveTile(cellIndex) || isSolved()) {
        return false;
    }

    const emptyIndex = getEmptyIndex();
    swapCells(cellIndex, emptyIndex);
    selectedIndex = emptyIndex;
    hintIndex = null;
    moves += 1;
    updateBoard();
    updateStats(isSolved() ? "Gelöst" : "Läuft");
    return true;
}

function canMoveTile(cellIndex) {
    return getMovableIndexes(getEmptyIndex()).includes(cellIndex);
}

function getMovableIndexes(emptyIndex) {
    const row = Math.floor(emptyIndex / size);
    const column = emptyIndex % size;
    const candidates = [
        [row - 1, column],
        [row + 1, column],
        [row, column - 1],
        [row, column + 1]
    ];

    return candidates
        .filter(([candidateRow, candidateColumn]) => (
            candidateRow >= 0 &&
            candidateRow < size &&
            candidateColumn >= 0 &&
            candidateColumn < size
        ))
        .map(([candidateRow, candidateColumn]) => candidateRow * size + candidateColumn);
}

function getEmptyIndex() {
    return cells.indexOf(emptyTile);
}

function swapCells(firstIndex, secondIndex) {
    [cells[firstIndex], cells[secondIndex]] = [cells[secondIndex], cells[firstIndex]];
}

function clampIndex(index) {
    return Math.min(Math.max(index, 0), cells.length - 1);
}

function isSolved() {
    return cells.every((tileId, index) => (
        index === cells.length - 1 ? tileId === emptyTile : tileId === index
    ));
}

function updateStats(status) {
    moveCount.textContent = String(moves);
    gridLabel.textContent = `${size} x ${size}`;
    gameStatus.textContent = status;
}

function solveBoard() {
    cells = createSolvedCells(size);
    selectedIndex = cells.length - 1;
    hintIndex = null;
    updateBoard();
    updateStats("Gelöst");
    board.focus();
}

function adjustSize(step) {
    const nextSize = normalizeSize(size + step);

    if (nextSize === size) {
        updateStats(size === minimumSize ? "Minimum" : "Maximum");
        return;
    }

    startGame(nextSize);
}

function showHint() {
    if (isSolved()) {
        hintIndex = null;
        updateBoard();
        updateStats("Gelöst");
        return;
    }

    hintIndex = getBestNextMoveIndex();
    selectedIndex = hintIndex ?? selectedIndex;
    updateBoard();
    updateStats(hintIndex === null ? "Kein Zug" : "Hinweis");
    board.focus();
}

function getBestNextMoveIndex() {
    const emptyIndex = getEmptyIndex();
    const movableIndexes = getMovableIndexes(emptyIndex);

    return movableIndexes
        .map((moveIndex) => ({
            moveIndex,
            score: scoreMove(moveIndex, emptyIndex)
        }))
        .sort((first, second) => first.score - second.score)[0]?.moveIndex ?? null;
}

function scoreMove(moveIndex, emptyIndex) {
    const simulatedCells = [...cells];
    [simulatedCells[moveIndex], simulatedCells[emptyIndex]] = [simulatedCells[emptyIndex], simulatedCells[moveIndex]];
    return simulatedCells.reduce((score, tileId, index) => {
        if (tileId === emptyTile) {
            return score;
        }

        const currentRow = Math.floor(index / size);
        const currentColumn = index % size;
        const targetRow = Math.floor(tileId / size);
        const targetColumn = tileId % size;
        return score + Math.abs(currentRow - targetRow) + Math.abs(currentColumn - targetColumn);
    }, 0);
}

function openConfirmDialog({ kicker, title, message, confirmLabel, onConfirm }) {
    confirmAction = onConfirm;
    modalKicker.textContent = kicker;
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalConfirm.textContent = confirmLabel;
    modal.hidden = false;
    modalConfirm.focus();
}

function closeConfirmDialog() {
    confirmAction = null;
    modal.hidden = true;
    board.focus();
}

function confirmDialogAction() {
    const action = confirmAction;
    closeConfirmDialog();
    action?.();
}

function openSolveConfirm() {
    openConfirmDialog({
        kicker: "Lösen",
        title: "Puzzle lösen?",
        message: "Das aktuelle Spielfeld wird direkt in den gelösten Zustand gesetzt.",
        confirmLabel: "Enter",
        onConfirm: solveBoard
    });
}

function openResetConfirm() {
    openConfirmDialog({
        kicker: "Reset",
        title: "Neu mischen?",
        message: "Das aktuelle Spiel wird mit demselben Bild und derselben Rastergröße neu gemischt.",
        confirmLabel: "Enter",
        onConfirm: () => startGame(size)
    });
}

function isTypingTarget(target) {
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    openResetConfirm();
});

solveButton.addEventListener("click", openSolveConfirm);
imageButton.addEventListener("click", () => startGameWithRandomImage(size));
modalConfirm.addEventListener("click", confirmDialogAction);
modalCancel.addEventListener("click", closeConfirmDialog);

stepButtons.forEach((button) => {
    button.addEventListener("click", () => {
        adjustSize(Number(button.dataset.step));
    });
});

document.addEventListener("keydown", (event) => {
    if (!modal.hidden) {
        if (event.key === "Enter") {
            event.preventDefault();
            confirmDialogAction();
        }

        if (event.key === "Backspace" || event.key === "Escape") {
            event.preventDefault();
            closeConfirmDialog();
        }

        return;
    }

    if (isTypingTarget(event.target)) {
        return;
    }

    const key = event.key.toLowerCase();

    if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        moveSelection(event.key);
        board.focus();
        return;
    }

    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        moveSelectedTile();
        board.focus();
        return;
    }

    if (event.key === "+" || key === "p") {
        event.preventDefault();
        adjustSize(1);
        return;
    }

    if (event.key === "-" || key === "m") {
        event.preventDefault();
        adjustSize(-1);
        return;
    }

    if (key === "l") {
        event.preventDefault();
        openSolveConfirm();
        return;
    }

    if (key === "r") {
        event.preventDefault();
        openResetConfirm();
        return;
    }

    if (key === "h") {
        event.preventDefault();
        showHint();
    }
});

loadPuzzleImages().then(() => startGameWithRandomImage(minimumSize));
