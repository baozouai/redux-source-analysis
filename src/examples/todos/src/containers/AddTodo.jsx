import { connect, useDispatch, useSelector } from 'react-redux'
import { addTodo } from '../actions'

const AddTodo = () => {
  let input
  useSelector(state => ({}), () => true)
  const dispatch = useDispatch()
  debugger
  return (
    <div>
      <form onSubmit={e => {
        e.preventDefault()
        if (!input.value.trim()) {
          return
        }
        dispatch(addTodo(input.value))
        input.value = ''
      }}>
        <input ref={node => input = node} />
        <button type="submit">
          Add Todo
        </button>
        <button onClick={() => input.value = ''}>reset</button>
      </form>
    </div>
  )
}

// export default connect()(AddTodo)
export default AddTodo
