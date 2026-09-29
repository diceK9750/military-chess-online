/** Movement-based tap recognition; a drag or any multi-touch gesture cannot select. */
export class TapGesture {
  private pointers = new Map<number, { x: number; y: number }>();
  private cancelled = false;
  down(id: number, x: number, y: number) {
    if (!this.pointers.size) this.cancelled = false;
    this.pointers.set(id, { x, y });
    if (this.pointers.size > 1) this.cancelled = true;
  }
  move(id: number, x: number, y: number) {
    const start = this.pointers.get(id);
    if (start && Math.hypot(x - start.x, y - start.y) > 6) this.cancelled = true;
  }
  up(id: number, x: number, y: number): boolean {
    this.move(id, x, y);
    const tap = this.pointers.has(id) && this.pointers.size === 1 && !this.cancelled;
    this.pointers.delete(id); return tap;
  }
  cancel(id: number) { this.cancelled = true; this.pointers.delete(id); }
}
