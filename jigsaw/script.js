const imageManifestUrl = "../img/images.json";
const fallbackImages = Array.from({ length: 5 }, (_, index) => ({
    src: `../img/${index + 1}.png`,
    name: String(index + 1)
}));
const minimumPieces = 9;
const maximumPieces = 100;

const canvas = document.querySelector("#puzzle-canvas");
const puzzleStage = document.querySelector(".puzzle-stage");
const boardSurface = document.querySelector(".board-surface");
const context = canvas.getContext("2d");
const settingsForm = document.querySelector("#settings-form");
const countRange = document.querySelector("#piece-count");
const countNumber = document.querySelector("#piece-number");
const countOutput = document.querySelector("#piece-output");
const groupCount = document.querySelector("#group-count");
const gameStatus = document.querySelector("#game-status");
const previewImage = document.querySelector("#preview-image");
const imageName = document.querySelector("#image-name");
const loadingMessage = document.querySelector("#loading-message");
const shuffleButton = document.querySelector("#shuffle-button");
const imageButton = document.querySelector("#image-button");

let availableImages = fallbackImages;
let currentImage = null;
let loadedImage = null;
let pieces = [];
let groups = new Map();
let groupOrder = [];
let adjacency = [];
let logicalWidth = 0;
let logicalHeight = 0;
let puzzleWidth = 0;
let puzzleHeight = 0;
let boardRect = { x: 0, y: 0, width: 0, height: 0 };
let selectedCount = 25;
let dragState = null;
let nextGroupId = 1;
let resizeFrame = null;

function clampCount(value) {
    const parsed = Math.round(Number(value));
    return Number.isFinite(parsed)
        ? Math.min(Math.max(parsed, minimumPieces), maximumPieces)
        : selectedCount;
}

function syncCountControls(value) {
    selectedCount = clampCount(value);
    countRange.value = String(selectedCount);
    countNumber.value = String(selectedCount);
    countOutput.value = String(selectedCount);
    countOutput.textContent = String(selectedCount);
}

async function loadImageManifest() {
    try {
        const response = await fetch(imageManifestUrl, { cache: "no-store" });
        if (!response.ok) {
            throw new Error("Manifest nicht verfügbar");
        }
        const entries = await response.json();
        const validEntries = entries.filter((entry) => entry && typeof entry.src === "string");
        if (validEntries.length) {
            availableImages = validEntries;
        }
    } catch {
        availableImages = fallbackImages;
    }
}

function chooseRandomImage(excludedImage = null) {
    const choices = availableImages.length > 1
        ? availableImages.filter((entry) => entry.src !== excludedImage?.src)
        : availableImages;
    return choices[Math.floor(Math.random() * choices.length)] || fallbackImages[0];
}

function loadImage(entry) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = entry.src;
    });
}

async function setImage(entry, startAfterLoad = true) {
    loadingMessage.hidden = false;
    gameStatus.textContent = "Motiv wird geladen";
    try {
        const image = await loadImage(entry);
        currentImage = entry;
        loadedImage = image;
        previewImage.src = entry.src;
        previewImage.alt = `Komplettes Puzzle-Motiv: ${entry.name || "Motiv"}`;
        imageName.textContent = entry.name || getFileName(entry.src);
        document.documentElement.style.setProperty("--puzzle-image", `url("${entry.src}")`);
        loadingMessage.hidden = true;
        if (startAfterLoad) {
            startPuzzle(selectedCount);
        }
    } catch {
        gameStatus.textContent = "Motiv konnte nicht geladen werden";
        loadingMessage.textContent = "Motiv konnte nicht geladen werden";
    }
}

function getFileName(src) {
    return src.split("/").pop()?.replace(/\.[^.]+$/, "") || "Motiv";
}

function resizeCanvas(restart = false) {
    const rect = puzzleStage.getBoundingClientRect();
    const nextWidth = Math.max(320, Math.round(rect.width));
    const nextHeight = Math.max(420, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (nextWidth === logicalWidth && nextHeight === logicalHeight && !restart) {
        return;
    }

    logicalWidth = nextWidth;
    logicalHeight = nextHeight;
    canvas.width = Math.round(logicalWidth * dpr);
    canvas.height = Math.round(logicalHeight * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (loadedImage && (restart || pieces.length === 0)) {
        startPuzzle(selectedCount);
    } else {
        keepPiecesInBounds();
        draw();
    }
}

function createRowLayout(count) {
    const aspect = loadedImage.naturalWidth / loadedImage.naturalHeight;
    const rowCount = Math.max(2, Math.min(count, Math.round(Math.sqrt(count / aspect))));
    const baseColumns = Math.floor(count / rowCount);
    const extraPieces = count % rowCount;
    return Array.from({ length: rowCount }, (_, row) => baseColumns + (row < extraPieces ? 1 : 0));
}

function buildPieces(count) {
    const imageAspect = loadedImage.naturalWidth / loadedImage.naturalHeight;
    const maxWidth = logicalWidth * 0.55;
    const maxHeight = logicalHeight * 0.4;
    puzzleWidth = Math.min(maxWidth, maxHeight * imageAspect);
    puzzleHeight = puzzleWidth / imageAspect;
    if (puzzleHeight > maxHeight) {
        puzzleHeight = maxHeight;
        puzzleWidth = puzzleHeight * imageAspect;
    }
    boardRect = {
        x: (logicalWidth - puzzleWidth) / 2,
        y: (logicalHeight - puzzleHeight) / 2,
        width: puzzleWidth,
        height: puzzleHeight
    };
    updateBoardSurface();

    const rows = createRowLayout(count);
    const builtPieces = [];
    const rowPieces = [];
    let id = 0;

    rows.forEach((columns, row) => {
        const rowHeight = puzzleHeight / rows.length;
        const pieceWidth = puzzleWidth / columns;
        const currentRow = [];

        for (let column = 0; column < columns; column += 1) {
            const piece = {
                id,
                row,
                column,
                sx: column * pieceWidth,
                sy: row * rowHeight,
                width: pieceWidth,
                height: rowHeight,
                topSegments: [],
                rightOut: 0,
                bottomSegments: [],
                leftOut: 0,
                x: 0,
                y: 0,
                groupId: 0,
                path: null
            };
            builtPieces.push(piece);
            currentRow.push(piece);
            id += 1;
        }
        rowPieces.push(currentRow);
    });

    rowPieces.forEach((row, rowIndex) => {
        row.forEach((piece, columnIndex) => {
            const tabSize = Math.min(piece.width, piece.height) * 0.3;
            if (columnIndex < row.length - 1) {
                const sign = randomSign();
                piece.rightOut = sign * tabSize;
                row[columnIndex + 1].leftOut = -sign * tabSize;
            }
        });
    });

    createHorizontalConnections(rowPieces);

    builtPieces.forEach((piece) => {
        piece.path = createPiecePath(piece);
    });

    adjacency = createAdjacency(rowPieces);
    return builtPieces;
}

function createHorizontalConnections(rowPieces) {
    for (let rowIndex = 0; rowIndex < rowPieces.length - 1; rowIndex += 1) {
        const upperRow = rowPieces[rowIndex];
        const lowerRow = rowPieces[rowIndex + 1];

        upperRow.forEach((upper) => {
            lowerRow.forEach((lower) => {
                const overlapStart = Math.max(upper.sx, lower.sx);
                const overlapEnd = Math.min(upper.sx + upper.width, lower.sx + lower.width);
                const overlapLength = overlapEnd - overlapStart;
                if (overlapLength <= 0.5) {
                    return;
                }

                const sign = randomSign();
                const tabSize = Math.min(overlapLength, upper.height, lower.height) * 0.3;
                upper.bottomSegments.push({
                    start: overlapStart - upper.sx,
                    end: overlapEnd - upper.sx,
                    out: sign * tabSize
                });
                lower.topSegments.push({
                    start: overlapStart - lower.sx,
                    end: overlapEnd - lower.sx,
                    out: -sign * tabSize
                });
            });
        });
    }
}

function updateBoardSurface() {
    boardSurface.style.left = `${boardRect.x}px`;
    boardSurface.style.top = `${boardRect.y}px`;
    boardSurface.style.width = `${boardRect.width}px`;
    boardSurface.style.height = `${boardRect.height}px`;
}

function randomSign() {
    return Math.random() < 0.5 ? -1 : 1;
}

function createPiecePath(piece) {
    const path = new Path2D();
    path.moveTo(0, 0);
    addHorizontalEdge(path, piece.width, 0, piece.topSegments, "forward");
    addEdge(path, piece.width, 0, piece.width, piece.height, 1, 0, piece.rightOut);
    addHorizontalEdge(path, piece.width, piece.height, piece.bottomSegments, "backward");
    addEdge(path, 0, piece.height, 0, 0, -1, 0, piece.leftOut);
    path.closePath();
    return path;
}

function addHorizontalEdge(path, width, y, segments, direction) {
    if (direction === "forward") {
        const orderedSegments = [...segments].sort((first, second) => first.start - second.start);
        orderedSegments.forEach((segment) => {
            path.lineTo(segment.start, y);
            addEdge(path, segment.start, y, segment.end, y, 0, -1, segment.out);
        });
        path.lineTo(width, y);
        return;
    }

    const orderedSegments = [...segments].sort((first, second) => second.start - first.start);
    orderedSegments.forEach((segment) => {
        path.lineTo(segment.end, y);
        addEdge(path, segment.end, y, segment.start, y, 0, 1, segment.out);
    });
    path.lineTo(0, y);
}

function addEdge(path, x1, y1, x2, y2, normalX, normalY, bulge) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const point = (amount, offset = 0) => ({
        x: x1 + dx * amount + normalX * offset,
        y: y1 + dy * amount + normalY * offset
    });
    if (!bulge) {
        path.lineTo(x2, y2);
        return;
    }

    const a = point(0.31);
    path.lineTo(a.x, a.y);
    const neckStart = point(0.38, bulge * 0.16);
    path.bezierCurveTo(...toCurveArgs(point(0.35), point(0.38), neckStart));

    const lobeStart = point(0.43, bulge * 0.88);
    path.bezierCurveTo(...toCurveArgs(
        point(0.39, bulge * 0.4),
        point(0.39, bulge * 0.78),
        lobeStart
    ));

    const lobeEnd = point(0.57, bulge * 0.88);
    path.bezierCurveTo(...toCurveArgs(
        point(0.46, bulge * 1.08),
        point(0.54, bulge * 1.08),
        lobeEnd
    ));

    const neckEnd = point(0.62, bulge * 0.16);
    path.bezierCurveTo(...toCurveArgs(
        point(0.61, bulge * 0.78),
        point(0.61, bulge * 0.4),
        neckEnd
    ));

    const edgeEnd = point(0.69);
    path.bezierCurveTo(...toCurveArgs(point(0.62), point(0.65), edgeEnd));
    path.lineTo(x2, y2);
}

function toCurveArgs(first, second, third) {
    return [first.x, first.y, second.x, second.y, third.x, third.y];
}

function createAdjacency(rowPieces) {
    const links = [];
    rowPieces.forEach((row, rowIndex) => {
        for (let column = 0; column < row.length - 1; column += 1) {
            links.push([row[column].id, row[column + 1].id]);
        }

        const nextRow = rowPieces[rowIndex + 1];
        if (!nextRow) {
            return;
        }

        row.forEach((upper) => {
            nextRow.forEach((lower) => {
                const overlap = Math.min(upper.sx + upper.width, lower.sx + lower.width)
                    - Math.max(upper.sx, lower.sx);
                if (overlap > 0.5) {
                    links.push([upper.id, lower.id]);
                }
            });
        });
    });
    return links;
}

function startPuzzle(count) {
    if (!loadedImage || logicalWidth === 0) {
        return;
    }

    syncCountControls(count);
    nextGroupId = 1;
    pieces = buildPieces(selectedCount);
    groups = new Map();
    groupOrder = [];

    const placementOrder = shuffleIds(pieces.map((piece) => piece.id));
    placementOrder.forEach((pieceId, placementIndex) => {
        const piece = pieces[pieceId];
        placePieceAtEdge(piece, placementIndex, pieces.length);
        const groupId = nextGroupId++;
        piece.groupId = groupId;
        groups.set(groupId, new Set([piece.id]));
        groupOrder.push(groupId);
    });

    gameStatus.textContent = "Läuft";
    updateGroupCount();
    draw();
}

function shuffleIds(ids) {
    for (let index = ids.length - 1; index > 0; index -= 1) {
        const target = Math.floor(Math.random() * (index + 1));
        [ids[index], ids[target]] = [ids[target], ids[index]];
    }
    return ids;
}

function placePieceAtEdge(piece, placementIndex, totalPieces) {
    const side = placementIndex % 4;
    const positionsOnSide = Math.ceil(totalPieces / 4);
    const slot = Math.floor(placementIndex / 4);
    const progress = positionsOnSide <= 1 ? 0.5 : slot / (positionsOnSide - 1);
    const boardGap = 10;
    const jitter = () => (Math.random() - 0.5) * 6;
    const topExtent = getSegmentExtent(piece.topSegments);
    const rightExtent = Math.max(0, piece.rightOut);
    const bottomExtent = getSegmentExtent(piece.bottomSegments);
    const leftExtent = Math.max(0, piece.leftOut);
    const horizontalSpace = Math.max(0, logicalWidth - piece.width - leftExtent - rightExtent);
    const verticalSpace = Math.max(0, logicalHeight - piece.height - topExtent - bottomExtent);

    if (side === 0) {
        piece.x = leftExtent + progress * horizontalSpace + jitter();
        piece.y = boardRect.y - piece.height - bottomExtent - boardGap + jitter();
    } else if (side === 1) {
        piece.x = boardRect.x + boardRect.width + leftExtent + boardGap + jitter();
        piece.y = topExtent + progress * verticalSpace + jitter();
    } else if (side === 2) {
        piece.x = leftExtent + (1 - progress) * horizontalSpace + jitter();
        piece.y = boardRect.y + boardRect.height + topExtent + boardGap + jitter();
    } else {
        piece.x = boardRect.x - piece.width - rightExtent - boardGap + jitter();
        piece.y = topExtent + (1 - progress) * verticalSpace + jitter();
    }

    keepPieceInsideStage(piece, { topExtent, rightExtent, bottomExtent, leftExtent });
}

function getSegmentExtent(segments) {
    return segments.reduce((extent, segment) => Math.max(extent, segment.out), 0);
}

function keepPieceInsideStage(piece, extents) {
    piece.x = Math.min(
        Math.max(piece.x, extents.leftExtent + 3),
        logicalWidth - piece.width - extents.rightExtent - 3
    );
    piece.y = Math.min(
        Math.max(piece.y, extents.topExtent + 3),
        logicalHeight - piece.height - extents.bottomExtent - 3
    );
}

function keepPiecesInBounds() {
    groups.forEach((pieceIds) => {
        const bounds = getGroupBounds(pieceIds);
        let dx = 0;
        let dy = 0;
        if (bounds.maxX < 0) dx = -bounds.maxX;
        if (bounds.minX > logicalWidth) dx = logicalWidth - bounds.minX;
        if (bounds.maxY < 0) dy = -bounds.maxY;
        if (bounds.minY > logicalHeight) dy = logicalHeight - bounds.minY;
        translateGroup(pieceIds, dx, dy);
    });
}

function getGroupBounds(pieceIds) {
    const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    pieceIds.forEach((pieceId) => {
        const piece = pieces[pieceId];
        const extent = Math.max(piece.width, piece.height) * 0.32;
        bounds.minX = Math.min(bounds.minX, piece.x - extent);
        bounds.minY = Math.min(bounds.minY, piece.y - extent);
        bounds.maxX = Math.max(bounds.maxX, piece.x + piece.width + extent);
        bounds.maxY = Math.max(bounds.maxY, piece.y + piece.height + extent);
    });
    return bounds;
}

function draw() {
    context.clearRect(0, 0, logicalWidth, logicalHeight);
    if (!loadedImage) {
        return;
    }

    groupOrder.forEach((groupId) => {
        const pieceIds = groups.get(groupId);
        if (!pieceIds) {
            return;
        }
        pieceIds.forEach((pieceId) => drawPiece(pieces[pieceId], pieceIds.size > 1));
    });
}

function drawPiece(piece, connected) {
    context.save();
    context.translate(piece.x, piece.y);
    context.shadowColor = "rgba(0, 0, 0, 0.48)";
    context.shadowBlur = connected ? 11 : 7;
    context.shadowOffsetY = connected ? 5 : 3;
    context.fillStyle = "#111";
    context.fill(piece.path);
    context.shadowColor = "transparent";
    context.clip(piece.path);
    context.drawImage(loadedImage, -piece.sx, -piece.sy, puzzleWidth, puzzleHeight);
    context.restore();

    context.save();
    context.translate(piece.x, piece.y);
    context.strokeStyle = connected ? "rgba(70, 214, 182, 0.72)" : "rgba(255, 255, 255, 0.48)";
    context.lineWidth = selectedCount > 400 ? 0.55 : 1;
    context.stroke(piece.path);
    context.restore();
}

function getPointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) * (logicalWidth / rect.width),
        y: (event.clientY - rect.top) * (logicalHeight / rect.height)
    };
}

function findPieceAt(x, y) {
    for (let groupIndex = groupOrder.length - 1; groupIndex >= 0; groupIndex -= 1) {
        const pieceIds = Array.from(groups.get(groupOrder[groupIndex]) || []);
        for (let index = pieceIds.length - 1; index >= 0; index -= 1) {
            const piece = pieces[pieceIds[index]];
            if (context.isPointInPath(piece.path, x - piece.x, y - piece.y)) {
                return piece;
            }
        }
    }
    return null;
}

function bringGroupToFront(groupId) {
    groupOrder = groupOrder.filter((id) => id !== groupId);
    groupOrder.push(groupId);
}

function translateGroup(pieceIds, dx, dy) {
    if (!dx && !dy) {
        return;
    }
    pieceIds.forEach((pieceId) => {
        pieces[pieceId].x += dx;
        pieces[pieceId].y += dy;
    });
}

function handlePointerDown(event) {
    const pointer = getPointerPosition(event);
    const piece = findPieceAt(pointer.x, pointer.y);
    if (!piece) {
        return;
    }

    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    bringGroupToFront(piece.groupId);
    dragState = {
        pointerId: event.pointerId,
        groupId: piece.groupId,
        lastX: pointer.x,
        lastY: pointer.y
    };
    canvas.classList.add("is-dragging");
    draw();
}

function handlePointerMove(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
    }
    const pointer = getPointerPosition(event);
    const pieceIds = groups.get(dragState.groupId);
    translateGroup(pieceIds, pointer.x - dragState.lastX, pointer.y - dragState.lastY);
    dragState.lastX = pointer.x;
    dragState.lastY = pointer.y;
    draw();
}

function handlePointerUp(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
    }
    const droppedGroupId = dragState.groupId;
    dragState = null;
    canvas.classList.remove("is-dragging");
    snapGroup(droppedGroupId);
    draw();
}

function snapGroup(initialGroupId) {
    let activeGroupId = initialGroupId;
    let merged = true;

    while (merged) {
        merged = false;
        const activeIds = groups.get(activeGroupId);
        if (!activeIds) {
            break;
        }

        for (const [firstId, secondId] of adjacency) {
            const first = pieces[firstId];
            const second = pieces[secondId];
            const firstActive = first.groupId === activeGroupId;
            const secondActive = second.groupId === activeGroupId;
            if (firstActive === secondActive) {
                continue;
            }

            const activePiece = firstActive ? first : second;
            const targetPiece = firstActive ? second : first;
            const expectedX = targetPiece.x + (activePiece.sx - targetPiece.sx);
            const expectedY = targetPiece.y + (activePiece.sy - targetPiece.sy);
            const dx = expectedX - activePiece.x;
            const dy = expectedY - activePiece.y;
            const snapDistance = Math.max(5, Math.min(activePiece.width, activePiece.height) * 0.24);

            if (Math.hypot(dx, dy) <= snapDistance) {
                translateGroup(activeIds, dx, dy);
                activeGroupId = mergeGroups(activeGroupId, targetPiece.groupId);
                merged = true;
                break;
            }
        }
    }

    constrainGroupToReachableArea(activeGroupId);
    updateGroupCount();
    if (groups.size === 1) {
        finishPuzzle();
    }
}

function mergeGroups(activeGroupId, targetGroupId) {
    if (activeGroupId === targetGroupId) {
        return activeGroupId;
    }
    const activeIds = groups.get(activeGroupId);
    const targetIds = groups.get(targetGroupId);
    targetIds.forEach((pieceId) => {
        activeIds.add(pieceId);
        pieces[pieceId].groupId = activeGroupId;
    });
    groups.delete(targetGroupId);
    groupOrder = groupOrder.filter((id) => id !== targetGroupId && id !== activeGroupId);
    groupOrder.push(activeGroupId);
    gameStatus.textContent = `${activeIds.size} Teile verbunden`;
    return activeGroupId;
}

function constrainGroupToReachableArea(groupId) {
    const ids = groups.get(groupId);
    if (!ids) {
        return;
    }
    const bounds = getGroupBounds(ids);
    const minVisible = 24;
    let dx = 0;
    let dy = 0;
    if (bounds.maxX < minVisible) dx = minVisible - bounds.maxX;
    if (bounds.minX > logicalWidth - minVisible) dx = logicalWidth - minVisible - bounds.minX;
    if (bounds.maxY < minVisible) dy = minVisible - bounds.maxY;
    if (bounds.minY > logicalHeight - minVisible) dy = logicalHeight - minVisible - bounds.minY;
    translateGroup(ids, dx, dy);
}

function updateGroupCount() {
    groupCount.textContent = String(groups.size);
}

function finishPuzzle() {
    gameStatus.textContent = `Gelöst – ${selectedCount} Teile verbunden`;
}

countRange.addEventListener("input", () => syncCountControls(countRange.value));
countNumber.addEventListener("input", () => {
    if (countNumber.value !== "") {
        syncCountControls(countNumber.value);
    }
});
countNumber.addEventListener("change", () => syncCountControls(countNumber.value));

document.querySelectorAll("[data-count]").forEach((button) => {
    button.addEventListener("click", () => syncCountControls(button.dataset.count));
});

settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    startPuzzle(selectedCount);
});

shuffleButton.addEventListener("click", () => startPuzzle(selectedCount));
imageButton.addEventListener("click", () => setImage(chooseRandomImage(currentImage)));

canvas.addEventListener("pointerdown", handlePointerDown);
canvas.addEventListener("pointermove", handlePointerMove);
canvas.addEventListener("pointerup", handlePointerUp);
canvas.addEventListener("pointercancel", handlePointerUp);

window.addEventListener("resize", () => {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => resizeCanvas(true));
});

syncCountControls(selectedCount);
resizeCanvas();
loadImageManifest().then(() => setImage(chooseRandomImage()));
