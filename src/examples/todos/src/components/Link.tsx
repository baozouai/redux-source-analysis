import {FC} from 'react'

const Link:FC<{active: boolean; onClick: (...args:any)=> any }> = ({ active, children, onClick }) => (
    <button
       onClick={onClick}
       disabled={active}
       style={{
           marginLeft: '4px',
       }}
    >
      {children}
    </button>
)

export default Link
