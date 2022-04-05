import { Component } from 'react'
import PropTypes from 'prop-types'

class Counter extends Component {
  constructor(props) {
    super(props);
    this.incrementAsync = this.incrementAsync.bind(this);
    this.incrementIfOdd = this.incrementIfOdd.bind(this);
  }

  incrementIfOdd() {
    if (this.props.value % 2 !== 0) {
      this.props.onIncrement()
    }
  }

  incrementAsync() {
    setTimeout(this.props.onIncrement, 1000)
  }

  render() {
    const { value, onIncrement, onDecrement } = this.props
    return (
      <div>
        <p>Clicked: {value} times</p>
        <div>
          <button onClick={onIncrement}>+</button>
        </div>
        <div>
          <button onClick={onDecrement}>-</button>
        </div>

        <div>
          <button onClick={this.incrementIfOdd}>Increment if odd</button>
        </div>

        <div>
          <button onClick={this.incrementAsync}>Increment async</button>
        </div>
      </div>

    )
  }
}

Counter.propTypes = {
  value: PropTypes.number.isRequired,
  onIncrement: PropTypes.func.isRequired,
  onDecrement: PropTypes.func.isRequired
}

export default Counter
