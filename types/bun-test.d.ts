/** Minimal Bun test runner types for IDE type-checking (runtime uses Bun). */

type BunMatchers<T = unknown> = {
  toBe(expected: T): void;
  toEqual(expected: unknown): void;
  toBeNull(): void;
  toBeUndefined(): void;
  toBeDefined(): void;
  toBeTrue(): void;
  toBeFalse(): void;
  toHaveLength(length: number): void;
  toBeCloseTo(expected: number, precision?: number): void;
  toBeGreaterThan(expected: number): void;
  toBeGreaterThanOrEqual(expected: number): void;
  toContain(expected: string): void;
  not: BunMatchers<T>;
};

declare module "bun:test" {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export function expect<T>(value: T): BunMatchers<T>;
}

interface ImportMeta {
  readonly dir: string;
}
