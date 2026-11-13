import { Alert, Center, Loader } from "@mantine/core";
import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import type { Role } from "./api";
import { useAuth } from "./auth";
import { Layout } from "./components/Layout";
import { DisciplinesPage } from "./pages/DisciplinesPage";
import { EvaluationPage } from "./pages/EvaluationPage";
import { EventDetailPage } from "./pages/EventDetailPage";
import { EventsPage } from "./pages/EventsPage";
import { IssuePage } from "./pages/IssuePage";
import { LoginPage } from "./pages/LoginPage";
import { ScoringPage } from "./pages/ScoringPage";
import { UsersPage } from "./pages/UsersPage";

function Guard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { can } = useAuth();
  return can(...roles) ? children : <Navigate to="/" replace />;
}

function Home() {
  const { can } = useAuth();
  if (can("ISSUER")) return <Navigate to="/ausgabe" replace />;
  if (can("SCORER")) return <Navigate to="/erfassung" replace />;
  if (can("EVALUATOR")) return <Navigate to="/auswertung" replace />;
  return <Alert color="yellow">Diesem Benutzer ist noch keine Rolle zugewiesen. Bitte an den Administrator wenden.</Alert>;
}

export function App() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (!user) return <LoginPage />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="ausgabe" element={<Guard roles={["ISSUER"]}><IssuePage /></Guard>} />
        <Route path="erfassung" element={<Guard roles={["SCORER"]}><ScoringPage /></Guard>} />
        <Route path="auswertung" element={<Guard roles={["SCORER", "EVALUATOR"]}><EvaluationPage /></Guard>} />
        <Route path="veranstaltungen" element={<Guard roles={[]}><EventsPage /></Guard>} />
        <Route path="veranstaltungen/:id" element={<Guard roles={[]}><EventDetailPage /></Guard>} />
        <Route path="benutzer" element={<Guard roles={[]}><UsersPage /></Guard>} />
        <Route path="disziplinen" element={<Guard roles={[]}><DisciplinesPage /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
