import { useState, useEffect, useLayoutEffect, useDebugValue, startTransition, } from 'react';
import { is } from './util';
import { Subscribe, Instance } from './type'
// Intentionally not using named imports because Rollup uses dynamic
// dispatch for CommonJS interop named imports.


// Disclaimer: This shim breaks many of the rules of React, and only works
// because of a very particular set of implementation details and assumptions
// -- change any one of them and it will break. The most important assumption
// is that updates are always synchronous, because concurrent rendering is
// only available in versions of React that also have a built-in
// useSyncExternalStore API. And we only use this shim when the built-in API
// does not exist.
//
// Do not assume that the clever hacks used by this hook also work in general.
// The point of this shim is to replace the need for hacks by other libraries.
// 这个打破了很多react的规则，只有在一组特定的实现细节和假设条件下才能起作用——改变其中任何一个细节和假设条件，它就会不起作用。
// 最重要的假设是更新总是同步的，因为concurrent的渲染是只在有内置useSyncExternalStore的react版本中才起作用
// 不要以为这个hook使用的奇淫巧技也适用于一般情况，
// 这个shim(垫片)的意义在于取代其他库对hack的需求

/**
 * @description 总的作用就是检查快照是否改变，改变的话就触发强制更新
 * 
 * @param subscribe 订阅函数
 * @param getSnapshot 获取快照的方法
 * @param getServerSnapshot 获取服务端快照的方法，目前没用
 * @returns 
 */
export function useSyncExternalStore<Snapshot>(
  subscribe: Subscribe,
  getSnapshot: () => Snapshot,
  // Note: The client shim does not use getServerSnapshot, because pre-18
  // versions of React do not expose a way to check if we're hydrating. So
  // users of the shim will need to track that themselves and return the
  // correct value from `getSnapshot`.
  getServerSnapshot?: () => Snapshot,
): Snapshot {


  // Read the current snapshot from the store on every render. Again, this
  // breaks the rules of React, and only works here because of specific
  // implementation details, most importantly that updates are
  // always synchronous.
  /**
   * 每次渲染时从store中读取当前快照。这打破了React的规则，特定的实现细节只在这里work，
   * 最重要的是更新总是同步的
   */
  const value = getSnapshot();
  // Because updates are synchronous, we don't queue them. Instead we force a
  // re-render whenever the subscribed state changes by updating an some
  // arbitrary useState hook. Then, during render, we call getSnapshot to read
  // the current value.
  //
  // Because we don't actually use the state returned by the useState hook, we
  // can save a bit of memory by storing other stuff in that slot.
  //
  // To implement the early bailout, we need to track some things on a mutable
  // object. Usually, we would put that in a useRef hook, but we can stash it in
  // our useState hook instead.
  //
  // To force a re-render, we call forceUpdate({inst}). That works because the
  // new object always fails an equality check.
  // 因为更新是同步的，
  const [{ inst }, forceUpdate] = useState<{ inst: Instance<Snapshot> }>({ inst: { value, getSnapshot } });

  // Track the latest getSnapshot function with a ref. This needs to be updated
  // in the layout phase so we can access it during the tearing check that
  // happens on subscribe.
  // 页面更新前同步最新的value和getSnapshot
  useLayoutEffect(() => {
    inst.value = value;
    inst.getSnapshot = getSnapshot;
    
    // Whenever getSnapshot or subscribe changes, we need to check in the
    // commit phase if there was an interleaved mutation. In concurrent mode
    // this can happen all the time, but even in synchronous mode, an earlier
    // effect may have mutated the store.
    /**
     * 无论getSnapshot或subscribe改变，都要检查commit阶段是否有交叉的mutation(突变)，
     * 在concurrent模式下，这种情况可能一直会发生，不过即使在同步模式也可能会，即一个早一点的effect也
     * 可能会对store有突变
     */
    if (checkIfSnapshotChanged(inst)) {
      // 快照改变则强制更新
      // Force a re-render.
      forceUpdate({ inst });
    }
  }, [subscribe, value, getSnapshot]);
  // 异步调度后也检查下快照是否改变
  useEffect(() => {
    // Check for changes right before subscribing. Subsequent changes will be
    // detected in the subscription handler.
    // 在订阅之前检查更改，随后的change会在handleStoreChange检测
    if (checkIfSnapshotChanged(inst)) {
      // Force a re-render.
      forceUpdate({ inst });
    }
    const handleStoreChange = () => {
      // TODO: Because there is no cross-renderer API for batching updates, it's
      // up to the consumer of this library to wrap their subscription event
      // with unstable_batchedUpdates. Should we try to detect when this isn't
      // the case and print a warning in development?

      // The store changed. Check if the snapshot changed since the last time we
      // read from the store.
      // store变化后的回调，那么检查快照是否变了，是的话强制更新
      if (checkIfSnapshotChanged(inst)) {
        // Force a re-render.
        forceUpdate({ inst });
      }
    };
    // Subscribe to the store and return a clean-up function.
    return subscribe(handleStoreChange);
  }, [subscribe]);

  useDebugValue(value);
  return value;
}
/**
 * @description 检查快照是否改变了
 */
function checkIfSnapshotChanged<Snapshot>(inst: Instance<Snapshot>) {
  const latestGetSnapshot = inst.getSnapshot;
  const prevValue = inst.value;
  try {
    const nextValue = latestGetSnapshot();
    return !is(prevValue, nextValue);
  } catch (error) {
    return true;
  }
}
