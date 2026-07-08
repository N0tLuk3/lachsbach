const fs = require("fs");
const path = require("path");

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);
const rootDirectory = path.resolve(__dirname, "..");
const imageDirectory = path.join(rootDirectory, "img");
const manifestPath = path.join(imageDirectory, "images.json");

const images = fs.readdirSync(imageDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => imageExtensions.has(path.extname(entry.name).toLowerCase()))
    .sort((first, second) => first.name.localeCompare(second.name, undefined, { numeric: true }))
    .map((entry) => ({
        src: `../img/${entry.name}`,
        name: path.basename(entry.name, path.extname(entry.name))
    }));

fs.writeFileSync(manifestPath, `${JSON.stringify(images, null, 2)}\n`);
console.log(`Generated ${path.relative(rootDirectory, manifestPath)} with ${images.length} image(s).`);
