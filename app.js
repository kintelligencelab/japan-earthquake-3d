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

        status.textContent = "Loading Japan map...";

        const url =
            "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson";

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error("Failed to download geographical data");
        }

        const geoData = await response.json();

        const japan = geoData.features.find(feature => {

            const properties = feature.properties || {};

            return (
                properties.ADMIN === "Japan" ||
                properties.name === "Japan" ||
                properties.NAME === "Japan"
            );

        });

        if (!japan) {
            throw new Error("Japan was not found in GeoJSON");
        }

        const mapMaterial = new THREE.MeshBasicMaterial({
            color: 0x263b4d,
            side: THREE.DoubleSide
        });

        const coastlineMaterial = new THREE.LineBasicMaterial({
            color: 0x6d8ba5
        });

        function convertCoordinate(coord) {

            const x = (coord[0] - MAP_CENTER_LON) * MAP_SCALE;

            const z = -(coord[1] - MAP_CENTER_LAT) * MAP_SCALE;

            return new THREE.Vector3(x, -5, z);
        }

        function createPolygon(polygonCoordinates) {

            const outerRing = polygonCoordinates[0];

            if (!outerRing || outerRing.length < 3) {
                return;
            }

            const shape = new THREE.Shape();

            outerRing.forEach((coord, index) => {

                const x = (coord[0] - MAP_CENTER_LON) * MAP_SCALE;

                const y = (coord[1] - MAP_CENTER_LAT) * MAP_SCALE;

                if (index === 0) {
                    shape.moveTo(x, y);
                } else {
                    shape.lineTo(x, y);
                }

            });

            shape.closePath();

            // Handle islands and polygon holes
            for (let ringIndex = 1; ringIndex < polygonCoordinates.length; ringIndex++) {

                const ring = polygonCoordinates[ringIndex];

                const hole = new THREE.Path();

                ring.forEach((coord, index) => {

                    const x = (coord[0] - MAP_CENTER_LON) * MAP_SCALE;

                    const y = (coord[1] - MAP_CENTER_LAT) * MAP_SCALE;

                    if (index === 0) {
                        hole.moveTo(x, y);
                    } else {
                        hole.lineTo(x, y);
                    }

                });

                hole.closePath();

                shape.holes.push(hole);

            }

            // Map fill temporarily disabled

        }

        const japanGeometry = japan.geometry;

        if (japanGeometry.type === "Polygon") {

            createPolygon(japanGeometry.coordinates);

        } else if (japanGeometry.type === "MultiPolygon") {

            japanGeometry.coordinates.forEach(polygon => {
                createPolygon(polygon);
            });

        }

        console.log("Japan geographical map loaded successfully");

        status.textContent = "Loading earthquake data...";

    } catch (error) {

        console.error("Japan map loading error:", error);

        status.textContent = "Map loading failed";

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
