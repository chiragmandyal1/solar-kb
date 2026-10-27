// Stylised (not to scale) solar system laid out in a line along x, Sun at the far left.
export type Body = {
  id: string;
  name: string;
  kind: string;
  dot: string; // colour used in the UI
  x: number;
  r: number; // radius in scene units
  tex: string;
  ring?: boolean;
  tint?: string; // multiplies the texture (e.g. to make the Moon texture read as Ceres)
  tilt: number; // axial tilt in degrees (NASA values; >90 = spins backwards)
  spin: number; // rad/s
  moonsOf?: string; // set on the Moon: it is also a body of its own, next to Earth
};

export const BODIES: Body[] = [
  { id: "sun", name: "Sun", kind: "Star", dot: "#F59A2A", x: -8, r: 6, tex: "sunmap.jpg", tilt: 7.25, spin: 0.02 },
  { id: "mercury", name: "Mercury", kind: "Planet", dot: "#9A968F", x: 4, r: 0.4, tex: "mercurymap.jpg", tilt: 0.03, spin: 0.05 },
  { id: "venus", name: "Venus", kind: "Planet", dot: "#D9A85B", x: 6.2, r: 0.7, tex: "venusmap.jpg", tilt: 177.4, spin: 0.03 },
  { id: "earth", name: "Earth", kind: "Planet", dot: "#2F7FD1", x: 8.6, r: 0.75, tex: "earthmap1k.jpg", tilt: 23.4, spin: 0.2 },
  { id: "moon", name: "Moon", kind: "Earth’s moon", dot: "#A9A9A9", x: 10, r: 0.22, tex: "moonmap1k.jpg", tilt: 6.7, spin: 0.04 },
  { id: "mars", name: "Mars", kind: "Planet", dot: "#C8532B", x: 12, r: 0.5, tex: "marsmap1k.jpg", tilt: 25.2, spin: 0.19 },
  { id: "ceres", name: "Ceres", kind: "Dwarf planet · asteroid belt", dot: "#7D7873", x: 14, r: 0.25, tex: "moonmap1k.jpg", tint: "#a89c8e", tilt: 4, spin: 0.1 },
  { id: "jupiter", name: "Jupiter", kind: "Planet", dot: "#C99A6B", x: 18.5, r: 2.4, tex: "jupitermap.jpg", tilt: 3.1, spin: 0.4 },
  { id: "saturn", name: "Saturn", kind: "Planet", dot: "#D8B878", x: 25, r: 2, tex: "saturnmap.jpg", ring: true, tilt: 26.7, spin: 0.35 },
  { id: "uranus", name: "Uranus", kind: "Planet", dot: "#7FD3DE", x: 30.5, r: 1.1, tex: "uranusmap.jpg", tilt: 97.8, spin: 0.25 },
  { id: "neptune", name: "Neptune", kind: "Planet", dot: "#3E62D6", x: 34, r: 1.05, tex: "neptunemap.jpg", tilt: 28.3, spin: 0.25 },
  { id: "pluto", name: "Pluto", kind: "Dwarf planet", dot: "#B08A72", x: 37, r: 0.3, tex: "plutomap1k.jpg", tilt: 122.5, spin: 0.05 },
];

export const byId = Object.fromEntries(BODIES.map((b) => [b.id, b]));

export const clean = (title: string) => title.replace(/\s+[-–]\s+NASA( Science)?$/i, "").replace(/^NASA:\s*/, "");

export const STARTERS = [
  { q: "Does Titan have liquid on its surface?", tag: "Saturn · Titan" },
  { q: "What did New Horizons find on Pluto this year?", tag: "Pluto" },
  { q: "Which missions are exploring Mars?", tag: "Mars" },
  { q: "How hot is Venus?", tag: "Venus" },
];
