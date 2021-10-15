import { useRef, useEffect, useMemo, useDebugValue } from 'react';
import { is } from './util';
import { useSyncExternalStore } from './useSyncExternalStoreClient';
import { Subscribe, InstanceExtra } from './type'
// Intentionally not using named imports because Rollup uses dynamic
// dispatch for CommonJS interop named imports.


// Same as useSyncExternalStore, but supports selector and isEqual arguments.
export function useSyncExternalStoreExtra<Snapshot, Selection>(
  subscribe: Subscribe,
  getSnapshot: () => Snapshot,
  getServerSnapshot: undefined | null | (() => Snapshot),
  selector: (snapshot: Snapshot) => Selection,
  isEqual?: (a: Selection, b: Selection) => boolean,
): Selection {
  // Use this to track the rendered snapshot.
  const instRef = useRef<InstanceExtra<Selection>>(null);
  let inst: InstanceExtra<Selection>;
  if (instRef.current === null) {
    inst = {
      hasValue: false,
      value: null,
    };
    instRef.current = inst;
  } else {
    inst = instRef.current;
  }

  const [getSelection, getServerSelection] = useMemo(() => {
    // Track the memoized state using closure variables that are local to this
    // memoized instance of a getSnapshot function. Intentionally not using a
    // useRef hook, because that state would be shared across all concurrent
    // copies of the hook/component.
    let hasMemo = false;
    let memoizedSnapshot;
    let memoizedSelection;
    /**
     * 
     * @param nextSnapshot store的即时数据
     * @returns nextSelection 从store中选择的数据
     */
    const memoizedSelector = nextSnapshot => {
      // snapShot是store中的左右数据，selection是从store中挑选的数据
      if (!hasMemo) {
        // 第一次调用memoizedSelector的时候
        // The first time the hook is called, there is no memoized result.
        hasMemo = true;
        memoizedSnapshot = nextSnapshot;
        const nextSelection = selector(nextSnapshot);
        if (isEqual !== undefined) {
          // Even if the selector has changed, the currently rendered selection
          // may be equal to the new selection. We should attempt to reuse the
          // current value if possible, to preserve downstream memoizations.
          if (inst.hasValue) {
            const currentSelection = inst.value;
            if (isEqual(currentSelection, nextSelection)) {
              memoizedSelection = currentSelection;
              return currentSelection;
            }
          }
        }
        memoizedSelection = nextSelection;
        return nextSelection;
      }
      // 第二次及之后调用该memoizedSelector的时候
      // We may be able to reuse the previous invocation's result.
      const prevSnapshot: Snapshot = memoizedSnapshot;
      const prevSelection: Selection = memoizedSelection;
      /** 
       * 下面两处的目的
       * 
       * @example
       * if (is(prevSnapshot, nextSnapshot)) {
       *  return prevSelection;
       * }
       * 
       * //和
       * 
       * if (isEqual?.(prevSelection, nextSelection)) {
       *  return prevSelection;
       * }
       * 
       * //都是为了useSyncExternalStore中的checkIfSnapshotChanged：
       * 
       * if (checkIfSnapshotChanged(inst)) {
       *  forceUpdate({ inst });
       * }
       * 
       * // checkIfSnapshotChanged会用is判断前后数据的引用是否相等，相等则checkIfSnapshotChanged(inst)为false,
       * // 那么就不会执行forceUpdate({ inst });就不会forceRender
       */
      if (is(prevSnapshot, nextSnapshot)) {
        // 如果和上次的数据一样，那么返回缓存就好，优化性能
        // The snapshot is the same as last time. Reuse the previous selection.
        return prevSelection;
      }
      // 到了这里store中的数据已经发生改变
      // The snapshot has changed, so we need to compute a new selection.
      const nextSelection = selector(nextSnapshot);

      // If a custom isEqual function is provided, use that to check if the data
      // has changed. If it hasn't, return the previous selection. That signals
      // to React that the selections are conceptually equal, and we can bail
      // out of rendering.
      /**
       * 虽然说store中的数据确实变化了，如果有传入自定义isEqual函数，那么这里判断下，
       * 满足的话还是返回上次从store中选择的数据，优化性能
       * 比如store中的数据是{a: 1, b: 1}，selection的数据是{a: 1},dispatch改变了b => 2,
       * 那么store中的数据就是{a: 1, b: 2},客商selection并没有选择b，如果我们传了isEqual，
       * 那么满足条件的情况下就能优化性能了
       */
      if (isEqual?.(prevSelection, nextSelection)) {
        return prevSelection;
      }
      // 到了这里就是store中的数据改变了，选择的数据也改变了，那么必须得返回新的selection引用，
      // 同时备份next的数据到memorized上，以便下次比较
      memoizedSnapshot = nextSnapshot;
      memoizedSelection = nextSelection;
      return nextSelection;
    };
    // Assigning this to a constant so that Flow knows it can't change.
    const maybeGetServerSnapshot =
      getServerSnapshot === undefined ? null : getServerSnapshot;
    const getSnapshotWithSelector = () => memoizedSelector(getSnapshot());
    const getServerSnapshotWithSelector =
      maybeGetServerSnapshot === null
        ? undefined
        : () => memoizedSelector(maybeGetServerSnapshot());
    return [getSnapshotWithSelector, getServerSnapshotWithSelector];
  }, [getSnapshot, getServerSnapshot, selector, isEqual]);

  const value = useSyncExternalStore(
    subscribe,
    getSelection,
    getServerSelection,
  );

  useEffect(() => {
    inst.hasValue = true;
    inst.value = value;
  }, [value]);

  useDebugValue(value);
  return value;
}
