// The world's draw order, sorted in place. The world is y-sorted and some mob crosses a
// neighbour almost every frame, so Pixi sorts its children every frame with Array.sort, which
// copies the array each time (a steady stream of garbage with a thousand figures). From one
// frame to the next the order barely changes, so an insertion sort does the same job in about
// one pass, allocates nothing, and keeps equal zIndex in their order as Array.sort does.

interface Sortable {
  children: { zIndex: number }[];
  sortableChildren: boolean;
  sortDirty: boolean;
  sortChildren(): void;
}

/** Sorts `a` by zIndex in place, stably; fast when it is nearly sorted already. Each zIndex
 *  read boxes a fractional number, so the sorted run's last key is carried along, not read again. */
export function sortByZ(a: { zIndex: number }[]): void {
  if (a.length < 2) return;
  // the largest key so far: an item inserted before the end leaves it where it was
  let last = a[0].zIndex;
  for (let i = 1; i < a.length; i++) {
    const item = a[i];
    const z = item.zIndex;
    if (last <= z) {
      last = z;
      continue;
    }
    let j = i - 1;
    do {
      a[j + 1] = a[j];
      j--;
    } while (j >= 0 && a[j].zIndex > z);
    a[j + 1] = item;
  }
}

/** Makes `c` keep its children sorted by zIndex with sortByZ instead of Pixi's own sort. */
export function sortSteadily(c: Sortable): void {
  c.sortableChildren = true;
  c.sortChildren = function (this: Sortable) {
    if (!this.sortDirty) return;
    this.sortDirty = false;
    sortByZ(this.children);
  };
}
