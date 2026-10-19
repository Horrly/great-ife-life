// Moving things along roads: paths, offsets (walk on the verge, drive on the right) and routes.

export function buildGraph(map) {
  const g = {};
  for (const n of Object.keys(map.nodes)) g[n] = [];
  for (const [a, b] of map.edges) {
    const [x1, z1] = map.nodes[a];
    const [x2, z2] = map.nodes[b];
    const d = Math.hypot(x2 - x1, z2 - z1);
    g[a].push([b, d]);
    g[b].push([a, d]);
  }
  return g;
}

export function route(graph, a, b) {
  const dist = { [a]: 0 };
  const prev = {};
  const todo = new Set(Object.keys(graph));
  while (todo.size) {
    let u = null;
    for (const n of todo) if (dist[n] !== undefined && (u === null || dist[n] < dist[u])) u = n;
    if (u === null || u === b) break;
    todo.delete(u);
    for (const [v, w] of graph[u]) {
      const nd = dist[u] + w;
      if (dist[v] === undefined || nd < dist[v]) {
        dist[v] = nd;
        prev[v] = u;
      }
    }
  }
  const path = [b];
  while (path[path.length - 1] !== a && prev[path[path.length - 1]]) path.push(prev[path[path.length - 1]]);
  return path.reverse();
}

/** Follows a polyline at a speed. offset > 0 keeps to the right of the direction of travel. */
export class Mover {
  constructor(points, { speed = 5, offset = 0, loop = false } = {}) {
    this.setPath(points);
    this.speed = speed;
    this.offset = offset;
    this.loop = loop;
    this.pause = 0;
  }

  setPath(points) {
    this.points = points;
    this.lengths = [0];
    for (let i = 1; i < points.length; i++) {
      const [x1, z1] = points[i - 1];
      const [x2, z2] = points[i];
      this.lengths.push(this.lengths[i - 1] + Math.hypot(x2 - x1, z2 - z1));
    }
    this.total = this.lengths[this.lengths.length - 1];
    this.s = 0;
    this.done = this.total === 0;
  }

  /** Position and heading at distance s along the path. */
  at(s) {
    const pts = this.points;
    if (pts.length === 1 || this.total === 0) return { x: pts[0][0], z: pts[0][1], heading: 0, seg: 0 };
    s = Math.max(0, Math.min(this.total, s));
    let i = 1;
    while (i < this.lengths.length - 1 && this.lengths[i] < s) i++;
    const [x1, z1] = pts[i - 1];
    const [x2, z2] = pts[i];
    const segLen = this.lengths[i] - this.lengths[i - 1] || 1;
    const t = (s - this.lengths[i - 1]) / segLen;
    const dx = (x2 - x1) / segLen;
    const dz = (z2 - z1) / segLen;
    // right-hand side of travel direction (three.js: +x right when facing +z means right = (-dz, dx))
    const rx = -dz;
    const rz = dx;
    return { x: x1 + (x2 - x1) * t + rx * this.offset, z: z1 + (z2 - z1) * t + rz * this.offset, heading: Math.atan2(dx, dz), seg: i };
  }

  update(dt) {
    if (this.pause > 0) {
      this.pause -= dt;
      return this.at(this.s);
    }
    this.s += this.speed * dt;
    if (this.s >= this.total) {
      if (this.loop) this.s -= this.total;
      else {
        this.s = this.total;
        this.done = true;
      }
    }
    return this.at(this.s);
  }
}

export function pointsFor(map, nodes) {
  return nodes.map((n) => map.nodes[n]);
}
