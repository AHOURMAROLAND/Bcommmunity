import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";

function Protegee({ children }) {
  const { utilisateur, chargement } = useAuth();
  if (chargement) return null;
  return utilisateur ? children : <Navigate to="/connexion" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/connexion" element={<div className="p-6 titre">Connexion</div>} />
      <Route path="/inscription" element={<div className="p-6 titre">Inscription</div>} />
      <Route path="/fil" element={<Protegee><div className="p-6 titre">Fil</div></Protegee>} />
      <Route path="*" element={<Navigate to="/fil" replace />} />
    </Routes>
  );
}
