// import-in-the-middle ships `register-hooks.d.ts` next to `register-hooks.mjs` but has no
// `exports` map, so NodeNext resolution looks for `.d.mts` and misses it. Mirror the API here.
declare module 'import-in-the-middle/register-hooks.mjs' {
  export interface RegisterHooksOptions {
    include?: Array<string | RegExp>;
    exclude?: Array<string | RegExp>;
    disableCjsSourceStripping?: boolean;
  }
  export function register(options?: RegisterHooksOptions): void;
  export function supportsSyncHooks(): boolean;
}
