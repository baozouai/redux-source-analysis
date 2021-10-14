import type { Dispatch, Action } from 'redux'
import verifySubselectors from './verifySubselectors'
import type { DefaultRootState, EqualityFn } from '../types'

export type SelectorFactory<S, TProps, TOwnProps, TFactoryOptions> = (
  dispatch: Dispatch<Action>,
  factoryOptions: TFactoryOptions
) => Selector<S, TProps, TOwnProps>

export type Selector<S, TProps, TOwnProps = null> = TOwnProps extends
  | null
  | undefined
  ? (state: S) => TProps
  : (state: S, ownProps: TOwnProps) => TProps

export type MapStateToProps<
  TStateProps,
  TOwnProps,
  State = DefaultRootState
> = (state: State, ownProps: TOwnProps) => TStateProps

export type MapStateToPropsFactory<
  TStateProps,
  TOwnProps,
  State = DefaultRootState
> = (
  initialState: State,
  ownProps: TOwnProps
) => MapStateToProps<TStateProps, TOwnProps, State>

export type MapStateToPropsParam<
  TStateProps,
  TOwnProps,
  State = DefaultRootState
> =
  | MapStateToPropsFactory<TStateProps, TOwnProps, State>
  | MapStateToProps<TStateProps, TOwnProps, State>
  | null
  | undefined

export type MapDispatchToPropsFunction<TDispatchProps, TOwnProps> = (
  dispatch: Dispatch<Action>,
  ownProps: TOwnProps
) => TDispatchProps

export type MapDispatchToProps<TDispatchProps, TOwnProps> =
  | MapDispatchToPropsFunction<TDispatchProps, TOwnProps>
  | TDispatchProps

export type MapDispatchToPropsFactory<TDispatchProps, TOwnProps> = (
  dispatch: Dispatch<Action>,
  ownProps: TOwnProps
) => MapDispatchToPropsFunction<TDispatchProps, TOwnProps>

export type MapDispatchToPropsParam<TDispatchProps, TOwnProps> =
  | MapDispatchToPropsFactory<TDispatchProps, TOwnProps>
  | MapDispatchToProps<TDispatchProps, TOwnProps>

export type MapDispatchToPropsNonObject<TDispatchProps, TOwnProps> =
  | MapDispatchToPropsFactory<TDispatchProps, TOwnProps>
  | MapDispatchToPropsFunction<TDispatchProps, TOwnProps>

export type MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps> = (
  stateProps: TStateProps,
  dispatchProps: TDispatchProps,
  ownProps: TOwnProps
) => TMergedProps

interface PureSelectorFactoryComparisonOptions<
  TOwnProps,
  State = DefaultRootState
> {
  areStatesEqual: EqualityFn<State>
  areOwnPropsEqual: EqualityFn<TOwnProps>
  areStatePropsEqual: EqualityFn<unknown>
  displayName: string
}
/**
 * @example
 * return function pureFinalPropsSelector(
 *  nextState: State,
 *  nextOwnProps: TOwnProps
 * ) {
 * return hasRunAtLeastOnce
 *    ? handleSubsequentCalls(nextState, nextOwnProps)
 *    : handleFirstCall(nextState, nextOwnProps)
 * }
 */
export function pureFinalPropsSelectorFactory<
  TStateProps,
  TOwnProps,
  TDispatchProps,
  TMergedProps,
  State = DefaultRootState
>(
  mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State> & {
    dependsOnOwnProps: boolean
  },
  mapDispatchToProps: MapDispatchToPropsParam<TDispatchProps, TOwnProps> & {
    dependsOnOwnProps: boolean
  },
  mergeProps: MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps>,
  dispatch: Dispatch,
  {
    areStatesEqual,
    areOwnPropsEqual,
    areStatePropsEqual,
  }: PureSelectorFactoryComparisonOptions<TOwnProps, State>
) {
  /** 至少执行过一次 */
  let hasRunAtLeastOnce = false
  let state: State
  /** 通过组件传的props */
  let ownProps: TOwnProps
   /** mapStateToProps得到的props */
  let stateProps: TStateProps
  /** mapDispatchToProps得到的props */
  let dispatchProps: TDispatchProps
  /** stateProps, dispatchProps, ownProps合并的props */
  let mergedProps: TMergedProps
  /** pureFinalPropsSelector第一次会调用这个 */
  function handleFirstCall(firstState: State, firstOwnProps: TOwnProps) {
    state = firstState
    ownProps = firstOwnProps
    // 第一次会调用这三个函数，最终生成mergedProps
    // @ts-ignore
    stateProps = mapStateToProps(state, ownProps)
    // @ts-ignore
    dispatchProps = mapDispatchToProps(dispatch, ownProps)
    mergedProps = mergeProps(stateProps, dispatchProps, ownProps)
    hasRunAtLeastOnce = true
    return mergedProps
  }
  /** 处理newProps(ownProps)和newState(mapStateToProps) */
  function handleNewPropsAndNewState() {
    // @ts-ignore
    stateProps = mapStateToProps(state, ownProps)
    // mapDispatchToProps.dependsOnOwnProps为true，说明mapDispatchToProps有第二个参数ownProps，
    // 那么才更新dispatchProps
    if (mapDispatchToProps.dependsOnOwnProps)
      // @ts-ignore
      dispatchProps = mapDispatchToProps(dispatch, ownProps)

    mergedProps = mergeProps(stateProps, dispatchProps, ownProps)
    return mergedProps
  }
  /** 处理ownProps */
  function handleNewProps() {
    // mapStateToProps.dependsOnOwnProps为true，说明mapStateToProps有第二个参数ownProps，
    // 那么才更新stateProps
    if (mapStateToProps.dependsOnOwnProps)
      // @ts-ignore
      stateProps = mapStateToProps(state, ownProps)
    // mapDispatchToProps.dependsOnOwnProps为true，说明mapDispatchToProps有第二个参数ownProps，
    // 那么才更新dispatchProps
    if (mapDispatchToProps.dependsOnOwnProps)
      // @ts-ignore
      dispatchProps = mapDispatchToProps(dispatch, ownProps)
    // 这里merge的原因是ownProps变化了，那么要返回一个新的引用，才能触发组件render
    mergedProps = mergeProps(stateProps, dispatchProps, ownProps)
    return mergedProps
  }
  /** 处理mapStateToProps */
  function handleNewState() {
    const nextStateProps = mapStateToProps(state, ownProps)
    const statePropsChanged = !areStatePropsEqual(nextStateProps, stateProps)
    // @ts-ignore
    stateProps = nextStateProps
    // state确实变化了才生成新的mergedProps，否则返回旧的引用，避免不必要的render
    if (statePropsChanged)
      mergedProps = mergeProps(stateProps, dispatchProps, ownProps)

    return mergedProps
  }

  function handleSubsequentCalls(nextState: State, nextOwnProps: TOwnProps) {
    // 是否相等，取！则是不相等，则变化了
    const propsChanged = !areOwnPropsEqual(nextOwnProps, ownProps)
    const stateChanged = !areStatesEqual(nextState, state)
    state = nextState
    ownProps = nextOwnProps
    // 下面的三个判断也是为了避免不必要的render，确实有变化了才返回新的mergedProps引用，触发组件render
    // ownProps和state都改变
    if (propsChanged && stateChanged) return handleNewPropsAndNewState()
    // 两者之一改变
    if (propsChanged) return handleNewProps()
    if (stateChanged) return handleNewState()
    // 都没变化就返回上次的mergedProps
    return mergedProps
  }
  /** 最终返回一个 mergedProps：stateProps, dispatchProps, ownProps合并的props */
  return function pureFinalPropsSelector(
    nextState: State,
    nextOwnProps: TOwnProps
  ) {
    return hasRunAtLeastOnce
      ? handleSubsequentCalls(nextState, nextOwnProps)
      : handleFirstCall(nextState, nextOwnProps)
  }
}

export interface SelectorFactoryOptions<
  TStateProps,
  TOwnProps,
  TDispatchProps,
  TMergedProps,
  State = DefaultRootState
> extends PureSelectorFactoryComparisonOptions<TOwnProps, State> {
  initMapStateToProps: (
    dispatch: Dispatch,
    options: PureSelectorFactoryComparisonOptions<TOwnProps, State>
  ) => MapStateToPropsParam<TStateProps, TOwnProps, State>
  initMapDispatchToProps: (
    dispatch: Dispatch,
    options: PureSelectorFactoryComparisonOptions<TOwnProps, State>
  ) => MapDispatchToPropsParam<TDispatchProps, TOwnProps>
  initMergeProps: (
    dispatch: Dispatch,
    options: PureSelectorFactoryComparisonOptions<TOwnProps, State>
  ) => MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps>
}

// TODO: Add more comments

// The selector returned by selectorFactory will memoize its results,
// allowing connect's shouldComponentUpdate to return false if final
// props have not changed.

export default function finalPropsSelectorFactory<
  TStateProps,
  TOwnProps,
  TDispatchProps,
  TMergedProps,
  State = DefaultRootState
>(
  dispatch: Dispatch<Action>,
  {
    initMapStateToProps,
    initMapDispatchToProps,
    initMergeProps,
    ...options
  }: SelectorFactoryOptions<
    TStateProps,
    TOwnProps,
    TDispatchProps,
    TMergedProps,
    State
  >
) {
  /** 
   *  @example
   * 如果最开始connect传入的mapStateToProps为空，那么这里通过initMapStateToProps得到的 
   * mapStateToProps为constantSelector
   * 
   * function constantSelector() {
   *   return constant
   * }
   * constantSelector.dependsOnOwnProps = false
   * 
   * // 否则是
   * 
   * const proxy = function mapToPropsProxy(
   *   stateOrDispatch: StateOrDispatch,
   *   ownProps?: P
   * ): MapToProps {
   *   return proxy.mapToProps(
   *     stateOrDispatch,
   *     proxy.dependsOnOwnProps ? ownProps : undefined
   *   )
   * }
   * */
  const mapStateToProps = initMapStateToProps(dispatch, options)
  /** 最开始connect传入的mapDispatchToProps为空或对象(值都为函数)，那么跟上面第一种情况，是函数就第二种 */
  const mapDispatchToProps = initMapDispatchToProps(dispatch, options)
  /**
   * @example
   * 
   * 最开始connect传入的mergeProps为空，那么这里得到的mergeProps为
   * 
   * function defaultMergeProps<TStateProps, TDispatchProps, TOwnProps>(
   *   stateProps: TStateProps,
   *   dispatchProps: TDispatchProps,
   *   ownProps: TOwnProps
   * ) {
   *   return { ...ownProps, ...stateProps, ...dispatchProps }
   * }
   * 
   * 否则是：
   * function mergePropsProxy(
   *   stateProps: TStateProps,
   *   dispatchProps: TDispatchProps,
   *   ownProps: TOwnProps
   * ){
   *  ...
   *  return mergedProps
   * }
   */
  const mergeProps = initMergeProps(dispatch, options)

  if (process.env.NODE_ENV !== 'production') {
    verifySubselectors(mapStateToProps, mapDispatchToProps, mergeProps)
  }

  return pureFinalPropsSelectorFactory(
    // @ts-ignore
    mapStateToProps,
    mapDispatchToProps,
    mergeProps,
    dispatch,
    options
  )
}
