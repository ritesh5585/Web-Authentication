import { Route, Routes } from "react-router";
import Register from "./pages/Register";
import VerifyEmail from "./pages/VerifyEmail";

const App = () => {
  return (
    <Routes>
      <Route path="/register" element={<Register />} />
      <Route path="*" element={<Register />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/login" />
    </Routes>
  );
};

export default App;
