import type { Provider } from "../../../domain/enums/platform-values.js";
export interface RuntimeImageResolver {
  resolve(source: Provider, target: Provider): string;
}
