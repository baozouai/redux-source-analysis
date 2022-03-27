import { createStore } from 'redux'
import { Provider } from 'react-redux'
import reducer from './reducers'
import generateTree from './generateTree'
import Node from './containers/Node'

const tree = generateTree()
const store = createStore(reducer, tree)

export default () => (
  <Provider store={store}>
    <Node id={0} />
  </Provider>
)
