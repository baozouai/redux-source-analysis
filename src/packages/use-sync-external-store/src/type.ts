export type Instance<Snapshot> = {value: Snapshot; getSnapshot():Snapshot}
export type InstanceExtra<Selection> = {hasValue: boolean; value:Selection | null}

export type Subscribe = (onStoreChange: () => void) => () => void