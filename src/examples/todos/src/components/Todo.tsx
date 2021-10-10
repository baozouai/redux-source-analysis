import {FC } from 'react'

import {AnyCallback} from '@/examples/types'
const Todo: FC<{onClick: AnyCallback; completed: boolean;  text: string}> = ({ onClick, completed, text }) => (
  <li
    onClick={onClick}
    style={{
      textDecoration: completed ? 'line-through' : 'none'
    }}
  >
    {text}
  </li>
)



export default Todo
