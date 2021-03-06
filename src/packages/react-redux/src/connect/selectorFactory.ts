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
  /** ????????????????????? */
  let hasRunAtLeastOnce = false
  let state: State
  /** ??????????????????props */
  let ownProps: TOwnProps
   /** mapStateToProps?????????props */
  let stateProps: TStateProps
  /** mapDispatchToProps?????????props */
  let dispatchProps: TDispatchProps
  /** stateProps, dispatchProps, ownProps?????????props */
  let mergedProps: TMergedProps
  /** pureFinalPropsSelector???????????????????????? */
  function handleFirstCall(firstState: State, firstOwnProps: TOwnProps) {
    state = firstState
    ownProps = firstOwnProps
    // ????????????????????????????????????????????????mergedProps
    // @ts-ignore
    stateProps = mapStateToProps(state, ownProps)
    // @ts-ignore
    dispatchProps = mapDispatchToProps(dispatch, ownProps)
    mergedProps = mergeProps(stateProps, dispatchProps, ownProps)
    hasRunAtLeastOnce = true
    return mergedProps
  }
  /** ??????newProps(ownProps)???newState(mapStateToProps) */
  function handleNewPropsAndNewState() {
    // @ts-ignore
    stateProps = mapStateToProps(state, ownProps)
    // mapDispatchToProps.dependsOnOwnProps???true?????????mapDispatchToProps??????????????????ownProps???
    // ???????????????dispatchProps
    if (mapDispatchToProps.dependsOnOwnProps)
      // @ts-ignore
      dispatchProps = mapDispatchToProps(dispatch, ownProps)

    mergedProps = mergeProps(stateProps, dispatchProps, ownProps)
    return mergedProps
  }
  /** ??????ownProps */
  function handleNewProps() {
    // mapStateToProps.dependsOnOwnProps???true?????????mapStateToProps??????????????????ownProps???
    // ???????????????stateProps
    if (mapStateToProps.dependsOnOwnProps)
      // @ts-ignore
      stateProps = mapStateToProps(state, ownProps)
    // mapDispatchToProps.dependsOnOwnProps???true?????????mapDispatchToProps??????????????????ownProps???
    // ???????????????dispatchProps
    if (mapDispatchToProps.dependsOnOwnProps)
      // @ts-ignore
      dispatchProps = mapDispatchToProps(dispatch, ownProps)
    // ??????merge????????????ownProps??????????????????????????????????????????????????????????????????render
    mergedProps = mergeProps(stateProps, dispatchProps, ownProps)
    return mergedProps
  }
  /** ??????mapStateToProps */
  function handleNewState() {
    const nextStateProps = mapStateToProps(state, ownProps)
    const statePropsChanged = !areStatePropsEqual(nextStateProps, stateProps)
    // @ts-ignore
    stateProps = nextStateProps
    // state??????????????????????????????mergedProps????????????????????????????????????????????????render
    if (statePropsChanged)
      mergedProps = mergeProps(stateProps, dispatchProps, ownProps)

    return mergedProps
  }

  function handleSubsequentCalls(nextState: State, nextOwnProps: TOwnProps) {
    // ???????????????????????????????????????????????????
    const propsChanged = !areOwnPropsEqual(nextOwnProps, ownProps)
    const stateChanged = !areStatesEqual(nextState, state)
    state = nextState
    ownProps = nextOwnProps
    // ???????????????????????????????????????????????????render????????????????????????????????????mergedProps?????????????????????render
    // ownProps???state?????????
    if (propsChanged && stateChanged) return handleNewPropsAndNewState()
    // ??????????????????
    if (propsChanged) return handleNewProps()
    if (stateChanged) return handleNewState()
    // ??????????????????????????????mergedProps
    return mergedProps
  }
  /** ?????????????????? mergedProps???stateProps, dispatchProps, ownProps?????????props */
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
   * ???????????????connect?????????mapStateToProps???????????????????????????initMapStateToProps????????? 
   * mapStateToProps???constantSelector
   * 
   * function constantSelector() {
   *   return constant
   * }
   * constantSelector.dependsOnOwnProps = false
   * 
   * // ?????????
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
  /** ?????????connect?????????mapDispatchToProps???????????????(???????????????)????????????????????????????????????????????????????????????????????? */
  const mapDispatchToProps = initMapDispatchToProps(dispatch, options)
  /**
   * @example
   * 
   * ?????????connect?????????mergeProps??????????????????????????????mergeProps???
   * 
   * function defaultMergeProps<TStateProps, TDispatchProps, TOwnProps>(
   *   stateProps: TStateProps,
   *   dispatchProps: TDispatchProps,
   *   ownProps: TOwnProps
   * ) {
   *   return { ...ownProps, ...stateProps, ...dispatchProps }
   * }
   * 
   * ????????????
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
