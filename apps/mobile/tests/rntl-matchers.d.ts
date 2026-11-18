// Types for the React Native Testing Library matchers registered in tests/setup.ts.
import type { JestNativeMatchers } from "@testing-library/react-native/dist/matchers/types";

declare module "vitest" {
  // oxlint-disable-next-line typescript/no-empty-object-type, typescript/no-explicit-any -- augments Vitest's own interface
  interface Matchers<T = any> extends JestNativeMatchers<T> {}
}
