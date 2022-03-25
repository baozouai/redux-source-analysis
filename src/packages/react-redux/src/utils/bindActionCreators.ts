import { ActionCreatorsMapObject, Dispatch } from 'redux'
/** 针对于mapDispatchToProps为对象的情况，要求value为函数 */
export default function bindActionCreators(
  actionCreators: ActionCreatorsMapObject,
  dispatch: Dispatch
): ActionCreatorsMapObject {
  const boundActionCreators: ActionCreatorsMapObject = {}

  for (const key in actionCreators) {
    const actionCreator = actionCreators[key]
    if (typeof actionCreator === 'function') {
      boundActionCreators[key] = (...args) => dispatch(actionCreator(...args))
    }
  }
  return boundActionCreators
}
