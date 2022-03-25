/* eslint-disable valid-jsdoc, @typescript-eslint/no-unused-vars */
import hoistStatics from 'hoist-non-react-statics'
import React, { useContext, useMemo, useRef } from 'react'
import { isValidElementType, isContextConsumer } from 'react-is'
import { useSyncExternalStore } from 'use-sync-external-store'

import type { Store, Dispatch } from 'redux'

import type {
  AdvancedComponentDecorator,
  ConnectedComponent,
  DefaultRootState,
  InferableComponentEnhancer,
  InferableComponentEnhancerWithProps,
  ResolveThunks,
  DispatchProp,
} from '../types'

import defaultSelectorFactory, {
  MapStateToPropsParam,
  MapDispatchToPropsParam,
  MergeProps,
  MapDispatchToPropsNonObject,
  SelectorFactoryOptions,
} from '../connect/selectorFactory'
import defaultMapDispatchToPropsFactories from '../connect/mapDispatchToProps'
import defaultMapStateToPropsFactories from '../connect/mapStateToProps'
import defaultMergePropsFactories from '../connect/mergeProps'

import { createSubscription, Subscription } from '../utils/Subscription'
import { useIsomorphicLayoutEffect } from '../utils/useIsomorphicLayoutEffect'
import shallowEqual from '../utils/shallowEqual'

import {
  ReactReduxContext,
  ReactReduxContextValue,
  ReactReduxContextInstance,
} from './Context'

// Define some constant arrays just to avoid re-creating these
const EMPTY_ARRAY: [unknown, number] = [null, 0]
const NO_SUBSCRIPTION_ARRAY = [null, null]

// Attempts to stringify whatever not-really-a-component value we were given
// for logging in an error message
const stringifyComponent = (Comp: unknown) => {
  try {
    return JSON.stringify(Comp)
  } catch (err) {
    return String(Comp)
  }
}

type EffectFunc = (...args: any[]) => void | ReturnType<React.EffectCallback>

// This is "just" a `useLayoutEffect`, but with two modifications:
// - we need to fall back to `useEffect` in SSR to avoid annoying warnings
// - we extract this to a separate function to avoid closing over values
//   and causing memory leaks
// 这个实际上就是useLayoutEffect，但在SSR中会替换成useEffect，以避免warning
function useIsomorphicLayoutEffectWithArgs(
  effectFunc: EffectFunc,
  effectArgs: any[],
  dependencies?: React.DependencyList
) {
  useIsomorphicLayoutEffect(() => effectFunc(...effectArgs), dependencies)
}

/** Effect callback, extracted: assign the latest props values to refs for later usage */
function captureWrapperProps(
  lastWrapperProps: React.MutableRefObject<unknown>,
  lastChildProps: React.MutableRefObject<unknown>,
  renderIsScheduled: React.MutableRefObject<boolean>,
  wrapperProps: unknown,
  // actualChildProps: unknown,
  childPropsFromStoreUpdate: React.MutableRefObject<unknown>,
  notifyNestedSubs: () => void
) {
  // We want to capture the wrapper props and child props we used for later comparisons
  lastWrapperProps.current = wrapperProps
  // renderIsScheduled.current为true是在subscribeUpdates中store数据改变触发checkForUpdates设置的，
  // forceRender后执行Effect回调，所以就没有正在调度了
  renderIsScheduled.current = false

  // If the render was from a store update, clear out that reference and cascade the subscriber update
  // 如果更新来着store，那么就必须通知子级subscriber，然后将store更新的标记清空
  // 可以清空是因为调用captureWrapperProps之前使用到childPropsFromStoreUpdate.current的都完成了，那么这里就可以置空了
  if (childPropsFromStoreUpdate.current) {
    childPropsFromStoreUpdate.current = null
    notifyNestedSubs()
  }
}

/**  
 * 这里是订阅store更新
 * Effect callback, extracted: subscribe to the Redux store or nearest connected ancestor,
 * check for updates after dispatched actions, and trigger re-renders. 
 * */
function subscribeUpdates(
  shouldHandleStateChanges: boolean,
  store: Store,
  subscription: Subscription,
  childPropsSelector: (state: unknown, props: unknown) => unknown,
  lastWrapperProps: React.MutableRefObject<unknown>,
  lastChildProps: React.MutableRefObject<unknown>,
  renderIsScheduled: React.MutableRefObject<boolean>,
  isMounted: React.MutableRefObject<boolean>,
  childPropsFromStoreUpdate: React.MutableRefObject<unknown>,
  notifyNestedSubs: () => void,
  // forceComponentUpdateDispatch: React.Dispatch<any>,
  additionalSubscribeListener: () => void
) {
  // 如果没有监听store，那么就不用做什么
  // If we're not subscribed to the store, nothing to do here
  if (!shouldHandleStateChanges) return () => {}
  // 到了这里就有监听store了
  // 捕获用于检查以及组件何时卸载的值
  // Capture values for checking if and when this component unmounts
  let didUnsubscribe = false
  let lastThrownError: Error | null = null

  // We'll run this callback every time a store subscription update propagates to this component
  // 每当store更新传播到该组件时，都会调用这个回调来检查是否需要更新，因为store update后，会通过顶级组件，
  // 每一层update后再通过notifyNestedSubs通知下一层，所以这里用了propagates(传播)
  const checkForUpdates = () => {
    // debugger
    // 如果已经取消订阅了(下面的unsubscribeWrapper会设置didUnsubscribe为true)，或组件还没挂载
    if (didUnsubscribe || !isMounted.current) {
      // 那么不执行过期的listeners
      // Don't run stale listeners.
      // Redux不保证在下一次dispatch之前取消订阅
      // Redux doesn't guarantee unsubscriptions happen until next dispatch.
      return
    }
    // 获取最新的store state
    const latestStoreState = store.getState()

    let newChildProps, error
    try {
      // Actually run the selector with the most recent store state and wrapper props
      // to determine what the child props should be
      newChildProps = childPropsSelector(
        latestStoreState,
        lastWrapperProps.current
      )
    } catch (e) {
      error = e
      lastThrownError = e as Error | null
    }

    if (!error) {
      lastThrownError = null
    }

    // If the child props haven't changed, nothing to do here - cascade the subscription update
    if (newChildProps === lastChildProps.current) {
      /**
       * store的数据确实更新了，可是组件不一定用到更新到的数据，比如store中的数据为{a: 1, b: 2},更新后是{a:2, b: 2},
       * 而某个组件的mapStateToProps=(state) => ({b: state.b})，那么其实该组件无需更新，通知其子Sub组件就好了
       */
      // 如果新旧childProps都没改变且没正在调度，那么notifyNestedSubs
      if (!renderIsScheduled.current) {
        notifyNestedSubs()
      }
    } else {
      // 到了这里新旧childProps确实不相等了，那么保存新的引用，且调用additionalSubscribeListener来forceRender
      // Save references to the new child props.  Note that we track the "child props from store update"
      // as a ref instead of a useState/useReducer because we need a way to determine if that value has
      // been processed.  If this went into useState/useReducer, we couldn't clear out the value without
      // forcing another re-render, which we don't want.
      // 保存newChildProps的引用，这里不用useState或useReducer
      lastChildProps.current = newChildProps
      // checkForUpdates是store变化才执行的回调，所以设置childProps来自store更新的标记
      childPropsFromStoreUpdate.current = newChildProps
      // 因为下面调用additionalSubscribeListener会触发forceRender，那么这里要标记正在调度
      renderIsScheduled.current = true

      // Trigger the React `useSyncExternalStore` subscriber
      /**
       * 这个函数实际上是useSyncExternalStore里的handleStoreChange:
       * @example
       * const handleStoreChange = () => {
       *  // store变化后的回调
       *  if (checkIfSnapshotChanged(inst)) {
       *    // Force a re-render.
       *    forceUpdate({ inst });
       *  }
       *}
       */
      additionalSubscribeListener()
    }
  }

  // Actually subscribe to the nearest connected ancestor (or store)
  subscription.onStateChange = checkForUpdates
  subscription.trySubscribe()

  // Pull data from the store after first render in case the store has
  // changed since we began.
  // 在首次渲染后从store中提取数据，以防开始渲染后store发生更改
  checkForUpdates()

  const unsubscribeWrapper = () => {
    didUnsubscribe = true
    subscription.tryUnsubscribe()
    subscription.onStateChange = null

    if (lastThrownError) {
      // It's possible that we caught an error due to a bad mapState function, but the
      // parent re-rendered without this component and we're about to unmount.
      // This shouldn't happen as long as we do top-down subscriptions correctly, but
      // if we ever do those wrong, this throw will surface the error in our tests.
      // In that case, throw the error from here so it doesn't get lost.
      throw lastThrownError
    }
  }

  return unsubscribeWrapper
}

// Reducer initial state creation for our update reducer
const initStateUpdates = () => EMPTY_ARRAY

export interface ConnectProps {
  reactReduxForwardedRef?: React.ForwardedRef<unknown>
  context?: ReactReduxContextInstance
  store?: Store
}

function match<T>(
  arg: unknown,
  factories: ((value: unknown) => T)[],
  name: string
): T {
  for (let i = factories.length - 1; i >= 0; i--) {
    const result = factories[i](arg)
    if (result) return result
  }

  return ((dispatch: Dispatch, options: { wrappedComponentName: string }) => {
    throw new Error(
      `Invalid value of type ${typeof arg} for ${name} argument when connecting component ${
        options.wrappedComponentName
      }.`
    )
  }) as any
}

function strictEqual(a: unknown, b: unknown) {
  return a === b
}

/**
 * Infers the type of props that a connector will inject into a component.
 */
export type ConnectedProps<TConnector> =
  TConnector extends InferableComponentEnhancerWithProps<
    infer TInjectedProps,
    any
  >
    ? unknown extends TInjectedProps
      ? TConnector extends InferableComponentEnhancer<infer TInjectedProps>
        ? TInjectedProps
        : never
      : TInjectedProps
    : never

export interface ConnectOptions<
  State = DefaultRootState,
  TStateProps = {},
  TOwnProps = {},
  TMergedProps = {}
> {
  forwardRef?: boolean
  context?: typeof ReactReduxContext
  areStatesEqual?: (nextState: State, prevState: State) => boolean

  areOwnPropsEqual?: (
    nextOwnProps: TOwnProps,
    prevOwnProps: TOwnProps
  ) => boolean

  areStatePropsEqual?: (
    nextStateProps: TStateProps,
    prevStateProps: TStateProps
  ) => boolean
  areMergedPropsEqual?: (
    nextMergedProps: TMergedProps,
    prevMergedProps: TMergedProps
  ) => boolean
}

/* @public */
function connect(): InferableComponentEnhancer<DispatchProp>

/* @public */
function connect<
  TStateProps = {},
  no_dispatch = {},
  TOwnProps = {},
  State = DefaultRootState
>(
  mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State>
): InferableComponentEnhancerWithProps<
  TStateProps & DispatchProp,
  TOwnProps & ConnectProps
>

/* @public */
function connect<no_state = {}, TDispatchProps = {}, TOwnProps = {}>(
  mapStateToProps: null | undefined,
  mapDispatchToProps: MapDispatchToPropsNonObject<TDispatchProps, TOwnProps>
): InferableComponentEnhancerWithProps<TDispatchProps, TOwnProps & ConnectProps>

/* @public */
function connect<no_state = {}, TDispatchProps = {}, TOwnProps = {}>(
  mapStateToProps: null | undefined,
  mapDispatchToProps: MapDispatchToPropsParam<TDispatchProps, TOwnProps>
): InferableComponentEnhancerWithProps<
  ResolveThunks<TDispatchProps>,
  TOwnProps & ConnectProps
>

/* @public */
function connect<
  TStateProps = {},
  TDispatchProps = {},
  TOwnProps = {},
  State = DefaultRootState
>(
  mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State>,
  mapDispatchToProps: MapDispatchToPropsNonObject<TDispatchProps, TOwnProps>
): InferableComponentEnhancerWithProps<
  TStateProps & TDispatchProps,
  TOwnProps & ConnectProps
>

/* @public */
function connect<
  TStateProps = {},
  TDispatchProps = {},
  TOwnProps = {},
  State = DefaultRootState
>(
  mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State>,
  mapDispatchToProps: MapDispatchToPropsParam<TDispatchProps, TOwnProps>
): InferableComponentEnhancerWithProps<
  TStateProps & ResolveThunks<TDispatchProps>,
  TOwnProps & ConnectProps
>

/* @public */
function connect<
  no_state = {},
  no_dispatch = {},
  TOwnProps = {},
  TMergedProps = {}
>(
  mapStateToProps: null | undefined,
  mapDispatchToProps: null | undefined,
  mergeProps: MergeProps<undefined, undefined, TOwnProps, TMergedProps>
): InferableComponentEnhancerWithProps<TMergedProps, TOwnProps & ConnectProps>

/* @public */
function connect<
  TStateProps = {},
  no_dispatch = {},
  TOwnProps = {},
  TMergedProps = {},
  State = DefaultRootState
>(
  mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State>,
  mapDispatchToProps: null | undefined,
  mergeProps: MergeProps<TStateProps, undefined, TOwnProps, TMergedProps>
): InferableComponentEnhancerWithProps<TMergedProps, TOwnProps & ConnectProps>

/* @public */
function connect<
  no_state = {},
  TDispatchProps = {},
  TOwnProps = {},
  TMergedProps = {}
>(
  mapStateToProps: null | undefined,
  mapDispatchToProps: MapDispatchToPropsParam<TDispatchProps, TOwnProps>,
  mergeProps: MergeProps<undefined, TDispatchProps, TOwnProps, TMergedProps>
): InferableComponentEnhancerWithProps<TMergedProps, TOwnProps & ConnectProps>

/* @public */
// @ts-ignore
function connect<
  TStateProps = {},
  no_dispatch = {},
  TOwnProps = {},
  State = DefaultRootState
>(
  mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State>,
  mapDispatchToProps: null | undefined,
  mergeProps: null | undefined,
  options: ConnectOptions<State, TStateProps, TOwnProps>
): InferableComponentEnhancerWithProps<
  DispatchProp & TStateProps,
  TOwnProps & ConnectProps
>

/* @public */
function connect<TStateProps = {}, TDispatchProps = {}, TOwnProps = {}>(
  mapStateToProps: null | undefined,
  mapDispatchToProps: MapDispatchToPropsNonObject<TDispatchProps, TOwnProps>,
  mergeProps: null | undefined,
  options: ConnectOptions<{}, TStateProps, TOwnProps>
): InferableComponentEnhancerWithProps<TDispatchProps, TOwnProps & ConnectProps>

/* @public */
function connect<TStateProps = {}, TDispatchProps = {}, TOwnProps = {}>(
  mapStateToProps: null | undefined,
  mapDispatchToProps: MapDispatchToPropsParam<TDispatchProps, TOwnProps>,
  mergeProps: null | undefined,
  options: ConnectOptions<{}, TStateProps, TOwnProps>
): InferableComponentEnhancerWithProps<
  ResolveThunks<TDispatchProps>,
  TOwnProps & ConnectProps
>

/* @public */
function connect<
  TStateProps = {},
  TDispatchProps = {},
  TOwnProps = {},
  State = DefaultRootState
>(
  mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State>,
  mapDispatchToProps: MapDispatchToPropsNonObject<TDispatchProps, TOwnProps>,
  mergeProps: null | undefined,
  options: ConnectOptions<State, TStateProps, TOwnProps>
): InferableComponentEnhancerWithProps<
  TStateProps & TDispatchProps,
  TOwnProps & ConnectProps
>

/* @public */
function connect<
  TStateProps = {},
  TDispatchProps = {},
  TOwnProps = {},
  State = DefaultRootState
>(
  mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State>,
  mapDispatchToProps: MapDispatchToPropsParam<TDispatchProps, TOwnProps>,
  mergeProps: null | undefined,
  options: ConnectOptions<State, TStateProps, TOwnProps>
): InferableComponentEnhancerWithProps<
  TStateProps & ResolveThunks<TDispatchProps>,
  TOwnProps & ConnectProps
>

/* @public */
function connect<
  TStateProps = {},
  TDispatchProps = {},
  TOwnProps = {},
  TMergedProps = {},
  State = DefaultRootState
>(
  mapStateToProps?: MapStateToPropsParam<TStateProps, TOwnProps, State>,
  mapDispatchToProps?: MapDispatchToPropsParam<TDispatchProps, TOwnProps>,
  mergeProps?: MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps>,
  options?: ConnectOptions<State, TStateProps, TOwnProps, TMergedProps>
): InferableComponentEnhancerWithProps<TMergedProps, TOwnProps & ConnectProps>

/**
 * Connects a React component to a Redux store.
 *
 * - Without arguments, just wraps the component, without changing the behavior / props
 *
 * - If 2 params are passed (3rd param, mergeProps, is skipped), default behavior
 * is to override ownProps (as stated in the docs), so what remains is everything that's
 * not a state or dispatch prop
 *
 * - When 3rd param is passed, we don't know if ownProps propagate and whether they
 * should be valid component props, because it depends on mergeProps implementation.
 * As such, it is the user's responsibility to extend ownProps interface from state or
 * dispatch props or both when applicable
 *
 * @param mapStateToProps A function that extracts values from state
 * @param mapDispatchToProps Setup for dispatching actions
 * @param mergeProps Optional callback to merge state and dispatch props together
 * @param options Options for configuring the connection
 *
 */
function connect<
  TStateProps = {},
  TDispatchProps = {},
  TOwnProps = {},
  TMergedProps = {},
  State = DefaultRootState
>(
  mapStateToProps?: MapStateToPropsParam<TStateProps, TOwnProps, State>,
  mapDispatchToProps?: MapDispatchToPropsParam<TDispatchProps, TOwnProps>,
  mergeProps?: MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps>,
  {
    // The `pure` option has been removed, so TS doesn't like us destructuring this to check its existence.
    // @ts-ignore
    pure,
    areStatesEqual = strictEqual,
    areOwnPropsEqual = shallowEqual,
    areStatePropsEqual = shallowEqual,
    areMergedPropsEqual = shallowEqual,

    // use React's forwardRef to expose a ref of the wrapped component
    forwardRef = false,

    // the context consumer to use
    context = ReactReduxContext,
  }: ConnectOptions<unknown, unknown, unknown, unknown> = {}
): unknown {

  // debugger
  const Context = context

  type WrappedComponentProps = TOwnProps & ConnectProps
  /** mapStateToProps为空则是initConstantSelector，最终会返回空对象，否则是initProxySelector */
  const initMapStateToProps = match(
    mapStateToProps,
    // @ts-ignore
    defaultMapStateToPropsFactories,
    // 第三个参数只是用来match不到的时候报错提示用而已
    'mapStateToProps'
  )!
  /** mapDispatchToProps为空则是initConstantSelector，否则是initProxySelector */
  const initMapDispatchToProps = match(
    mapDispatchToProps,
    // @ts-ignore
    defaultMapDispatchToPropsFactories,
    // 第三个参数只是用来match不到的时候报错提示用而已
    'mapDispatchToProps'
  )!
  /** mergeProps为空则是() => defaultMergeProps，否则是initMergePropsProxy */
  const initMergeProps = match(
    mergeProps,
    // @ts-ignore
    defaultMergePropsFactories,
    // 第三个参数只是用来match不到的时候报错提示用而已
    'mergeProps'
  )!
  // 有传mapStateToProps才需要处理当store中的state变化要做相应的处理
  const shouldHandleStateChanges = Boolean(mapStateToProps)
    /**
     * 调用connext后会返回wrapWithConnect，其接收一个组件作为参数
     * WrappedComponent即调用connext后传入的组件
     * 
     * @example
     * function WrappedComponent(props) {}  
     * export default connext(mapStateToProps, mapDispatchToProps)(WrappedComponent)
     *  */ 
  const wrapWithConnect: AdvancedComponentDecorator<
    TOwnProps,
    WrappedComponentProps
  > = (WrappedComponent) => {
    // debugger
    if (
      process.env.NODE_ENV !== 'production' &&
      !isValidElementType(WrappedComponent)
    ) {
      throw new Error(
        `You must pass a component to the function returned by connect. Instead received ${stringifyComponent(
          WrappedComponent
        )}`
      )
    }

    const wrappedComponentName =
      WrappedComponent.displayName || WrappedComponent.name || 'Component'

    const displayName = `Connect(${wrappedComponentName})`

    const selectorFactoryOptions: SelectorFactoryOptions<any, any, any, any> = {
      pure,
      shouldHandleStateChanges,
      displayName,
      wrappedComponentName,
      WrappedComponent,
      initMapStateToProps,
      initMapDispatchToProps,
      // @ts-ignore
      initMergeProps,
      areStatesEqual,
      areStatePropsEqual,
      areOwnPropsEqual,
      areMergedPropsEqual,
    }

    // If we aren't running in "pure" mode, we don't want to memoize values.
    // To avoid conditionally calling hooks, we fall back to a tiny wrapper
    // that just executes the given callback immediately.
    const usePureOnlyMemo = pure ? useMemo : (callback: () => any) => callback()
    /**
     * WrappedComponent实际上是由ConnectFunction处理的
     */ 
    function ConnectFunction<TOwnProps>(props: ConnectProps & TOwnProps) {
      // 如果配置了forwardRef，那么会将ref作为reactReduxForwardedRef的prop，
      // 见下面if (forwardRef) {...}
      const [propsContext, reactReduxForwardedRef, wrapperProps] =
        useMemo(() => {
          // Distinguish between actual "data" props that were passed to the wrapper component,
          // and values needed to control behavior (forwarded refs, alternate context instances).
          // To maintain the wrapperProps object reference, memoize this destructuring.
          const { reactReduxForwardedRef, ...wrapperProps } = props
          // 这里如果props有context，那么有可能是Context，下面的
          // propsContext &&
          // propsContext.Consumer &&
          // isContextConsumer(<propsContext.Consumer />)
          // 会做判断
          return [props.context, reactReduxForwardedRef, wrapperProps]
        }, [props])

      const ContextToUse: ReactReduxContextInstance = useMemo(() => {
        // Users may optionally pass in a custom context instance to use instead of our ReactReduxContext.
        // Memoize the check that determines which context instance we should use.
        // 如果自定义传了context，那么用该context，否则用默认的ReactReduxContext
        return propsContext &&
          propsContext.Consumer &&
          // @ts-ignore
          isContextConsumer(<propsContext.Consumer />)
          ? propsContext
          : Context
      }, [propsContext, Context])

      // Retrieve the store and ancestor subscription via context, if available
      const contextValue = useContext(ContextToUse)

      // The store _must_ exist as either a prop or in context.
      // We'll check to see if it _looks_ like a Redux store first.
      // This allows us to pass through a `store` prop that is just a plain value.
      // 有props是store还不行，还必须有有getState和dispatch，都有说明长得像 Redux store
      const didStoreComeFromProps =
        Boolean(props.store) &&
        Boolean(props.store.getState) &&
        Boolean(props.store.dispatch)
        // store是否来着context
      const didStoreComeFromContext =
        Boolean(contextValue) && Boolean(contextValue!.store)

      if (
        process.env.NODE_ENV !== 'production' &&
        !didStoreComeFromProps &&
        !didStoreComeFromContext
      ) {
        // 如果都为false，!didStoreComeFromContext说明没有从context得到store，
        // !didStoreComeFromProps说明没有向Provider的prop传入store
        throw new Error(
          `Could not find "store" in the context of ` +
            `"${displayName}". Either wrap the root component in a <Provider>, ` +
            `or pass a custom React context provider to <Provider> and the corresponding ` +
            `React context consumer to ${displayName} in connect options.`
        )
      }

      // Based on the previous check, one of these must be true
      // store来着两处： 1. props; 2.context，优先取props.store
      const store: Store = didStoreComeFromProps
        ? props.store!
        : contextValue!.store
      /**
       * 这个执行后会得到真正的childProps
       * @example
       * // 最终返回一个 mergedProps：stateProps, dispatchProps, ownProps合并的props
       * childPropsSelector = function pureFinalPropsSelector(
       *  nextState: State,
       *  nextOwnProps: TOwnProps
       * ) {
       *  return hasRunAtLeastOnce ? 
       *  handleSubsequentCalls(nextState, nextOwnProps): 
       *  handleFirstCall(nextState, nextOwnProps)
       * }
       */
      const childPropsSelector = useMemo(() => {
        // The child props selector needs the store reference as an input.
        // Re-create this selector whenever the store changes.
        return defaultSelectorFactory(store.dispatch, selectorFactoryOptions)
      }, [store])

      const [subscription, notifyNestedSubs] = useMemo(() => {
        if (!shouldHandleStateChanges) return NO_SUBSCRIPTION_ARRAY

        // This Subscription's source should match where store came from: props vs. context. A component
        // connected to the store via props shouldn't use subscription from context, or vice versa.
        // 这里需要 判断store是来自props还是context，如果来自props，说明是顶级，无需传parentSub
        // 否则是来自context，那么将context的subscription作为新生成的subscription的parentSub
        const subscription = createSubscription(
          store,
          didStoreComeFromProps ? undefined : contextValue!.subscription
        )

        // `notifyNestedSubs` is duplicated to handle the case where the component is unmounted in
        // the middle of the notification loop, where `subscription` will then be null. This can
        // probably be avoided if Subscription's listeners logic is changed to not call listeners
        // that have been unsubscribed in the  middle of the notification loop.
        // 如果notification的过程中组件被卸载了，那么subscription会变为null，用bind可避免notifyNestedSubs为空
        const notifyNestedSubs =
          subscription.notifyNestedSubs.bind(subscription)

        return [subscription, notifyNestedSubs]
      }, [store, didStoreComeFromProps, contextValue])

      // Determine what {store, subscription} value should be put into nested context, if necessary,
      // and memoize that value to avoid unnecessary context updates.
      const overriddenContextValue = useMemo(() => {
        if (didStoreComeFromProps) {
          // 组件直接从props.store订阅，那么contextValue还是不变
          // This component is directly subscribed to a store from props.
          // We don't want descendants reading from this store - pass down whatever
          // the existing context value is from the nearest connected ancestor.
          return contextValue!
        }
        // 否则替换subscription
        // Otherwise, put this component's subscription instance into context, so that
        // connected descendants won't update until after this component is done
        return {
          ...contextValue,
          subscription,
        } as ReactReduxContextValue
      }, [didStoreComeFromProps, contextValue, subscription])

      // Set up refs to coordinate values between the subscription effect and the render logic
      /** 更新前传给connect后组件的props，包括传给WrappedComponent的、mapStateToProps、mapDispatchToProps执行后得到的 */
      const lastChildProps = useRef<unknown>()
      /** 更新前传给WrappedComponent的Props */
      const lastWrapperProps = useRef(wrapperProps)
      /** 来自sotre的props是否更新,只有store更新了才有值，否则都是undefined */
      const childPropsFromStoreUpdate = useRef<unknown>()
      /** 是否正在调度 */
      const renderIsScheduled = useRef(false)
      const isProcessingDispatch = useRef(false)
      const isMounted = useRef(false)

      const latestSubscriptionCallbackError = useRef<Error>()

      useIsomorphicLayoutEffect(() => {
        isMounted.current = true
        return () => {
          isMounted.current = false
        }
      }, [])

      const actualChildPropsSelector = usePureOnlyMemo(() => {
        const selector = () => {
          // Tricky logic here:
          // - This render may have been triggered by a Redux store update that produced new child props
          // - However, we may have gotten new wrapper props after that
          // If we have new child props, and the same wrapper props, we know we should use the new child props as-is.
          // But, if we have new wrapper props, those might change the child props, so we have to recalculate things.
          // So, we'll use the child props from store update only if the wrapper props are the same as last time.
          // 这个render可能是由 Redux store 更新所触发，产生了新的childProps，
          // 但在这之后我们又可能获取到新的wrapperProps。
          // 如果有新的childProps,但wrapperProps和上次相同，那么我们使用新的childProps就好，
          // 即return childPropsFromStoreUpdate.current。
          // 但是 ，如果有新老wrapperProps不同，其可能会改变childProps，那么我们应该重新计算，
          // 即return childPropsSelector(store.getState(), wrapperProps)。
          // 综上，只有在更新来着store，且在wrapperProps和上次相同的情况下才使用store更新的childProps
          if (
            childPropsFromStoreUpdate.current &&
            wrapperProps === lastWrapperProps.current
          ) {
            return childPropsFromStoreUpdate.current
          }

          // TODO We're reading the store directly in render() here. Bad idea?
          // This will likely cause Bad Things (TM) to happen in Concurrent Mode.
          // Note that we do this because on renders _not_ caused by store updates, we need the latest store state
          // to determine what the child props should be.
          // 否则wrapperProps要参与到childProps的计算中
          return childPropsSelector(store.getState(), wrapperProps)
        }
        return selector
      }, [store, wrapperProps])

      // We need this to execute synchronously every time we re-render. However, React warns
      // about useLayoutEffect in SSR, so we try to detect environment and fall back to
      // just useEffect instead to avoid the warning, since neither will run anyway.

      const subscribeForReact = useMemo(() => {
        const subscribe = (reactListener: () => void) => {
          if (!subscription) {
            return () => {}
          }

          return subscribeUpdates(
            shouldHandleStateChanges,
            store,
            subscription,
            // @ts-ignore
            childPropsSelector,
            lastWrapperProps,
            lastChildProps,
            renderIsScheduled,
            isMounted,
            childPropsFromStoreUpdate,
            notifyNestedSubs,
            reactListener
          )
        }

        return subscribe
      }, [subscription])

      useIsomorphicLayoutEffectWithArgs(captureWrapperProps, [
        lastWrapperProps,
        lastChildProps,
        renderIsScheduled,
        wrapperProps,
        childPropsFromStoreUpdate,
        notifyNestedSubs,
      ])
      /** WrappedComponent真正的props，即被connect的组件真正的props */
      let actualChildProps: unknown

      try {
        /** 
         * useSyncExternalStore里面会触发forceRender，那么这里就会通过actualChildPropsSelector()
         * 获取到新的childProps，那么页面就变化了 
         * */
        actualChildProps = useSyncExternalStore(
          subscribeForReact,
          actualChildPropsSelector,
          // TODO Need a real getServerSnapshot here
          actualChildPropsSelector
        )
        // debugger
      } catch (err) {
        if (latestSubscriptionCallbackError.current) {
          ;(
            err as Error
          ).message += `\nThe error may be correlated with this previous error:\n${latestSubscriptionCallbackError.current.stack}\n\n`
        }

        throw err
      }
      /** 
       * 上面相关状态都用完了，那么这里会重置，且保存最新的childProps，
       * 以便下次和store变化的时候触发checkForUpdates得到newChildProps做比较，
       * 来判断是否需要forRender 
       * */
      useIsomorphicLayoutEffect(() => {
        latestSubscriptionCallbackError.current = undefined
        childPropsFromStoreUpdate.current = undefined
        lastChildProps.current = actualChildProps
      })

      // Now that all that's done, we can finally try to actually render the child component.
      // We memoize the elements for the rendered child component as an optimization.
      /**
       * 这里的actualChildProps可能包含stateProps、dispatchProps、ownProps
       * @example
       * mergedProps = mergeProps(stateProps, dispatchProps, ownProps)
       *  */ 
      const renderedWrappedComponent = useMemo(() => {
        return (
          // @ts-ignore
          <WrappedComponent
            {...actualChildProps}
            ref={reactReduxForwardedRef}
          />
        )
      }, [reactReduxForwardedRef, WrappedComponent, actualChildProps])

      // If React sees the exact same element reference as last time, it bails out of re-rendering
      // that child, same as if it was wrapped in React.memo() or returned false from shouldComponentUpdate.
      const renderedChild = useMemo(() => {
        // 这里shouldHandleStateChanges不用加入useMemo的依赖是因为
        // mapStateToProps是否有传从一开始调用connect就确定了，后续不会改变
        if (shouldHandleStateChanges) {
          // 有mapStateToProps的话，说明订阅了store的数据，那么再加一个context，且将value的subscription改为自己的
          // 即overriddenContextValue
          // If this component is subscribed to store updates, we need to pass its own
          // subscription instance down to our descendants. That means rendering the same
          // Context instance, and putting a different value into the context.
          return (
            <ContextToUse.Provider value={overriddenContextValue}>
              {renderedWrappedComponent}
            </ContextToUse.Provider>
          )
        }
        // 否则直接返回renderedWrappedComponent
        return renderedWrappedComponent
      }, [ContextToUse, renderedWrappedComponent, overriddenContextValue])

      return renderedChild
    }

    // If we're in "pure" mode, ensure our wrapper component only re-renders when incoming props have changed.
    const _Connect = React.memo(ConnectFunction)

    type ConnectedWrapperComponent = typeof _Connect & {
      WrappedComponent: typeof WrappedComponent
    }

    // Add a hacky cast to get the right output type
    const Connect = _Connect as unknown as ConnectedComponent<
      typeof WrappedComponent,
      WrappedComponentProps
    >
    Connect.WrappedComponent = WrappedComponent
    Connect.displayName = ConnectFunction.displayName = displayName
    // 如果配置了forwardRef选项为true
    if (forwardRef) {
      const _forwarded = React.forwardRef(function forwardConnectRef(
        props,
        ref
      ) {
        // @ts-ignore
        return <Connect {...props} reactReduxForwardedRef={ref} />
      })

      const forwarded = _forwarded as ConnectedWrapperComponent
      forwarded.displayName = displayName
      forwarded.WrappedComponent = WrappedComponent
      return hoistStatics(forwarded, WrappedComponent)
    }

    return hoistStatics(Connect, WrappedComponent)
  }

  return wrapWithConnect
}

export default connect
