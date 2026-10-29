import { V1 } from './v1';
import { V2 } from './v2';
import { V3 } from './v3';
import { V4 } from './v4';
import { V5 } from './v5';
import { V6 } from './v6';
import { V7 } from './v7';
import { V8 } from './v8';

// The save corpus (README.md): one stored save per SAVE_VERSION, keyed by version.
export const SAVES: Readonly<Record<number, Readonly<Record<string, unknown>>>> = { 1: V1, 2: V2, 3: V3, 4: V4, 5: V5, 6: V6, 7: V7, 8: V8 };
