import { createStore } from 'redux'
import { Provider } from 'react-redux'
import App from './components/App'
import rootReducer from './reducers'

const store = createStore(rootReducer)

export default () => (
  <Provider store={store}>
    <App />
  </Provider>
)
