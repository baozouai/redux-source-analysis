import { useState, useEffect } from 'react'
import { createStore } from 'redux'
import Counter from './components/Counter'
import counter from './reducers'

const store = createStore(counter)

function App() {
  const [_, forceUpdate] = useState(0)
  useEffect(() => {
    const unsubscribe = store.subscribe(() => forceUpdate(num => num + 1))
    return unsubscribe
  }, [])
  return (
    <Counter
      value={store.getState()}
      onIncrement={() => store.dispatch({ type: 'INCREMENT' })}
      onDecrement={() => store.dispatch({ type: 'DECREMENT' })}
    />
  )
}

export default App

