import { getBatch } from './batch'

// encapsulates the subscription logic for connecting a component to the redux store, as
// well as nesting subscriptions of descendant components, so that we can ensure the
// ancestor components re-render before descendants

type VoidFunc = () => void

type Listener = {
  callback: VoidFunc
  next: Listener | null
  prev: Listener | null
}
/** 创建一个listener的相关方法 */
function createListenerCollection() {
  const batch = getBatch()
  // 用链表的形式组成listeners
  let first: Listener | null = null
  let last: Listener | null = null

  return {
    // 清空listeners
    clear() {
      first = null
      last = null
    },
    /** 通知所有listener */
    notify() {
      batch(() => {
        let listener = first
        while (listener) {
          listener.callback()
          listener = listener.next
        }
      })
    },
    // 获取所有listeners，是数组的形式
    get() {
      let listeners = []
      let listener = first
      while (listener) {
        listeners.push(listener)
        listener = listener.next
      }
      return listeners
    },
    // 添加订阅，会返回一个取消订阅的方法
    subscribe(callback: () => void) {
      let isSubscribed = true
      // 创建一个listener，然后移动last
      let listener: Listener = (last = {
        callback,
        next: null,
        prev: last,
      })

      if (listener.prev) {
        // 有pre的话，意味着上面一开始的last有值，那么拼接到后面
        listener.prev.next = listener
      } else {
        // 否则指向第一个
        first = listener
      }
      // 返回取消订阅
      return function unsubscribe() {
        // 该listener已经取消订阅了，或者listener为空，那么直接return
        if (!isSubscribed || first === null) return
        // 标志已经取消了订阅
        isSubscribed = false
        // 如果该listener有后缀，那么其后缀的pre之前前缀
        if (listener.next) {
          listener.next.prev = listener.prev
        } else {
          //没有后缀，意味着是最后一个，那么last移动到前缀
          last = listener.prev
        }
        if (listener.prev) {
          // 如果listener有前缀，那么前缀的next之前该listener的后缀
          listener.prev.next = listener.next
        } else {
          // 没有前缀，意味着是第一个，那么指向后面
          first = listener.next
        }
      }
    },
  }
}

type ListenerCollection = ReturnType<typeof createListenerCollection>

export interface Subscription {
  addNestedSub: (listener: VoidFunc) => VoidFunc
  notifyNestedSubs: VoidFunc
  handleChangeWrapper: VoidFunc
  isSubscribed: () => boolean
  onStateChange?: VoidFunc | null
  trySubscribe: VoidFunc
  tryUnsubscribe: VoidFunc
  getListeners: () => ListenerCollection
}

const nullListeners = {
  notify() {},
  get: () => [],
} as unknown as ListenerCollection
/**
 * @description 创建订阅
 * @param store 
 * @param parentSub 有值的话parentSub会将handleChangeWrapper放入listeners中
 */
export function createSubscription(store: any, parentSub?: Subscription) {
  let unsubscribe: VoidFunc | undefined
  let listeners: ListenerCollection = nullListeners

  function addNestedSub(listener: () => void) {
    trySubscribe()
    return listeners.subscribe(listener)
  }

  function notifyNestedSubs() {
    listeners.notify()
  }

  function handleChangeWrapper() {
    subscription.onStateChange?.()
  }

  function isSubscribed() {
    return Boolean(unsubscribe)
  }

  function trySubscribe() {
    if (!unsubscribe) {
      // 对于Provider，没有parentSub，那么会调用store.subscribe,其他的有parentSub。
      // 每次dispatch后store会执行每个listener，
      // 对于Provider，onStateChange为notifyNestedSubs，即调用它们子组件的onStateChange，
      // 保证当store的state变化后组件是从最外层一层接着一层更新
      unsubscribe = parentSub
        ? parentSub.addNestedSub(handleChangeWrapper)
        : store.subscribe(handleChangeWrapper)

      listeners = createListenerCollection()
    }
  }

  function tryUnsubscribe() {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = undefined
      listeners.clear()
      listeners = nullListeners
    }
  }

  const subscription: Subscription = {
    addNestedSub,
    notifyNestedSubs,
    handleChangeWrapper,
    isSubscribed,
    trySubscribe,
    tryUnsubscribe,
    getListeners: () => listeners,
  }

  return subscription
}
