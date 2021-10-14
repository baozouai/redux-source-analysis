import React from 'react'
import { connect, useDispatch } from 'react-redux'
import { addTodo } from '../actions'

const AddTodo = () => {
  let input
  const dispatch = useDispatch()
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
      </form>
    </div>
  )
}

// export default connect()(AddTodo)
export default AddTodo
