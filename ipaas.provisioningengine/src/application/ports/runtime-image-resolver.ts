export interface RuntimeImageResolver {
  resolve(sourceConnector: string, destinationConnector: string): string;
}
