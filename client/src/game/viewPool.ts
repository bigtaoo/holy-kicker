// Display objects a view hides and hands out again instead of destroying: beads, cymbals,
// lingering fields, lotus seeds, palms and bursts come and go every few seconds all run long,
// and a new Sprite or Graphics for each is garbage the collector must sweep up mid-fight (a
// hitch on a phone). A pool only grows to the most a view ever showed at once; its objects
// stay children of the view's layer and go with it when the run ends. Pure: the caller hands
// in how to make one and where it goes.

interface Shown {
  visible: boolean;
}

export class ViewPool<T extends Shown> {
  private readonly free: T[] = [];
  /** Objects made so far, shown or waiting (for tests and leak checks). */
  made = 0;

  constructor(
    private readonly make: () => T,
    private readonly place: (view: T) => void,
  ) {}

  /** A shown object: a waiting one if there is one, as it was left; else a new one, placed. */
  take(): T {
    let view = this.free.pop();
    if (!view) {
      view = this.make();
      this.made++;
      this.place(view);
    }
    view.visible = true;
    return view;
  }

  /** Hides `view` until the next take. */
  give(view: T): void {
    view.visible = false;
    this.free.push(view);
  }
}
