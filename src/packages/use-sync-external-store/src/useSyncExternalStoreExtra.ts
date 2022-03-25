import { useRef, useEffect, useMemo, useDebugValue } from 'react';
import { is } from './util';
import { useSyncExternalStore } from './useSyncExternalStoreClient';
import { Subscribe, InstanceExtra } from './type'
// Intentionally not using named imports because Rollup uses dynamic
// dispatch for CommonJS interop named imports.


// Same as useSyncExternalStore, but supports selector and isEqual arguments.
/**
 * @description 和useSyncExternalStore类似，但多了支持selector和isEqual参数
 * @param subscribe 订阅
 * @param getSnapshot 获取快照，用于client
 * @param getServerSnapshot 获取服务端快照
 * @param selector 选择器，从state中挑选需要的state
 * @param isEqual 是否相等
 * @returns 返回selector的state
 */
export function useSyncExternalStoreExtra<Snapshot, Selection>(
  subscribe: Subscribe,
  getSnapshot: () => Snapshot,
  getServerSnapshot: undefined | null | (() => Snapshot),
  selector: (snapshot: Snapshot) => Selection,
  isEqual?: (a: Selection, b: Selection) => boolean,
): Selection {
  // Use this to track the rendered snapshot.
  const instRef = useRef<InstanceExtra<Selection>>(null);
  let inst: InstanceExtra<Selection>
  /** 
   * 下面的区分情况是为了避免：
   * Warning: App: Unsafe read of a mutable value during render.
   * 
   * Reading from a ref during render is only safe if:
   * 1. The ref value has not been updated, or
   * 2. The ref holds a lazily-initialized value that is only set once.
   */
  if (instRef.current === null) {
    // 初始值
    inst = {
      hasValue: false,
      value: null,
    };
    instRef.current = inst;
  } else {
    // update的值
    inst = instRef.current;
  }

  const [getSelection, getServerSelection] = useMemo(() => {
    // Track the memoized state using closure variables that are local to this
    // memoized instance of a getSnapshot function. Intentionally not using a
    // useRef hook, because that state would be shared across all concurrent
    // copies of the hook/component.
    // 使用 getSnapshot 函数的这个 memoized 实例的本地闭包变量来跟踪 memoized 状态。
    // 故意不使用 useRef 挂钩，因为该状态会在 concurrent 模式下的所有 hook/component 中共享
    let hasMemo = false;
    let memoizedSnapshot;
    let memoizedSelection;
    /**
     * 
     * @param nextSnapshot store的即时数据
     * @returns nextSelection 从store中选择的数据
     */
    const memoizedSelector = nextSnapshot => {
      // snapShot是store中的所有即时数据，selection是从store中挑选的数据
      if (!hasMemo) {
        // 第一次调用memoizedSelector的时候，这个时候还没memoized
        // The first time the hook is called, there is no memoized result.
        hasMemo = true;
        // 做下缓存
        memoizedSnapshot = nextSnapshot;
        // 根据选择器中store中拿到要挑选的数据
        const nextSelection = selector(nextSnapshot);
        if (isEqual !== undefined) {
          // Even if the selector has changed, the currently rendered selection
          // may be equal to the new selection. We should attempt to reuse the
          // current value if possible, to preserve downstream memoizations.
          // 即使selector改变了，新旧的selection可能相等，可以的话，尝试复用旧的数据，保持单向数据流数据地址不变
          if (inst.hasValue) {
            const currentSelection = inst.value;
            if (isEqual(currentSelection, nextSelection)) {
              // 根据传入的isEqual函数判断新旧数据相等的话，那么复用旧数据就好了，那么prop就不会改变
              memoizedSelection = currentSelection;
              return currentSelection;
            }
          }
        }
        // 没有isEqual，或者新旧数据判断不相等，那么赋值新数据并返回
        memoizedSelection = nextSelection;
        return nextSelection;
      }
      // 第二次及之后调用该memoizedSelector的时候，保存memo的值，即上次的
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
      // 到了这里store中的数据已经发生改变，那么就要计算新的selection了
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
       * 那么store中的数据就是{a: 1, b: 2},可是selection并没有选择b，如果我们传了isEqual，
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
  // 返回selection
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
