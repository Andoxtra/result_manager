import { Alert, Badge, Button, Checkbox, Group, Loader, Modal, PasswordInput, Stack, Switch, TextInput, Title } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, type Role, type User } from "../api";
import { useAuth } from "../auth";
import { Row } from "../components/Row";
import { ROLE_LABELS } from "../format";
import { notifyError, notifySuccess } from "../notify";

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ISSUER: "Schützen registrieren und Schießkarten ausgeben",
  SCORER: "Ergebnisse erfassen, PDF exportieren",
  EVALUATOR: "Ranglisten und Statistik einsehen, PDF exportieren",
  ADMIN: "Alles, einschließlich Benutzer, Disziplinen und Veranstaltungen",
};
const ROLE_ORDER: Role[] = ["ISSUER", "SCORER", "EVALUATOR", "ADMIN"];

function UserForm({ user, onDone }: { user: User | null; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState(user?.username ?? "");
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [password, setPassword] = useState("");
  const [roles, setRoles] = useState<string[]>(user?.roles ?? []);
  const [active, setActive] = useState(user?.active ?? true);

  const save = useMutation({
    mutationFn: () =>
      user
        ? api.patch(`/users/${user.id}`, { displayName: displayName.trim(), roles, active, ...(password ? { password } : {}) })
        : api.post("/users", { username: username.trim(), displayName: displayName.trim(), password, roles }),
    onSuccess: () => {
      notifySuccess("Benutzer gespeichert.");
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
      onDone();
    },
    onError: notifyError,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <form onSubmit={submit}>
      <Stack>
        <TextInput label="Benutzername" value={username} onChange={(e) => setUsername(e.currentTarget.value)} disabled={!!user} minLength={2} maxLength={50} autoComplete="off" required data-autofocus />
        <TextInput label="Anzeigename" value={displayName} onChange={(e) => setDisplayName(e.currentTarget.value)} maxLength={100} autoComplete="off" required />
        <PasswordInput
          label={user ? "Neues Passwort" : "Passwort"}
          description={user ? "Leer lassen, um das Passwort nicht zu ändern. Mindestens 8 Zeichen." : "Mindestens 8 Zeichen"}
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          minLength={8}
          autoComplete="new-password"
          required={!user}
        />
        <Checkbox.Group label="Rollen" value={roles} onChange={setRoles}>
          <Stack gap="xs" mt="xs">
            {ROLE_ORDER.map((role) => (
              <Checkbox key={role} value={role} label={ROLE_LABELS[role]} description={ROLE_DESCRIPTIONS[role]} />
            ))}
          </Stack>
        </Checkbox.Group>
        {user && <Switch label="Aktiv (darf sich anmelden)" checked={active} onChange={(e) => setActive(e.currentTarget.checked)} />}
        <Button type="submit" loading={save.isPending}>
          Speichern
        </Button>
      </Stack>
    </form>
  );
}

export function UsersPage() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<{ user: User | null } | null>(null);
  const users = useQuery({ queryKey: ["users"], queryFn: () => api.get<User[]>("/users") });

  const remove = useMutation({
    mutationFn: (u: User) => api.delete(`/users/${u.id}`),
    onSuccess: () => {
      notifySuccess("Benutzer gelöscht.");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: notifyError,
  });

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Benutzer</Title>
        <Button onClick={() => setForm({ user: null })}>Neuer Benutzer</Button>
      </Group>
      {users.isPending && <Loader />}
      {users.error && <Alert color="red">{users.error.message}</Alert>}
      <Stack gap="xs">
        {users.data?.map((u) => (
          <Row
            key={u.id}
            title={`${u.displayName} (${u.username})`}
            actions={
              <>
                <Button variant="default" onClick={() => setForm({ user: u })}>
                  Bearbeiten
                </Button>
                {u.id !== me?.id && (
                  <Button
                    variant="subtle"
                    color="red"
                    onClick={() => window.confirm(`Benutzer „${u.username}“ wirklich löschen?`) && remove.mutate(u)}
                  >
                    Löschen
                  </Button>
                )}
              </>
            }
          >
            {!u.active && <Badge color="gray">gesperrt</Badge>}
            {ROLE_ORDER.filter((r) => u.roles.includes(r)).map((r) => (
              <Badge key={r} variant="light" color={r === "ADMIN" ? "red" : "blue"}>
                {ROLE_LABELS[r]}
              </Badge>
            ))}
            {u.roles.length === 0 && <span>keine Rolle</span>}
          </Row>
        ))}
      </Stack>
      <Modal opened={!!form} onClose={() => setForm(null)} title={form?.user ? "Benutzer bearbeiten" : "Neuer Benutzer"}>
        {form && <UserForm key={form.user?.id ?? "new"} user={form.user} onDone={() => setForm(null)} />}
      </Modal>
    </Stack>
  );
}
