import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";

// ======================================================
// SCENE
// ======================================================

const scene = new THREE.Scene();
scene.background = new THREE.Color("#080d16");

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
camera.position.set(0, 600, 900);

const renderer = new THREE.WebGLRenderer({
    antialias: true
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

document.getElementById("scene").appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 1.2));

const light = new THREE.DirectionalLight(0xffffff, 1.0);
light.position.set(300, 500, 500);
scene.add(light);

// ======================================================
// DATA
// ======================================================

let rows = [];
let points = null;
let geometry = null;
let material = null;
let filtered = [];

const MAP_SCALE = 30;
const MAP_CENTER_LON = 136;
const MAP_CENTER_LAT = 36;

// ======================================================
// GEOGRAPHICAL COORDINATES
// ======================================================

function mapPoint(record) {

    const x = (record.longitude - MAP_CENTER_LON) * MAP_SCALE;

    const z = -(record.latitude - MAP_CENTER_LAT) * MAP_SCALE;

    const y = -Math.min(record.depth, 700) * 0.65;

    return [x, y, z];
}

// ======================================================
// DEPTH COLOUR
// ======================================================

function depthColor(depth) {

    const t = Math.max(0, Math.min(1, depth / 700));

    return new THREE.Color().setHSL(
        0.52 - t * 0.52,
        1,
        0.52
    );
}

// ======================================================
// JAPAN MAP
// ======================================================

async function loadJapanMap() {

    const status = document.getElementById("status");

    try {

        status.textContent = "Loading Japan terrain...";

        // Load terrain metadata
        const metadataResponse = await fetch("./japan_terrain.json");

        if (!metadataResponse.ok) {
            throw new Error("Failed to load terrain metadata");
        }

        const metadata = await metadataResponse.json();

        // Load binary elevation data
        const terrainResponse = await fetch("./japan_terrain.bin");

        if (!terrainResponse.ok) {
            throw new Error("Failed to load terrain data");
        }

        const buffer = await terrainResponse.arrayBuffer();

        const elevations = new Int16Array(buffer);

        const width = metadata.width;
        const height = metadata.height;

        const bounds = metadata.bounds;

        // Reduce mesh resolution for better performance
        const stride = 2;

        const meshWidth = Math.floor(width / stride);
        const meshHeight = Math.floor(height / stride);

        const positions = [];
        const colours = [];
        const indices = [];

        const terrainScale = 0.035;

        function terrainColour(elevation) {

            if (elevation < -6000) {
                return new THREE.Color(0x061b38);
            }

            if (elevation < -4000) {
                return new THREE.Color(0x0b2d55);
            }

            if (elevation < -2000) {
                return new THREE.Color(0x123f70);
            }

            if (elevation < -500) {
                return new THREE.Color(0x1c5688);
            }

            if (elevation < 0) {
                return new THREE.Color(0x286b99);
            }

            if (elevation < 200) {
                return new THREE.Color(0x476b3c);
            }

            if (elevation < 800) {
                return new THREE.Color(0x658348);
            }

            if (elevation < 1500) {
                return new THREE.Color(0x8a8659);
            }

            if (elevation < 2500) {
                return new THREE.Color(0xa39a7c);
            }

            return new THREE.Color(0xd9d5c8);
        }

        // Generate terrain vertices
        for (let row = 0; row < meshHeight; row++) {

            for (let col = 0; col < meshWidth; col++) {

                const originalRow = row * stride;
                const originalCol = col * stride;

                const index =
                    originalRow * width + originalCol;

                const elevation = elevations[index];

                const longitude =
                    bounds.west +
                    (originalCol / (width - 1)) *
                    (bounds.east - bounds.west);

                const latitude =
                    bounds.north -
                    (originalRow / (height - 1)) *
                    (bounds.north - bounds.south);

                const x =
                    (longitude - MAP_CENTER_LON) *
                    MAP_SCALE;

                const z =
                    -(latitude - MAP_CENTER_LAT) *
                    MAP_SCALE;

                const y = elevation * terrainScale;

                positions.push(x, y, z);

                const colour = terrainColour(elevation);

                colours.push(
                    colour.r,
                    colour.g,
                    colour.b
                );

            }

        }

        // Generate terrain triangles
        for (let row = 0; row < meshHeight - 1; row++) {

            for (let col = 0; col < meshWidth - 1; col++) {

                const a = row * meshWidth + col;
                const b = a + 1;
                const c = a + meshWidth;
                const d = c + 1;

                indices.push(
                    a, c, b,
                    b, c, d
                );

            }

        }

        const terrainGeometry = new THREE.BufferGeometry();

        terrainGeometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(
                positions,
                3
            )
        );

        terrainGeometry.setAttribute(
            "color",
            new THREE.Float32BufferAttribute(
                colours,
                3
            )
        );

        terrainGeometry.setIndex(indices);

        terrainGeometry.computeVertexNormals();

        const terrainMaterial = new THREE.MeshStandardMaterial({

            vertexColors: true,

            roughness: 1,

            metalness: 0,

            side: THREE.DoubleSide

        });

        const terrainMesh = new THREE.Mesh(
            terrainGeometry,
            terrainMaterial
        );

        scene.add(terrainMesh);

        console.log("Japan terrain loaded successfully");

        status.textContent =
            "Japan terrain loaded. Loading earthquake data...";

    } catch (error) {

        console.error("Terrain loading error:", error);

        status.textContent = "Terrain loading failed";

    }

}
// ======================================================
// EARTHQUAKE POINTS
// ======================================================

function loadPoints() {

    if (points) {

        scene.remove(points);

        geometry.dispose();

        material.dispose();

    }

    const minMagnitude =
        Number(document.getElementById("mag").value);

    const maxDepth =
        Number(document.getElementById("depth").value);

    const startYear =
        Number(document.getElementById("year").value);

    filtered = rows.filter(record => {

        const earthquakeYear =
            new Date(record.time).getUTCFullYear();

        return (
            record.mag >= minMagnitude &&
            record.depth <= maxDepth &&
            earthquakeYear >= startYear
        );

    });

    const positions = [];
    const colours = [];

    for (const record of filtered) {

        const [x, y, z] = mapPoint(record);

        positions.push(x, y, z);

        const colour = depthColor(record.depth);

        colours.push(
            colour.r,
            colour.g,
            colour.b
        );

    }

    geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3)
    );

    geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(colours, 3)
    );

    material = new THREE.PointsMaterial({

        size: 3,

        vertexColors: true,

        sizeAttenuation: true

    });

    points = new THREE.Points(
        geometry,
        material
    );

    scene.add(points);

    document.getElementById("status").textContent =
        `Showing ${filtered.length.toLocaleString()} / ${rows.length.toLocaleString()} earthquakes`;

}

// ======================================================
// CSV PARSER
// ======================================================

function parseCSVLine(line) {

    const output = [];

    let value = "";

    let quoted = false;

    for (let i = 0; i < line.length; i++) {

        const character = line[i];

        if (character === '"') {

            if (quoted && line[i + 1] === '"') {

                value += '"';

                i++;

            } else {

                quoted = !quoted;

            }

        } else if (character === "," && !quoted) {

            output.push(value);

            value = "";

        } else {

            value += character;

        }

    }

    output.push(value);

    return output;

}

// ======================================================
// LOAD EARTHQUAKE CSV
// ======================================================

async function loadEarthquakeData() {

    try {

        document.getElementById("status").textContent =
            "Loading earthquake data...";

        const response = await fetch("./earthquakes.csv");

        if (!response.ok) {

            throw new Error(
                `CSV loading failed: HTTP ${response.status}`
            );

        }

        const text = await response.text();

        const lines = text.trim().split(/\r?\n/);

        const headers = parseCSVLine(lines[0]);

        rows = lines.slice(1).map(line => {

            const values = parseCSVLine(line);

            const record = {};

            headers.forEach((header, index) => {

                record[header] = values[index];

            });

            return {

                time: record.time,

                latitude: Number(record.latitude),

                longitude: Number(record.longitude),

                depth: Number(record.depth),

                mag: Number(record.mag),

                place: record.place,

                id: record.id,

                magType: record.magType

            };

        }).filter(record => {

            return (

                Number.isFinite(record.latitude) &&

                Number.isFinite(record.longitude) &&

                Number.isFinite(record.depth) &&

                Number.isFinite(record.mag)

            );

        });

        loadPoints();

        console.log(
            `Loaded ${rows.length.toLocaleString()} earthquakes`
        );

    } catch (error) {

        console.error("Earthquake data loading error:", error);

        document.getElementById("status").textContent =
            "Earthquake data loading failed";

    }

}

// ======================================================
// RESIZE
// ======================================================

function resize() {

    const element = document.getElementById("scene");

    camera.aspect =
        element.clientWidth / element.clientHeight;

    camera.updateProjectionMatrix();

    renderer.setSize(
        element.clientWidth,
        element.clientHeight
    );

}

window.addEventListener("resize", resize);

resize();

// ======================================================
// FILTERS
// ======================================================

["mag", "depth", "year"].forEach(id => {

    document.getElementById(id).addEventListener(
        "input",
        () => {

            const value =
                document.getElementById(id).value;

            const label =
                document.getElementById(id + "Label");

            if (id === "mag") {

                label.textContent =
                    Number(value).toFixed(1);

            } else if (id === "depth") {

                label.textContent =
                    value + " km";

            } else {

                label.textContent = value;

            }

            loadPoints();

        }
    );

});

// ======================================================
// RESET
// ======================================================

document.getElementById("reset").onclick = () => {

    document.getElementById("mag").value = 3;

    document.getElementById("depth").value = 700;

    document.getElementById("year").value = 1970;

    document.getElementById("magLabel").textContent = "3.0";

    document.getElementById("depthLabel").textContent = "700 km";

    document.getElementById("yearLabel").textContent = "1970";

    camera.position.set(0, 600, 900);

    controls.target.set(0, 0, 0);

    controls.update();

    loadPoints();

};

// ======================================================
// EARTHQUAKE CLICK DETECTION
// ======================================================

const raycaster = new THREE.Raycaster();

raycaster.params.Points.threshold = 8;

const mouse = new THREE.Vector2();

renderer.domElement.addEventListener("click", event => {

    const rect =
        renderer.domElement.getBoundingClientRect();

    mouse.x =
        ((event.clientX - rect.left) / rect.width) * 2 - 1;

    mouse.y =
        -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    if (!points) {
        return;
    }

    const hits = raycaster.intersectObject(points);

    if (hits.length === 0) {
        return;
    }

    const record =
        filtered[hits[0].index];

    document.getElementById("info").innerHTML = `

        <b>${record.place || "Earthquake"}</b>

        <p>
            ${new Date(record.time).toLocaleString()}
            · Magnitude ${record.mag}
            (${record.magType || "unknown"})
            · Depth ${record.depth.toFixed(1)} km
        </p>

        <p>
            Latitude ${record.latitude.toFixed(4)}
            · Longitude ${record.longitude.toFixed(4)}
        </p>

        <p>
            ID: ${record.id}
        </p>

    `;

});

// ======================================================
// ANIMATION
// ======================================================

function animate() {

    requestAnimationFrame(animate);

    controls.update();

    renderer.render(scene, camera);

}

animate();

// ======================================================
// START
// ======================================================

loadJapanMap();

loadEarthquakeData();
