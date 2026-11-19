import { Route, Routes } from "react-router";
import Register from "./pages/Register";
import VerifyEmail from "./pages/VerifyEmail";
import { Navigate } from "react-router";

const App = () => {
  return (
    <Routes>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={""} />
      <Route path="/login" />
      <Route path="/register" element={<Register />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
    </Routes>
  );
};

export default App;
