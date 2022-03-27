import Async from '@/examples/async'
import Counter from '@/examples/counter'
import ShoppingCart from '@/examples/shopping-cart'
import TodoMvc from '@/examples/todomvc'
import Todos from '@/examples/todos'
import TodosWithUndo from '@/examples/todos-with-undo'
import TreeView from '@/examples/tree-view'
import { Routes, Route, Outlet } from 'react-router'
import { Link } from 'react-router-dom'

const routeConfigs = [
  {
    path: 'async',
    Element: Async,
  },
  {
    path: 'counter',
    Element: Counter,
  },
  {
    path: 'shopping-cart',
    Element: ShoppingCart,
  },
  {
    path: 'todomvc',
    Element: TodoMvc,
  },
  {
    path: 'todos',
    Element: Todos,
  },
  {
    path: 'todos-with-undo',
    Element: TodosWithUndo,
  },
  {
    path: 'tree-view',
    Element: TreeView,
  },
]

function Layout() {
  debugger
  return (
    <>
     <p>主页面</p>
      <ul>
        {
          routeConfigs.map(({ path }) => {
            if (path === '*') return null
            return (
              <li key={path}>
                <Link to={`/${path}`}>{path}</Link>
              </li>
            )
          })
        }
      </ul>
      <hr />
      <Outlet />
    </>
  )
}
function App() {
  debugger
  return (
    <Routes>
      {/* 注意，这里不是LayoutRoute，因为LayoutRoute只允许element和children,而这里有path */}
      <Route path='/' element={<Layout />}>
        {
          routeConfigs.map(({ path, Element }) => <Route key={path} path={`${path}${path === '*' ? '': '/*'}`} element={<Element />} />)
        }
      </Route>
    </Routes>
  )
  
}

export default App
