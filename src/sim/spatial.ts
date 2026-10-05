/**
 * Uniform spatial hash grid. Answers "what is near this point?" without
 * checking every object in the world, which keeps hundreds of creatures fast.
 */
export class Grid<T extends { x: number; y: number }> {
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;
  readonly minX: number;
  readonly minY: number;
  readonly cells: T[][];

  constructor(minX: number, minY: number, width: number, height: number, cellSize: number) {
    this.cellSize = cellSize;
    this.minX = minX;
    this.minY = minY;
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
  }

  clear(): void {
    for (const c of this.cells) c.length = 0;
  }

  private cellIndex(x: number, y: number): number {
    let cx = Math.floor((x - this.minX) / this.cellSize);
    let cy = Math.floor((y - this.minY) / this.cellSize);
    if (cx < 0) cx = 0;
    else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0;
    else if (cy >= this.rows) cy = this.rows - 1;
    return cy * this.cols + cx;
  }

  insert(item: T): void {
    this.cells[this.cellIndex(item.x, item.y)].push(item);
  }

  remove(item: T): boolean {
    const cell = this.cells[this.cellIndex(item.x, item.y)];
    const i = cell.indexOf(item);
    if (i < 0) return false;
    cell[i] = cell[cell.length - 1];
    cell.pop();
    return true;
  }

  /** Collects every item in cells overlapping the circle (no exact distance test). */
  query(x: number, y: number, r: number, out: T[]): T[] {
    out.length = 0;
    const cs = this.cellSize;
    let c0 = Math.floor((x - r - this.minX) / cs);
    let c1 = Math.floor((x + r - this.minX) / cs);
    let r0 = Math.floor((y - r - this.minY) / cs);
    let r1 = Math.floor((y + r - this.minY) / cs);
    if (c0 < 0) c0 = 0;
    if (r0 < 0) r0 = 0;
    if (c1 >= this.cols) c1 = this.cols - 1;
    if (r1 >= this.rows) r1 = this.rows - 1;
    for (let cy = r0; cy <= r1; cy++) {
      const base = cy * this.cols;
      for (let cx = c0; cx <= c1; cx++) {
        const cell = this.cells[base + cx];
        for (let k = 0; k < cell.length; k++) out.push(cell[k]);
      }
    }
    return out;
  }
}
