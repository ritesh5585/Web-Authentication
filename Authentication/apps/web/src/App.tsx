import { Route, Routes } from "react-router"

const App = () => {
  return (
    <Routes>
      <Route path="/register" element={<App/>} />
      <Route path="*" element={<App/>} />
      <Route path="/verify-email" />
      <Route path="/login" />
    </Routes>
  )
}

export default App