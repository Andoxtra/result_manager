import { AppShell, Burger, Button, Group, Modal, NavLink, PasswordInput, Stack, Text, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useState, type FormEvent } from "react";
import { NavLink as RouterNavLink, Outlet, useLocation } from "react-router-dom";
import { api, type Role } from "../api";
import { useAuth } from "../auth";
import { notifyError, notifySuccess } from "../notify";

const NAV: { to: string; label: string; roles: Role[] | "all" }[] = [
  { to: "/ausgabe", label: "Kartenausgabe", roles: ["ISSUER"] },
  { to: "/erfassung", label: "Ergebniserfassung", roles: ["SCORER"] },
  { to: "/auswertung", label: "Auswertung", roles: ["SCORER", "EVALUATOR"] },
  { to: "/veranstaltungen", label: "Veranstaltungen", roles: "all" },
  { to: "/disziplinen", label: "Disziplinen", roles: [] },
  { to: "/benutzer", label: "Benutzer", roles: [] },
];

function PasswordModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const mismatch = repeat !== "" && repeat !== newPassword;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== repeat) return;
    setBusy(true);
    try {
      await api.post("/auth/password", { currentPassword, newPassword });
      notifySuccess("Passwort geändert.");
      setCurrent("");
      setNew("");
      setRepeat("");
      onClose();
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Passwort ändern">
      <form onSubmit={submit}>
        <Stack>
          <PasswordInput label="Aktuelles Passwort" value={currentPassword} onChange={(e) => setCurrent(e.currentTarget.value)} autoComplete="current-password" required />
          <PasswordInput label="Neues Passwort" description="Mindestens 8 Zeichen" value={newPassword} onChange={(e) => setNew(e.currentTarget.value)} autoComplete="new-password" minLength={8} required />
          <PasswordInput label="Neues Passwort wiederholen" value={repeat} onChange={(e) => setRepeat(e.currentTarget.value)} autoComplete="new-password" error={mismatch ? "Die Passwörter stimmen nicht überein." : undefined} required />
          <Button type="submit" loading={busy} disabled={mismatch}>
            Speichern
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}

export function Layout() {
  const { user, can, logout } = useAuth();
  const [navOpen, nav] = useDisclosure(false);
  const [passwordOpen, password] = useDisclosure(false);
  const location = useLocation();

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 230, breakpoint: "sm", collapsed: { mobile: !navOpen } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group wrap="nowrap">
            <Burger opened={navOpen} onClick={nav.toggle} hiddenFrom="sm" size="sm" aria-label="Menü" />
            <Title order={4}>Result Manager</Title>
          </Group>
          <Text size="sm" c="dimmed" truncate visibleFrom="xs">
            {user?.displayName}
          </Text>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <AppShell.Section grow>
          {NAV.filter((item) => item.roles === "all" || can(...item.roles)).map((item) => (
            <NavLink
              key={item.to}
              component={RouterNavLink}
              to={item.to}
              label={item.label}
              active={location.pathname.startsWith(item.to)}
              onClick={nav.close}
            />
          ))}
        </AppShell.Section>
        <AppShell.Section>
          <Stack gap="xs">
            <Button variant="subtle" onClick={password.open}>
              Passwort ändern
            </Button>
            <Button variant="default" onClick={() => logout().catch(notifyError)}>
              Abmelden
            </Button>
          </Stack>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>

      <PasswordModal opened={passwordOpen} onClose={password.close} />
    </AppShell>
  );
}
