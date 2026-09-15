/** Transport-neutral operations. Updates replace editable fields; reads are detached snapshots. */
export interface CrudRepository<Model, Create, Update, Filter> {
  list(filter?: Filter): Promise<readonly Model[]>;
  get(id: string): Promise<Model | null>;
  create(input: Create): Promise<Model>;
  update(id: string, input: Update): Promise<Model>;
  delete(id: string): Promise<void>;
}
